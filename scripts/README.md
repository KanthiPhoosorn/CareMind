# CareMind Data Pipeline Scripts

Scripts for data preparation, de-identification, tokenization, and NER labeling.

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements-data-pipeline.txt
```

### 2. Run Demo

```bash
# See all pipeline components in action
python data_pipeline_demo.py
```

### 3. Process Your Data

**De-identify only:**
```bash
python deidentify.py
```

**ETL pipeline (Excel → Normalized JSON chunks):**
```bash
python etl_pipeline.py --input-dir data/ --output-dir output/
```

**Train tokenizer:**
```bash
python train_tokenizer.py --corpus clinical_corpus.txt --output-dir models/ --evaluate
```

**Generate NER training data:**
```bash
python generate_ner_data.py --output-dir ner_data/ --format json
```

---

## Scripts Overview

| Script | Purpose | Input | Output |
| --- | --- | --- | --- |
| **deidentify.py** | Remove PII from text/JSON | Text or JSON dict | De-identified text or JSON |
| **etl_pipeline.py** | Convert Excel → normalized chunks | Excel files (data/) | JSONL chunks + index |
| **train_tokenizer.py** | Train SentencePiece BPE tokenizer | Text corpus | .model + .vocab files |
| **generate_ner_data.py** | Create 100+ labeled NER examples | (generated from code) | JSON/CoNLL/IOB2/spaCy |
| **training_utils.py** | Utilities for ML training | (library) | Classes: corpus building, checkpointing, data loaders |
| **train_medical_encoder.py** | Train 50-100M encoder (MLM) | 1-5B token corpus | Checkpoints + model files |
| **finetune_ner.py** | Fine-tune encoder for NER task | Labeled NER data | NER model + auto-generated labels |
| **drug_interaction_engine.py** | Drug safety rules & validation | (code-generated database) | Drug database JSON + validation API |
| **generate_eval_sets.py** | Create evaluation benchmarks | (code-generated) | 100 clinical cases + 100 triage scenarios |
| **data_pipeline_demo.py** | Demonstrate pipeline components | (none) | Console output |

---

## Detailed Usage

### deidentify.py

**Remove PII from clinical text:**

```bash
python deidentify.py
```

This runs a demo showing:
- PII detection (names, HN, dates, phone, email)
- Text de-identification
- JSON de-identification

**In your code:**

```python
from deidentify import DeidentificationPipeline

pipeline = DeidentificationPipeline()

# Text
original = "Patient AN123456 John Smith has fever"
deidentified = pipeline.deidentify(original)
# → "Patient [AN] [PATIENT_NAME] has fever"

# JSON
json_obj = {"patientName": "John", "assessment": "John has fever"}
deidentified_json = pipeline.deidentify_json(json_obj)
```

### etl_pipeline.py

**Convert hospital Excel exports to normalized chunks:**

```bash
python etl_pipeline.py --input-dir data/ --output-dir output/
```

**Options:**
- `--input-dir`: Directory with Excel files (expects data/AN1/*.xlsx, data/AN2/*.xlsx, etc.)
- `--output-dir`: Output directory for JSONL chunks
- `--no-deidentify`: Skip de-identification (for testing)

**Output:**
- `all_chunks.jsonl` — One JSON chunk per line
- `chunk_index.json` — Metadata index (chunk counts by type/encounter)

### train_tokenizer.py

**Train SentencePiece BPE tokenizer on clinical text:**

```bash
# Create synthetic corpus and train
python train_tokenizer.py --create-synthetic --vocab-size 32000 --evaluate

# Train on your own corpus
python train_tokenizer.py --corpus my_corpus.txt --output-dir models/ --evaluate
```

**Options:**
- `--corpus`: Path to training corpus (one sentence per line)
- `--output-dir`: Output directory for model files
- `--vocab-size`: Vocabulary size (default: 32000)
- `--model-type`: 'bpe', 'char', 'word', 'unigram' (default: 'bpe')
- `--create-synthetic`: Generate synthetic clinical corpus
- `--evaluate`: Test tokenizer on sample texts

**Output:**
- `models/caremind_32k.model` — Trained model
- `models/caremind_32k.vocab` — Vocabulary (32k tokens)

**Use in code:**

```python
from train_tokenizer import load_tokenizer

sp = load_tokenizer('models/caremind_32k.model')

# Encode to pieces
tokens = sp.encode_as_pieces("Patient has fever 39°C")
# → ['▁Patient', '▁has', '▁fever', '▁39', '°C']

# Encode to IDs
ids = sp.encode_as_ids("Patient has fever 39°C")
# → [2501, 456, 789, 156, 234]

# Decode back
text = sp.decode_pieces(tokens)
# → "Patient has fever 39°C"
```

### generate_ner_data.py

**Generate 100+ clinician-labeled NER examples:**

```bash
# Generate in JSON format (default)
python generate_ner_data.py --output-dir ner_data/ --format json

# Generate in multiple formats
python generate_ner_data.py --output-dir ner_data/ --format conll
python generate_ner_data.py --output-dir ner_data/ --format spacy
```

**Entity types included:**
- DRUG: Medication/drug names
- DISEASE: Disease/condition names
- SYMPTOM: Patient symptoms
- LAB: Laboratory test names
- DOSAGE: Drug dosages
- VITAL: Vital sign measurements
- ANATOMY: Anatomical locations
- PROCEDURE: Diagnostic procedures

**Output formats:**
- **JSON**: Easy to parse, good for custom training
- **CoNLL**: For spaCy, flair NER models
- **IOB2**: Traditional NER tag format
- **spaCy**: Native spaCy JSON format

### data_pipeline_demo.py

**See all components working together:**

```bash
python data_pipeline_demo.py
```

Shows:
1. De-identification examples
2. Tokenization (Thai, English, mixed)
3. ETL chunking strategy
4. NER training data
5. End-to-end pipeline flow

---

## Complete Pipeline Workflow

```bash
# 1. Prepare clinical corpus from raw text files
cat data/*/*.txt > clinical_corpus.txt

# 2. ETL: Convert Excel to normalized chunks
python etl_pipeline.py --input-dir data/ --output-dir etl_output/

# 3. Extract corpus from chunks for tokenizer training
python -c "
import jsonlines
texts = []
with jsonlines.open('etl_output/all_chunks.jsonl') as f:
    texts = [chunk['content'] for chunk in f]
with open('corpus_from_chunks.txt', 'w') as f:
    f.writelines(t + '\n' for t in texts)
"

# 4. Train tokenizer
python train_tokenizer.py \
    --corpus corpus_from_chunks.txt \
    --output-dir models/ \
    --vocab-size 32000 \
    --evaluate

# 5. Generate NER training data
python generate_ner_data.py \
    --output-dir ner_data/ \
    --format conll

# 6. Ready for:
#    - Embedding training (use tokenizer + transformer)
#    - NER model training (use labeled data)
#    - Milvus ingestion (use chunks + embeddings)
#    - RAG prompting (use chunks for retrieval)
```

---

## Data Formats

### Chunk Format (JSONL)

```json
{
  "chunk_id": "chunk_000001",
  "encounter_id": "AN1",
  "patient_id": "patient_0001",
  "chunk_type": "doctor_note",
  "section": "assessment",
  "content": "Patient presents with fever...",
  "timestamp": "2026-02-14T09:30:00Z",
  "author_role": "doctor",
  "author_id": "staff_0001",
  "document_title": "AN1_DoctorProgress_note.xlsx",
  "metadata": {
    "temperature": 101.5,
    "bloodPressure": "130/85",
    "heartRate": 88,
    "respiratoryRate": 22,
    "oxygenSaturation": 94
  }
}
```

### NER Example (JSON)

```json
{
  "example_id": "EX001",
  "text": "Patient has fever (39.5°C). Start Azithromycin 500mg daily.",
  "entities": [
    {
      "text": "fever",
      "type": "SYMPTOM",
      "start": 13,
      "end": 18,
      "confidence": 1.0
    },
    {
      "text": "39.5°C",
      "type": "VITAL",
      "start": 20,
      "end": 26,
      "confidence": 1.0
    },
    {
      "text": "Azithromycin",
      "type": "DRUG",
      "start": 36,
      "end": 48,
      "confidence": 1.0
    },
    {
      "text": "500mg",
      "type": "DOSAGE",
      "start": 49,
      "end": 54,
      "confidence": 1.0
    }
  ],
  "encounter_id": "AN001",
  "note_type": "doctor_note",
  "source": "clinician"
}
```

---

## Troubleshooting

### ImportError: No module named 'sentencepiece'

```bash
pip install sentencepiece
# Or reinstall all deps:
pip install -r requirements-data-pipeline.txt
```

### File not found errors

Make sure your data structure is:
```
data/
  AN1/
    AN1_DoctorProgress_note.xlsx
    AN1_NURSE_Note.xlsx
    AN1_order (lab).xlsx
    ...
  AN2/
    ...
```

### Tokenizer produces too many pieces per word

Increase vocab size:
```bash
python train_tokenizer.py --vocab-size 64000
```

### De-identification missing some PII

Add custom patterns to `deidentify.py`:
```python
HnPatternDetector.HN_PATTERNS.append(r'\b(ผู้ป่วยที่)\s*(\d+)\b')
```

---

## Next Steps

1. **Expand NER data**: Collect 500+ clinician-labeled examples
2. **Train spaCy NER**: `python -m spacy train config.cfg --training-data ner_data/train.json`
3. **Embedding model**: Use tokenizer + transformer (BERT, GPT) for dense vectors
4. **Milvus ingestion**: Load chunks + embeddings into vector DB
5. **RAG system**: Use retriever + generative model for citation-based summaries

---

## Documentation

- **Full guide**: [docs/DATA_PIPELINE_AND_TOKENIZER.md](../docs/DATA_PIPELINE_AND_TOKENIZER.md)
- **Clinical personas**: [docs/CLINICAL_PERSONAS_AND_TRIAGE.md](../docs/CLINICAL_PERSONAS_AND_TRIAGE.md)
- **Safety layer**: [docs/PHASE4_SAFETY_LAYER.md](../docs/PHASE4_SAFETY_LAYER.md)
- **Thai NLP**: [docs/PHASE5_THAI_MEDICAL.md](../docs/PHASE5_THAI_MEDICAL.md)

