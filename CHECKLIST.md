# CareMind — Team Checklist

> Live tracker for Sprint 0 → Sprint 4. Anyone can edit; check items as they ship.
> Companion page in Notion (CareMind Team Hub → CareMind — Team Checklist).

**Decisions locked in (2026-05-07)**
- **AI primary:** Gemini 2.5 Pro (long context for full patient charts, strong Thai, already scaffolded). AI service stays abstracted — swappable.
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
- [ ] Branch protection on `main` (require PR + review + green CI)
- [ ] CI: lint + `tsc --noEmit` on PR (GitHub Actions)
- [ ] `README.md` with setup steps
- [ ] `CONVENTIONS.md` (or pin to Notion section)

### Supabase backend
- [x] Initial schema migration (7 tables + RLS read policies)
- [ ] ❓ Provision Supabase: **cloud** vs `supabase start` local
- [ ] `.env.local` filled (web + mobile)
- [ ] **Migration `00002_multi_tenant.sql`** — adds `hospitals` table, `hospital_id` FK on `profiles` + `patients`, tenant-scoped RLS
- [ ] Migration applied to running DB
- [ ] Seed script: 1 default hospital + `sample_data/*_clean.json` → DB (patients an1/an2/an3)
- [ ] Generate `Database` type via `supabase gen types typescript`

### Shared package
- [x] Skeleton + `APP_NAME` constant
- [ ] Types: `Hospital`, `Patient`, `Profile`, `DoctorNote`, `Medication`, `LabResult`, `NurseRecord`, `Imaging`
- [ ] Role + status enums, color constants
- [ ] Helpers: date formatting, vital-sign normalization, flag→severity mapping

### Auth foundation
- [ ] `/login` page (currently linked from home but doesn't exist)
- [ ] Signup with role + hospital selection
- [ ] Auth callback route
- [ ] `middleware.ts` for protected routes
- [ ] Profile bootstrap on first login (insert into `profiles` with `hospital_id`)

### Quality engineering setup (foundation for all sprints)
- [ ] Vitest config in `web/`, `shared/`, `mobile/` + first sample test passing
- [ ] Playwright installed in `web/e2e/` + smoke test (loads home)
- [ ] Maestro installed in `mobile/e2e/` + smoke flow (launches app)
- [ ] ESLint + Prettier configs (extending Next.js + Expo presets)
- [ ] husky + lint-staged for pre-commit (lint + format staged files)
- [ ] GitHub Actions PR workflow: lint + `tsc --noEmit` + unit + coverage report
- [ ] PR template + Issue templates (bug / feature / decision) in `.github/`
- [ ] `CODEOWNERS` file
- [ ] `docs/adr/` directory + ADR template
- [ ] First ADR: "Multi-tenant architecture with `hospital_id` scoping"

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

### AI layer (Gemini 2.5 Pro)
- [ ] Move Gemini service to `shared/services/ai.ts` (currently mobile-only) and bump models to `gemini-2.5-pro` / `gemini-2.5-flash`
- [ ] System prompts: clinical summary, drug interaction, AI consult
- [ ] Streaming responses
- [ ] ❓ PHI redaction policy before sending to LLM (recommend: strip name/AN, keep clinical fields)
- [ ] Cache by `(patientId, fromTs, toTs)`

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

- ❓ **Supabase mode**: cloud or local for Sprint 0? *(still blocks seed script)*
- ❓ **PHI redaction** policy for Gemini calls
- ❓ **Hospital onboarding** flow: self-serve signup vs admin-invite-only
- ❓ **Realtime** for nurse vitals view, or is polling acceptable for MVP?
- ❓ **MediHack prototype**: port screens, or use as visual reference only?

---

## How to use this list

- Edit directly — small wins still get a check.
- Add a sub-bullet under any item if it grows scope.
- When Sprint N starts, move open Sprint N-1 items to a "**Carry-over**" section at the top of Sprint N rather than letting them drift.
- Decisions in the "Open decisions" section block the items that reference them — resolve as soon as possible.
