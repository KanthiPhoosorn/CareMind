from pathlib import Path
import nbformat as nbf

src = "/mnt/data/CareMind_Patient_Custom_Local_Medical_Chatbot.ipynb"

nb = nbf.read(src, as_version=4)

new_cells = []

new_cells.append(nbf.v4.new_markdown_cell("""
# Phase 2 — Custom Embedding System

Phase 1 used TF-IDF retrieval.

Phase 2 upgrades CareMind into a true semantic medical retrieval system.

Goals:
- train local embeddings
- improve Thai clinical search
- improve symptom matching
- support multilingual retrieval
- improve citation quality

---

# Recommended Architecture

```text
Clinical Text
    ↓
Tokenizer
    ↓
Embedding Model
    ↓
Vector Database
    ↓
Semantic Retrieval
    ↓
Citation Validation

"""))

new_cells.append(nbf.v4.new_code_cell("""

Phase 2 imports

from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
import numpy as np
"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Step 1 — Build Dense Semantic Embeddings

Instead of sparse TF-IDF only,
we create compressed semantic vectors.

This simulates a lightweight embedding model.
"""))

new_cells.append(nbf.v4.new_code_cell("""

Create dense embeddings from TF-IDF

svd = TruncatedSVD(
n_components=128,
random_state=42
)

dense_embeddings = svd.fit_transform(X)

dense_embeddings = normalize(dense_embeddings)

dense_embeddings.shape
"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Step 2 — Semantic Vector Retrieval

This is much closer to modern retrieval systems.
"""))

new_cells.append(nbf.v4.new_code_cell("""
def semantic_retrieve(
query: str,
patient_an: str,
top_k: int = 5
):

scoped_df = chunk_df[
    chunk_df["patient_an"] == patient_an
].copy()

if scoped_df.empty:
    return pd.DataFrame()

scoped_indices = scoped_df.index.tolist()

scoped_vectors = dense_embeddings[scoped_indices]

query_tfidf = vectorizer.transform([query])

query_dense = svd.transform(query_tfidf)

query_dense = normalize(query_dense)

scores = np.dot(
    scoped_vectors,
    query_dense.T
).flatten()

scoped_df["semantic_score"] = scores

scoped_df = scoped_df.sort_values(
    by="semantic_score",
    ascending=False
)

return scoped_df.head(top_k)

"""))

new_cells.append(nbf.v4.new_code_cell("""
semantic_retrieve(
query="high fever and sore throat",
patient_an="AN1"
)
"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Step 3 — Hybrid Retrieval

Best practice in healthcare retrieval:

Keyword Search
+ Semantic Search
+ Metadata Filters

This improves:

citation quality
recall
symptom matching
medication lookup
"""))

new_cells.append(nbf.v4.new_code_cell("""
def hybrid_retrieve(
query: str,
patient_an: str,
top_k: int = 5
):

keyword_results = retrieve_chunks(
    query=query,
    patient_an=patient_an,
    top_k=top_k
)

semantic_results = semantic_retrieve(
    query=query,
    patient_an=patient_an,
    top_k=top_k
)

combined = pd.concat([
    keyword_results,
    semantic_results
])

combined = combined.drop_duplicates(
    subset=["chunk_id"]
)

score_columns = [
    c for c in combined.columns
    if "score" in c
]

combined["final_score"] = combined[
    score_columns
].fillna(0).sum(axis=1)

combined = combined.sort_values(
    by="final_score",
    ascending=False
)

return combined.head(top_k)

"""))

new_cells.append(nbf.v4.new_code_cell("""
hybrid_retrieve(
query="medication for fever",
patient_an="AN1"
)
"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Phase 3 — Build Your Own Small Transformer

This phase moves toward a real custom language model.

DO NOT attempt a giant GPT-scale model.

Instead:

train a small clinical transformer
focus on Thai medical data
optimize for retrieval + summarization
Recommended Initial Specs
Component	Recommendation
Framework	PyTorch
Parameters	20M–150M
Tokenizer	SentencePiece
Context Window	2048
Objective	Next-token prediction
Hardware	Single GPU initially
Training Corpus

Use:

doctor notes
nurse notes
medication orders
discharge summaries
queue records
FAQ workflows

Do NOT train on:

unrestricted internet data
random Reddit dumps
unverified medical text
"""))

new_cells.append(nbf.v4.new_code_cell("""

Example transformer tokenizer training plan

training_plan = {
"phase": "small_transformer",
"tokenizer": "SentencePiece",
"vocab_size": 32000,
"target_parameters": "50M",
"training_objective": "causal_language_modeling",
"primary_data": [
"doctor_notes",
"nurse_notes",
"lab_orders",
"queue_workflows"
]
}

training_plan
"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Phase 4 — Clinical Safety Layer

Even with your own model:

The model is NEVER trusted directly.

You still need:

retrieval grounding
citations
schema validation
hallucination detection
audit logs
"""))

new_cells.append(nbf.v4.new_code_cell("""
def validate_citations(
answer: str,
citations: list
):

if len(citations) == 0:
    return False

if len(answer.strip()) < 10:
    return False

return True

"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Phase 5 — Thai Medical Language Optimization

Real Thai hospitals contain:

Thai + English mixing
abbreviations
shorthand
inconsistent formatting

You will eventually need:

Thai medical normalization
custom tokenization
abbreviation expansion
multilingual embeddings
"""))

new_cells.append(nbf.v4.new_code_cell("""
THAI_MEDICAL_ABBREVIATIONS = {
"HT": "hypertension",
"DM": "diabetes mellitus",
"SOB": "shortness of breath",
"AF": "atrial fibrillation"
}

THAI_MEDICAL_ABBREVIATIONS
"""))

new_cells.append(nbf.v4.new_markdown_cell("""

Phase 6 — Production Architecture

Final CareMind AI stack:

Frontend
    ↓
AI Gateway
    ↓
Auth + RLS
    ↓
Hybrid Retrieval
    ↓
Citation Engine
    ↓
Custom Transformer
    ↓
Safety Validation
    ↓
Streaming Response
Final Recommendation

Do NOT rush into giant model training.

The correct order is:

Phase 1
Retrieval + Citations
        ↓
Phase 2
Embeddings + Semantic Search
        ↓
Phase 3
Small Transformer
        ↓
Phase 4
Clinical Fine-Tuning
        ↓
Phase 5
Advanced Safety + Evaluation

For healthcare AI:

retrieval quality matters more than model size
citations matter more than fluent writing
safety matters more than creativity
"""))

nb.cells.extend(new_cells)

out = "/mnt/data/CareMind_Phase2_to_Phase6_Roadmap.ipynb"
nbf.write(nb, out)

print("Extended notebook saved:", out)

STDOUT/STDERR
Extended notebook saved: /mnt/data/CareMind_Phase2_to_Phase6_Roadmap.ipynb


I extended your updated notebook into the next development phases for CareMind’s fully custom medical AI system.

The new notebook now includes:

Phase 2 — custom semantic embeddings
Hybrid retrieval (keyword + semantic)
Dense vector search
Phase 3 — roadmap for training your own transformer
Thai medical language handling
Citation validation
Safety architecture
Production AI gateway design
Clinical AI deployment strategy