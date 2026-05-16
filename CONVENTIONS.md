# CareMind — Coding Conventions

> Team agreement on style, patterns, and practices.
> Complements [`QUALITY.md`](./QUALITY.md) (process) and [`CHECKLIST.md`](./CHECKLIST.md) (tasks).

---

## 1. Language & Tooling

- **TypeScript** everywhere — `strict: true`, no `any` unless unavoidable (add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining why).
- **ESLint** — `next/core-web-vitals` for web; workspace-level configs extend the root.
- **Prettier** — runs on save and in CI. Config in `.prettierrc.json`. Don't fight the formatter.
- **Import aliases** — use `@caremind/shared/*` for shared package imports. Never use relative paths to `../../../shared/`.

---

## 2. File & Folder Naming

| What                   | Convention                       | Example                             |
| ---------------------- | -------------------------------- | ----------------------------------- |
| React components       | `PascalCase.tsx`                 | `PatientCard.tsx`                   |
| Hooks                  | `camelCase.ts` with `use` prefix | `usePatients.ts`                    |
| Utilities / services   | `camelCase.ts`                   | `dateHelpers.ts`                    |
| Types (file)           | `camelCase.ts`                   | `patient.ts`                        |
| Types (interface/type) | `PascalCase`                     | `Patient`, `DoctorNote`             |
| Constants              | `SCREAMING_SNAKE_CASE`           | `APP_NAME`, `ROLE_COLORS`           |
| SQL migrations         | `NNNNN_description.sql`          | `00002_multi_tenant.sql`            |
| ADRs                   | `NNNN-title.md`                  | `0001-multi-tenant-architecture.md` |
| Test files             | `*.test.ts` / `*.test.tsx`       | `patients.test.ts`                  |

---

## 3. TypeScript Patterns

### Prefer interfaces for data shapes, types for unions

```typescript
// ✅ Good
export interface Patient { ... }
export type UserRole = 'doctor' | 'nurse' | 'pharmacist' | 'patient';

// ❌ Avoid
export type Patient = { ... };
```

### Export from barrel files

Every directory with public exports has an `index.ts` that re-exports. Consumers import from the directory, not individual files:

```typescript
// ✅ Good
import { Patient, APP_NAME } from '@caremind/shared';

// ❌ Avoid
import { Patient } from '@caremind/shared/src/types/patient';
```

### Use `const` assertions for static arrays

```typescript
export const USER_ROLES = ['doctor', 'nurse', 'pharmacist', 'patient'] as const;
export type UserRole = (typeof USER_ROLES)[number];
```

---

## 4. React Patterns

### Functional components only

No class components. Use hooks for state and effects.

### Component structure

```tsx
// 1. Imports
// 2. Types (if component-specific and small; otherwise separate file)
// 3. Component
// 4. Sub-components (if small and tightly coupled)
// 5. Helpers (if component-specific)
```

### Props naming

```typescript
// ✅ Good — descriptive, prefixed for handlers
interface PatientCardProps {
  patient: Patient;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

// ❌ Avoid — generic names, no prefix
interface Props {
  data: any;
  click: () => void;
}
```

### Server vs Client components (Next.js)

- Default to **Server Components** (no `'use client'` directive).
- Add `'use client'` only when the component needs interactivity (state, effects, event handlers, browser APIs).
- Keep client components as small (leaf-level) as possible.

---

## 5. Styling

- **Tailwind CSS** for all styling in the web app.
- Use the design tokens defined in `tailwind.config.ts`:
  - Role colors: `brand-doctor`, `brand-nurse`, `brand-pharmacist`, `brand-patient`
  - Severity: `severity-critical`, `severity-warning`, `severity-info`, `severity-positive`
- Avoid arbitrary values (`text-[#123456]`) — add tokens to the config instead.
- Mobile uses React Native `StyleSheet` — no Tailwind (unless NativeWind is adopted).

---

## 6. Supabase & Database

### Migrations

- One migration file per logical change.
- Migrations are **append-only** — never edit an applied migration. Create a new one.
- Name format: `NNNNN_description.sql`.
- Always include `IF NOT EXISTS` / `IF EXISTS` guards where possible.

### RLS policies

- Every table **must** have RLS enabled.
- Policies must enforce `hospital_id` tenant isolation (see ADR 0001).
- Test RLS with pgTAP or dedicated integration tests — never trust "it works in my browser."

### Client usage

```typescript
// ✅ Good — use the typed client from lib/
import { createClient } from '@/lib/supabase/client';

// ❌ Avoid — raw createClient with no typing
import { createClient } from '@supabase/supabase-js';
```

---

## 7. Data Pipeline & Tokenization

**Read first**: [`docs/DATA_PIPELINE_AND_TOKENIZER.md`](../docs/DATA_PIPELINE_AND_TOKENIZER.md)

When working with clinical data processing:

- **De-identification**: Use `scripts/deidentify.py` for all PII removal (names, HN, dates, phone, email). Never pass raw patient data to AI models without de-identification.
- **ETL pipeline**: Use `scripts/etl_pipeline.py` to convert Excel exports to normalized JSON chunks with metadata. Output format: JSONL (one chunk per line) + index JSON.
- **Chunking strategy**: Chunk by encounter, note section (assessment/plan/findings), and metadata (timestamp, author role, vital signs). Aim for 100–300 word chunks for optimal retrieval.
- **Tokenization**: Use trained SentencePiece (32k BPE) from `scripts/train_tokenizer.py`. Never use generic tokenizers (BERT, GPT) for Thai+English mixed text.
- **NER labels**: Refer to `scripts/generate_ner_data.py` for 100+ clinician-labeled examples (DRUG, DISEASE, SYMPTOM, LAB, DOSAGE, VITAL, ANATOMY, PROCEDURE). Use for training custom spaCy/HF NER models.

---

## 8. AI / Local Model

- AI service lives in `shared/services/ai.ts` — one abstraction, backed by the self-hosted local model stack.
- Never let a request escape its hospital, role, or patient scope when building prompt context.
- Always validate AI output against expected schema and citation list before rendering.
- Use streaming for long responses.
- Cache results by `(patientId, fromTs, toTs)` to avoid redundant calls.
- **Before sending prompt context**: de-identify using `deidentify.py` (strip name/AN, keep clinical fields).

---

## 9. Python / ML Patterns

**Read first**: [`docs/TRAINING_AND_EVALUATION.md`](../docs/TRAINING_AND_EVALUATION.md) and [`docs/ARCHITECTURE_ML_INTEGRATION.md`](../docs/ARCHITECTURE_ML_INTEGRATION.md)

### PyTorch & HuggingFace Conventions

- **Models**: Inherit from `nn.Module` or use `PreTrainedModel` from HuggingFace.
- **Checkpoints**: Always save with `CheckpointManager` (see `training_utils.py`). Include model weights, optimizer state, epoch, step, and metrics.
- **Optimizer**: Use `AdamW` with `weight_decay=0.01` for regularization.
- **Learning rate**: Default `1e-4` for pre-training, `2e-5` for fine-tuning.
- **Gradient clipping**: Apply `torch.nn.utils.clip_grad_norm_()` with `max_norm=1.0` to prevent exploding gradients.
- **Batch size**: Start with 32 for encoder training, 16 for NER fine-tuning. Scale down if OOM.

### Model Configurations

Store configurations in files, not hardcoded:

```python
# ✅ Good — config dict in model code
MODEL_SIZES = {
    "tiny": {"hidden": 256, "layers": 4, "heads": 4},
    "small": {"hidden": 512, "layers": 6, "heads": 8},
    "medium": {"hidden": 768, "layers": 12, "heads": 12},
}

# Create from config
config = BertConfig(**MODEL_SIZES["small"])
model = BertForMaskedLM(config)

# ❌ Avoid — hardcoded values scattered in code
model = BertForMaskedLM.from_pretrained("bert-base-uncased")
# Loses reproducibility
```

### Dataset & DataLoader Patterns

```python
# ✅ Good — custom Dataset class with __getitem__
class MaskedLanguageModelingDataset(Dataset):
    def __init__(self, corpus_file, tokenizer, max_seq_length=512):
        self.tokenizer = tokenizer
        self.max_seq_length = max_seq_length
        self.examples = self._load_examples(corpus_file)
    
    def __getitem__(self, idx):
        return self._apply_masking(self.examples[idx])
    
    def __len__(self):
        return len(self.examples)

# Create loaders with workers
train_loader = DataLoader(
    train_dataset,
    batch_size=64,
    shuffle=True,
    num_workers=4,  # Parallel loading
    pin_memory=True  # Faster GPU transfer
)

# ❌ Avoid — loading all data in memory
data = load_entire_corpus()  # OOM on large datasets
```

### Training Loop Patterns

```python
# ✅ Good — clean separation of train/eval
def train_epoch(model, train_loader, optimizer, device):
    model.train()
    total_loss = 0
    for batch in train_loader:
        batch = {k: v.to(device) for k, v in batch.items()}
        outputs = model(**batch)
        loss = outputs.loss
        
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        optimizer.zero_grad()
        
        total_loss += loss.item()
    return total_loss / len(train_loader)

def evaluate(model, eval_loader, device):
    model.eval()
    total_loss = 0
    with torch.no_grad():
        for batch in eval_loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            total_loss += outputs.loss.item()
    return total_loss / len(eval_loader)

# Main training
for epoch in range(num_epochs):
    train_loss = train_epoch(model, train_loader, optimizer, device)
    eval_loss = evaluate(model, eval_loader, device)
    
    # Save if improved
    if eval_loss < best_loss:
        best_loss = eval_loss
        checkpoint_manager.save_checkpoint(model, optimizer, epoch, metrics)

# ❌ Avoid — mixing train/eval, no metrics tracking
for epoch in range(num_epochs):
    for batch in data_loader:
        model.train()  # Every iteration
        loss = model(batch)
        loss.backward()
        # No validation
```

### Tokenizer Patterns

```python
# ✅ Good — use SentencePiece for Thai+English
from sentencepiece import SentencePieceProcessor

tokenizer = SentencePieceProcessor(model_file="caremind_32k.model")
tokens = tokenizer.encode("ผู้ป่วยมี HTN")  # → [1234, 5678, 9012, ...]

# ✅ Good — preserve tokenizer metadata
tokenizer_config = {
    "vocab_size": 32000,
    "algorithm": "BPE",
    "split_by_unicode_script": True,  # Critical for Thai+English
    "character_coverage": 0.9999,
}

# ❌ Avoid — generic tokenizers for Thai text
from transformers import AutoTokenizer
tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
# Won't handle Thai properly
```

### NER Label Alignment

```python
# ✅ Good — align word-level labels with subword tokens
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("caremind-encoder/")

word_tokens = ["Patient", "has", "fever"]
word_labels = ["O", "O", "SYMPTOM"]  # Word-level labels

# Tokenize with word_ids tracking
encoded = tokenizer(
    word_tokens,
    is_split_into_words=True,
    truncation=True,
    return_tensors="pt"
)

# Align labels to subword tokens
token_labels = []
word_id = None
for word_idx in encoded.word_ids(batch_index=0):
    if word_idx is None:
        token_labels.append(-100)  # Special token (CLS, SEP, etc.)
    elif word_id != word_idx:
        token_labels.append(LABEL_2_ID[word_labels[word_idx]])
        word_id = word_idx
    else:
        token_labels.append(LABEL_2_ID[word_labels[word_idx]])

# ❌ Avoid — assuming 1:1 token-label mapping
# BertTokenizer splits words into subwords:
# "fever" → ["f", "ever"]
# If you only have one label, you lose information
```

### Metrics & Evaluation

```python
# ✅ Good — use seqeval for NER metrics
from seqeval.metrics import f1_score, precision_score, recall_score, classification_report

gold_labels = [["O", "B-DRUG", "O"], ["B-DISEASE", "O"]]
pred_labels = [["O", "B-DRUG", "I-DRUG"], ["B-DISEASE", "O"]]

f1 = f1_score(gold_labels, pred_labels)
report = classification_report(gold_labels, pred_labels)

# ✅ Good — track during training
for epoch in range(num_epochs):
    eval_loss = evaluate(model, eval_loader, device)
    metrics = compute_metrics(predictions, labels)
    
    # Log for monitoring
    if metrics['f1'] > best_f1:
        best_f1 = metrics['f1']
        checkpoint_manager.save_checkpoint(model, optimizer, epoch, metrics)
        
    wandb.log({"epoch": epoch, "f1": metrics['f1'], "loss": eval_loss})

# ❌ Avoid — computing metrics only at the end
# You won't know if training is working until it finishes
```

### Command-line Interface

```python
# ✅ Good — use argparse with subcommands
import argparse

def main():
    parser = argparse.ArgumentParser(description="Train medical encoder")
    subparsers = parser.add_subparsers(dest="command")
    
    # Subcommand: build-corpus
    parser_corpus = subparsers.add_parser("build-corpus")
    parser_corpus.add_argument("--corpus-source", required=True)
    parser_corpus.add_argument("--output-corpus", required=True)
    parser_corpus.set_defaults(func=build_corpus)
    
    # Subcommand: train
    parser_train = subparsers.add_parser("train")
    parser_train.add_argument("--corpus", required=True)
    parser_train.add_argument("--model-size", default="small")
    parser_train.add_argument("--batch-size", type=int, default=32)
    parser_train.set_defaults(func=train)
    
    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()

# ❌ Avoid — hardcoded paths and parameters
corpus_path = "/home/user/data.jsonl"
batch_size = 32
learning_rate = 1e-4
# Hard to reuse, no version control
```

### File Organization

```
scripts/
├── training_utils.py          # Shared utilities (corpus, checkpoints, datasets)
├── train_medical_encoder.py   # Encoder pre-training (MLM)
├── finetune_ner.py           # NER fine-tuning (token classification)
├── drug_interaction_engine.py # Rule-based drug safety
├── generate_eval_sets.py     # Generate evaluation benchmarks
├── generate_ner_data.py      # Generate labeled NER examples
├── deidentify.py             # De-identification pipeline
├── train_tokenizer.py        # SentencePiece tokenizer training
├── etl_pipeline.py           # Excel → JSONL conversion
│
├── requirements-data-pipeline.txt  # All ML dependencies
└── README.md                  # Quick reference guide
```

### Reproducibility

```python
# ✅ Good — set seed at start of training
def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

set_seed(42)

# ✅ Good — save config for inference
config = {
    "model_size": "small",
    "vocab_size": 32000,
    "max_seq_length": 512,
    "model_checkpoint": "checkpoint-epoch5-step250000/",
    "tokenizer_model": "caremind_32k.model"
}

with open("production_config.json", "w") as f:
    json.dump(config, f)

# ❌ Avoid — random behavior without seed
# Results won't be reproducible
```

---

## 10. Clinical Personas & Summaries

**Read first**: [`docs/CLINICAL_PERSONAS_AND_TRIAGE.md`](../docs/CLINICAL_PERSONAS_AND_TRIAGE.md)

When implementing AI summaries or role-aware features:

- **Three personas** — Doctor (decision-making), Nurse (care coordination), Pharmacist (safety) — each with distinct summary format.
- **Golden examples**: 5 clinically-reviewed examples per persona (see doc Part 1).
- **V1 Triage scope**: Support exactly **12 chief complaints** (fever, cough, dyspnea, chest pain, abd pain, headache, rash, nausea/vomiting, diarrhea, UTI symptoms, extremity pain/swelling, medication side effects). Everything else returns "please consult a clinician."
- **Escalation triggers**: Always escalate critical vitals, altered mental status, signs of shock, anaphylaxis, severe infection, GI bleed (see doc Part 2 for full list).
- **Drug interactions & dosing**: Reference the pharmacist persona examples (doc Part 1) for real-world interaction patterns. Cross-reference allergy/cross-reactivity appendices.

---

## 11. Git Conventions

### Branch naming

```
feat/patient-list
fix/rls-hospital-leak
chore/upgrade-next
docs/adr-002
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(web): add patient list page with search
fix(shared): correct vital sign normalization for temp unit
chore(ci): add Prettier format check
docs: add CONVENTIONS.md
```

### PR rules

- Target `main` (protected — requires PR + review + green CI).
- Fill out the PR template completely.
- Squash merge preferred — keeps history linear.
- Delete branch after merge.

---

## 12. Error Handling

- Use `try/catch` at service boundaries, not inside every function.
- Log errors with context (userId, patientId, operation) — never log PHI.
- Surface user-friendly messages in the UI; log technical details to console/service.
- Use React Error Boundaries for component-level failures.

---

## 13. Testing

See [`QUALITY.md`](./QUALITY.md) for the full strategy. Key conventions:

- Test files live next to the code they test (or in `__tests__/` directories).
- Name: `<module>.test.ts` / `<Component>.test.tsx`.
- Use descriptive `describe` / `it` blocks:
  ```typescript
  describe('vitalSignNormalization', () => {
    it('flags temperature above 38.5°C as warning', () => { ... });
    it('flags SpO2 below 90% as critical', () => { ... });
  });
  ```
- Mock external services (Supabase, local model gateway) — never hit real APIs in unit tests.
- Integration tests may use a test Supabase project.

---

## 14. Accessibility

- All interactive elements need accessible names (`aria-label`, visible label, or `aria-labelledby`).
- Use semantic HTML (`<button>`, `<nav>`, `<main>`, not `<div onClick>`).
- Color is never the only indicator — pair with icons or text.
- Respect `prefers-reduced-motion`.
- Target WCAG 2.1 AA.

---

## 15. Security

- **Environment variables**: never commit `.env.local`. Use `.env.example` as the template.
- **Service role key**: server-side only — never expose in client bundles.
- **PHI**: treat patient data as sensitive. No logging of names/ANs. Redact before AI calls.
- **Dependencies**: run `npm audit` regularly. Address CRITICAL/HIGH before release.

---

## 16. Brand voice & design system

Full design system reference lives in the `caremind-design` Claude skill (`~/.claude/skills/caremind-design/`). Drop-in tokens are in `web/app/tokens.css`; brand SVGs in `web/public/brand/`.

**Two-channel color rule.** Role colors (Doctor blue / Nurse green / Pharmacist purple / Patient amber) tint *chrome* — nav, primary buttons, focus rings. Severity colors (Critical red / Warning amber / Info blue / Positive green) tint *content* — badges, alerts, vital trends. **Never mix the two channels.**

**Voice.**

- **Direct, never chatty.** "Start metoprolol 25mg BID." Not "Let's go ahead and get you started…"
- **Patient-respectful.** Never "the AFib in bed 4." Always `Mr. Chen, 67, ward 4B, bed 12`.
- **Quantified.** Numbers + units, every time. `WBC 12.5 (high)` beats `elevated white count`.
- **Explicit about uncertainty.** AI output is prefixed `Suggested:` or `AI summary:` and shows source records. Never "I think" / "Maybe."
- **Bilingual-ready.** Every string lives in i18n. Clinical terms get clinician translations, not generic ones.

**Tone by surface.**

| Surface | Tone | Example |
|---|---|---|
| Clinical lists & detail | Neutral, precise | `Azithromycin 500mg PO · Active · Dr. Johnson · Started Feb 14` |
| Empty states | Quietly helpful | `No labs yet. Order a panel from the Plan tab.` |
| AI summaries | Cautious, sourced | `Suggested: WBC normalized (12.5 → 9.8). Source: CBC, Feb 15.` |
| Critical alerts | Urgent, terse | `Drug interaction: Apixaban + NSAID. Bleeding risk.` |
| Patient-facing (mobile) | Warm, plain language | `Your fever has gone down since yesterday. Keep resting.` |

**Casing.**

- **Sentence case for UI** — buttons, headers, nav, table columns. `Patient list`, not `Patient List`.
- **Title Case only for proper nouns and the product name** — `CareMind`, registered panels.
- **ALL CAPS reserved for severity badges** — `CRITICAL`, `WARNING` (small, tracking-wide). Never for buttons or headlines.

**Other rules.**

- **You/we, not I.** Patient-facing copy says "you." Clinician copy lists actions, doesn't narrate.
- **No emoji. Anywhere.** Not in copy, not in icons, not as bullets. Clinical environments don't tolerate them.
- **No exclamation marks.** A flat tone is part of the brand.
- **Numbers + units.** `Heart rate 75 bpm` patient-facing; `HR 75` clinician-facing.
- **Dates: relative + absolute.** `Today 09:30` · `Yesterday 14:00` · `Feb 14, 09:30` once older.

**Visual rules.**

- **No gradients, no decorative illustrations, no stock imagery, no glassmorphism.**
- **Iconography**: Lucide only (`lucide-react`), 1.5px stroke, sizes 16/20/24, `currentColor`.
- **No unicode-as-icon** (`→`, `✓`, `★`) — use Lucide equivalents.
- **Border radius**: 6px buttons/inputs, 8px cards, 12px sheets/modals, 9999px pills.
- **Shadows**: flat by default. Cards use `var(--shadow-card)`, modals add `var(--shadow-modal)`. No inner shadows, no glows, no colored shadows.
- **Motion**: `cubic-bezier(0.2, 0, 0, 1)` (`--ease-standard`). 120ms hover, 200ms entry, 280ms sheet. No springs, no bounces. Reduced-motion collapses to 80ms opacity fades.
