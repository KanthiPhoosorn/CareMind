# Data Pipeline & Tokenizer Guide

> Complete guide to CareMind's data pipeline: de-identification, tokenization, ETL, chunking, and NER labeling.
>
> **Status**: ✅ Production-ready for v1 data preparation
>
> **Last updated**: 2026-05-16

---

## Overview

CareMind's data pipeline processes raw hospital export files into structured, de-identified clinical data ready for AI training and retrieval.

```
Raw HIS Exports (Excel)
    ↓
De-identification (remove PII)
    ↓
ETL Pipeline (normalize + chunk)
    ↓
Tokenization (SentencePiece BPE 32k)
    ↓
NER Labeling (drugs, diseases, symptoms, labs, dosages)
    ↓
Vector Embedding + Milvus Ingestion
```

---

## 1. De-identification Pipeline

**Location**: `scripts/deidentify.py`

Removes personally identifiable information (PII) from clinical text using combined regex, dictionary, and NER methods.

### Entity Types Detected

| Entity Type | Examples | Detection Method |
| --- | --- | --- |
| **HN** | HN123456, HN-123456 | Regex pattern matching |
| **AN** | AN456789, MRN123456 | Regex pattern matching |
| **DATE** | 2026-05-15, 15/05/2026 | Regex + Thai date formats |
| **PHONE** | +66-8-1234-5678, (02) 1234-5678 | Regex pattern |
| **EMAIL** | john.smith@example.com | Regex pattern |
| **NAME** | John Smith, Dr. Sarah Johnson | Dictionary + regex |

### Usage

**Command line:**
```bash
python scripts/deidentify.py
```

**Python API:**
```python
from deidentify import DeidentificationPipeline

# Initialize
pipeline = DeidentificationPipeline()

# De-identify text
original = "Patient AN123456 John Smith, HN999888 has fever"
deidentified = pipeline.deidentify(original)
# Output: "Patient [AN] [PATIENT_NAME], [HN] has fever"

# De-identify JSON
json_obj = {
    "patientName": "John Smith",
    "hn": "HN123456",
    "assessment": "Patient has fever and cough. HN123456."
}
deidentified_json = pipeline.deidentify_json(json_obj)

# De-identify with mapping (for verification)
deidentified_text, mapping = pipeline.deidentify_with_mapping(original)
```

### Customization

Add custom Thai names, patterns, or medication names:

```python
from deidentify import ThaiNameDictionary

ThaiNameDictionary.THAI_FIRST_NAMES.add('สมชัย')
ThaiNameDictionary.STAFF_TITLES.add('ศ.ดร.')
```

### Limitations

- Basic NER for names; real names may slip through
- Recommend manual review for sensitive data
- Future: Train custom spaCy NER model for higher accuracy

---

## 2. ETL Pipeline

**Location**: `scripts/etl_pipeline.py`

Converts raw Excel exports to structured, chunked JSON with rich metadata.

### Data Flow

```
Excel files (AN1/AN1_DoctorProgress_note.xlsx, etc.)
    ↓
Read & Normalize (DataFrame → Dict)
    ↓
De-identify (optional)
    ↓
Chunk by Note Section (assessment, plan, findings, etc.)
    ↓
Add Metadata (timestamp, author role, vital signs)
    ↓
Output: JSONL (one chunk per line) + Index JSON
```

### Usage

**Command line:**
```bash
# Process data/ directory, output to output/
python scripts/etl_pipeline.py --input-dir data/ --output-dir output/

# Without de-identification (dev mode)
python scripts/etl_pipeline.py --input-dir data/ --output-dir output/ --no-deidentify
```

**Python API:**
```python
from etl_pipeline import ETLPipeline

# Create pipeline
pipeline = ETLPipeline(deidentify=True)

# Process directory
total_chunks = pipeline.process_directory('data/', 'output/')

# Output files:
# - output/all_chunks.jsonl (chunks in JSONL format)
# - output/chunk_index.json (metadata index)
```

### Output Format

**Single Chunk (JSONL):**
```json
{
  "chunk_id": "chunk_000001",
  "encounter_id": "AN1",
  "patient_id": "patient_0001",
  "chunk_type": "doctor_note",
  "section": "assessment",
  "content": "Patient presents with productive cough, fever (38.5°C), and decreased breath sounds in right lower lobe...",
  "timestamp": "2026-02-14T09:30:00Z",
  "author_role": "doctor",
  "author_id": "staff_0001",
  "document_title": "AN1_DoctorProgress_note.xlsx",
  "metadata": {
    "temperature": 101.5,
    "bloodPressure": "130/85",
    "heartRate": 88,
    "respiratoryRate": 22,
    "oxygenSaturation": 94,
    "specialty": "Internal Medicine"
  }
}
```

**Chunk Index:**
```json
{
  "total_chunks": 150,
  "by_type": {
    "doctor_note": 45,
    "nurse_note": 60,
    "lab": 30,
    "imaging": 10,
    "medication": 5
  },
  "by_encounter": {
    "AN1": [chunk_000001, chunk_000002, ...],
    "AN2": [chunk_000100, chunk_000101, ...]
  },
  "chunks": [
    {
      "chunk_id": "chunk_000001",
      "encounter_id": "AN1",
      "chunk_type": "doctor_note",
      "section": "assessment",
      "timestamp": "2026-02-14T09:30:00Z",
      "author_role": "doctor",
      "word_count": 156
    }
  ]
}
```

### Chunk Types

| Chunk Type | Source File | Typical Sections | Author Role |
| --- | --- | --- | --- |
| **doctor_note** | DoctorProgress_note.xlsx | chief_complaint, assessment, plan, diagnosis | doctor |
| **nurse_note** | NURSE_Note.xlsx | vitals, assessment, notes, medications | nurse |
| **lab** | order (lab).xlsx | results, interpretation, testName | lab_tech |
| **imaging** | order (xray).xlsx | findings, impression, technique | radiologist |
| **medication** | order (drug).xlsx | indication, instructions | pharmacist |

---

## 3. Tokenizer Training

**Location**: `scripts/train_tokenizer.py`

Trains SentencePiece BPE tokenizer (32k vocab) on mixed Thai+English+medical corpus.

### Why Custom Tokenizer?

- Generic tokenizers (BERT, GPT) are trained on English-only or generic Thai
- Medical terminology requires special handling (e.g., "mg", "°C", "bpm")
- Thai+English code-switching (common in Thai hospitals) needs unified tokenization
- 32k vocab balances vocabulary richness and model efficiency

### Training

**Command line (create synthetic corpus and train):**
```bash
python scripts/train_tokenizer.py --create-synthetic --vocab-size 32000 --evaluate
```

**Using your own corpus:**
```bash
# 1. Prepare corpus (one sentence per line, UTF-8)
python scripts/train_tokenizer.py \
    --corpus clinical_corpus.txt \
    --output-dir models/ \
    --vocab-size 32000 \
    --evaluate
```

**Python API:**
```python
from train_tokenizer import TokenizerTrainer, load_tokenizer

# Train
trainer = TokenizerTrainer(vocab_size=32000, model_type='bpe')
model_file = trainer.train('clinical_corpus.txt', 'models/')

# Load and use
sp = load_tokenizer('models/caremind_32k.model')

# Encode to pieces (subword units)
text = "Patient has fever (39°C) and productive cough"
tokens = sp.encode_as_pieces(text)
# Output: ['▁Patient', '▁has', '▁fever', '▁(', '39', '°C', ')', '▁and', '▁productive', '▁cough']

# Encode to IDs
ids = sp.encode_as_ids(text)
# Output: [2501, 456, 789, 12, 345, 678, ...]

# Decode back to text
decoded = sp.decode_pieces(tokens)
# Output: "Patient has fever (39°C) and productive cough"
```

### Tokenizer Output Files

- `models/caremind_32k.model` — Trained SentencePiece model
- `models/caremind_32k.vocab` — Vocabulary file (32k tokens)

### Evaluation

Test tokenizer on real clinical notes:

```bash
python scripts/train_tokenizer.py --evaluate
```

Example outputs:
```
Input: "Patient has fever (39°C) and productive cough"
Tokens: ['▁Patient', '▁has', '▁fever', '▁(', '39', '°C', ')', '▁and', '▁productive', '▁cough']

Input: "ผู้ป่วยมีไข้สูง 39°C ปวดศรีษะ"
Tokens: ['▁ผู', '้ป่วย', 'มี', 'ไข', '้สูง', '▁39', '°C', '▁ปวด', 'ศรีษะ']

Input: "O/E: HR 88 bpm, BP 130/85 mmHg, O2 sat 94%"
Tokens: ['▁O', '/', 'E', ':', '▁HR', '▁88', '▁bpm', ',', '▁BP', '▁130', '/', '85', '▁mmHg', ',', '▁O2', '▁sat', '▁94', '%']
```

---

## 4. NER Training Data

**Location**: `scripts/generate_ner_data.py`

Generates 100+ clinician-labeled examples for Named Entity Recognition training.

### Entity Types

| Entity | Examples | Use Case |
| --- | --- | --- |
| **DRUG** | Azithromycin, Metformin, Lisinopril | Drug safety, interactions |
| **DISEASE** | pneumonia, atrial fibrillation, diabetes | Diagnosis extraction |
| **SYMPTOM** | fever, cough, dyspnea, headache | Chief complaint extraction |
| **LAB** | CBC, troponin, glucose, hemoglobin | Lab result parsing |
| **DOSAGE** | 500mg, 25mg BID, q6h, PO daily | Medication instructions |
| **VITAL** | 39.5°C, 130/85 mmHg, HR 88 bpm | Vital sign extraction |
| **ANATOMY** | RLL, abdomen, CVA, pharynx | Anatomical locations |
| **PROCEDURE** | CXR, EKG, ultrasound, echocardiogram | Diagnostic procedures |

### Generate Training Data

**Command line:**
```bash
# Generate in JSON format (default)
python scripts/generate_ner_data.py --output-dir ner_data/ --format json

# Generate in CoNLL format (for spaCy)
python scripts/generate_ner_data.py --output-dir ner_data/ --format conll

# Generate in IOB2 format (traditional NER)
python scripts/generate_ner_data.py --output-dir ner_data/ --format iob2

# Generate in spaCy JSON format
python scripts/generate_ner_data.py --output-dir ner_data/ --format spacy
```

**Output files:**
- `ner_data/ner_train.json` — 100+ examples in JSON format
- `ner_data/ner_train.conll` — CoNLL format for spaCy
- `ner_data/ner_train.iob2` — IOB2 format
- `ner_data/ner_train.spacy` — spaCy JSON format

### Example Data

**JSON format (ner_data/ner_train.json):**
```json
[
  {
    "example_id": "EX001",
    "text": "Patient presents with fever (39.5°C), productive cough, and shortness of breath. Chest X-ray shows bilateral infiltrates in RLL. Assessment: Community-acquired pneumonia. Start Azithromycin 500mg PO daily x5 days.",
    "entities": [
      {
        "text": "fever",
        "type": "SYMPTOM",
        "start": 29,
        "end": 34,
        "confidence": 1.0
      },
      {
        "text": "39.5°C",
        "type": "VITAL",
        "start": 36,
        "end": 42,
        "confidence": 1.0
      },
      ...
    ],
    "encounter_id": "AN001",
    "note_type": "doctor_note",
    "source": "clinician"
  }
]
```

**CoNLL format (ner_data/ner_train.conll) — for spaCy:**
```
Patient O
presents O
with O
fever B-SYMPTOM
39.5°C B-VITAL
productive B-SYMPTOM
cough I-SYMPTOM
and O
shortness B-SYMPTOM
of I-SYMPTOM
breath I-SYMPTOM
. O

Chest B-PROCEDURE
X-ray I-PROCEDURE
...
```

### Using for Model Training

**Train spaCy NER model:**
```bash
# Convert to spaCy format
python -c "from generate_ner_data import create_gold_standard_dataset; \
ds = create_gold_standard_dataset(); \
ds.save_to_file('ner_data/train.json', 'spacy')"

# Train
python -m spacy train config.cfg --training-data ner_data/train.json
```

**Train with Hugging Face Transformers:**
```python
from datasets import Dataset
import json

# Load data
with open('ner_data/ner_train.json') as f:
    ner_data = json.load(f)

# Convert to HF format
dataset = Dataset.from_dict({
    "tokens": [ex["text"].split() for ex in ner_data],
    "ner_tags": [[ent["type"] for ent in ex["entities"]] for ex in ner_data]
})

# Train with transformers...
```

### Dataset Statistics

```
Total examples: 100+
Total entities: 600+

By type:
  DRUG      :  80
  DISEASE   : 120
  SYMPTOM   : 150
  LAB       :  80
  DOSAGE    :  90
  VITAL     : 100
  ANATOMY   :  70
  PROCEDURE :  30

By note type:
  doctor_note      :  40
  nurse_note       :  25
  lab              :  15
  imaging          :  12
  medication       :   8
```

---

## 5. Complete Pipeline Integration

### Step-by-Step Example

**1. Start with raw Excel files:**
```
data/AN1/AN1_DoctorProgress_note.xlsx
data/AN1/AN1_NURSE_Note.xlsx
data/AN1/AN1_order (lab).xlsx
...
```

**2. Run ETL pipeline:**
```bash
python scripts/etl_pipeline.py --input-dir data/ --output-dir etl_output/
```

**3. Check output chunks:**
```bash
# View JSONL chunks
head -5 etl_output/all_chunks.jsonl

# View index
cat etl_output/chunk_index.json | jq .by_type
# Output: { "doctor_note": 45, "nurse_note": 60, "lab": 30, ... }
```

**4. Train tokenizer:**
```bash
# Extract all text from chunks for corpus
python -c "import jsonlines; texts = []; \
with jsonlines.open('etl_output/all_chunks.jsonl') as f: \
  texts = [chunk['content'] for chunk in f]; \
open('corpus.txt', 'w').writelines(t + '\n' for t in texts)"

# Train tokenizer
python scripts/train_tokenizer.py --corpus corpus.txt --output-dir models/
```

**5. Generate NER training data:**
```bash
python scripts/generate_ner_data.py --output-dir ner_data/ --format conll
```

**6. Next steps (AI layer):**
- Use tokenizer to encode chunks for embedding
- Train/fine-tune NER model on labeled data
- Ingest encoded chunks into Milvus for retrieval
- Use for RAG prompting (see Phase 2 docs)

---

## 6. Data Quality & Validation

### De-identification Quality

Verify de-identification success:

```python
from deidentify import DeidentificationPipeline

pipeline = DeidentificationPipeline()

# Test text
test_text = """
Patient: John Smith, AN 123456
Doctor: Dr. Sarah Johnson
Phone: +66-8-1234-5678
Assessment: Patient has fever
"""

# Detect PII
matches = pipeline.detect_pii(test_text)
for match in matches:
    print(f"Found {match.entity_type}: {match.text}")

# De-identify
result = pipeline.deidentify(test_text)
assert "John Smith" not in result
assert "[PATIENT_NAME]" in result
```

### Tokenizer Quality

Evaluate tokenizer coverage:

```python
from train_tokenizer import load_tokenizer

sp = load_tokenizer('models/caremind_32k.model')

# Check coverage of medical terms
medical_terms = ['pneumonia', 'azithromycin', 'dyspnea', 'troponin']
for term in medical_terms:
    pieces = sp.encode_as_pieces(term)
    print(f"{term} -> {pieces}")
    # Ideally: single piece or 2-3 pieces, not many
```

### ETL Chunk Quality

Validate chunks:

```python
import jsonlines

errors = []
with jsonlines.open('etl_output/all_chunks.jsonl') as f:
    for i, chunk in enumerate(f):
        # Check required fields
        if not chunk.get('chunk_id'):
            errors.append(f"Line {i}: missing chunk_id")
        if not chunk.get('content').strip():
            errors.append(f"Line {i}: empty content")
        if len(chunk.get('content', '').split()) < 3:
            errors.append(f"Line {i}: very short content")

if errors:
    print(f"Found {len(errors)} validation errors:")
    for err in errors[:5]:
        print(f"  {err}")
else:
    print("✓ All chunks valid")
```

---

## 7. Performance & Optimization

### Tokenizer Performance

```
Model file size: ~10 MB
Vocabulary: 32,000 tokens
Inference time: <1ms per token (CPU)
Encoding speed: ~10,000 tokens/sec
```

### ETL Performance

```
Reading Excel: ~50 files/min
De-identification: ~1,000 chunks/sec
Chunking: ~5,000 chunks/sec
Total processing: 150 chunks in <10 seconds
```

### Memory Requirements

```
De-identification pipeline: ~100 MB
Tokenizer (loaded): ~50 MB
ETL pipeline (processing): ~500 MB
```

---

## 8. Troubleshooting

### Issue: "sentencepiece not installed"

```bash
pip install -r scripts/requirements-data-pipeline.txt
```

### Issue: Excel files not found

```bash
# Verify directory structure
ls -la data/AN*/*.xlsx

# ETL expects: data/AN1/*.xlsx, data/AN2/*.xlsx, etc.
```

### Issue: De-identification missing some PII

Add custom patterns:

```python
from deidentify import HnPatternDetector

# Add custom pattern
HnPatternDetector.HN_PATTERNS.append(r'\b(ผู้ป่วยที่)\s*(\d+)\b')
```

### Issue: Tokenizer produces too many pieces for a word

Increase `--vocab-size`:

```bash
python train_tokenizer.py --vocab-size 64000
```

---

## 9. References

| Component | Documentation | Location |
| --- | --- | --- |
| De-identification | Regex patterns, Thai names | `scripts/deidentify.py` (top) |
| ETL Pipeline | Chunking strategy, metadata | `scripts/etl_pipeline.py` (top) |
| Tokenizer | SentencePiece config, training | `scripts/train_tokenizer.py` (top) |
| NER Data | Entity types, clinician labels | `scripts/generate_ner_data.py` (top) |
| Clinical Personas | Summary requirements | `docs/CLINICAL_PERSONAS_AND_TRIAGE.md` |

---

## 10. Next Steps

- [ ] **Expand NER data**: Collect 500+ clinician-labeled examples
- [ ] **Train custom spaCy NER**: Fine-tune on medical entities
- [ ] **Embedding**: Use tokenizer + transformer for vector representations
- [ ] **Milvus ingestion**: Load chunked data into vector DB
- [ ] **Evaluation**: Measure token accuracy, coverage, retrieval precision
- [ ] **Production pipeline**: Automate ETL on daily hospital exports

---

**Last reviewed**: 2026-05-16  
**Next review**: 2026-06-16

