# CareMind

**AI-Powered Patient Care Coordination** — a multi-tenant clinical dashboard for Thai hospitals.

Doctors, nurses, pharmacists, and patients each get a role-aware view of patient data, AI-powered delta summaries, and real-time collaboration tools.

| Platform                  | Tech                                  | Directory               |
| ------------------------- | ------------------------------------- | ----------------------- |
| Web (Doctor / Pharmacist) | Next.js 15 + Tailwind                 | `web/`                  |
| Mobile (Nurse / Patient)  | Expo 54 + React Native                | `mobile/`               |
| Shared library            | TypeScript                            | `shared/`               |
| Backend                   | Supabase (Postgres + Auth + Realtime) | `supabase/`             |
| AI                        | Self-hosted local model (RAG + citations) | `shared/services/ai.ts` |
| Vector DB                  | Milvus (self-hosted, local/dev compose) | `deployment/milvus/`    |

---

## Prerequisites

| Tool         | Version                   | Install                            |
| ------------ | ------------------------- | ---------------------------------- |
| Node.js      | ≥ 18                      | [nodejs.org](https://nodejs.org)   |
| npm          | ≥ 9 (ships with Node 18+) | —                                  |
| Supabase CLI | latest                    | `npm i -g supabase`                |
| Expo CLI     | latest                    | `npm i -g expo-cli`                |
| Git          | latest                    | [git-scm.com](https://git-scm.com) |

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/KanthiPhoosorn/CareMind.git
cd CareMind
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in the values — see `.env.example` for the full list:

| Variable                        | Where to get it                                 |
| ------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase dashboard → Settings → API             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same                                            |
| `SUPABASE_SERVICE_ROLE_KEY`     | Same (never expose client-side)                 |
| `LOCAL_LLM_BASE_URL`            | Self-hosted inference endpoint for the local model |
| `LOCAL_LLM_MODEL`               | Local chat model name/version                    |
| `LOCAL_EMBEDDING_MODEL`         | Local embedding model name/version               |
| `MILVUS_HOST`                  | Milvus gRPC host (local default: `127.0.0.1`)    |
| `MILVUS_PORT`                  | Milvus gRPC port (local default: `19530`)        |
| `MILVUS_COLLECTION`            | Milvus collection name for clinical chunks       |
| `MILVUS_DIM`                   | Embedding dimension used during ingestion        |
| `MILVUS_USER` / `MILVUS_PASSWORD` | Optional auth for managed Milvus deployments |

### 3. Supabase setup

**Option A — Cloud (recommended for team work)**

```bash
# Link to your Supabase project
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — Local (requires Docker)**

```bash
supabase start
supabase db reset      # applies migrations + seed
```

### 4. Milvus setup (for chatbot retrieval)

Start the local vector DB from the repo root:

```bash
cd deployment/milvus
docker compose up -d
```

Smoke test the connection and ingestion from the repo root:

```bash
pip install -r scripts/requirements-milvus.txt
python scripts/ingest_to_milvus.py --data-dir ./sample_data --milvus-host 127.0.0.1 --milvus-port 19530
```

### 5. Phase 3: Small Causal Transformer (optional)

CareMind ships a production-ready tiny causal transformer for experimentation and learning. It learns real clinical text patterns from the sample data.

**Features:**
- Word-level tokenization optimized for small medical corpora
- Adaptive vocabulary sizing (learns 240-300 tokens from 39-40 real clinical snippets)
- Confidence-based generation filtering to avoid nonsense outputs
- Real clinical text generation: "Patient has breathing management ECG shows temperature normalized..."
- Lightweight: trains in <3 seconds on CPU, loss converges to 3.2

**Setup:**

```bash
# Create isolated Python environment (first time only)
python3 -m venv .venv-transformer
.venv-transformer/bin/pip install --upgrade pip
.venv-transformer/bin/pip install -r scripts/requirements-transformer.txt
```

**Quick start:**

```bash
# Smoke test with 4 different prompts
.venv-transformer/bin/python scripts/train_small_transformer.py --smoke-test

# Custom training
.venv-transformer/bin/python scripts/train_small_transformer.py \
  --steps 150 \
  --batch-size 12 \
  --prompt "Patient has" \
  --temperature 0.65 \
  --max-new-tokens 40
```

**Arguments:**
- `--steps` — training iterations (default: 120)
- `--batch-size` — examples per step (default: 16)
- `--prompt` — generation seed text (try: "Patient has", "Lab results show", "Continue")
- `--temperature` — sampling randomness 0.0=deterministic, 1.0=random (default: 0.7)
- `--max-new-tokens` — generated text length (default: 40)
- `--learning-rate` — optimizer LR (default: 3e-4)

**Technical details:**
- Corpus: extracted from clinical JSON files in `sample_data/` (39 high-quality narrative snippets)
- Tokenizer: word-level with 241 tokens (no character-level noise)
- Model: 2-layer decoder-only transformer, 96-dim embeddings, 4 attention heads
- Training: AdamW optimizer, cross-entropy loss, gradient clipping
- Generation: top-k sampling (k=15) with temperature scaling and confidence filtering

**Use cases:**
- Learning transformer architecture on real medical text
- Testing language generation on small datasets
- Experimentation with prompts and generation strategies
- Educational reference for building NLP systems

→ **Full documentation**: See [docs/PHASE3_TRANSFORMER.md](./docs/PHASE3_TRANSFORMER.md) for detailed architecture, customization guides, and experiments.

### 6. Phase 4: Clinical Safety Layer (production-ready)

CareMind includes a **comprehensive Clinical Safety Layer** protecting medical text generation from harmful outputs, data breaches, and hallucinations.

**Features:**
- 🛡️ **Content Safety**: Blocks dangerous medical advice (stopping medications, extreme dosages)
- 🔐 **Data Privacy**: Detects and redacts PII (names, emails, phone, SSN, MRN) from inputs/outputs
- 🎯 **Hallucination Detection**: Identifies unrealistic medical claims (miracle cures, impossible stats)
- 💊 **Drug Safety**: Validates medication interactions, contraindications, and dosages
- 📋 **Audit Logging**: Maintains compliance-ready decision logs for each check
- ⚡ **Hybrid Architecture**: Rule-based patterns + ML-ready confidence scoring

**Integration:**

```python
from clinical_safety_layer import ClinicalSafetyLayer

# Initialize safety layer
safety = ClinicalSafetyLayer(log_file="safety_audit.jsonl")

# Validate user input (detect PII)
input_result = safety.validate_input(user_query)
if input_result['level'] == 'BLOCKED':
    return "Please don't include personal information in your query"

# Validate model output before displaying
output_result = safety.validate_output(model_response)
if output_result['level'] == 'BLOCKED':
    return "I cannot provide this medical advice. Please consult a healthcare provider."
elif output_result['level'] == 'WARNING':
    return f"{model_response}\n⚠️ Important: {output_result['reason']}"
else:
    return model_response
```

**Safety Levels:**
- 🟢 **SAFE** — Output passed all checks, display directly
- 🟡 **WARNING** — Minor concerns detected, display with disclaimer
- 🔴 **BLOCKED** — Dangerous content found, don't display

**Knowledge Base:**
- **20+ medications** with dosage ranges (ibuprofen, acetaminophen, warfarin, metformin, etc.)
- **Major drug interactions** (warfarin + aspirin, SSRI + MAOI, etc.)
- **Contraindications** for 8+ medical conditions (pregnancy, kidney disease, asthma, etc.)
- **PII patterns** (names, emails, phone, SSN, MRN, dates, credit cards, IPs)
- **Dangerous patterns** (miracle claims, extreme dosages, stop medications, etc.)

**Testing:**

```bash
# View live demo of all safety checks
python scripts/clinical_safety_layer.py

# Or test in notebook
jupyter notebook CareMind_Custom_Citation_Based_Medical_Chatbot_for_Patient.ipynb
# Navigate to "Phase 4: Clinical Safety Layer" section
```

**Configuration:**

```python
# Strict mode: warnings become blocking
strict_safety = ClinicalSafetyLayer(strict_mode=True)

# Add custom drug interaction
safety.interaction_checker.MAJOR_INTERACTIONS[('drug1', 'drug2')] = 'interaction reason'

# Extend dosage database
safety.dosage_validator.DOSAGE_RANGES['new_drug'] = (min=10, max_single=50, max_daily=200)
```

**Compliance Features:**
- ✅ Audit logging with timestamps and decision hash
- ✅ JSON-format logs for analytics
- ✅ Confidence scoring (0-1) with all decisions
- ✅ Detailed categorization of safety violations
- ✅ Report generation for compliance metrics

→ **Full documentation**: See [docs/PHASE4_SAFETY_LAYER.md](./docs/PHASE4_SAFETY_LAYER.md) for architecture, customization, limitations, FAQ, and medical knowledge base details.

### 7. Phase 5: Thai Medical Language Optimization (TMLO)

CareMind includes **Thai Medical Language Optimization** for real-world Thai hospital text that mixes Thai + English, abbreviations, synonyms, and clinical shorthand.

**Problem Solved:**
Real Thai hospital notes are **NOT monolingual**:
```
"Patient AN1 HT DM ไข้สูง 39°C ปวดศรีษะ c/o SOB"
```

Standard NLP fails because of:
- Thai-English code-switching
- 150+ medical abbreviations (HT, DM, SOB, c/o)
- Symptom synonym variations (ไข้ vs ไข้สูง vs มีไข้)
- Thai text with no spaces between words

**Features:**
- ✅ **Thai-English Code-Switching** — Detects and handles mixed-language input
- ✅ **150+ Abbreviations** — Medical abbreviation dictionary in Thai context
- ✅ **Symptom Standardization** — Thai clinical terms → English medical terminology
- ✅ **Synonym Normalization** — Reduces variations (ไข้, เจ็บ, ปวด) to standard terms
- ✅ **Text Type Detection** — Identifies doctor notes, labs, vital signs, etc.
- ✅ **Language Mix Analysis** — Reports Thai/English character ratios
- ✅ **Medical Tokenization** — Longest-match greedy tokenization using clinical dictionary

**Example Usage:**

```python
from thai_medical_nlp import ThaiMedicalProcessor

processor = ThaiMedicalProcessor()

# Process Thai + English medical text
result = processor.process("Patient AN1 HT DM ไข้สูง 39°C ปวดศรีษะ c/o SOB")

print(result['normalized_text'])
# Output: "Patient AN1 hypertension diabetes mellitus fever 39 celsius headache complains of shortness of breath"

print(result['abbreviations_expanded'])
# Output: {'HT': 'hypertension', 'DM': 'diabetes mellitus', 'c/o': 'complains of', 'SOB': 'shortness of breath'}

print(result['text_type'])
# Output: 'unknown' or detected type
```

**Medical Abbreviations Covered:**
- **Conditions**: HT, DM, DM2, CAD, CHF, COPD, CKD, TB, HIV, AF, AMI, CVA, RA, SLE, OA
- **Symptoms**: SOB, DOE, PND, N/V, LOC, AMS, CP, RLQ, LLQ
- **Medications**: IV, IM, SC, PO, QID, TID, BID, OD, ACE-I, ARB, NSAID, SSRI
- **Laboratory**: CBC, CMP, HbA1c, BUN, Cr, eGFR, AST, ALT, PT, PTT, TSH
- **Vital Signs**: BP, HR, RR, SpO2, BMI

**Symptom Normalization:**
```
Thai                        English
ไข้, ไข้สูง, มีไข้, ร้อน   → fever
ปวด, เจ็บ, เสียว          → pain
ไอ, ho, cough            → cough
หายใจติดขัด              → dyspnea
ท้องเสีย                  → diarrhea
```

**Integration:**
Phase 5 (TMLO) → Phase 2 (Improved retrieval) → Phase 3 (Transformer) → Phase 4 (Safety)

```python
# Complete pipeline
thai_query = "ผู้ป่วย HT ไข้สูง 39°C หายใจติดขัด"

# Step 1: Normalize with Phase 5
normalized = processor.process(thai_query)

# Step 2-4: Rest of pipeline uses clean, standardized text
response = safe_medical_chatbot(normalized['normalized_text'], model, tokenizer, safety)
```

**Testing in Notebook:**

```bash
jupyter notebook CareMind_Custom_Citation_Based_Medical_Chatbot_for_Patient.ipynb
# Navigate to "Phase 5: Thai Medical Language Optimization" section
```

→ **Full documentation**: See [docs/PHASE5_THAI_MEDICAL.md](./docs/PHASE5_THAI_MEDICAL.md) for complete architecture, customization, limitations, and advanced usage.

→ **Run demo**: `python scripts/thai_medical_nlp.py`

### 8. Run the dev servers

```bash
# Web (http://localhost:3000)
npm run dev:web

# Mobile (Expo Go on your device)
npm run dev:mobile
```

---

## Monorepo Scripts

All scripts run from the repo root:

| Script                 | What it does                         |
| ---------------------- | ------------------------------------ |
| `npm run dev:web`      | Start Next.js dev server             |
| `npm run dev:mobile`   | Start Expo dev server                |
| `npm run build:web`    | Production build (web)               |
| `npm run lint`         | ESLint across all workspaces         |
| `npm run type-check`   | `tsc --noEmit` across all workspaces |
| `npm run format`       | Prettier — auto-fix formatting       |
| `npm run format:check` | Prettier — check only (used in CI)   |

---

## Project Structure

```
CareMind/
├── .github/              # CI workflows, PR/issue templates, CODEOWNERS
├── docs/
│   └── adr/              # Architecture Decision Records
├── mobile/               # Expo (React Native) app
│   ├── app/              # Screens (file-based routing)
│   ├── components/       # Mobile components
│   └── services/         # API / device services
├── data/                 # Raw hospital case files for chatbot corpus
├── sample_data/          # Real clinical data fixtures (anonymised)
├── scripts/              # One-off setup scripts
├── shared/               # @caremind/shared workspace
│   └── src/
│       ├── types/        # TypeScript interfaces (Patient, DoctorNote, etc.)
│       └── utils/        # Constants, helpers
├── supabase/
│   ├── migrations/       # SQL migrations (run in order)
│   └── seed/             # Seed data scripts
├── web/                  # Next.js 15 app
│   ├── app/              # Pages (App Router)
│   ├── components/       # UI components
│   └── lib/              # Supabase client, utilities
├── .env.example          # Template for env vars
├── CHECKLIST.md          # Sprint task tracker
├── CONVENTIONS.md        # Coding conventions
├── QUALITY.md            # SDLC, Definition of Done, test strategy
├── package.json          # Workspace root
└── tsconfig.json         # Base TS config
```

---

## Development Workflow

1. **Create a branch** from `main` — `main` is protected.
2. **Write code** following [`CONVENTIONS.md`](./CONVENTIONS.md).
3. **Open a PR** — CI runs lint, typecheck, format check, and build.
4. **Get 1 approving review** (from CODEOWNERS).
5. **Merge** — squash or rebase only (linear history enforced).

See [`QUALITY.md`](./QUALITY.md) for the full Definition of Done.

---

## Architecture Decisions

Recorded in `docs/adr/`. Key decisions so far:

| ADR                                                | Decision                                       |
| -------------------------------------------------- | ---------------------------------------------- |
| [0001](docs/adr/0001-multi-tenant-architecture.md) | Multi-tenant with `hospital_id` row-scoped RLS |
| [0002](docs/adr/0002-local-model-citation-chatbots.md) | Self-hosted local model with citation-based patient and staff chatbots |
| [0003](docs/adr/0003-milvus-vector-db.md) | Milvus as the self-hosted vector DB for retrieval |

---

## Sample Data

`data/` contains the raw hospital case files used to build the chatbot corpus, grouped by encounter folder (`AN1` ... `AN10`). `sample_data/` contains anonymised fixtures and cleaned JSON versions for the structured app flows. See [`DATA_STRUCTURE_GUIDE.md`](sample_data/DATA_STRUCTURE_GUIDE.md) for the schema.

---

## License

Private — all rights reserved.
