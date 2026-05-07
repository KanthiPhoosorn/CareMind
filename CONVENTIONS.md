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

## 7. AI / Gemini

- AI service lives in `shared/services/ai.ts` — one abstraction, swappable provider.
- **Never send PHI** (patient name, admission number) to external APIs. Strip before calling.
- Always validate AI output against expected schema before rendering.
- Use streaming for long responses.
- Cache results by `(patientId, fromTs, toTs)` to avoid redundant calls.

---

## 8. Git Conventions

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

## 9. Error Handling

- Use `try/catch` at service boundaries, not inside every function.
- Log errors with context (userId, patientId, operation) — never log PHI.
- Surface user-friendly messages in the UI; log technical details to console/service.
- Use React Error Boundaries for component-level failures.

---

## 10. Testing

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
- Mock external services (Supabase, Gemini) — never hit real APIs in unit tests.
- Integration tests may use a test Supabase project.

---

## 11. Accessibility

- All interactive elements need accessible names (`aria-label`, visible label, or `aria-labelledby`).
- Use semantic HTML (`<button>`, `<nav>`, `<main>`, not `<div onClick>`).
- Color is never the only indicator — pair with icons or text.
- Respect `prefers-reduced-motion`.
- Target WCAG 2.1 AA.

---

## 12. Security

- **Environment variables**: never commit `.env.local`. Use `.env.example` as the template.
- **Service role key**: server-side only — never expose in client bundles.
- **PHI**: treat patient data as sensitive. No logging of names/ANs. Redact before AI calls.
- **Dependencies**: run `npm audit` regularly. Address CRITICAL/HIGH before release.
