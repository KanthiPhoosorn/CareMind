# Training Infrastructure Quick Start

> TL;DR guide to using the ML training scripts created for CareMind.

---

## 📦 What You Got

| Component | Files | Status | Ready to Use? |
| --- | --- | --- | --- |
| **Data Pipeline** | deidentify.py, etl_pipeline.py, train_tokenizer.py, generate_ner_data.py | ✅ Complete | NOW |
| **Training Utils** | training_utils.py | ✅ Complete | NOW |
| **Encoder Training** | train_medical_encoder.py | ✅ Complete | NOW (async) |
| **NER Fine-tuning** | finetune_ner.py | ✅ Complete | NOW (async) |
| **Drug Rules** | drug_interaction_engine.py | ✅ Complete | NOW |
| **Eval Sets** | generate_eval_sets.py | ✅ Complete | NOW |
| **Documentation** | TRAINING_AND_EVALUATION.md | ✅ Complete | NOW |

---

## 🚀 Quick Commands

### Generate Evaluation Sets (5 min)

```bash
# Create 100 clinical cases + 100 triage scenarios
python scripts/generate_eval_sets.py
```

Output:
- `eval_data/clinical_cases_100.json` — Cases with doctor/nurse/pharmacist summaries
- `eval_data/triage_scenarios_100.json` — Triage scenarios with red-flag labels

### Build Drug Safety Database (2 min)

```bash
# Create drug interaction rules
python scripts/drug_interaction_engine.py --build-database
```

Output: `drugs/drug_database.json` (~10 KB)

Use it:
```bash
# Check drug interactions
python scripts/drug_interaction_engine.py --check \
    --drugs "warfarin,aspirin"

# Validate prescription
python scripts/drug_interaction_engine.py --validate-prescription \
    --prescription rx.json \
    --patient-data patient.json
```

### Prepare Training Data (10-30 min)

```bash
# Step 1: Convert Excel → normalized chunks (ETL)
python scripts/etl_pipeline.py \
    --input-dir data/ \
    --output-dir output/

# Step 2: Build corpus from ETL output
python scripts/train_medical_encoder.py --build-corpus \
    --corpus-source output/all_chunks.jsonl \
    --output-corpus corpus/medical_corpus.jsonl

# Step 3: Check corpus
wc -l corpus/medical_corpus.jsonl
```

### Train Encoder (1-2 weeks, async)

```bash
# Quick test on small data (30 min)
python scripts/train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --model-size tiny \
    --max-steps 1000

# Full training (background process)
nohup python scripts/train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --model-size small \
    --max-steps 100000 \
    --checkpoint-dir checkpoints/medical_encoder/ \
    > training.log 2>&1 &
```

Monitor:
```bash
tail -f training.log
ls -la checkpoints/medical_encoder/
```

### Fine-tune for NER (3-10 days, async)

```bash
# Using pre-trained checkpoint
python scripts/finetune_ner.py --train \
    --pretrained-model checkpoints/medical_encoder/checkpoint-epoch2-step50000/ \
    --train-data ner_data/ner_train.json \
    --output-dir checkpoints/medical_ner/ \
    --max-epochs 10
```

Then expand labels:
```bash
# Auto-label unlabeled data
python scripts/finetune_ner.py --generate-labels \
    --model-path checkpoints/medical_ner/best_model/ \
    --unlabeled-data unlabeled.jsonl \
    --output-labels generated_labels.json
```

---

## 📊 What Each Script Does

### training_utils.py (Library)

Use these classes in your own code:

```python
from training_utils import (
    MedicalTextProcessor,      # Normalize Thai+English medical text
    MedicalCorpusBuilder,      # Build corpus from files
    MaskedLanguageModelingDataset,  # PyTorch dataset
    CheckpointManager,         # Save/load checkpoints
    create_data_loaders,       # Create train/eval loaders
)

# Example
processor = MedicalTextProcessor()
normalized = processor.normalize_text("ผู้ป่วยมี HTN BP 130/85")

builder = MedicalCorpusBuilder()
builder.add_from_jsonl("output/all_chunks.jsonl")
builder.save_corpus("corpus.jsonl")
```

### train_medical_encoder.py (Training)

Pre-train transformer encoder on clinical text.

```bash
# Build corpus
python train_medical_encoder.py --build-corpus \
    --corpus-source output/ \
    --output-corpus corpus/medical_corpus.jsonl

# Train (on GPU)
python train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --model-size small \
    --max-steps 100000

# Resume
python train_medical_encoder.py --train \
    --corpus corpus/medical_corpus.jsonl \
    --resume-from checkpoints/medical_encoder/checkpoint-epoch2-step50000/
```

Model sizes:
- `tiny` — ~30M params, 4 GB VRAM, 24 hours training
- `small` — ~60M params, 8 GB VRAM, 1 week training
- `medium` — ~110M params, 24 GB VRAM, 2 weeks training

### finetune_ner.py (NER)

Fine-tune encoder for Named Entity Recognition.

```bash
# Fine-tune on labeled data
python finetune_ner.py --train \
    --pretrained-model checkpoints/medical_encoder/checkpoint-epoch2/ \
    --train-data ner_data/ner_train.json \
    --output-dir checkpoints/medical_ner/

# Auto-label unlabeled data
python finetune_ner.py --generate-labels \
    --model-path checkpoints/medical_ner/best_model/ \
    --unlabeled-data unlabeled.jsonl \
    --output-labels generated.json
```

### drug_interaction_engine.py (Safety Rules)

Rule-based drug safety engine.

```bash
# Build database
python drug_interaction_engine.py --build-database

# Check interactions
python drug_interaction_engine.py --check --drugs "warfarin,aspirin"

# Validate prescription
python drug_interaction_engine.py --validate-prescription \
    --prescription rx.json \
    --patient-data patient.json
```

### generate_eval_sets.py (Benchmarks)

Create gold-standard evaluation data.

```bash
# Generate 100 cases + 100 triage scenarios
python generate_eval_sets.py \
    --output-cases eval_data/cases_100.json \
    --output-triage eval_data/triage_100.json
```

---

## 🔧 Configuration

### GPU Setup

```bash
# Check GPU availability
nvidia-smi

# Use specific GPU
export CUDA_VISIBLE_DEVICES=0

# Multi-GPU training
accelerate launch --multi_gpu train_medical_encoder.py ...
```

### Memory Issues?

```bash
# Reduce batch size
--batch-size 8

# Enable gradient accumulation
--gradient-accumulation-steps 4

# Use mixed precision
--mixed-precision fp16
```

### Checkpoints

All scripts save checkpoints automatically:
```
checkpoints/
├── medical_encoder/
│   ├── checkpoint-epoch1-step25000/
│   ├── checkpoint-epoch2-step50000/
│   └── checkpoint-epoch5-step250000/
├── medical_ner/
│   └── best_model/
```

Resume from any checkpoint:
```bash
--resume-from checkpoints/medical_encoder/checkpoint-epoch2-step50000/
```

---

## 📈 Training Timeline

**Week 1:**
- Day 1-2: Prepare data (corpus building)
- Day 3-7: Train small encoder
- Day 8-14: Train medium encoder (if GPU available)

**Week 2:**
- Day 1: Fine-tune NER on 100 labels
- Day 2-4: Expand labels to 500+
- Day 5: Fine-tune v2 on expanded set

**Day 15:**
- Build drug database (5 min)
- Generate eval sets (2 min)

**Complete in parallel while encoder trains!**

---

## 💡 Tips

1. **Use early checkpoints**: Don't wait for full training. Use checkpoints after 5-10% training for downstream tasks.

2. **Monitor with TensorBoard**:
   ```bash
   tensorboard --logdir checkpoints/
   ```

3. **Backup important checkpoints**:
   ```bash
   cp -r checkpoints/medical_encoder/checkpoint-epoch5-step250000/ \
       models/medical_encoder_prod/
   ```

4. **Combine with data pipeline**:
   ```bash
   # ETL → Corpus → Encoder → NER fine-tune
   # All outputs feed into each other
   ```

5. **Evaluate as you go**:
   ```bash
   # Use eval sets immediately after generation
   # Don't wait for training to complete
   ```

---

## 🎯 Next Steps

- [ ] Run data pipeline (5 min)
- [ ] Generate eval sets (2 min)
- [ ] Build drug database (2 min)
- [ ] Start encoder training (async)
- [ ] While training: label 500+ NER examples
- [ ] Fine-tune NER (after encoder checkpoint)
- [ ] Integrate into chatbot

---

## 📚 Full Documentation

For complete details, see: [`docs/TRAINING_AND_EVALUATION.md`](../docs/TRAINING_AND_EVALUATION.md)

---

**Questions?** Check the docstrings in each script:
```bash
python scripts/train_medical_encoder.py --help
python scripts/finetune_ner.py --help
python scripts/drug_interaction_engine.py --help
python scripts/generate_eval_sets.py --help
```

