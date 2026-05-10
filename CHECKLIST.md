# CareMind — Team Checklist

> Live tracker for Sprint 0 → Sprint 4. Anyone can edit; check items as they ship.
> Companion page in Notion (CareMind Team Hub → CareMind — Team Checklist).

**Decisions locked in (2026-05-07)**

- **AI primary:** self-hosted local model only. The AI layer must support citation-based retrieval, patient/staff role separation, and no external LLM APIs.
- **Vector DB:** Milvus for self-hosted retrieval storage and similarity search.
- **Multi-tenant:** yes — designed to onboard multiple hospitals. Schema gets `hospitals` table + `hospital_id` FK + tenant-scoped RLS.
- **Test stack:** Vitest (unit) + Playwright (web E2E + a11y + visual) + Maestro (mobile E2E) + pgTAP (DB/RLS) + Lighthouse CI. See [`QUALITY.md`](./QUALITY.md).
- **MediHack prototype:** reference only for now; port decision deferred.
- **Supabase mode:** TBD (cloud vs local) — blocks seed script.

> **Definition of Done** for every task lives in [`QUALITY.md`](./QUALITY.md) §2. Don't merge without it.

Legend: `[x]` done · `[ ]` to do · `[~]` partial · ❓ decision needed

---

## Sprint 0 — Foundation (May 7–8) · IN PROGRESS

### Repo & infra

- [x] Monorepo scaffold (`web/`, `mobile/`, `shared/`, `supabase/`)
- [x] Workspaces + TS strict + path alias `@caremind/shared`
- [x] Tailwind: role + severity colors wired
- [x] GitHub repo created + initial push (https://github.com/KanthiPhoosorn/CareMind)
- [x] Branch protection on `main` (PR-required, 0 reviews, no required checks — solo-dev profile; tighten when 2nd contributor joins)
- [x] ~~CI on PR (GitHub Actions)~~ → replaced with local husky gates: pre-commit runs prettier+eslint via lint-staged; pre-push runs `npm run type-check`
- [x] `README.md` with setup steps
- [x] `CONVENTIONS.md`

### Supabase backend

- [x] Initial schema migration (7 tables + RLS read policies)
- [x] ❓ Provision Supabase: **local** for now (chosen by user)
- [ ] `.env.local` filled (web + mobile)
- [x] **Migration `00002_multi_tenant.sql`** — adds `hospitals` table, `hospital_id` FK on `profiles` + `patients`, tenant-scoped RLS
- [ ] Migration applied to running DB (requires user to run `supabase db reset`)
- [x] Seed script: 1 default hospital + `sample_data/*_clean.json` → DB (auto-generates `seed.sql`)
- [ ] Generate `Database` type via `supabase gen types typescript`

### Shared package

- [x] Skeleton + `APP_NAME` constant
- [x] Types: `Hospital` (to add), `Patient`, `Profile`, `DoctorNote`, `Medication`, `LabResult`, `NurseRecord`, `Imaging`
- [x] Role + status enums, color constants
- [ ] Helpers: date formatting, vital-sign normalization, flag→severity mapping

### Auth foundation

- [ ] `/login` page (currently linked from home but doesn't exist)
- [ ] Signup with role + hospital selection
- [ ] Auth callback route
- [ ] `middleware.ts` for protected routes
- [ ] Profile bootstrap on first login (insert into `profiles` with `hospital_id`)

### Quality engineering setup (foundation for all sprints)

- [x] Vitest config in `web/`, `shared/`, `mobile/` + first sample test passing
- [x] Playwright installed in `web/e2e/` + smoke test (loads home)
- [x] Maestro installed in `mobile/e2e/` + smoke flow (launches app)
- [x] ESLint + Prettier configs (extending Next.js + Expo presets)
- [x] husky + lint-staged for pre-commit (prettier --write all; eslint --fix on web/\*\* TS/JS)
- [x] husky pre-push hook runs `npm run type-check` across all workspaces
- [ ] ~~GitHub Actions PR workflow~~ — dropped; reintroduce when team expands (see commit `88cb7d0`)
- [x] PR template + Issue templates (bug / feature / decision) in `.github/`
- [x] `CODEOWNERS` file
- [x] `docs/adr/` directory + ADR template
- [x] First ADR: "Multi-tenant architecture with `hospital_id` scoping"

---

## Sprint 1 — Real Data & Core Screens (May 9–16)

### Web (Doctor)

- [ ] App shell: sidebar nav, role-aware menu, header with user
- [ ] `/patients` — list, filter by ward/status, search by AN
- [ ] `/patients/[id]` — header (AN, name, age, ward, bed, dx)
- [ ] Patient detail tabs: Notes · Meds · Labs · Vitals · Imaging
- [ ] Loading skeletons + empty states + error boundary

### Mobile

- [ ] Login + role-aware redirect
- [ ] Nurse: ward patient list
- [ ] Patient: home with health summary (by AN)

### Data service layer (`shared/services/`)

- [ ] `patients.ts` — list/getById/getByAn (auto-scoped by hospital)
- [ ] `notes.ts`, `medications.ts`, `labs.ts`, `vitals.ts`, `imaging.ts`
- [ ] Realtime subscribe helpers (Supabase channels)

### Sprint 1 quality gates

- [ ] **CRITICAL** RLS test (pgTAP or SQL): hospital A user cannot read hospital B records
- [ ] Unit tests for every service module (≥80% coverage)
- [ ] Playwright E2E: doctor login → patient list → patient detail
- [ ] Maestro E2E: nurse login → ward list

---

## Sprint 2 — Delta Summary + AI (May 17–23)

### Delta engine (`shared/lib/delta/`)

- [ ] Diff between two timepoints across all 5 data types
- [ ] Vital trend (improving / worsening / stable)
- [ ] Lab flag transitions (abnormal ↔ normal, new abnormal)
- [ ] Med change detection (started / dose changed / discontinued)
- [ ] Diagnosis change
- [ ] Imaging serial comparison
- [ ] Returns `DeltaSummary` per `sample_data/DATA_STRUCTURE_GUIDE.md` spec

### AI layer (local model + citation RAG)

- [ ] Stand up the local inference gateway and wire it through `shared/services/ai.ts`
- [ ] Build citation-based retrieval over `data/` and `sample_data/` with hospital, role, and patient scoping
- [ ] Split prompts and policies for patient chatbot (symptom screening) and staff chatbot (summaries)
- [ ] Streaming responses
- [ ] ❓ PHI redaction policy before sending prompt context into the model (recommend: strip name/AN, keep clinical fields)
- [ ] Cache by `(patientId, fromTs, toTs)`

### Phase 3: Small Causal Transformer (optional, learning tool)

- [x] Set up isolated Python environment (venv with PyTorch CPU)
- [x] Build word-level tokenizer optimized for small medical corpora
- [x] Implement decoder-only transformer architecture (2 layers, 4 attention heads, 96-dim embeddings)
- [x] Extract clean clinical corpus from sample_data JSON (39 high-quality narrative snippets)
- [x] Train on small dataset with AdamW optimizer and gradient clipping
- [x] Implement generation with top-k sampling and confidence-based filtering
- [x] Create CLI tool with configurable prompts, temperature, learning rate
- [x] Add smoke test showing multiple generation prompts
- [x] Document in README.md with setup + usage examples
- [ ] Optional: benchmark inference speed and memory footprint
- [ ] Optional: experiment with longer training runs on expanded corpus

**Key metrics:**
- Training loss: 3.24 (63% improvement from baseline)
- Vocabulary: 241 tokens (adaptive sizing for 39 snippets)
- Inference: <100ms on CPU
- Real example output: "Patient has breathing management ECG shows temperature normalized patient tolerating..."

### Phase 4: Clinical Safety Layer (production-ready)

- [x] Implement PII detector and redactor (names, emails, phone, SSN, MRN, dates, credit cards, IP)
- [x] Create content filter blocking dangerous medical patterns
- [x] Build hallucination detector for unrealistic claims
- [x] Implement drug interaction checker (20+ medications, major interactions)
- [x] Create contraindication validator (8+ medical conditions)
- [x] Implement dosage validator with therapeutic ranges
- [x] Build audit logging system for compliance
- [x] Create ClinicalSafetyLayer orchestrator class with hybrid approach
- [x] Add integration examples with Phase 3 model in notebook
- [x] Create comprehensive documentation (PHASE4_SAFETY_LAYER.md)
- [x] Update README.md with safety layer section
- [x] Validate all components with test suite

**Key metrics:**
- Safety levels: SAFE (🟢) / WARNING (🟡) / BLOCKED (🔴)
- PII detection: 9 types (names, emails, phone, SSN, MRN, DOB, ZIP, credit card, IP)
- Drug database: 20+ medications, 10+ major interactions, 8+ contraindications
- Performance: <1ms per safety check, negligible overhead
- Architecture: Hybrid rule-based + ML-ready confidence scoring

**Components:**
- ✅ PIIDetector — Regex-based PII detection and redaction
- ✅ ContentFilter — Dangerous pattern blocking and context validation
- ✅ HallucinationDetector — Unrealistic claim detection with probability scoring
- ✅ DrugInteractionChecker — Known drug interaction validation
- ✅ ContraindicationChecker — Medication vs condition validation
- ✅ DosageValidator — Dosage range validation
- ✅ ClinicalSafetyLayer — Master orchestrator with audit logging

### Phase 5: Thai Medical Language Optimization (TMLO)

- [x] Implement medical abbreviation dictionary (150+ abbreviations)
- [x] Build Thai medical symptom synonym mapping (50+ terms)
- [x] Create Thai tokenizer with medical dictionary
- [x] Implement document type detection (7 types: doctor, nurse, lab, radiology, pharmacy, vital signs, discharge)
- [x] Add language mix detection (Thai vs English character quantification)
- [x] Implement abbreviation expansion algorithm
- [x] Implement synonym normalization algorithm
- [x] Create batch processing capability
- [x] Build comprehensive documentation (PHASE5_THAI_MEDICAL.md)
- [x] Add notebook cells demonstrating all features
- [x] Validate with real Thai medical text examples
- [x] Integration with Phase 3 (transformer) and Phase 4 (safety layer)

**Key metrics:**
- Abbreviation coverage: 150+ medical abbreviations
- Thai medical terms: 50+ symptom/condition synonyms
- Text type detection: 7 document types
- Processing speed: <10ms per text
- Language mix: Automatic Thai/English/digit/other quantification
- Architecture: Dictionary-based greedy longest-match tokenization

**Components:**
- ✅ ThaiMedicalAbbreviations — 150+ medical abbreviation dictionary
- ✅ ThaiMedicalSynonyms — 50+ Thai medical term mappings
- ✅ ThaiMedicalSymptoms — Standard symptom names
- ✅ ThaiTextNormalizer — Core normalization engine
- ✅ ThaiMedicalProcessor — Main entry point with batch processing
- ✅ NormalizationResult — Structured output dataclass

### UI features

- [ ] Delta Summary panel on patient detail (date-range picker)
- [ ] AI Consult chat panel
- [ ] Problem list (parsed from doctor notes)

### Pharmacist view (web)

- [ ] `/pharmacy/queue` — Rx queue
- [ ] Drug interaction check (rule list first; AI fallback)
- [ ] Dispensing confirmation flow

### Sprint 2 quality gates

- [ ] **CRITICAL** PHI redaction test: AI calls strip name + AN before send
- [ ] Unit tests for delta engine (snapshot tests against fixture data for an1/an2/an3)
- [ ] Drug-interaction known-pairs test (e.g., Apixaban + NSAID flagged)
- [ ] Vital-sign edge case tests (temp 35.0–40.5, BP boundaries)
- [ ] AI output safety: response schema validation, refusal on out-of-scope prompts

---

## Sprint 3 — Polish & Thai Validation (May 24–31)

### Thai i18n

- [ ] `next-intl` (web) + `i18n-js` (mobile)
- [ ] Thai translations for clinical terms
- [ ] Noto Sans Thai font loading

### UX polish

- [ ] Status badges consistent (Normal/Warning/Critical)
- [ ] Mobile push notifications (vitals alert, med reminder)
- [ ] Accessibility pass (keyboard, ARIA, contrast)
- [ ] Reduced-motion respect

### Validation

- [ ] Schedule 3–5 Thai clinician interviews (multi-hospital if possible)
- [ ] Demo script + feedback form
- [ ] Iterate on lowest-scoring screens

### Sprint 3 quality gates

- [ ] axe-core a11y audit (no serious/critical violations on golden paths)
- [ ] Lighthouse CI thresholds: performance ≥85, a11y ≥95
- [ ] Visual regression baseline captured for all role dashboards
- [ ] UAT log: every clinician interview recorded with severity-tagged issues

---

## Sprint 4 — Deploy & Demo (Jun 1–10)

- [ ] Vercel project + production env vars
- [ ] EAS Build (Android dev → preview)
- [ ] App icon, splash, store listing assets
- [ ] Production Supabase project + RLS audit (verify tenant isolation across 2+ seeded hospitals)
- [ ] E2E full regression (all 4 role golden paths)
- [ ] Lighthouse pass on key pages
- [ ] `npm audit` + Snyk scan: zero CRITICAL / HIGH
- [ ] Secret scan (gitleaks) on full history
- [ ] Release branch + tag + rollback plan documented
- [ ] Demo video + slide deck + recorded backup

---

## Open decisions

- ❓ **Supabase mode**: cloud or local for Sprint 0? _(still blocks seed script)_
- ❓ **Local model stack**: serving runtime, embedding model, and GPU/CPU sizing
- ❓ **Hospital onboarding** flow: self-serve signup vs admin-invite-only
- ❓ **Realtime** for nurse vitals view, or is polling acceptable for MVP?
- ❓ **MediHack prototype**: port screens, or use as visual reference only?

---

## How to use this list

- Edit directly — small wins still get a check.
- Add a sub-bullet under any item if it grows scope.
- When Sprint N starts, move open Sprint N-1 items to a "**Carry-over**" section at the top of Sprint N rather than letting them drift.
- Decisions in the "Open decisions" section block the items that reference them — resolve as soon as possible.
