# CareMind — Quality & SDLC

> How we keep CareMind production-grade. Read once at onboarding; reference when in doubt.
> Companion: `CHECKLIST.md` tracks tasks; this doc explains the **process** behind them.

---

## 1. SDLC Overview

We follow an iterative sprint-based SDLC tuned for a 5-week MVP push:

| Phase                 | When                   | Output                            | Owner           |
| --------------------- | ---------------------- | --------------------------------- | --------------- |
| **Requirements**      | Continuous             | Notion PRD + Sprint Board         | PM / lead       |
| **Design**            | Sprint kickoff         | Architecture notes, schema, mocks | Lead dev        |
| **Implementation**    | Mid-sprint             | Code + tests in PR                | Dev             |
| **Verification (QA)** | Pre-merge + pre-deploy | CI green, manual test passes      | Dev + QA        |
| **Validation (UAT)**  | Sprint 3               | Thai clinician feedback log       | PM              |
| **Deployment**        | Sprint 4               | Vercel + EAS builds, RLS audit    | Lead dev        |
| **Maintenance**       | Post-MVP               | Bug intake, releases              | Rotating oncall |

### Sprint ceremonies

- **Kickoff** (start of sprint): review goals, assign tasks, agree on Definition of Done.
- **Daily standup** (15 min): yesterday / today / blockers. Update Sprint Board.
- **Mid-sprint check-in**: cut scope if at risk.
- **Demo + retro** (end of sprint): show working software, capture lessons, update `CHECKLIST.md`.

---

## 2. Definition of Done (per task)

A task is **not done** until:

- [ ] Code reviewed by ≥1 teammate (no self-merges to `main`)
- [ ] `npm run lint` + `npm run type-check` pass
- [ ] Unit tests written and passing
- [ ] Integration tests added if the change touches DB / external APIs
- [ ] Coverage ≥ 80% for **new** code (existing code grandfathered)
- [ ] No CRITICAL / HIGH issues from `npm audit`
- [ ] If touching patient data → PHI handling reviewed
- [ ] If touching DB → RLS / tenant-isolation test added
- [ ] If touching AI calls → output validated against system prompt expectations
- [ ] `README.md` / `CONVENTIONS.md` updated where relevant
- [ ] PR description includes screenshot or recording for UI changes
- [ ] Sprint Board status moved to **Done**

---

## 3. Test Stack (decision)

| Layer                        | Tool                                            | Why                                                   |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Unit (web / shared / mobile) | **Vitest**                                      | Fast, ESM-native, same config across workspaces       |
| Web E2E + visual regression  | **Playwright**                                  | Cross-browser, screenshot diffs, axe-core integration |
| Mobile E2E                   | **Maestro**                                     | YAML-based, far less flaky than Detox                 |
| DB / RLS                     | **pgTAP** (or `vitest` + Supabase test project) | Verifies tenant isolation declaratively               |
| Accessibility                | **axe-core** via Playwright                     | Automated WCAG checks per page                        |
| Performance                  | **Lighthouse CI**                               | Core Web Vitals enforced as PR gate                   |
| Security (deps)              | **`npm audit`** + **Snyk** (free tier)          | Dependency CVEs                                       |
| Type safety                  | **TypeScript strict** + `tsc --noEmit` in CI    | Catches whole classes of bugs upstream                |

### Folder layout

```
shared/__tests__/...          # unit + integration
web/e2e/...                   # Playwright specs
mobile/e2e/...                # Maestro flows (.yaml)
supabase/tests/...            # pgTAP / SQL tests
```

---

## 4. Test Pyramid & Coverage

| Level                                    | Share of test count | Coverage target                          |
| ---------------------------------------- | ------------------- | ---------------------------------------- |
| Unit                                     | ~70%                | ≥ 80% on new code                        |
| Integration (real Supabase test project) | ~20%                | Each service module has at least one     |
| E2E (golden path per role)               | ~10%                | Doctor, Nurse, Pharmacist, Patient flows |

**Golden paths to cover end-to-end before MVP demo:**

1. Doctor: login → patient list → patient detail → delta summary
2. Nurse: login → ward list → log vitals → submit
3. Pharmacist: login → Rx queue → drug interaction check → dispense
4. Patient (mobile): login → home → AI chat → med reminder

---

## 5. Healthcare-Specific Tests (CRITICAL)

These have higher priority than generic feature tests.

| Test                          | What it proves                                     | Severity if broken       |
| ----------------------------- | -------------------------------------------------- | ------------------------ |
| **Multi-tenant RLS**          | Hospital A user cannot read Hospital B records     | **P0** — release blocker |
| **PHI redaction in AI calls** | Patient name / AN stripped before Gemini call      | **P0**                   |
| **Audit log**                 | Every patient record view writes to `audit_log`    | P1                       |
| **Vital sign flagging**       | Out-of-range values raise correct severity         | P1                       |
| **Drug interaction**          | Known dangerous pairs trigger alert                | P1                       |
| **Lab unit handling**         | Values in mg/dL vs mmol/L don't get cross-compared | P1                       |
| **Thai text rendering**       | All clinical terms render without tofu / clipping  | P2                       |

---

## 6. CI/CD Quality Gates

```
PR opened ──► [Lint] ──► [Typecheck] ──► [Unit + coverage] ──► reviewer assigned
                                                                  │
Reviewer approves ──► [Integration tests] ──► [RLS tests] ──────► merge to main
                                                                  │
Push to main ──► staging deploy ──► [E2E] ──► [a11y] ──► [Lighthouse] ──► OK
                                                                  │
Manual promotion ──► production deploy ──► [smoke tests] ──► [RLS audit]
```

### What blocks each gate

| Gate        | Blocks if                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| PR open     | lint, typecheck, or unit fails • coverage drops on new code               |
| Pre-merge   | integration / RLS test fails • reviewer not approved                      |
| Pre-deploy  | E2E broken • a11y violations introduced • Lighthouse perf regress > 5 pts |
| Pre-release | manual smoke test fails • multi-tenant audit reveals leakage              |

---

## 7. Bug & Issue Workflow

**Where:** GitHub Issues (mirror in Notion Sprint Board if needed for visibility).

**Severity:**

| Level  | Definition                                  | SLA         |
| ------ | ------------------------------------------- | ----------- |
| **P0** | Demo / release blocker, data leak, security | Same day    |
| **P1** | Core feature broken, no workaround          | This sprint |
| **P2** | UX issue, has workaround                    | Next sprint |
| **P3** | Polish, nice-to-have                        | Backlog     |

**Triage:** every Monday + ad-hoc for P0/P1.

**Issue template fields:** role affected, steps to reproduce, expected vs actual, severity, screenshot/log, suspected component.

---

## 8. Release Process

1. **Cut release branch** from `main`: `release/v0.x.0`
2. **Run full regression** (E2E + a11y + Lighthouse + manual golden paths)
3. **Security audit**: `npm audit`, RLS isolation test, secret scan
4. **Tag & deploy** to staging → soak 24h → production
5. **Post-release smoke test** on prod
6. **Rollback plan** documented per release: previous Vercel deployment + Supabase migration `down`

---

## 9. Documentation Standards

Every shared module or non-trivial decision gets:

- A short JSDoc / docstring on exported functions
- An ADR (Architecture Decision Record) in `docs/adr/NNN-title.md` for changes that lock in a direction (DB schema, AI provider, auth model)

ADR template:

```markdown
# ADR NNN — Title

**Status:** proposed | accepted | superseded
**Date:** YYYY-MM-DD

## Context

## Decision

## Consequences
```

---

## 10. Onboarding Checklist (new teammate)

- [ ] Clone repo, copy `.env.example` → `.env.local`
- [ ] Install: Node 18+, npm, Supabase CLI, Expo CLI
- [ ] Run `npm install`
- [ ] Read this `QUALITY.md` and the `CHECKLIST.md`
- [ ] Run the test suite locally — all green before first PR
- [ ] Pair on a small task to learn the workflow
