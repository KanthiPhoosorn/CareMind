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

### 5. Run the dev servers

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
