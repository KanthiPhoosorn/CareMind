# Walk-in Queue Management — Design Spec

- **Status:** Draft — pending review
- **Owner:** Kanthi (lead) + CareMind team
- **Created:** 2026-05-11
- **Target sprint window:** Sprint 1 → Sprint 3 (M0–M5 slices land independently)
- **Related ADRs:** [0001-multi-tenant-architecture](../../adr/0001-multi-tenant-architecture.md)

## 1. Context & goals

### Problem

Thai hospital OPD walk-in flow today is paper-ticket + verbal-call:

- Patient arrives, takes a paper number at the front desk
- Triage nurse manually routes to a department
- Staff calls numbers by voice; patients must stay within earshot of a single waiting area
- No visibility into expected wait time, queue depth, or current-served number
- No data trail for metrics or audits

### Goals (Sprint 1–3)

1. **Self check-in via mobile** — patient scans a hospital QR, picks symptom category, gets a queue ticket with no install required
2. **Real-time queue dashboard for staff** — per-department live list with one-tap Call / Done / No-Show
3. **Auto-routing** — symptom category → target department, seeded by hospital admin (DB-only in M0; UI later)
4. **Notify on call** — SMS + audible chime when patient's number is called, so they don't need to stay in the waiting area
5. **Metrics & wait-time estimate** — rolling per-department averages, ticket-level state history

### Non-goals (for this scope)

- Appointment booking (this is **walk-in only**)
- IPD / surgical / lab queues (OPD-only for now)
- Payment, billing, or insurance lookup
- Clinician note-taking inside this flow (separate feature)
- AI symptom screening / chatbot (separate feature, deferred)
- Multi-language UI beyond Thai + English on patient surface
- Native mobile app for patients (PWA only)

### Success metrics

- p95 ticket-create flow time **< 30 seconds** from QR scan to ticket page
- **≥ 80%** of patients receive an SMS within 5 seconds of being called
- Staff dashboard **Realtime latency p95 < 1 second** for state changes
- Per-dept queue list renders in **< 1.5s LCP** on a 3G profile

## 2. User journeys

### 2.1 Patient (mobile web, anonymous)

```
[Scan hospital QR at front desk or reception poster]
        │
        ▼
[Landing: hospital branding + "Get a queue number" CTA]
        │
        ▼
[Symptom category picker — icon grid, tap only]
   (cough, fever, stomach pain, injury, skin, eye/ENT, other)
        │
        ▼
[Severity prompt — 3 tappable cards: Mild / Moderate / Severe]
        │  ─── If a red-flag chest-pain / breathing / heavy-bleed icon
        │      is tapped, jump to "Please go to ER" interstitial
        │      with map link, do NOT create a ticket
        ▼
[Phone number → OTP (SMS, 6 digits)]
        │
        ▼
[Ticket page — large number, department, queue position, est. wait]
   - Realtime: position updates as others are called
   - Notify: "We'll SMS you when it's nearly your turn"
   - Cancel button
```

**Constraints**

- Zero typing on symptom + severity steps; only typing is phone number
- Page must work without JS for the landing CTA (progressive enhancement)
- Thai default, English toggle in header
- No login, no PHI stored beyond phone + symptom code + timestamps

### 2.2 Staff (web dashboard, authenticated)

```
[Login → /dashboard/queue]
        │
        ▼
[Department selector — tabs or sidebar]
        │
        ▼
[Live queue list for selected dept]
   - Now serving: ticket #
   - Next 5 waiting (sorted by priority, then arrival)
   - Each row: ticket # · symptom code · severity badge · arrival time
   - Actions: [Call next] [Mark done] [No-show] [Move to dept ...]
        │
        ▼
[Call next →
   - Updates ticket to `called`
   - Fires Realtime event
   - Triggers SMS to patient + audible chime in waiting area
   - Starts no-show timer (default 5 min, configurable per dept)
]
```

**Constraints**

- Hospital-scoped — staff only see queues for their own hospital
- Department-scoped where applicable — a dermatology nurse can be limited to derm dept (role gating, M5+)
- Optimistic UI on action click; rollback on server error

### 2.3 Admin (deferred to post-M5)

Hospital admin manages departments and routing rules. **In M0 we seed via SQL** and revisit the UI when there's a real ops request.

## 3. Data model

### 3.1 Tables (new)

```sql
-- Departments are hospital-scoped OPD departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  code TEXT NOT NULL,           -- e.g. "GP", "DERM", "ENT"
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Default no-show timer (seconds after `called` before auto-no-show)
  no_show_seconds INT NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, code)
);

-- Routing rules map a (symptom_code, severity) to a department
-- Seeded per-hospital; rule resolution is "first match wins" by `priority` asc
CREATE TABLE routing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  symptom_code TEXT NOT NULL,                -- 'cough' | 'fever' | 'stomach' | ...
  severity TEXT,                              -- 'mild' | 'moderate' | 'severe' | NULL = any
  target_department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routing_lookup
  ON routing_rules(hospital_id, symptom_code, is_active, priority);

-- One ticket per walk-in visit
CREATE TABLE queue_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,

  -- Display number, monotonic per (hospital, dept, calendar day)
  ticket_number INT NOT NULL,

  -- Patient input (no FK to patients; walk-ins are anonymous until intake)
  phone_e164 TEXT NOT NULL,
  symptom_code TEXT NOT NULL,
  severity TEXT NOT NULL,                     -- 'mild' | 'moderate' | 'severe'

  -- Priority bump from severity; lower number = served sooner
  priority INT NOT NULL DEFAULT 100,

  -- State machine (see §3.3)
  state TEXT NOT NULL DEFAULT 'waiting',

  -- Timestamps populated as state advances
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,            -- set when OTP succeeds; unverified rows swept after 10 min
  called_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,

  -- Anti-abuse: short-lived signed token the patient holds in localStorage
  -- so they can re-open / cancel their own ticket without auth
  patient_token_hash TEXT NOT NULL,

  -- Audit
  called_by UUID REFERENCES profiles(id),
  completed_by UUID REFERENCES profiles(id),

  CHECK (state IN ('waiting', 'called', 'done', 'no_show', 'cancelled')),
  CHECK (severity IN ('mild', 'moderate', 'severe'))
);

-- Human-friendly ticket numbers are unique per (hospital, dept, day).
-- Expressed as a unique index because table-level UNIQUE cannot use
-- functional expressions like `created_at::date`.
CREATE UNIQUE INDEX idx_queue_tickets_daily_number
  ON queue_tickets(hospital_id, department_id, ticket_number, (created_at::date));

CREATE INDEX idx_queue_active
  ON queue_tickets(hospital_id, department_id, state, priority, created_at)
  WHERE state IN ('waiting', 'called');

-- Optional in M5; useful for analytics
CREATE TABLE queue_ticket_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES queue_tickets(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor UUID REFERENCES profiles(id),  -- NULL for anonymous (patient cancel)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Severity → priority mapping

| Severity | Priority value |
| -------- | -------------- |
| mild     | 100            |
| moderate | 50             |
| severe   | 10             |

Lower number is served first. Within a priority level, FIFO by `created_at`.

### 3.3 State machine

```
            ┌─────────┐
            │ waiting │ ── patient cancels ──▶ cancelled
            └────┬────┘
                 │ staff: call_next
                 ▼
            ┌─────────┐
            │ called  │ ── staff: mark_done ──▶ done
            └────┬────┘
                 │ no_show_seconds elapsed OR staff: mark_no_show
                 ▼
            ┌──────────┐
            │ no_show  │   (terminal)
            └──────────┘
```

- `waiting → called`: only valid action is `call_next`; only one ticket per dept can be in `called` at a time (enforced by partial unique index or application check)
- `called → done`: terminal, sets `done_at`
- `called → no_show`: either staff-triggered or background job that scans `called` tickets older than `no_show_seconds`
- `waiting → cancelled`: patient-initiated only (carries `patient_token_hash`)
- No transition is reversible in M0–M5; if staff fumble, they create a new ticket

## 4. RLS policies

### 4.1 Roles

| Role                    | How identified                                 |
| ----------------------- | ---------------------------------------------- |
| `anon`                  | Public Supabase JWT (Patient PWA)              |
| `authenticated` (staff) | Logged-in user with `profiles.hospital_id` set |
| `service_role`          | Background jobs (no-show sweep, SMS dispatch)  |

### 4.2 Policies

```sql
-- ── queue_tickets ──

-- 1. Anonymous patient: can INSERT a new ticket (creates own row)
--    Enforced through a SECURITY DEFINER RPC `create_walkin_ticket` rather
--    than direct INSERT, so we can validate hospital + symptom + rate-limit
--    inside the function. RLS still requires the policy below for defence-in-depth.
CREATE POLICY "anon_insert_walkin"
  ON queue_tickets FOR INSERT TO anon
  WITH CHECK (state = 'waiting');

-- 2. Anonymous patient: can SELECT their own ticket by id IFF they present
--    a matching patient_token (we expose this via an RPC, not raw row read)
--    Direct table SELECT is blocked for anon.

-- 3. Staff: can SELECT all tickets in their hospital
CREATE POLICY "staff_read_queue"
  ON queue_tickets FOR SELECT TO authenticated
  USING (hospital_id = current_hospital_id());

-- 4. Staff: can UPDATE tickets in their hospital
--    Only via RPCs `call_next_ticket`, `mark_ticket_done`, `mark_ticket_no_show`
CREATE POLICY "staff_update_queue"
  ON queue_tickets FOR UPDATE TO authenticated
  USING (hospital_id = current_hospital_id());

-- 5. service_role bypasses RLS

-- ── departments + routing_rules ──

-- Public read of `is_active` departments via RPC (used by patient picker
-- to look up the symptom → dept routing on the server). No direct SELECT
-- for anon on these tables.

CREATE POLICY "staff_read_departments"
  ON departments FOR SELECT TO authenticated
  USING (hospital_id = current_hospital_id());

CREATE POLICY "staff_read_routing"
  ON routing_rules FOR SELECT TO authenticated
  USING (hospital_id = current_hospital_id());
```

### 4.3 Anonymous-ticket security

Because patient flow is anonymous, we issue a short-lived signed `patient_token` (random 32-byte secret) at ticket creation. The hash is stored in `queue_tickets.patient_token_hash`; the raw token is returned once in the create response and persisted in the patient's localStorage. Subsequent patient actions (view own ticket, cancel) go through RPCs that verify the token against the row hash.

This avoids needing Supabase Auth for walk-in patients while preventing one patient from reading or cancelling another patient's ticket.

## 5. Routes & surfaces

### 5.1 Patient PWA — `web/app/(checkin)/...`

```
web/app/(checkin)/
├── layout.tsx                       # Public layout, no nav, hospital theming
├── [hospitalCode]/
│   ├── page.tsx                     # Landing: "Get a queue number"
│   ├── symptom/page.tsx             # Symptom icon grid
│   ├── severity/page.tsx            # 3-card severity picker
│   ├── verify/page.tsx              # Phone + OTP
│   └── ticket/[ticketId]/page.tsx   # Live ticket + Realtime updates
```

- Route group `(checkin)` keeps these out of the authenticated dashboard layout
- `[hospitalCode]` segment is the path in the QR code so different hospitals share the same deployment
- All routes are server components except `ticket/[ticketId]` (Realtime subscription)
- Flow state held in URL search params + ephemeral cookie, not a global store

### 5.2 Staff dashboard — `web/app/(dashboard)/queue/...`

```
web/app/(dashboard)/queue/
├── layout.tsx                       # Auth-guarded, hospital-scoped
├── page.tsx                         # Dept selector + redirect to first dept
└── [departmentCode]/page.tsx        # Live queue list + actions
```

### 5.3 Public API — `web/app/api/queue/...`

Route handlers that wrap Supabase RPCs:

```
POST   /api/queue/tickets             # create walk-in ticket (anon)
POST   /api/queue/tickets/[id]/verify # submit OTP (anon)
POST   /api/queue/tickets/[id]/cancel # cancel own ticket (anon, requires token)
POST   /api/queue/[deptId]/call-next  # staff
POST   /api/queue/tickets/[id]/done   # staff
POST   /api/queue/tickets/[id]/no-show# staff
```

## 6. API contracts

### 6.1 Create ticket (anonymous)

```ts
// POST /api/queue/tickets
type CreateTicketRequest = {
  hospitalCode: string; // from QR
  symptomCode: SymptomCode; // enum, see §2.1
  severity: 'mild' | 'moderate' | 'severe';
  phoneE164: string;
  locale: 'th' | 'en';
};

type CreateTicketResponse = {
  ticketId: string;
  ticketNumber: number;
  departmentCode: string;
  departmentNameTh: string;
  departmentNameEn: string;
  positionInQueue: number;
  estimatedWaitSeconds: number | null; // null until M5 wait-math ships
  patientToken: string; // returned once, persist in localStorage
};
```

OTP is sent on this call. The ticket is created in `waiting` state with `verified_at = NULL`; the background sweeper deletes rows where `verified_at IS NULL AND created_at < NOW() - INTERVAL '10 minutes'`.

### 6.2 Verify OTP

```ts
// POST /api/queue/tickets/[id]/verify
type VerifyRequest = { otp: string };
type VerifyResponse = { ok: true } | { ok: false; reason: 'expired' | 'invalid' };
```

### 6.3 Call next (staff)

```ts
// POST /api/queue/[deptId]/call-next
type CallNextResponse = {
  ticket: {
    id: string;
    ticketNumber: number;
    symptomCode: SymptomCode;
    severity: 'mild' | 'moderate' | 'severe';
    waitedSeconds: number;
  } | null; // null if queue is empty
};
```

Side effects:

1. UPDATE ticket SET state='called', called_at=NOW(), called_by=auth.uid()
2. Insert `queue_ticket_events` row
3. Enqueue SMS dispatch job
4. Realtime broadcast on `queue:<hospitalId>:<departmentId>`

### 6.4 Mark done / no-show — symmetric, omitted for brevity

## 7. Realtime channels

| Channel                             | Subscribers                            | Events                                                                                 |
| ----------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `queue:<hospitalId>:<departmentId>` | Staff dashboard for that dept          | `ticket_created`, `ticket_called`, `ticket_done`, `ticket_no_show`, `ticket_cancelled` |
| `ticket:<ticketId>`                 | The single patient holding that ticket | `position_changed`, `called`, `cancelled_by_staff`                                     |

- Use Supabase Realtime via `postgres_changes` on `queue_tickets` filtered by `hospital_id` and `department_id`
- Patient client filters further to its own `id`
- Reconnect strategy: exponential backoff to 30s; on reconnect, refetch ticket state once

## 8. Notifications

### 8.1 SMS

- Provider: **TBD** — Twilio (works in Thailand but Latin-script bias) vs. a Thai aggregator (Thaibulksms, Infobip). Decision deferred to M3; spec the abstract interface now.
- Trigger: `waiting → called` transition (M4) and OTP send (M3)
- Template (Thai): `"คิวของคุณใกล้ถึงแล้ว เลขที่ {n} แผนก {dept}. กรุณามาที่จุดเรียกคิว."`
- Template (English): `"Your turn is coming up. Number {n}, {dept}. Please come to the calling point."`
- Dispatch via background worker, not inside the request handler
- Retry 3× with 5s/30s/2min backoff; log final failure

### 8.2 Audio chime — staff dashboard

- WebAudio chime on every `ticket_called` event in the dashboard
- User-toggleable mute in dashboard header (persisted in localStorage)

### 8.3 PWA push — deferred

PWA notifications require user permission + service worker registration, which costs install friction. Stay with SMS for M4; revisit push in a later sprint if SMS cost becomes a problem.

## 9. Wait-time estimation (M5)

```
For dept D at time T:
  avg_service_seconds = rolling 1h average of (done_at - called_at)
                        across completed tickets in D
  ahead_in_line       = count of tickets in (waiting, called) in D
                        with (priority, created_at) <= caller's row
  estimated_wait      = ahead_in_line * avg_service_seconds
```

- Recomputed on the server every 60s and cached per dept
- Returned in `CreateTicketResponse` and refreshed on the ticket page
- Honest about uncertainty: show as a range (`~10–20 min`) not a single number

## 10. Slice plan (M0–M5)

The slices are demoable end-to-end. They are sized so multiple contributors can work in parallel after M0 lands.

| Slice  | What ships                                                                                                                            | Depends on      | Parallelizable with |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| **M0** | Migration `00003_walkin_queue.sql` (tables + RLS + indexes), seed routing rules, generated types, pgTAP RLS tests                     | —               | —                   |
| **M1** | Patient PWA flow with **mocked** API (in-memory responses), full UI for QR → symptom → severity → phone → ticket page, Thai + English | M0 (types only) | M2                  |
| **M2** | Staff dashboard with **mocked** API, per-dept queue list, action buttons, optimistic UI                                               | M0 (types only) | M1                  |
| **M3** | Real backend: server actions + RPCs (`create_walkin_ticket`, `call_next_ticket`, etc.), OTP via SMS provider, replace M1 + M2 mocks   | M0, M1, M2      | —                   |
| **M4** | SMS dispatch on `called`, audio chime, no-show sweeper background job                                                                 | M3              | —                   |
| **M5** | Wait-time estimate + simple metrics view (tickets per dept per day, avg wait, no-show %)                                              | M3              | M4                  |

Each slice is its own PR (or set of PRs) and shippable behind a feature flag if needed.

## 11. Test strategy

| Layer             | Tool                       | What we cover                                                                                            |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Migrations + RLS  | **pgTAP**                  | Anon can insert; anon cannot read other tickets; staff scoped to own hospital; state machine constraints |
| Server logic      | **Vitest**                 | RPC wrappers, severity → priority mapping, routing-rule resolution, wait-time math                       |
| Patient flow      | **Playwright**             | QR → ticket happy path; ER red-flag interstitial; OTP retry; cancel ticket                               |
| Staff flow        | **Playwright**             | Call next happy path; no-show timer; optimistic UI rollback on server error                              |
| Visual regression | **Playwright screenshots** | Symptom grid, severity cards, ticket page, dashboard list at 320 / 375 / 768                             |
| Accessibility     | axe via Playwright         | Keyboard nav through patient flow; color contrast on severity badges                                     |
| Performance       | Lighthouse CI              | Patient landing LCP < 2.5s; dashboard < 1.5s LCP                                                         |

DoD per slice: pgTAP for any schema change, Vitest ≥ 80% on new TS code, Playwright happy-path green.

## 12. Security & PHI handling

- **Phone numbers** are PHI. Stored in plaintext for SMS delivery; access restricted by RLS. Logged only as last-4-digit hash in non-PHI logs.
- **Symptom codes** are coarse and de-identified (no free text). Severity is a 3-bucket enum.
- **Retention:** auto-purge tickets in terminal states (`done`, `no_show`, `cancelled`) older than **30 days** via a daily job. Events table retained 90 days for ops audit.
- **Audit:** every state change writes to `queue_ticket_events` with actor.
- **Rate limit:** anon ticket-create endpoint limited to 5/min per IP and 1/min per phone number (Supabase Edge Function or Vercel middleware).
- **CSP:** patient PWA has a strict CSP, no inline scripts, no third-party iframes.
- **No service worker** in M0–M4 — keeps the install surface minimal; add deliberately when push lands.

## 13. Open questions

1. **SMS provider** — Twilio vs. Thaibulksms vs. Infobip. Need a cost-per-message comparison and a Thai Unicode delivery test before M3 implementation starts.
2. **Severity input UX** — three big cards vs. slider vs. emoji grid. M1 ships with three big cards; visual review may revisit.
3. **OTP rate-limit thresholds** — 5/min per IP is a guess; tune against real traffic in M3.
4. **No-show timer default** — 5 min is an opinion. Validate with the OPD ops contact before M4.
5. **Department code conventions** — do hospitals share a code taxonomy or is each hospital free-form? Affects whether routing rules can be templated. Decision deferred to admin-UI sprint.
6. **Severity-bump fairness** — should `severe` jump ahead of an already-waiting `mild` from 30 min ago? Current rule says yes (priority strictly dominates). Confirm with clinical contact.
7. **Multi-hospital admin UI** — when do we build it? Tracked separately; not in M0–M5.

## 14. Decisions log

| Date       | Decision                                              | Why                                                                            |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2026-05-11 | Walk-in queue is the only feature in scope this round | Patient/staff chatbots and local model deferred to keep slice count manageable |
| 2026-05-11 | PWA, not native, for patient surface                  | Zero-install requirement; PWA push deferred to reduce friction                 |
| 2026-05-11 | Accept SMS cost over PWA push                         | Push requires install + permission; SMS works for everyone                     |
| 2026-05-11 | Two UIs, one Supabase project                         | Shared schema + tenancy model; cheaper to operate                              |
| 2026-05-11 | Per-dept FIFO + severity bump                         | Simple, predictable; clinical-judgement-friendly                               |
| 2026-05-11 | Anonymous patient via signed token, not Supabase Auth | Walk-in UX should require no account creation                                  |
| 2026-05-11 | Approach A (Lean MVP, M0–M5)                          | Smallest contract surface, slice-friendly, ships demoable value early          |
