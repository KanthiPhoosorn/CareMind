# Medical AI Training & Evaluation Guide

> Complete guide to training a small medical encoder, fine-tuning for NER, building drug interaction rules, and generating evaluation sets.
>
> **Timeline**: 1-4 weeks depending on compute resources  
> **Status**: Infrastructure complete, ready for training
>
> **Last updated**: 2026-05-16

---

## Overview

Four parallel tracks for ML infrastructure:

| Track | Duration | Task | Output |
| --- | --- | --- | --- |
| **1. Encoder Training** | 1-2 weeks | Train 50-100M param encoder (MLM) on 1-5B tokens | Checkpoint files |
| **2. NER Fine-tuning** | 3-5 days | Fine-tune encoder for NER (target: 500-1000 labels) | NER model + labels |
| **3. Drug Rules** | 1 day | Build interaction rule engine | Drug database JSON |
| **4. Eval Sets** | 2-3 days | Generate gold-standard evaluation sets | 100 cases + 100 triage |

---

## 1. Medical Encoder Training

**Location**: `scripts/train_medical_encoder.py`  
**Utilities**: `scripts/training_utils.py`

### What it does

Trains a small transformer encoder from scratch using masked language modeling (MLM).

- **Model size**: 50-100M parameters (tiny/small/medium/base presets)
- **Data**: Thai + English + medical mixed corpus (1-5B tokens)
- **Objective**: Predict masked tokens in clinical text
- **Output**: Checkpoint files for use in fine-tuning and inference

### Setup

**1. Install dependencies:**
```bash
pip install -r scripts/requirements-data-pipeline.txt
```

**2. Build training corpus:**
```bash
# From ETL pipeline output (recommended)
python scripts/train_medical_encoder.py --build-corpus \
    --corpus-source output/all_chunks.jsonl \
    --output-corpus corpus/medical_corpus.jsonl \
    --limit-tokens 5000000000  # 5B tokens (optional)
```

The corpus builder will:
- Extract text from JSONL chunks
- Normalize Thai+English medical text
- Handle abbreviations (HTN → hypertension, etc.)
- Remove duplicates
- Output ready-for-training JSONL

### Training

**Start training small model (recommended for testing):**
```bash
python scripts/train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --model-size small \
    --batch-size 64 \
    --learning-rate 1e-4 \
    --max-steps 100000 \
    --warmup-steps 10000 \
    --eval-steps 5000 \
    --checkpoint-dir checkpoints/medical_encoder/ \
    --gradient-accumulation-steps 2
```

**For larger corpus (full training):**
```bash
# Use medium model if you have GPU with 24+ GB VRAM
python scripts/train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --model-size medium \
    --batch-size 32 \
    --max-steps 500000 \
    --checkpoint-dir checkpoints/medical_encoder/
```

**Resume from checkpoint:**
```bash
python scripts/train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --resume-from checkpoints/medical_encoder/checkpoint-epoch2-step50000/
```

### Model Architectures

```
Tiny:    256 hidden, 4 layers   → ~30M params
Small:   512 hidden, 6 layers   → ~60M params
Medium:  768 hidden, 12 layers  → ~110M params
Base:    768 hidden, 12 layers  → ~110M params
```

### Hardware Requirements

| Model | Batch Size | VRAM | Training Time (5B tokens) |
| --- | --- | --- | --- |
| Tiny | 256 | 4 GB | ~24 hours |
| Small | 64 | 8 GB | ~1 week |
| Medium | 32 | 24 GB | ~2 weeks |
| Base | 16 | 32 GB | ~2-3 weeks |

### Monitoring Training

Check logs during training:
```bash
# View training loss
tail -f checkpoints/medical_encoder/training.log

# Load best checkpoint
ls -la checkpoints/medical_encoder/
# Look for checkpoint with lowest eval_loss
```

Checkpoints are saved every N eval steps. Early checkpoints (5-10% training) can be used immediately for fine-tuning.

---

## 2. NER Fine-tuning

**Location**: `scripts/finetune_ner.py`

### What it does

Fine-tunes the pre-trained encoder for Named Entity Recognition (NER).

- **Task**: Identify DRUG, DISEASE, SYMPTOM, LAB, DOSAGE, VITAL, ANATOMY, PROCEDURE
- **Training data**: 100+ labeled examples (expand to 500-1000 for production)
- **Output**: NER model ready for inference + auto-labels for unlabeled data

### Data Preparation

**Generate initial 100+ labeled examples:**
```bash
python scripts/generate_ner_data.py \
    --output-dir ner_data/ \
    --format json
```

**Expand to 500+ examples:**

Option 1: Manual annotation (most accurate)
```
1. Use model to predict labels on unlabeled data
2. Have clinical staff verify/correct predictions
3. Add corrected labels to training set
```

Option 2: Active learning (semi-automated)
```bash
# Use encoder to generate candidate labels
python scripts/finetune_ner.py --generate-labels \
    --model-path checkpoints/medical_ner/best_model/ \
    --unlabeled-data ner_data/unlabeled_notes.jsonl \
    --output-labels ner_data/ner_generated.json

# Manually review generated labels
# Add high-confidence examples to training set
```

### Fine-tuning

**Fine-tune on initial 100 examples:**
```bash
python scripts/finetune_ner.py --train \
    --pretrained-model checkpoints/medical_encoder/checkpoint-epoch2-step50000/ \
    --train-data ner_data/ner_train.json \
    --output-dir checkpoints/medical_ner/ \
    --batch-size 16 \
    --max-epochs 10 \
    --learning-rate 2e-5
```

**Fine-tune on expanded 500+ examples:**
```bash
python scripts/finetune_ner.py --train \
    --pretrained-model checkpoints/medical_encoder/checkpoint-epoch5-step250000/ \
    --train-data ner_data/ner_expanded_500.json \
    --output-dir checkpoints/medical_ner_v2/ \
    --batch-size 32 \
    --max-epochs 5
```

### Evaluation

Metrics tracked during training:
- **F1 score** — Harmonic mean of precision + recall
- **Precision** — Accuracy of predicted entities
- **Recall** — Coverage of actual entities

Example eval output:
```
Eval Loss: 0.0234
Eval F1: 0.92 (excellent)
  - DRUG:     precision=0.94, recall=0.91
  - DISEASE:  precision=0.91, recall=0.89
  - SYMPTOM:  precision=0.88, recall=0.90
  - LAB:      precision=0.93, recall=0.91
```

### Generate Labels for Unlabeled Data

Once model is trained:
```bash
python scripts/finetune_ner.py --generate-labels \
    --model-path checkpoints/medical_ner/best_model/ \
    --unlabeled-data clinical_notes_unlabeled.jsonl \
    --output-labels generated_labels.json
```

This produces auto-labeled data that can be:
1. Manually reviewed/corrected
2. Added back to training set for v2 training
3. Used for distant supervision

---

## 3. Drug Interaction Rule Engine

**Location**: `scripts/drug_interaction_engine.py`

### What it does

Creates a rule-based system for drug interactions, contraindications, and dosing.

- **Interactions**: Warfarin + ASA, macrolide + statins, NSAIDs + ACE-I, etc.
- **Contraindications**: Drug-disease (beta blockers + asthma, etc.)
- **Allergy groups**: Cross-reactivity (penicillin ↔ cephalosporins)
- **Renal dosing**: GFR-based dose adjustments

### Build Default Database

```bash
python scripts/drug_interaction_engine.py --build-database \
    --output-db drugs/drug_database.json
```

This creates a starter database with:
- ~20 common medications
- ~10 major drug-drug interactions
- ~4 drug-disease contraindications
- ~4 allergy cross-reactivity groups
- Renal dosing for 3 drugs

Output: `drugs/drug_database.json` (~10 KB JSON)

### Customize Database

Add your own drugs and interactions:

```python
from drug_interaction_engine import DrugDatabase, SeverityLevel

db = DrugDatabase()

# Add drug
db.add_drug("Clarithromycin", "macrolide_antibiotic")

# Add interaction
db.add_interaction(
    "Clarithromycin", "Lovastatin",
    SeverityLevel.CONTRAINDICATED,
    "Macrolide inhibits CYP3A4, causing statin toxicity",
    "Use pravastatin/rosuvastatin instead; hold lovastatin",
    "Monitor for myalgia, check CK"
)

# Add contraindication
db.add_contraindication("ACE-I", "Pregnancy", "Teratogenic in 2nd/3rd trimester")

# Save
db.save_to_file("drugs/drug_database_custom.json")
```

### Check Interactions

**Check two drugs:**
```bash
python scripts/drug_interaction_engine.py --check \
    --drugs "warfarin,aspirin" \
    --db drugs/drug_database.json
```

Output:
```
✓ Found 1 interactions:

  warfarin + aspirin
  Severity: SEVERE
  Reason: Both inhibit hemostasis - increased bleeding risk
  Recommendation: Avoid concurrent use; if necessary, use lowest ASA dose
  Management: Monitor INR every 2-3 days initially
```

### Validate Prescriptions

**Create patient data:**
```json
{
  "patient_id": "P123",
  "conditions": ["hypertension", "diabetes", "CKD"],
  "allergies": ["penicillin", "aspirin"],
  "renal_function": {
    "gfr": 32,
    "serum_creatinine": 2.1
  }
}
```

**Create prescription:**
```json
{
  "patient_id": "P123",
  "medications": [
    {"drug": "Lisinopril", "dose": "10mg", "frequency": "daily"},
    {"drug": "Metformin", "dose": "500mg", "frequency": "BID"},
    {"drug": "Atorvastatin", "dose": "40mg", "frequency": "daily"}
  ]
}
```

**Validate:**
```bash
python scripts/drug_interaction_engine.py --validate-prescription \
    --prescription prescription.json \
    --patient-data patient.json \
    --db drugs/drug_database.json
```

Output:
```
============================================================
Prescription Validation: ✗ ISSUES FOUND
============================================================

WARNINGS:
  ⚠ RENAL DOSING: Metformin dosing adjustment needed (GFR 32)

RECOMMENDATIONS:
  → GFR < 30: contraindicated; hold Metformin
```

### Integrate into Chatbot

The rule engine can be called during prescription review:

```python
from drug_interaction_engine import DrugDatabase, PrescriptionValidator

db = DrugDatabase.load_from_file("drugs/drug_database.json")
validator = PrescriptionValidator(db)

# In your API
result = validator.validate(prescription, patient_data)
if result['alerts']:
    return error_response(result['alerts'])
```

---

## 4. Evaluation Sets

**Location**: `scripts/generate_eval_sets.py`

### What it does

Generates gold-standard evaluation datasets:
- **100 clinical cases** with persona-specific summaries
- **100 triage scenarios** with red-flag labels

### Generate Evaluation Sets

```bash
python scripts/generate_eval_sets.py \
    --output-cases eval_data/clinical_cases_100.json \
    --output-triage eval_data/triage_scenarios_100.json \
    --num-cases 100 \
    --num-triage 100
```

### Clinical Cases

Each case includes:

```json
{
  "id": "case_001",
  "title": "Fever + Cough",
  "chief_complaint": "38.5°C fever × 3 days, productive cough",
  "hpi": "68-year-old male with fever, productive cough...",
  "pmi": "HTN, DM type 2",
  "vitals": {"temp": 38.5, "hr": 98, "bp": "135/85", ...},
  "pe": "Bilateral crackles RLL...",
  "labs": {"wbc": 14.5, "cxr": "RLL infiltrate"},
  
  "doctor_summary": "68-year-old with fever, productive cough, RLL infiltrate...",
  "nurse_summary": "Patient admitted with pneumonia. Vitals: Temp 38.5°C...",
  "pharmacist_summary": "Azithromycin 500mg daily × 5 days. Patient on Lisinopril..."
}
```

**Use for:**
- Training abstractive summarization models
- Evaluating model summaries against gold standard
- Comparing persona-specific outputs
- BLEU/ROUGE scoring

### Triage Scenarios

Each scenario includes:

```json
{
  "id": "triage_001",
  "complaint": "Fever 39.5°C, cough, SOB",
  "red_flag": "urgent",
  "reasoning": "Fever + respiratory symptoms + hypoxia risk...",
  "key_findings": ["High fever", "Respiratory distress", "Hypoxia"]
}
```

**Red-flag types:**
- `ACUTE_EMERGENCY` — ICU/ER referral needed
- `SEVERE_CHRONIC` — Hospital admission needed
- `URGENT` — Same-day evaluation needed
- `ROUTINE` — Outpatient management
- `NOT_RED_FLAG` — No emergency features

**Use for:**
- Training triage classification models
- Evaluating red-flag detection accuracy
- Benchmark chatbot judgment calls

### Custom Cases

Add your own cases:

```python
from generate_eval_sets import save_clinical_cases, save_triage_scenarios

custom_case = {
    "id": "custom_001",
    "title": "Your case title",
    "chief_complaint": "...",
    "hpi": "...",
    "doctor_summary": "...",
    "nurse_summary": "...",
    "pharmacist_summary": "..."
}

cases = [custom_case]
save_clinical_cases(cases, "eval_data/custom_cases.json")
```

---

## 5. Training Infrastructure Utilities

**Location**: `scripts/training_utils.py`

### MedicalTextProcessor

Normalizes Thai+English medical text:
```python
from training_utils import MedicalTextProcessor

processor = MedicalTextProcessor()
text = "ผู้ป่วยมี HTN BP 130/85 ไอ"
normalized = processor.normalize_text(text)
# → "patient has hypertension blood pressure 130/85 cough"
```

### MedicalCorpusBuilder

Build corpus from various sources:
```python
from training_utils import MedicalCorpusBuilder

builder = MedicalCorpusBuilder()

# Add from JSONL (ETL output)
builder.add_from_jsonl("output/all_chunks.jsonl", text_field="content")

# Add from directory
builder.add_from_directory("data/", pattern="*.jsonl")

# Save corpus
builder.save_corpus("corpus/medical_corpus.jsonl")
builder.print_stats()
```

### CheckpointManager

Manage training checkpoints:
```python
from training_utils import CheckpointManager

manager = CheckpointManager("checkpoints/")

# Save checkpoint
manager.save_checkpoint(model, optimizer, epoch=2, step=50000, 
                        metrics={'loss': 0.23, 'f1': 0.91})

# Load checkpoint
epoch, step = manager.load_checkpoint(model, optimizer, 
                                       "checkpoints/checkpoint-epoch2-step50000/")

# List checkpoints
checkpoints = manager.list_checkpoints()
```

### create_data_loaders

Create PyTorch data loaders:
```python
from training_utils import create_data_loaders

train_loader, eval_loader = create_data_loaders(
    corpus=corpus_data,
    tokenizer=tokenizer,
    batch_size=64,
    train_ratio=0.9
)

for batch in train_loader:
    # batch['input_ids'], batch['labels'], etc.
```

---

## 6. Complete Training Pipeline

### Week 1: Encoder Training (1-2 weeks total)

**Day 1-2: Preparation**
```bash
# Build corpus
python scripts/train_medical_encoder.py --build-corpus \
    --corpus-source output/ \
    --output-corpus corpus/medical_corpus.jsonl

# Check corpus size
wc -l corpus/medical_corpus.jsonl
# Should be millions of lines
```

**Day 3-7: Train small model**
```bash
python scripts/train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --model-size small \
    --max-steps 50000

# Monitor checkpoints
ls -la checkpoints/medical_encoder/
```

**Day 8-14: Train medium/base model (if GPU available)**

### Week 2: NER Fine-tuning (3-5 days)

**Day 1: Fine-tune on initial 100 labels**
```bash
python scripts/finetune_ner.py --train \
    --pretrained-model checkpoints/medical_encoder/checkpoint-epoch2-step50000/ \
    --train-data ner_data/ner_train.json \
    --max-epochs 10
```

**Day 2-4: Label expansion**
- Generate labels for unlabeled data
- Manual review + correction
- Add high-confidence labels to training set

**Day 5: Fine-tune v2**
```bash
python scripts/finetune_ner.py --train \
    --pretrained-model checkpoints/medical_encoder/checkpoint-epoch5-step250000/ \
    --train-data ner_data/ner_expanded_500.json \
    --max-epochs 5
```

### Day 15-16: Rule Engine + Eval Sets

**Day 15:**
```bash
python scripts/drug_interaction_engine.py --build-database
# ~5 minutes
```

**Day 16:**
```bash
python scripts/generate_eval_sets.py --output-cases eval_data/cases_100.json
# ~2 minutes
```

---

## 7. GPU Optimization

### Enable Gradient Checkpointing

Reduce memory usage:
```python
model.encoder.gradient_checkpointing_enable()
```

### Mixed Precision Training

Faster training with reduced memory:
```bash
# Automatic mixed precision (AMP)
accelerate launch --mixed_precision fp16 train_medical_encoder.py ...
```

### Distributed Training

Multi-GPU training:
```bash
# 4 GPUs
accelerate launch --multi_gpu train_medical_encoder.py --max-steps 200000 ...
```

### Batch Size Tuning

Find maximum batch size:
```bash
# Test incrementally
for BS in 32 64 128 256; do
    python train_medical_encoder.py \
        --batch-size $BS \
        --max-steps 100  # Quick test
done
```

---

## 8. Troubleshooting

### Out of Memory (OOM)

```python
# Reduce batch size
--batch-size 16

# Enable gradient accumulation
--gradient-accumulation-steps 4

# Enable gradient checkpointing
model.gradient_checkpointing_enable()

# Use CPU offloading
--use_cpu_offload
```

### Training too slow

```bash
# Use smaller model
--model-size tiny

# Use mixed precision
--mixed-precision fp16

# Use multi-GPU
accelerate launch --multi_gpu ...

# Increase batch size
--batch-size 128
```

### NaN loss

```python
# Reduce learning rate
--learning-rate 1e-5

# Add gradient clipping
torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)

# Check for bad data
# Remove examples with very long text
```

### CUDA out of memory

```bash
# Check GPU memory
nvidia-smi

# Reduce batch size
--batch-size 8

# Enable AMP
--mixed-precision fp16

# Clear CUDA cache
python -c "import torch; torch.cuda.empty_cache()"
```

---

## 9. Production Deployment

### Export Trained Models

```bash
# Export encoder
cp -r checkpoints/medical_encoder/checkpoint-epoch5-step250000/ \
    models/medical_encoder_v1/

# Export NER model
cp -r checkpoints/medical_ner/best_model/ \
    models/medical_ner_v1/

# Export drug database
cp drugs/drug_database.json models/
```

### Docker Container

```dockerfile
FROM python:3.10
WORKDIR /app

COPY scripts/ ./scripts/
COPY models/ ./models/
COPY scripts/requirements-data-pipeline.txt ./

RUN pip install -r requirements-data-pipeline.txt

# Load models on startup
RUN python -c "from transformers import AutoModel; \
    AutoModel.from_pretrained('/app/models/medical_encoder_v1/')"
```

### API Integration

```python
from transformers import AutoModel, AutoTokenizer
from finetune_ner import NERModel
from drug_interaction_engine import DrugDatabase, PrescriptionValidator

# Load models
encoder = AutoModel.from_pretrained("models/medical_encoder_v1/")
tokenizer = AutoTokenizer.from_pretrained("models/medical_encoder_v1/")
ner_model = NERModel.from_pretrained("models/medical_ner_v1/")
drug_db = DrugDatabase.load_from_file("models/drug_database.json")

# Use in API
@app.post("/api/analyze-note")
def analyze_note(text: str):
    # NER
    entities = ner_model.predict(text)
    
    # Drug interactions
    drugs = [e['text'] for e in entities if e['type'] == 'DRUG']
    interactions = drug_db.check_all_interactions(drugs)
    
    return {
        'entities': entities,
        'interactions': interactions
    }
```

---

## 10. Next Steps

- [ ] **Week 1**: Train encoder on full corpus
- [ ] **Week 2-3**: Fine-tune NER, expand labels to 500+
- [ ] **Week 3-4**: Integrate drug rules + eval sets into chatbot
- [ ] **Week 4+**: Fine-tune on downstream tasks (summarization, triage)
- [ ] Deploy to production with monitoring

---

## References

- HuggingFace Transformers: https://huggingface.co/transformers/
- PyTorch: https://pytorch.org/
- Masked Language Modeling: https://arxiv.org/abs/1810.04805 (BERT)
- Named Entity Recognition: https://huggingface.co/tasks/token-classification
- seqeval: https://github.com/chakki-works/seqeval

---

**Last reviewed**: 2026-05-16  
**Next review**: 2026-06-16

