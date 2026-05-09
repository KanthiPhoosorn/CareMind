#!/usr/bin/env python3
"""scripts/ingest_to_milvus.py

Lightweight ingestion tool to normalize clinical files (multi-format),
create searchable chunks, build lightweight embeddings (TF-IDF + SVD),
and upsert into a Milvus collection with citation metadata.

NOTE: For production use, replace the embedding generator with your
`LOCAL_EMBEDDING_MODEL` server. This script uses a deterministic,
offline-friendly TF-IDF -> TruncatedSVD pipeline for demo and testing.
"""

import os
import re
import glob
import json
import html
from pathlib import Path
from dataclasses import dataclass
from typing import List, Any

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize

try:
    from pymilvus import (
        connections,
        FieldSchema,
        CollectionSchema,
        DataType,
        Collection,
        utility,
    )
except Exception:
    connections = None
    FieldSchema = None
    CollectionSchema = None
    DataType = None
    Collection = None
    utility = None


@dataclass
class ClinicalChunk:
    chunk_id: str
    patient_an: str
    source_file: str
    source_ref: str
    file_format: str
    text: str
    row_index: Any = ""
    sheet_name: str = ""


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    text = str(value).strip()
    return re.sub(r"\s+", " ", text)


def extract_patient_an(file_path: str) -> str:
    path_text = file_path.replace("\\", "/")
    match = re.search(r"AN\d+", path_text, flags=re.IGNORECASE)
    if match:
        return match.group(0).upper()
    return os.path.basename(os.path.dirname(file_path)) or "UNKNOWN"


def make_chunk_text(pairs: List[str]) -> str:
    text = " | ".join(pair for pair in pairs if clean_text(pair))
    return re.sub(r"\s+", " ", text).strip()


def chunk_text_blocks(text: str, min_length: int = 8) -> List[str]:
    blocks = []
    for block in re.split(r"(?:\n\s*\n|\r\n\s*\r\n)", text):
        block = re.sub(r"\s+", " ", block).strip()
        if len(block) >= min_length:
            blocks.append(block)
    return blocks


def flatten_json(value: Any, prefix: str = "") -> List[str]:
    rows = []
    if isinstance(value, dict):
        for key, item in value.items():
            nested_prefix = f"{prefix}{key}" if prefix else str(key)
            rows.extend(flatten_json(item, nested_prefix + "."))
    elif isinstance(value, list):
        for index, item in enumerate(value, start=1):
            nested_prefix = f"{prefix}{index}"
            rows.extend(flatten_json(item, nested_prefix + "."))
    else:
        scalar = clean_text(value)
        if scalar:
            key = prefix[:-1] if prefix.endswith(".") else prefix
            rows.append(f"{key}: {scalar}" if key else scalar)
    return rows


def dataframe_to_chunks(df: pd.DataFrame, source_file: str, patient_an: str, sheet_name: str = "Sheet1") -> List[ClinicalChunk]:
    records: List[ClinicalChunk] = []
    for idx, row in df.iterrows():
        pairs = []
        for column_name, value in row.items():
            value_text = clean_text(value)
            if value_text:
                pairs.append(f"{column_name}: {value_text}")
        if not pairs:
            continue
        text = make_chunk_text(pairs)
        if len(text) < 5:
            continue
        records.append(ClinicalChunk(
            chunk_id="",
            patient_an=patient_an,
            source_file=source_file,
            source_ref=f"{sheet_name}:row_{idx + 1}",
            file_format=Path(source_file).suffix.lstrip(".").lower() or "tabular",
            text=text,
            row_index=idx,
            sheet_name=sheet_name,
        ))
    return records


def text_file_to_chunks(raw_text: str, source_file: str, patient_an: str, file_format: str) -> List[ClinicalChunk]:
    records: List[ClinicalChunk] = []
    blocks = chunk_text_blocks(raw_text)
    for block_index, block in enumerate(blocks, start=1):
        records.append(ClinicalChunk(
            chunk_id="",
            patient_an=patient_an,
            source_file=source_file,
            source_ref=f"block_{block_index}",
            file_format=file_format,
            text=block,
            row_index=block_index,
            sheet_name="",
        ))
    return records


def load_clinical_file_chunks(file_path: str) -> List[ClinicalChunk]:
    source_file = os.path.basename(file_path)
    patient_an = extract_patient_an(file_path)
    suffix = Path(file_path).suffix.lower()
    chunks_for_file: List[ClinicalChunk] = []

    if suffix in {".xlsx", ".xls", ".xlsm"}:
        workbook = pd.read_excel(file_path, sheet_name=None)
        for sheet_name, sheet_df in workbook.items():
            if sheet_df.empty:
                continue
            chunks_for_file.extend(dataframe_to_chunks(sheet_df, source_file, patient_an, sheet_name=sheet_name))
        return chunks_for_file

    if suffix in {".csv", ".tsv"}:
        delimiter = "\t" if suffix == ".tsv" else ","
        table_df = pd.read_csv(file_path, dtype=str, sep=delimiter, keep_default_na=False)
        return dataframe_to_chunks(table_df, source_file, patient_an)

    if suffix == ".json":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as json_file:
            payload = json.load(json_file)

        if isinstance(payload, list):
            for index, record in enumerate(payload, start=1):
                text = make_chunk_text(flatten_json(record))
                if len(text) >= 5:
                    chunks_for_file.append(ClinicalChunk(
                        chunk_id="",
                        patient_an=patient_an,
                        source_file=source_file,
                        source_ref=f"record_{index}",
                        file_format="json",
                        text=text,
                        row_index=index,
                        sheet_name="",
                    ))
        else:
            text = make_chunk_text(flatten_json(payload))
            if len(text) >= 5:
                chunks_for_file.append(ClinicalChunk(
                    chunk_id="",
                    patient_an=patient_an,
                    source_file=source_file,
                    source_ref="json_document",
                    file_format="json",
                    text=text,
                    row_index=1,
                    sheet_name="",
                ))
        return chunks_for_file

    if suffix in {".xml", ".html", ".htm", ".txt", ".md"}:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as text_file:
            raw_text = text_file.read()

        if suffix == ".xml":
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(raw_text)
                extracted_text = " ".join(part.strip() for part in root.itertext() if part and part.strip())
            except Exception:
                extracted_text = raw_text
            return text_file_to_chunks(extracted_text, source_file, patient_an, "xml")

        if suffix in {".html", ".htm"}:
            extracted_text = re.sub(r"<script.*?>.*?</script>|<style.*?>.*?</style>|<[^>]+>", " ", raw_text, flags=re.IGNORECASE | re.DOTALL)
            extracted_text = html.unescape(extracted_text)
            return text_file_to_chunks(extracted_text, source_file, patient_an, "html")

        return text_file_to_chunks(raw_text, source_file, patient_an, suffix.lstrip("."))

    with open(file_path, "r", encoding="utf-8", errors="ignore") as fallback_file:
        raw_text = fallback_file.read()
    return text_file_to_chunks(raw_text, source_file, patient_an, suffix.lstrip(".") or "text")


def generate_embeddings(texts: List[str], dim: int = 128):
    """Deterministic offline embedding generator: TF-IDF -> TruncatedSVD -> normalize"""
    vectorizer = TfidfVectorizer(lowercase=True, stop_words="english")
    X = vectorizer.fit_transform(texts)
    svd = TruncatedSVD(n_components=min(dim, max(2, X.shape[1] - 1 or 2)), random_state=42)
    dense = svd.fit_transform(X)
    dense = normalize(dense)
    return dense.tolist()


def connect_milvus(host: str, port: str):
    if connections is None:
        raise RuntimeError("pymilvus not available; install requirements before running")
    connections.connect(host=host, port=port)


def ensure_collection(collection_name: str, dim: int = 128):
    if utility.has_collection(collection_name):
        return Collection(collection_name)

    fields = [
        FieldSchema(name="pk", dtype=DataType.INT64, is_primary=True, auto_id=True),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=dim),
        FieldSchema(name="patient_an", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="source_file", dtype=DataType.VARCHAR, max_length=256),
        FieldSchema(name="source_ref", dtype=DataType.VARCHAR, max_length=256),
        FieldSchema(name="file_format", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=8192),
    ]
    schema = CollectionSchema(fields=fields, description="CareMind clinical chunks")
    collection = Collection(name=collection_name, schema=schema)
    return collection


def upsert_chunks_to_milvus(collection: "Collection", chunks: List[ClinicalChunk], vectors: List[List[float]]):
    # Milvus expects column-aligned lists
    patient_ans = [c.patient_an for c in chunks]
    source_files = [c.source_file for c in chunks]
    source_refs = [c.source_ref for c in chunks]
    file_formats = [c.file_format for c in chunks]
    texts = [c.text for c in chunks]

    entities = [vectors, patient_ans, source_files, source_refs, file_formats, texts]
    # The first field in the schema is auto-id pk, so it's not sent.
    collection.insert(entities)
    collection.flush()


def main(data_dir: str, milvus_host: str, milvus_port: str, collection_name: str = "caremind_chunks", dim: int = 128):
    # discover files
    patterns = ["**/*.xlsx", "**/*.xls", "**/*.csv", "**/*.tsv", "**/*.json", "**/*.txt", "**/*.md", "**/*.xml", "**/*.html"]
    files = []
    for p in patterns:
        files.extend(glob.glob(os.path.join(data_dir, p), recursive=True))
    files = sorted(set(files))
    print(f"Found {len(files)} clinical files to ingest")

    chunks = []
    for f in files:
        try:
            file_chunks = load_clinical_file_chunks(f)
            chunks.extend(file_chunks)
        except Exception as e:
            print(f"Failed to load {f}: {e}")

    if not chunks:
        print("No chunks found — nothing to ingest.")
        return

    texts = [c.text for c in chunks]
    print(f"Generating embeddings for {len(texts)} chunks (dim={dim})")
    vectors = generate_embeddings(texts, dim=dim)

    # connect to Milvus
    print(f"Connecting to Milvus at {milvus_host}:{milvus_port}")
    connect_milvus(milvus_host, milvus_port)
    coll = ensure_collection(collection_name, dim=dim)

    print("Upserting chunks to Milvus collection")
    upsert_chunks_to_milvus(coll, chunks, vectors)
    # create an IVF_FLAT index (example)
    index_params = {"index_type": "IVF_FLAT", "metric_type": "L2", "params": {"nlist": 128}}
    coll.create_index(field_name="embedding", index_params=index_params)
    coll.load()
    print("Done — data upserted and collection loaded")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="./caremind_data", help="Path to clinical data root")
    parser.add_argument("--milvus-host", default=os.getenv("MILVUS_HOST", "127.0.0.1"))
    parser.add_argument("--milvus-port", default=os.getenv("MILVUS_PORT", "19530"))
    parser.add_argument("--collection", default=os.getenv("MILVUS_COLLECTION", "caremind_chunks"))
    parser.add_argument("--dim", type=int, default=int(os.getenv("MILVUS_DIM", "128")))

    args = parser.parse_args()
    main(args.data_dir, args.milvus_host, args.milvus_port, args.collection, args.dim)
