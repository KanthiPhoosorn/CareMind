"""Hybrid retrieval: prefer Milvus vector search, fallback to TF-IDF retrieval.

Usage:
    from shared.services.hybrid_retriever import hybrid_retrieve
    results = hybrid_retrieve(query, patient_an, top_k=5)

Each result is a dict: {"source_file", "source_ref", "patient_an", "text", "score"}
"""
from typing import List, Dict
import os
import traceback

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
from sklearn.metrics.pairwise import cosine_similarity

try:
    from pymilvus import connections, utility, Collection
except Exception:
    connections = None
    utility = None
    Collection = None


def _tfidf_svd_embed(texts: List[str], dim: int = 128):
    vec = TfidfVectorizer(lowercase=True, stop_words="english")
    X = vec.fit_transform(texts)
    n_comp = min(dim, max(2, X.shape[1] - 1 or 2))
    svd = TruncatedSVD(n_components=n_comp, random_state=42)
    dense = svd.fit_transform(X)
    dense = normalize(dense)
    return dense, vec, svd


def _tfidf_query_similarity(query: str, texts: List[str], top_k: int = 5):
    dense, vec, svd = _tfidf_svd_embed(texts, dim=128)
    q_vec = vec.transform([query])
    q_dense = svd.transform(q_vec)
    q_dense = normalize(q_dense)
    sims = cosine_similarity(q_dense, dense)[0]
    idxs = sims.argsort()[::-1][:top_k]
    return [(int(i), float(sims[i])) for i in idxs]


def hybrid_retrieve(query: str, patient_an: str, top_k: int = 5) -> List[Dict]:
    """Return top-k retrievals scoped to `patient_an`.

    Strategy:
      1. Try Milvus vector search (requires pymilvus and collection present).
      2. On error or not available, fall back to local TF-IDF retrieval over sample_data.
    """
    # Try Milvus path
    try:
        if connections is not None and utility is not None and Collection is not None:
            # connect using env vars if needed
            host = os.getenv("MILVUS_HOST", "127.0.0.1")
            port = os.getenv("MILVUS_PORT", "19530")
            collection_name = os.getenv("MILVUS_COLLECTION", "caremind_chunks")
            try:
                connections.connect(host=host, port=port)
            except Exception:
                # could already be connected or network issue; raise to fallback
                raise

            if not utility.has_collection(collection_name):
                raise RuntimeError(f"Milvus collection {collection_name} not found")

            coll = Collection(collection_name)

            # fetch all texts to build embedding pipeline consistent with index
            all_rows = coll.query(expr=None, output_fields=["text", "patient_an", "source_file", "source_ref"])
            texts = [r.get("text", "") for r in all_rows]
            if not texts:
                raise RuntimeError("No texts found in Milvus collection to build embeddings")

            dense, vec, svd = _tfidf_svd_embed(texts, dim=int(os.getenv("MILVUS_DIM", "128")))
            q_vec = vec.transform([query])
            q_dense = svd.transform(q_vec)
            q_dense = normalize(q_dense)

            # use Milvus search with expr to scope by patient_an
            search_params = {"metric_type": "L2", "params": {"nprobe": 10}}
            try:
                hits = coll.search(
                    data=q_dense.tolist(),
                    anns_field="embedding",
                    param=search_params,
                    limit=top_k,
                    expr=f"patient_an == '{patient_an}'",
                    output_fields=["patient_an", "source_file", "source_ref", "text"],
                )
            except Exception:
                # if Milvus search fails, fall back
                raise

            results = []
            # hits is a list per query (we had one query)
            for hit in hits[0]:
                meta = {f: hit.entity.get(f) for f in ["patient_an", "source_file", "source_ref", "text"]}
                results.append({"source_file": meta.get("source_file"), "source_ref": meta.get("source_ref"), "patient_an": meta.get("patient_an"), "text": meta.get("text"), "score": float(hit.distance)})
            return results
    except Exception:
        # Milvus path failed; fall back to TF-IDF over local sample_data
        try:
            # lazy import to avoid heavy deps unless needed
            from scripts.ingest_to_milvus import load_clinical_file_chunks
        except Exception:
            load_clinical_file_chunks = None
        try:
            data_root = os.path.join(os.getcwd(), "sample_data")
            chunks = []
            for root, _, files in os.walk(data_root):
                for fn in files:
                    path = os.path.join(root, fn)
                    try:
                        if load_clinical_file_chunks:
                            file_chunks = load_clinical_file_chunks(path)
                            chunks.extend(file_chunks)
                    except Exception:
                        continue

            texts = [c.text for c in chunks if getattr(c, "patient_an", "") == patient_an]
            if not texts:
                # no patient-scoped text
                return []

            sims = _tfidf_query_similarity(query, texts, top_k=top_k)
            results = []
            patient_chunks = [c for c in chunks if getattr(c, "patient_an", "") == patient_an]
            for idx, score in sims:
                c = patient_chunks[idx]
                results.append({"source_file": c.source_file, "source_ref": c.source_ref, "patient_an": c.patient_an, "text": c.text, "score": score})
            return results
        except Exception:
            traceback.print_exc()
            return []
