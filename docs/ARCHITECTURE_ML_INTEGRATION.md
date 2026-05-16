# CareMind ML Architecture & Integration

> Complete system architecture showing how trained models, data pipeline, and safety layers connect to the chatbot.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CAREMIND AI SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  LAYER 1: DATA SOURCE                                                   │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Hospital HIS (Excel Exports)                                   │    │
│  │ ├─ Doctor notes, Nurse notes, Lab results                      │    │
│  │ ├─ Medication records, Imaging reports                         │    │
│  │ └─ Patient demographics, Vital signs                           │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                ↓                                         │
│  LAYER 2: DATA PIPELINE                                                 │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ ETL Pipeline (scripts/etl_pipeline.py)                         │    │
│  │ ├─ Read Excel files (encounter-based)                          │    │
│  │ ├─ Detect document types (doctor/nurse/lab/imaging)           │    │
│  │ ├─ De-identify PII (scripts/deidentify.py)                     │    │
│  │ ├─ Chunk by section (assessment/plan/findings)                 │    │
│  │ ├─ Preserve metadata (timestamp, author, role)                 │    │
│  │ └─ Output: JSONL chunks + index                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                ↓                                         │
│  LAYER 3: TOKENIZATION                                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ SentencePiece Tokenizer (scripts/train_tokenizer.py)           │    │
│  │ ├─ BPE algorithm, 32k vocabulary                               │    │
│  │ ├─ Thai+English code-switching support                         │    │
│  │ ├─ Medical abbreviation normalization                          │    │
│  │ └─ Output: .model + .vocab files                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                ↓                                         │
│  LAYER 4: MODEL TRAINING (Async, 1-2 weeks)                            │
│  ┌──────────────────────┐        ┌──────────────────────────────┐      │
│  │ Encoder Training     │        │ Auxiliary Engines            │      │
│  │ (MLM objective)      │        │ ├─ Drug Interaction Rules    │      │
│  │                      │        │ │ (script: drug_*.py)         │      │
│  │ • Model: BERT-like   │        │ ├─ ~20 drugs                │      │
│  │   encoder (50-110M)  │        │ ├─ ~10 interactions         │      │
│  │ • Data: 1-5B tokens  │        │ ├─ Allergy groups           │      │
│  │ • Sizes: tiny/small/ │        │ └─ Renal dosing rules       │      │
│  │   medium/base        │        │                              │      │
│  │ • Output:            │        │ Evaluation Sets              │      │
│  │   Checkpoints        │        │ (script: generate_*.py)      │      │
│  │                      │        │ ├─ 100 clinical cases       │      │
│  │                      │        │ ├─ 100 triage scenarios     │      │
│  │                      │        │ └─ Gold-standard summaries  │      │
│  └──────────────────────┘        └──────────────────────────────┘      │
│         ↓ Checkpoint                                                     │
│         (epoch2, step 50k+)                                              │
│         ↓                                                                │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ NER Fine-tuning (3-5 days)                                   │      │
│  │ ├─ Pre-trained: encoder checkpoint                           │      │
│  │ ├─ Labeled data: 100→500+ NER examples                       │      │
│  │ ├─ 8 entity types (DRUG, DISEASE, SYMPTOM, LAB, etc.)       │      │
│  │ ├─ Metrics: F1/precision/recall                              │      │
│  │ ├─ Auto-labeling: semi-supervised expansion                  │      │
│  │ └─ Output: NER model checkpoint                              │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                ↓                                         │
│  LAYER 5: INFERENCE (Production Deployment)                            │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Model Server (FastAPI/Flask)                                 │      │
│  │ ├─ Load: Encoder (768-d embeddings)                          │      │
│  │ ├─ Load: NER model (token classification)                    │      │
│  │ ├─ Load: Drug database (JSON rules)                          │      │
│  │ └─ Load: Tokenizer (SentencePiece)                           │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                ↓                                         │
│  LAYER 6: RETRIEVAL + SAFETY                                            │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Hybrid Retriever (scripts/shared/services/hybrid_retriever)  │      │
│  │ ├─ Encode query with pre-trained encoder → 768-d vector      │      │
│  │ ├─ Dense search: Milvus vector DB                            │      │
│  │ ├─ Sparse search: BM25 on chunk text + metadata              │      │
│  │ ├─ Hybrid score: combine dense + sparse                      │      │
│  │ ├─ NER: extract entities from results (drugs, diseases)      │      │
│  │ ├─ Drug validation: cross-check with interaction engine      │      │
│  │ └─ Output: [chunk1, chunk2, ...] + [alert1, alert2, ...]    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                ↓                                         │
│  LAYER 7: CLINICAL SAFETY LAYER                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Pre-generation (Input)                                       │      │
│  │ ├─ PII detection + redaction (deidentify.py)                 │      │
│  │ └─ Query validation                                          │      │
│  │                                                              │      │
│  │ Post-generation (Output)                                     │      │
│  │ ├─ Content filtering (dangerous patterns)                    │      │
│  │ ├─ Hallucination detection (ML-ready, rule-based)            │      │
│  │ ├─ Drug interaction checking (from engine)                   │      │
│  │ ├─ PII leakage detection                                     │      │
│  │ └─ Confidence scoring + audit logging                        │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                ↓                                         │
│  LAYER 8: PERSONA-SPECIFIC SUMMARIES                                    │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Summarization (LLM-based or template-based)                  │      │
│  │ ├─ Doctor: decision-making focus (diagnoses, plan)           │      │
│  │ ├─ Nurse: care coordination (vitals, tasks, timeline)        │      │
│  │ └─ Pharmacist: safety focus (drugs, interactions, dosing)    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                ↓                                         │
│  LAYER 9: CHATBOT API                                                   │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ shared/services/ai.ts (TypeScript abstraction)               │      │
│  │ ├─ Single interface to all AI services                       │      │
│  │ ├─ Hospital/role/patient scope enforcement                   │      │
│  │ ├─ Streaming response support                                │      │
│  │ ├─ Citation + source tracking                                │      │
│  │ └─ Caching layer (patientId, fromTs, toTs)                   │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                ↓                                         │
│  LAYER 10: USER INTERFACE                                               │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Patient Chatbot (mobile/web)                                 │      │
│  │ ├─ Plain language summaries                                  │      │
│  │ ├─ Vital sign trends + red-flag alerts                       │      │
│  │ └─ Medication reminders + side-effect checks                 │      │
│  │                                                              │      │
│  │ Staff Chatbot (web)                                          │      │
│  │ ├─ Doctor: structured plans + diagnosis reasoning            │      │
│  │ ├─ Nurse: task lists + vital trends                          │      │
│  │ └─ Pharmacist: drug interactions + dosing recommendations    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Example 1: Patient Asks "Why can't I take this drug?"

```
1. INPUT (Patient mobile app)
   Text: "I read online azithromycin and atorvastatin together is bad. Is it true?"
   
2. SAFETY LAYER (Pre-generation)
   ├─ PII check: ✓ No personal data
   └─ Query validation: ✓ OK
   
3. NLP PROCESSING
   ├─ Tokenize: azithromycin + atorvastatin → token IDs
   ├─ NER: Extract DRUG entities
   │  └─ Drugs detected: ["azithromycin", "atorvastatin"]
   └─ Encode query → 768-d vector
   
4. RETRIEVAL
   ├─ Dense: Find similar chunks (patient's medications, interactions)
   ├─ Sparse: Find chunks mentioning "macrolide" + "statin"
   └─ Hybrid: Combine scores → top-3 chunks
   
5. DRUG INTERACTION CHECK
   ├─ Query engine: Check(azithromycin, atorvastatin)
   └─ Result: ⚠ SEVERE interaction (CYP3A4 inhibition → statin toxicity)
   
6. GENERATION (LLM)
   Input: [query, retrieved_chunks, drug_alert]
   Output: "Yes, there's a real interaction. Azithromycin inhibits..."
   
7. SAFETY LAYER (Post-generation)
   ├─ Content filter: ✓ No dangerous advice
   ├─ Hallucination check: ✓ Factual
   ├─ PII leak check: ✓ No patient names
   └─ Drug interaction check: ✓ Already noted
   
8. PERSONA TRANSFORM (Patient → Plain language)
   Input: Technical summary
   Output: "Yes, this is a real interaction. Talk to your pharmacist..."
   
9. OUTPUT (Patient sees in app)
   "You're right to be cautious. Azithromycin + atorvastatin have a serious 
    interaction that can cause muscle damage. Your doctor should be notified.
    Don't stop taking either drug without asking your doctor first.
    
    Alert: Discussed with your care team on Feb 15 at 2:30 PM."
```

### Example 2: Doctor Reviews Patient Case

```
1. INPUT (Doctor web app)
   Text: "Summarize this patient's last 3 days of hospital stay"
   Patient: P12345, Hospital: MGH, Role: doctor
   
2. RETRIEVAL
   ├─ Scope: All chunks for P12345, MGH, last 72h
   ├─ Retrieve: All note sections, vitals, labs, meds
   └─ De-identify: Remove PHI (already done in pipeline)
   
3. GENERATION (LLM)
   Input: [query, all_chunks_scoped_to_patient, role=doctor]
   Output: Structured summary with diagnosis reasoning
   
4. NER POST-PROCESSING
   ├─ Extract: medications, diagnoses, labs from output
   ├─ Validate: Check labs against normal ranges
   └─ Flag: Any critical values
   
5. DRUG INTERACTION CHECK
   ├─ Extract drugs from summary
   ├─ Cross-check with patient's allergy list
   └─ Flag any interactions or allergy risks
   
6. PERSONA-SPECIFIC FORMATTING (Doctor persona)
   Input: Generated text + structured data
   Output: "Assessment: 68-year-old with pneumonia. WBC 14.5 (↑), CXR: RLL 
           infiltrate. Vitals stable. Plan: Continue azithromycin. Monitor 
           O2 sat q4h. Discharge if afebrile × 24h."
   
7. SAFETY VALIDATION
   ├─ Drug checks: ✓ All dosages within range
   ├─ Hallucination: ✓ Consistent with notes
   └─ Citation: ✓ All statements sourced
   
8. OUTPUT (Doctor sees in web)
   Summary + Sources + Drug alerts + Vital trends
```

---

## Component Details

### 1. Data Pipeline

**Location**: `scripts/etl_pipeline.py`, `scripts/deidentify.py`

**Input**: Raw Excel exports from hospital HIS
- Doctor notes (Word, physician summary)
- Nurse notes (charting system)
- Lab results (structured + interpretive)
- Imaging reports (radiology)
- Medication records (pharmacy)

**Processing**:
```python
# Pseudo-code
for patient_id in patients:
    for encounter in patient.encounters:
        for document in encounter.documents:
            # 1. Detect type (doctor/nurse/lab/etc.)
            doc_type = detect_type(document.filename)
            
            # 2. De-identify
            deidentified = deidentify(document.content)
            
            # 3. Chunk by section
            for section in detect_sections(deidentified):
                chunk = {
                    "encounter_id": encounter.id,
                    "patient_id": patient_id,  # De-identified
                    "chunk_type": doc_type,
                    "section": section.name,
                    "content": section.text,
                    "metadata": {
                        "timestamp": encounter.date,
                        "author_role": detect_role(document),
                        "vitals": extract_vitals(section),
                        "findings": extract_findings(section)
                    }
                }
                output.write(chunk)  # JSONL
```

**Output**: `output/all_chunks.jsonl`
- One JSON object per line (JSONL format)
- Metadata preserved for retrieval
- Ready for training or inference

---

### 2. Tokenizer

**Location**: `scripts/train_tokenizer.py`

**Purpose**: Convert Thai+English medical text to tokens

**Configuration**:
```python
config = {
    "vocab_size": 32000,           # BPE vocabulary
    "algorithm": "BPE",             # Byte-Pair Encoding
    "character_coverage": 0.9999,   # Handle rare Thai diacritics
    "split_by_unicode_script": True, # Separate Thai/English
    "normalization": "identity",    # Preserve distinctiveness
}
```

**Key Feature**: Handles Thai+English code-switching without separate tokenizers
```
Input:  "ผู้ป่วยมี HTN ไข้สูง"
Tokens: ["ผู้", "ป่", "วย", "มี", "HTN", "ไข้", "สูง"]
IDs:    [1234, 5678, 9012, 3456, 7890, 2345, 6789]
```

---

### 3. Encoder Training

**Location**: `scripts/train_medical_encoder.py`

**Objective**: Masked Language Modeling (MLM)
- Randomly mask 15% of tokens
- Train model to predict masked tokens
- Learn bidirectional context (good for retrieval/understanding)

**Model Sizes**:
| Size | Params | Layers | Hidden | VRAM | Time |
|------|--------|--------|--------|------|------|
| tiny | 30M | 4 | 256 | 4 GB | 24h |
| small | 60M | 6 | 512 | 8 GB | 1 week |
| medium | 110M | 12 | 768 | 24 GB | 2 weeks |

**Output**: Checkpoint directories with:
- `pytorch_model.bin` — Model weights
- `config.json` — Architecture config
- `tokenizer_config.json` — Tokenizer settings
- `training.log` — Loss curves

---

### 4. NER Fine-tuning

**Location**: `scripts/finetune_ner.py`

**Task**: Token-level Named Entity Recognition

**Entity Types**:
```python
ENTITY_TYPES = {
    "DRUG": "Medications",
    "DISEASE": "Diagnoses / conditions",
    "SYMPTOM": "Patient symptoms",
    "LAB": "Lab test names",
    "DOSAGE": "Doses / frequency",
    "VITAL": "Vital signs / values",
    "ANATOMY": "Body parts / organs",
    "PROCEDURE": "Surgical / diagnostic procedures"
}
```

**Training Data**: 100+ labeled examples (expand to 500+)
```json
{
  "text": "Patient presents with fever and started on Azithromycin 500mg BID",
  "entities": [
    {"text": "fever", "type": "SYMPTOM", "start": 26, "end": 31},
    {"text": "Azithromycin", "type": "DRUG", "start": 46, "end": 58},
    {"text": "500mg", "type": "DOSAGE", "start": 59, "end": 64},
    {"text": "BID", "type": "DOSAGE", "start": 65, "end": 68}
  ]
}
```

**Output**: Model checkpoint ready for:
- Entity extraction from new notes
- Preprocessing for drug safety checks
- Improving retrieval (entity-focused chunks)

---

### 5. Drug Interaction Engine

**Location**: `scripts/drug_interaction_engine.py`

**Database**: ~20 drugs, ~10 major interactions, allergy groups, renal dosing

**Features**:

1. **Drug-Drug Interactions**
   ```python
   interaction = {
       "drug1": "warfarin",
       "drug2": "aspirin",
       "severity": "SEVERE",
       "reason": "Both inhibit hemostasis → bleeding risk",
       "recommendation": "Avoid concurrent use",
       "management": "Monitor INR closely if necessary"
   }
   ```

2. **Drug-Disease Contraindications**
   ```python
   contraindication = {
       "drug": "beta-blocker",
       "disease": "asthma",
       "reason": "Bronchospasm risk",
       "recommendation": "Use alternative (calcium channel blocker)"
   }
   ```

3. **Allergy Cross-reactivity**
   ```python
   allergy_group = {
       "name": "beta-lactams",
       "drugs": ["penicillin", "amoxicillin", "cephalosporin"],
       "note": "25% cross-reactivity with penicillin allergy"
   }
   ```

4. **Renal Dosing** (GFR-based)
   ```python
   renal_rule = {
       "drug": "ciprofloxacin",
       "doses": {
           "gfr>=60": "500mg q12h",
           "gfr_30_59": "500mg q24h",
           "gfr_15_29": "250mg q24h",
           "gfr<15": "250mg q48h"
       }
   }
   ```

**API**:
```python
# Check interaction
db.check_interaction("warfarin", "aspirin")
# → DrugInteraction(severity=SEVERE, ...)

# Check allergy cross-reactivity
db.check_allergy_cross_reactivity("penicillin", "amoxicillin")
# → True (cross-reactive)

# Validate prescription
validator.validate(prescription, patient)
# → {"valid": False, "alerts": [...], "warnings": [...]}
```

---

### 6. Hybrid Retriever

**Location**: `scripts/shared/services/hybrid_retriever.py`

**Pipeline**:
```
Query → Tokenize → Encode (encoder model)
            ↓
      [768-d vector]
            ↓
    Dense Search (Milvus) + Sparse Search (BM25)
            ↓
    Combine scores (0.5 * dense + 0.5 * sparse)
            ↓
    Top-K chunks [chunk1, chunk2, chunk3, ...]
            ↓
    NER extraction → Detect drugs/diseases in results
            ↓
    Drug validation → Cross-check with interaction engine
            ↓
    Return: [chunks] + [alerts]
```

**Example**:
```python
retriever = HybridRetriever(
    encoder_model="checkpoints/medical_encoder/best/",
    nER_model="checkpoints/medical_ner/best/",
    drug_db="drugs/drug_database.json",
    milvus_host="localhost",
    milvus_port=19530
)

results = retriever.retrieve(
    query="Patient with fever and on azithromycin",
    patient_id="P12345",
    hospital_id="MGH",
    n_results=5
)

# Output:
# {
#   "chunks": [
#     {"id": "chunk_001", "content": "...", "metadata": {...}},
#     {"id": "chunk_002", "content": "...", "metadata": {...}},
#     ...
#   ],
#   "alerts": [
#     {"type": "drug_detected", "drug": "azithromycin", ...},
#     {"type": "interaction", "severity": "MODERATE", ...}
#   ],
#   "entities": {
#     "drugs": ["azithromycin"],
#     "diseases": ["pneumonia"],
#     "labs": ["WBC"]
#   }
# }
```

---

### 7. Clinical Safety Layer

**Location**: `scripts/clinical_safety_layer.py`

**Pre-generation**:
```python
# Input validation
safety.validate_input("Patient John Doe has fever")
# Detects: name "John Doe"
# Returns: "Patient [REDACTED] has fever" + {"pii_found": ["John Doe"]}

# Query sanitization
safety.sanitize_query(query)
# Removes clinical red flags, validates context
```

**Post-generation**:
```python
# Content filtering
safety.check_content("Stop taking warfarin and take 2000mg ibuprofen daily")
# Detects: "stop prescribed drug" + "extreme dosage"
# Returns: is_safe=False, reason="Dangerous combination of actions"

# Hallucination detection
safety.check_hallucination("Azithromycin cures cancer in 100% of cases")
# Detects: "cure" + "100%" + "cancer"
# Returns: confidence=0.95, is_hallucination=True

# PII leakage
safety.check_pii_leakage(generated_text)
# Scans for: names, dates, phone numbers, emails, medical record #s
# Returns: {"found": [], "safe": True}

# Confidence scoring
safety.score_output(text, source_chunks)
# Scores based on: citation match, entity consistency, medical plausibility
# Returns: confidence=0.92
```

---

## Integration Points

### 1. TypeScript Chatbot API

**File**: `shared/services/ai.ts`

```typescript
// Initialize with all models
const ai = new MedicalAI({
  encoder: "./checkpoints/medical_encoder/best/",
  ner: "./checkpoints/medical_ner/best/",
  drug_db: "./drugs/drug_database.json",
  tokenizer: "./corpus/caremind_32k.model",
});

// Single interface to all AI services
const response = await ai.queryPatient(
  patientId,
  hospitalId,
  userRole,
  query,
  { streaming: true }
);

// response includes:
// {
//   text: "...",
//   summary: {...},
//   citations: [{chunk_id, content, source}],
//   alerts: [{type, severity, message}],
//   confidence: 0.92,
//   entities: {drugs: [...], diseases: [...]}
// }
```

### 2. Python Model Server

**Quick start**:
```bash
# Install
pip install -r scripts/requirements-data-pipeline.txt

# Load models
from transformers import AutoModel, AutoTokenizer
from finetune_ner import NERModel
from drug_interaction_engine import DrugDatabase

encoder = AutoModel.from_pretrained("checkpoints/medical_encoder/best/")
ner = NERModel.from_pretrained("checkpoints/medical_ner/best/")
drugs = DrugDatabase.load_from_file("drugs/drug_database.json")

# Expose via FastAPI
from fastapi import FastAPI
app = FastAPI()

@app.post("/encode")
def encode_query(text: str):
    tokens = tokenizer.encode(text)
    embeddings = encoder(tokens)
    return {"embedding": embeddings.tolist()}

@app.post("/extract-entities")
def extract_entities(text: str):
    entities = ner.predict(text)
    return {"entities": entities}

@app.post("/check-drugs")
def check_drug_safety(drugs_list: List[str]):
    interactions = drug.check_all_interactions(drugs_list)
    return {"interactions": interactions}
```

### 3. Database Schema

**New Milvus collections** (for vector search):
```sql
-- Chunks collection
CREATE COLLECTION chunks (
  id: primary_key,
  embedding: float_vector(768),  -- From encoder
  encounter_id,
  patient_id,
  chunk_type,
  section,
  content,
  metadata,
  created_at
);

-- Create index on embedding
CREATE INDEX idx_embedding ON chunks (embedding);
```

### 4. Caching

**Cache key**: `(patientId, hospitalId, fromTs, toTs, userRole, query_hash)`
**TTL**: 24 hours
**Storage**: Redis or Supabase RLS table

```typescript
// In ai.ts
const cacheKey = `${patientId}:${hospitalId}:${fromTs}:${toTs}:${role}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

const result = await generateResponse(...);
await cache.set(cacheKey, result, ttl=86400);
return result;
```

---

## Deployment Checklist

- [ ] **Week 1**: Train encoder (async, continuous)
- [ ] **Week 2**: Fine-tune NER, expand labels
- [ ] **Week 3**: Build Milvus cluster, load chunks
- [ ] **Week 4**: Deploy model server + API
- [ ] Test end-to-end retrieval + generation
- [ ] Load production drug database (Thai FDA + DrugBank)
- [ ] Configure RLS for multi-tenant isolation
- [ ] Set up monitoring (inference latency, error rates, safety flags)
- [ ] Launch A/B test (new AI vs baseline)

---

## Performance Targets

| Component | Latency | Throughput |
|-----------|---------|-----------|
| Encode query | <100ms | 1000 qps |
| Dense search (Milvus) | <500ms | 100 qps |
| Sparse search (BM25) | <300ms | 200 qps |
| NER extraction | <200ms | 500 qps |
| Drug validation | <50ms | 2000 qps |
| Safety checks | <200ms | 500 qps |
| **Total (end-to-end)** | **<2s** | **50 qps** |

---

## References

- **Data pipeline**: [docs/DATA_PIPELINE_AND_TOKENIZER.md](./DATA_PIPELINE_AND_TOKENIZER.md)
- **Training guide**: [docs/TRAINING_AND_EVALUATION.md](./TRAINING_AND_EVALUATION.md)
- **Safety layer**: [docs/PHASE4_SAFETY_LAYER.md](./PHASE4_SAFETY_LAYER.md)
- **Personas & triage**: [docs/CLINICAL_PERSONAS_AND_TRIAGE.md](./CLINICAL_PERSONAS_AND_TRIAGE.md)

