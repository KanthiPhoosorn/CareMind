# LINE OA Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a walk-in patient link their LINE account to their queue ticket so the existing Phase F.1 dispatcher can push "ticket called" notifications via LINE.

**Architecture:** A patient taps a deep-link button on their ticket page, which opens the hospital LINE OA with a prefilled `LINK-XXXXXXXX` message. When they send it, LINE calls our Next.js webhook route; the route verifies the HMAC signature, extracts the code, and calls a `SECURITY DEFINER` RPC that stores the patient's LINE `userId` on the matching ticket. The "delivery" half (push on ticket-called) already exists and starts working automatically once `line_user_id` is populated.

**Tech Stack:** Supabase (Postgres 15, pgTAP), Next.js 16 App Router route handlers, TypeScript, vitest, `node:crypto` for HMAC.

**Spec:** `docs/superpowers/specs/2026-05-14-line-oa-webhook-design.md`

**Branch:** `feat/walkin-queue-complete` (continues PR #6 — no branch switch).

---

## File Structure

New files:

| File                                             | Responsibility                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `supabase/migrations/00014_walkin_line_link.sql` | `line_link_code` column, `link_line_user_id` RPC, extends `get_ticket_wait_estimate` return shape |
| `supabase/tests/walkin_line_link_test.sql`       | pgTAP guard for the migration                                                                     |
| `web/lib/line/signature.ts`                      | `verifyLineSignature` — HMAC-SHA256 webhook signature check                                       |
| `web/lib/line/signature.test.ts`                 | vitest for `verifyLineSignature`                                                                  |
| `web/lib/line/messaging.ts`                      | LINE Messaging API client — `pushMessage` + `replyMessage`                                        |
| `web/app/api/line/webhook/route.ts`              | The webhook POST handler                                                                          |
| `web/app/api/line/webhook/route.test.ts`         | vitest for the webhook handler logic                                                              |

Modified files:

| File                                                          | Change                                                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/src/types/database.ts`                                | Register `link_line_user_id`; extend `get_ticket_wait_estimate` `Returns`; add `line_user_id` + `line_link_code` to the `queue_tickets` row/insert types |
| `web/app/(checkin)/actions.ts`                                | `TicketWaitEstimate` gains `lineLinkCode` + `lineUserId`; mapping updated                                                                                |
| `web/lib/sms/line-provider.ts`                                | Refactored to a thin wrapper over `messaging.pushMessage` (kills duplicated fetch logic)                                                                 |
| `web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx` | Adds the "notify on LINE" button / "linked" confirmation block                                                                                           |
| `vitest.config.ts`                                            | Adds an `@` → `web` resolve alias so webhook tests can import `@/...` modules                                                                            |
| `web/.env.example`                                            | Adds `LINE_CHANNEL_SECRET` and `NEXT_PUBLIC_LINE_OA_ID`                                                                                                  |

---

## Task 1: Database migration — `line_link_code` + `link_line_user_id` RPC

**Files:**

- Create: `supabase/migrations/00014_walkin_line_link.sql`
- Test: `supabase/tests/walkin_line_link_test.sql`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/walkin_line_link_test.sql`:

```sql
-- Guards migration 00014: the line_link_code column, the link_line_user_id
-- RPC, and the two columns added to get_ticket_wait_estimate.
BEGIN;
SELECT plan(14);

-- ---- column shape -------------------------------------------------------
SELECT has_column('public', 'queue_tickets', 'line_link_code',
  'queue_tickets.line_link_code column exists');
SELECT col_type_is('public', 'queue_tickets', 'line_link_code', 'text',
  'line_link_code is TEXT');
SELECT col_not_null('public', 'queue_tickets', 'line_link_code',
  'line_link_code is NOT NULL');
SELECT col_has_default('public', 'queue_tickets', 'line_link_code',
  'line_link_code has a server-side default');

-- ---- fixtures -----------------------------------------------------------
INSERT INTO hospitals (id, name, code)
  VALUES ('7a000000-0000-0000-0000-000000000000', 'LineLink Hospital', 'LLK')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, hospital_id, code, name_th, name_en)
  VALUES ('7a000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '7a000000-0000-0000-0000-000000000000',
          'GP', 'ทั่วไป', 'General')
  ON CONFLICT (id) DO NOTHING;

-- An active (waiting) ticket. line_link_code is left to its DEFAULT.
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, priority,
                           state, patient_token_hash)
  VALUES ('7a000000-1111-1111-1111-111111111111',
          '7a000000-0000-0000-0000-000000000000',
          '7a000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          1, '+66810000001', 'cough', 'mild', 100, 'waiting',
          encode(extensions.digest('llk-tok-1', 'sha256'), 'hex'));

-- A closed (done) ticket with a known, fixed code.
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, priority,
                           state, patient_token_hash, line_link_code)
  VALUES ('7a000000-2222-2222-2222-222222222222',
          '7a000000-0000-0000-0000-000000000000',
          '7a000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          2, '+66810000002', 'cough', 'mild', 100, 'done',
          encode(extensions.digest('llk-tok-2', 'sha256'), 'hex'),
          'DONE0001');

-- 5. the DEFAULT produced an 8-char uppercase-hex code on the waiting ticket
SELECT ok(
  (SELECT line_link_code ~ '^[0-9A-F]{8}$'
     FROM queue_tickets WHERE id = '7a000000-1111-1111-1111-111111111111'),
  'DEFAULT generates an 8-char uppercase-hex line_link_code'
);

-- 6. link_line_user_id on the active ticket reports reason=linked.
--    (reason uniquely determines ok, so checking reason is sufficient.)
SELECT is(
  (SELECT reason FROM link_line_user_id(
     (SELECT line_link_code FROM queue_tickets
        WHERE id = '7a000000-1111-1111-1111-111111111111'),
     'U00000000000000000000000000000001')),
  'linked',
  'link_line_user_id on an active ticket returns reason=linked'
);

-- 7. ...and it actually wrote line_user_id onto the ticket
SELECT is(
  (SELECT line_user_id FROM queue_tickets
     WHERE id = '7a000000-1111-1111-1111-111111111111'),
  'U00000000000000000000000000000001',
  'link_line_user_id wrote line_user_id onto the ticket'
);

-- 8. link_line_user_id on a closed (done) ticket is rejected
SELECT is(
  (SELECT reason FROM link_line_user_id('DONE0001',
     'U00000000000000000000000000000009')),
  'closed',
  'link_line_user_id on a done ticket returns reason=closed'
);

-- 9. ...and left the closed ticket's line_user_id untouched
SELECT is(
  (SELECT line_user_id FROM queue_tickets
     WHERE id = '7a000000-2222-2222-2222-222222222222'),
  NULL,
  'closed ticket line_user_id is left untouched'
);

-- 10. unknown code
SELECT is(
  (SELECT reason FROM link_line_user_id('ZZZZZZZZ',
     'U00000000000000000000000000000009')),
  'not_found',
  'link_line_user_id with an unknown code returns reason=not_found'
);

-- 11. idempotent: relinking with the same userId
SELECT is(
  (SELECT reason FROM link_line_user_id(
     (SELECT line_link_code FROM queue_tickets
        WHERE id = '7a000000-1111-1111-1111-111111111111'),
     'U00000000000000000000000000000001')),
  'already_linked',
  'relinking with the same userId is idempotent (already_linked)'
);

-- 12. a different userId on an already-linked ticket
SELECT is(
  (SELECT reason FROM link_line_user_id(
     (SELECT line_link_code FROM queue_tickets
        WHERE id = '7a000000-1111-1111-1111-111111111111'),
     'U00000000000000000000000000000002')),
  'taken',
  'a different userId on a linked ticket returns reason=taken'
);

-- 13 + 14. get_ticket_wait_estimate now surfaces the two new columns
SELECT isnt(
  (SELECT line_link_code FROM get_ticket_wait_estimate(
     '7a000000-1111-1111-1111-111111111111'::uuid, 'llk-tok-1')),
  NULL,
  'get_ticket_wait_estimate returns a non-null line_link_code'
);
SELECT is(
  (SELECT line_user_id FROM get_ticket_wait_estimate(
     '7a000000-1111-1111-1111-111111111111'::uuid, 'llk-tok-1')),
  'U00000000000000000000000000000001',
  'get_ticket_wait_estimate returns the linked line_user_id'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: FAIL — `walkin_line_link_test.sql` errors with `column "line_link_code" does not exist` / `function link_line_user_id(...) does not exist`. Other test files still pass.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00014_walkin_line_link.sql`:

```sql
-- Migration 00014: line_link_code column + link_line_user_id RPC
--
-- Patients link their LINE account to a ticket by sending a prefilled
-- "LINK-XXXXXXXX" message to the hospital LINE OA. The webhook
-- (web/app/api/line/webhook/route.ts) extracts the code and calls
-- link_line_user_id() to populate queue_tickets.line_user_id, which the
-- Phase F.1 dispatcher (web/app/(dashboard)/queue/actions.ts) already
-- consumes.
--
-- See docs/superpowers/specs/2026-05-14-line-oa-webhook-design.md

-- 1. Per-ticket link code. 8 uppercase hex chars, DB-generated so
--    create_walkin_ticket needs no change. The DEFAULT backfills existing
--    rows. pgcrypto already lives in the `extensions` schema.
ALTER TABLE queue_tickets
  ADD COLUMN line_link_code TEXT NOT NULL
    DEFAULT upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));

COMMENT ON COLUMN queue_tickets.line_link_code IS
  'Short code embedded in the patient LINE deep link. Matched by link_line_user_id().';

-- 2. Re-create get_ticket_wait_estimate with two extra output columns so the
--    patient ticket page (which already polls this RPC every 30s) can render
--    the LINE button and flip it to "linked" with no new query.
--    DROP first — RETURNS TABLE shape is changing, CREATE OR REPLACE refuses
--    "cannot change return type" (same constraint hit in migration 00012).
DROP FUNCTION IF EXISTS get_ticket_wait_estimate(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_ticket_wait_estimate(
  p_ticket_id      UUID,
  p_patient_token  TEXT
)
RETURNS TABLE (
  state                      TEXT,
  position_in_queue          INTEGER,
  estimated_wait_minutes     INTEGER,
  current_ticket_number      INTEGER,
  current_department_code    TEXT,
  current_department_name_th TEXT,
  current_department_name_en TEXT,
  line_link_code             TEXT,
  line_user_id               TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash  TEXT;
  v_ticket      RECORD;
  v_position    INTEGER;
BEGIN
  v_token_hash := encode(extensions.digest(p_patient_token, 'sha256'), 'hex');

  SELECT t.id, t.department_id, t.priority, t.ticket_number, t.state,
         t.patient_token_hash, t.line_link_code, t.line_user_id,
         d.code AS dept_code, d.name_th AS dept_th, d.name_en AS dept_en
    INTO v_ticket
    FROM queue_tickets t
    JOIN departments d ON d.id = t.department_id
   WHERE t.id = p_ticket_id;

  IF NOT FOUND OR v_ticket.patient_token_hash <> v_token_hash THEN
    RAISE EXCEPTION 'ticket_not_found_or_token_mismatch'
      USING ERRCODE = '42501';
  END IF;

  current_ticket_number      := v_ticket.ticket_number;
  current_department_code    := v_ticket.dept_code;
  current_department_name_th := v_ticket.dept_th;
  current_department_name_en := v_ticket.dept_en;
  line_link_code             := v_ticket.line_link_code;
  line_user_id               := v_ticket.line_user_id;

  IF v_ticket.state = 'pending_triage' THEN
    SELECT COUNT(*) + 1 INTO v_position
      FROM queue_tickets q
     WHERE q.department_id = v_ticket.department_id
       AND q.state = 'pending_triage'
       AND q.ticket_number < v_ticket.ticket_number;
    state := 'pending_triage';
    position_in_queue := v_position;
    estimated_wait_minutes := GREATEST(0, v_position * 5);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_ticket.state NOT IN ('waiting', 'called') THEN
    state := v_ticket.state;
    position_in_queue := 0;
    estimated_wait_minutes := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_position
    FROM queue_tickets q
   WHERE q.department_id = v_ticket.department_id
     AND q.state = 'waiting'
     AND (
       q.priority < v_ticket.priority
       OR (q.priority = v_ticket.priority AND q.ticket_number < v_ticket.ticket_number)
     );

  IF v_ticket.state = 'called' THEN
    v_position := 0;
  ELSE
    v_position := v_position + 1;
  END IF;

  state := v_ticket.state;
  position_in_queue := v_position;
  estimated_wait_minutes := estimate_wait_minutes(v_ticket.department_id, v_position);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION get_ticket_wait_estimate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ticket_wait_estimate(UUID, TEXT) TO anon, authenticated;

-- 3. link_line_user_id: matches an active ticket by its line_link_code and
--    stores the patient's LINE userId. Idempotent. SECURITY DEFINER so the
--    webhook can call it with the anon key, like the rest of the check-in
--    flow. ORDER BY created_at DESC LIMIT 1 defensively handles the
--    (effectively impossible) 8-hex-char collision by taking the newest.
CREATE OR REPLACE FUNCTION link_line_user_id(
  p_link_code     TEXT,
  p_line_user_id  TEXT
)
RETURNS TABLE (
  ok                 BOOLEAN,
  reason             TEXT,
  ticket_number      INTEGER,
  department_name_th TEXT,
  department_name_en TEXT,
  state              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ticket RECORD;
BEGIN
  SELECT t.id, t.state, t.ticket_number, t.line_user_id,
         d.name_th AS dept_th, d.name_en AS dept_en
    INTO v_ticket
    FROM queue_tickets t
    JOIN departments d ON d.id = t.department_id
   WHERE t.line_link_code = upper(p_link_code)
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    ok := false; reason := 'not_found';
    RETURN NEXT; RETURN;
  END IF;

  ticket_number      := v_ticket.ticket_number;
  department_name_th := v_ticket.dept_th;
  department_name_en := v_ticket.dept_en;
  state              := v_ticket.state;

  IF v_ticket.state NOT IN ('pending_triage', 'waiting', 'called') THEN
    ok := false; reason := 'closed';
    RETURN NEXT; RETURN;
  END IF;

  IF v_ticket.line_user_id IS NULL THEN
    UPDATE queue_tickets
       SET line_user_id = p_line_user_id
     WHERE id = v_ticket.id;
    ok := true; reason := 'linked';
    RETURN NEXT; RETURN;
  END IF;

  IF v_ticket.line_user_id = p_line_user_id THEN
    ok := true; reason := 'already_linked';
    RETURN NEXT; RETURN;
  END IF;

  ok := false; reason := 'taken';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION link_line_user_id(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_line_user_id(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION link_line_user_id(TEXT, TEXT) IS
  'Links a LINE userId to a ticket via its line_link_code. Idempotent. Called by the LINE OA webhook.';
```

- [ ] **Step 4: Apply the migration and run the full pgTAP suite**

Run: `cd /mnt/d/CareMind && npx supabase db reset && npx supabase test db`
Expected: clean reset with `00014_walkin_line_link.sql` listed as applied; all test files PASS, including the new `walkin_line_link_test.sql` (14/14). The existing `walkin_line_user_id_test.sql` and `walkin_get_ticket_wait_estimate_test.sql` still pass (the new column has a DEFAULT so old inserts are unaffected; the wait-estimate test's `SELECT *` is inside a `throws_ok` that raises before returning rows).

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/CareMind
git add supabase/migrations/00014_walkin_line_link.sql supabase/tests/walkin_line_link_test.sql
git commit -m "feat(db): line_link_code column + link_line_user_id RPC (00014)"
```

---

## Task 2: Type layer — register the RPC and new columns

This task has no standalone test (it is a pure TypeScript type-declaration file plus a thin mapping). `tsc --noEmit` is the verification. It must come before the webhook task, which calls `callRpc(supabase, 'link_line_user_id', ...)` — that only typechecks once the function is registered here.

**Files:**

- Modify: `shared/src/types/database.ts`
- Modify: `web/app/(checkin)/actions.ts`

- [ ] **Step 1: Add `line_user_id` + `line_link_code` to the `queue_tickets` Row**

In `shared/src/types/database.ts`, find the `queue_tickets` `Row` block. It currently ends:

```ts
          otp_attempts: number;
          called_by: string | null;
          completed_by: string | null;
        };
```

Replace with:

```ts
          otp_attempts: number;
          called_by: string | null;
          completed_by: string | null;
          line_user_id: string | null;
          line_link_code: string;
        };
```

(Note: `line_user_id` was added to the DB in migration 00013 but never registered here — fixed now while we are in this file.)

- [ ] **Step 2: Make both new columns optional on Insert**

Still in the `queue_tickets` block, the `Insert` type currently reads:

```ts
        Insert: Omit<
          Database['public']['Tables']['queue_tickets']['Row'],
          | 'id'
          | 'created_at'
          | 'verified_at'
          | 'called_at'
          | 'done_at'
          | 'cancelled_at'
          | 'no_show_at'
          | 'called_by'
          | 'completed_by'
          | 'priority'
          | 'state'
          | 'otp_code_hash'
          | 'otp_expires_at'
          | 'otp_attempts'
        > & {
          priority?: number;
          state?: TicketState;
        };
```

Replace with:

```ts
        Insert: Omit<
          Database['public']['Tables']['queue_tickets']['Row'],
          | 'id'
          | 'created_at'
          | 'verified_at'
          | 'called_at'
          | 'done_at'
          | 'cancelled_at'
          | 'no_show_at'
          | 'called_by'
          | 'completed_by'
          | 'priority'
          | 'state'
          | 'otp_code_hash'
          | 'otp_expires_at'
          | 'otp_attempts'
          | 'line_user_id'
          | 'line_link_code'
        > & {
          priority?: number;
          state?: TicketState;
          line_user_id?: string | null;
          line_link_code?: string;
        };
```

- [ ] **Step 3: Extend the `get_ticket_wait_estimate` Returns shape and register `link_line_user_id`**

In the `Functions` block, the `get_ticket_wait_estimate` entry currently reads:

```ts
get_ticket_wait_estimate: {
  Args: {
    p_ticket_id: string;
    p_patient_token: string;
  }
  Returns: Array<{
    state: string;
    position_in_queue: number;
    estimated_wait_minutes: number;
    current_ticket_number: number;
    current_department_code: string;
    current_department_name_th: string;
    current_department_name_en: string;
  }>;
}
```

Replace with:

```ts
get_ticket_wait_estimate: {
  Args: {
    p_ticket_id: string;
    p_patient_token: string;
  }
  Returns: Array<{
    state: string;
    position_in_queue: number;
    estimated_wait_minutes: number;
    current_ticket_number: number;
    current_department_code: string;
    current_department_name_th: string;
    current_department_name_en: string;
    line_link_code: string;
    line_user_id: string | null;
  }>;
}
link_line_user_id: {
  Args: {
    p_link_code: string;
    p_line_user_id: string;
  }
  Returns: Array<{
    ok: boolean;
    reason: string;
    ticket_number: number | null;
    department_name_th: string | null;
    department_name_en: string | null;
    state: string | null;
  }>;
}
```

- [ ] **Step 4: Add the two fields to `TicketWaitEstimate` and its mapping**

In `web/app/(checkin)/actions.ts`, the `TicketWaitEstimate` interface currently reads:

```ts
export interface TicketWaitEstimate {
  state: string;
  positionInQueue: number;
  estimatedWaitMinutes: number;
  currentTicketNumber: number;
  currentDepartmentCode: string;
  currentDepartmentNameTh: string;
  currentDepartmentNameEn: string;
}
```

Replace with:

```ts
export interface TicketWaitEstimate {
  state: string;
  positionInQueue: number;
  estimatedWaitMinutes: number;
  currentTicketNumber: number;
  currentDepartmentCode: string;
  currentDepartmentNameTh: string;
  currentDepartmentNameEn: string;
  lineLinkCode: string;
  lineUserId: string | null;
}
```

Then in the same file the `getTicketWaitEstimate` return object currently reads:

```ts
return {
  state: r.state as string,
  positionInQueue: r.position_in_queue as number,
  estimatedWaitMinutes: r.estimated_wait_minutes as number,
  currentTicketNumber: r.current_ticket_number as number,
  currentDepartmentCode: r.current_department_code as string,
  currentDepartmentNameTh: r.current_department_name_th as string,
  currentDepartmentNameEn: r.current_department_name_en as string,
};
```

Replace with:

```ts
return {
  state: r.state as string,
  positionInQueue: r.position_in_queue as number,
  estimatedWaitMinutes: r.estimated_wait_minutes as number,
  currentTicketNumber: r.current_ticket_number as number,
  currentDepartmentCode: r.current_department_code as string,
  currentDepartmentNameTh: r.current_department_name_th as string,
  currentDepartmentNameEn: r.current_department_name_en as string,
  lineLinkCode: r.line_link_code as string,
  lineUserId: (r.line_user_id as string | null) ?? null,
};
```

- [ ] **Step 5: Type-check**

Run: `cd /mnt/d/CareMind && npm run build:shared && npm run type-check`
Expected: PASS — no type errors in any workspace.

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/CareMind
git add shared/src/types/database.ts "web/app/(checkin)/actions.ts"
git commit -m "feat(types): register link_line_user_id RPC + line link columns"
```

---

## Task 3: LINE signature verification

**Files:**

- Create: `web/lib/line/signature.ts`
- Test: `web/lib/line/signature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/lib/line/signature.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyLineSignature } from './signature';

const SECRET = 'test-channel-secret';
const BODY = '{"events":[{"type":"message"}]}';
const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64');

describe('verifyLineSignature', () => {
  it('accepts a signature computed with the right secret over the exact body', () => {
    expect(verifyLineSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyLineSignature(BODY + ' ', sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it('rejects a signature computed with a different secret', () => {
    expect(verifyLineSignature(BODY, sign(BODY, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature header without throwing', () => {
    expect(verifyLineSignature(BODY, null, SECRET)).toBe(false);
  });

  it('rejects when the channel secret is empty', () => {
    expect(verifyLineSignature(BODY, sign(BODY, SECRET), '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /mnt/d/CareMind && npm test -- signature`
Expected: FAIL — cannot resolve `./signature` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `web/lib/line/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

// LINE signs every webhook request: the X-Line-Signature header is
// base64(HMAC-SHA256(channelSecret, rawRequestBody)). We must verify it
// against the *raw* body before trusting any event in the payload.
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual throws on length mismatch — guard first, then compare
  // in constant time.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /mnt/d/CareMind && npm test -- signature`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/CareMind
git add web/lib/line/signature.ts web/lib/line/signature.test.ts
git commit -m "feat(line): HMAC-SHA256 webhook signature verification"
```

---

## Task 4: LINE Messaging API client

This is a pure I/O wrapper (two `fetch` calls). Per the spec it has no standalone test — it is exercised indirectly by the webhook route test (Task 6), which mocks it. Verification here is that the existing suite still passes and the module type-checks.

**Files:**

- Create: `web/lib/line/messaging.ts`

- [ ] **Step 1: Write the implementation**

Create `web/lib/line/messaging.ts`:

```ts
// LINE Messaging API client — the two calls the walk-in queue needs:
//   pushMessage  -> notify a patient their ticket was called (Phase F.1 dispatch)
//   replyMessage -> confirm a successful link from the webhook
// Both authenticate with LINE_CHANNEL_ACCESS_TOKEN. We deliberately avoid the
// LINE SDK: two fetch calls do not justify the dependency.
const LINE_API = 'https://api.line.me/v2/bot/message';

function authHeaders(): Record<string, string> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Push a text message to a single LINE userId.
export async function pushMessage(to: string, text: string): Promise<{ messageId: string }> {
  const res = await fetch(`${LINE_API}/push`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LINE push failed (${res.status}): ${detail || res.statusText}`);
  }
  return { messageId: res.headers.get('x-line-request-id') ?? `line-${Date.now()}` };
}

// Reply to an inbound event using its single-use replyToken.
export async function replyMessage(replyToken: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/reply`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LINE reply failed (${res.status}): ${detail || res.statusText}`);
  }
}
```

- [ ] **Step 2: Verify the suite and types are still green**

Run: `cd /mnt/d/CareMind && npm test && npm run type-check`
Expected: PASS — 11/11 tests (6 existing + 5 from Task 3), no type errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/d/CareMind
git add web/lib/line/messaging.ts
git commit -m "feat(line): Messaging API client (pushMessage + replyMessage)"
```

---

## Task 5: Refactor `line-provider.ts` onto the shared client

Removes the duplicated `fetch`/header logic — the SMS LINE provider now delegates to `messaging.pushMessage`. Behaviour is unchanged, so verification is type-check + the existing suite.

**Files:**

- Modify: `web/lib/sms/line-provider.ts`

- [ ] **Step 1: Replace the file contents**

`web/lib/sms/line-provider.ts` currently reads:

```ts
// LINE Messaging API provider. Sends a text message to a single LINE userId
// via the v2 push endpoint. Free tier (~1000 messages/month for verified
// Official Accounts) is enough for an early-stage rollout in Thailand.
//
// The `to` argument is treated as a LINE userId (U + 32 hex), NOT a phone
// number. The dispatcher in app/(dashboard)/queue/actions.ts picks which
// address to pass based on ticket.line_user_id presence.
import type { SmsProvider, SmsSendResult } from './provider';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export function createLineProvider(channelAccessToken: string): SmsProvider {
  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required to use the line provider');
  }
  return {
    key: 'line',
    async send(to: string, body: string): Promise<SmsSendResult> {
      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          to,
          messages: [{ type: 'text', text: body }],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LINE push failed (${res.status}): ${text || res.statusText}`);
      }
      const xLineRequestId = res.headers.get('x-line-request-id') ?? `line-${Date.now()}`;
      return { messageId: xLineRequestId, provider: 'line' };
    },
  };
}
```

Replace the entire file with:

```ts
// LINE SmsProvider — a thin adapter so resolveSmsProvider() in ./index.ts can
// treat LINE like any other SMS provider. The actual HTTP call lives in
// web/lib/line/messaging.ts, shared with the webhook's replyMessage().
//
// Despite the SMS_PROVIDER name, "line" addresses recipients by LINE userId
// (U + 32 hex), not phone — the dispatcher in app/(dashboard)/queue/actions.ts
// picks the right address per ticket.
//
// createLineProvider still takes (and validates) channelAccessToken: that
// early, loud failure is what resolveSmsProvider()'s fallback-to-dev relies
// on. messaging.pushMessage reads the env var itself so the webhook path
// works too.
import type { SmsProvider, SmsSendResult } from './provider';
import { pushMessage } from '@/lib/line/messaging';

export function createLineProvider(channelAccessToken: string): SmsProvider {
  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required to use the line provider');
  }
  return {
    key: 'line',
    async send(to: string, body: string): Promise<SmsSendResult> {
      const { messageId } = await pushMessage(to, body);
      return { messageId, provider: 'line' };
    },
  };
}
```

- [ ] **Step 2: Verify types and the existing suite**

Run: `cd /mnt/d/CareMind && npm run type-check && npm test`
Expected: PASS — no type errors; 11/11 tests still green (no test imports `line-provider.ts` directly, and behaviour is unchanged).

- [ ] **Step 3: Commit**

```bash
cd /mnt/d/CareMind
git add web/lib/sms/line-provider.ts
git commit -m "refactor(line): SMS provider delegates to shared messaging client"
```

---

## Task 6: Webhook route handler

**Files:**

- Modify: `vitest.config.ts`
- Create: `web/app/api/line/webhook/route.ts`
- Test: `web/app/api/line/webhook/route.test.ts`

- [ ] **Step 1: Add the `@` resolve alias to `vitest.config.ts`**

The webhook test imports `@/...` modules and uses `vi.mock('@/...')`; vitest must resolve the alias `web/tsconfig.json` defines. `vitest.config.ts` currently reads:

```ts
import { defineConfig } from 'vitest/config';

// Vitest picks up *.test.ts and *.spec.ts by default. We explicitly exclude
// web/e2e/** because those files are Playwright specs — they import
// '@playwright/test' which only works under `playwright test`, not vitest.
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'web/e2e/**'],
  },
});
```

Replace with:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest picks up *.test.ts and *.spec.ts by default. We explicitly exclude
// web/e2e/** because those files are Playwright specs — they import
// '@playwright/test' which only works under `playwright test`, not vitest.
//
// The `@` alias mirrors web/tsconfig.json's "@/*" path so web tests (e.g.
// the LINE webhook route test) can import and vi.mock `@/lib/...` modules.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'web') },
  },
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'web/e2e/**'],
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `web/app/api/line/webhook/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// Mock the Supabase server helpers and the LINE messaging client so the test
// exercises only the webhook's own logic: signature gate, code extraction,
// RPC dispatch, reply.
const callRpc = vi.fn();
const replyMessage = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
  callRpc: (...args: unknown[]) => callRpc(...args),
}));
vi.mock('@/lib/line/messaging', () => ({
  replyMessage: (...args: unknown[]) => replyMessage(...args),
}));

import { POST } from './route';

const SECRET = 'test-secret';
const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('base64');

function lineRequest(body: string, signature: string = sign(body)): Request {
  return new Request('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: { 'x-line-signature': signature, 'content-type': 'application/json' },
    body,
  });
}

const textEvent = (text: string) => ({
  type: 'message',
  replyToken: 'reply-token-1',
  source: { userId: 'U00000000000000000000000000000001' },
  message: { type: 'text', text },
});

beforeEach(() => {
  vi.stubEnv('LINE_CHANNEL_SECRET', SECRET);
  callRpc.mockReset();
  replyMessage.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/line/webhook', () => {
  it('rejects a request with a bad signature and never calls the RPC', async () => {
    const body = JSON.stringify({ events: [textEvent('LINK-A1B2C3D4')] });
    const res = await POST(lineRequest(body, 'wrong-signature'));
    expect(res.status).toBe(401);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('links a valid LINK-code message and replies to the patient', async () => {
    callRpc.mockResolvedValue({
      data: [
        {
          ok: true,
          reason: 'linked',
          ticket_number: 42,
          department_name_th: 'อายุรกรรม',
          department_name_en: 'Internal Medicine',
          state: 'waiting',
        },
      ],
      error: null,
    });
    const body = JSON.stringify({ events: [textEvent('LINK-A1B2C3D4')] });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(callRpc).toHaveBeenCalledWith(expect.anything(), 'link_line_user_id', {
      p_link_code: 'A1B2C3D4',
      p_line_user_id: 'U00000000000000000000000000000001',
    });
    expect(replyMessage).toHaveBeenCalledWith('reply-token-1', expect.stringContaining('42'));
  });

  it('ignores a non-text event and still returns 200', async () => {
    const body = JSON.stringify({
      events: [{ type: 'follow', replyToken: 'rt', source: { userId: 'U1' } }],
    });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('ignores a text message with no LINK code and returns 200', async () => {
    const body = JSON.stringify({ events: [textEvent('สวัสดีครับ')] });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(callRpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /mnt/d/CareMind && npm test -- route`
Expected: FAIL — cannot resolve `./route` (module does not exist).

- [ ] **Step 4: Write the route handler**

Create `web/app/api/line/webhook/route.ts`:

```ts
// LINE OA webhook. Receives message events from patients who sent the
// prefilled "LINK-XXXXXXXX" deep-link message to the hospital Official
// Account, and links their LINE userId to the matching queue ticket.
//
// See docs/superpowers/specs/2026-05-14-line-oa-webhook-design.md
import { createClient, callRpc } from '@/lib/supabase/server';
import { verifyLineSignature } from '@/lib/line/signature';
import { replyMessage } from '@/lib/line/messaging';

// node:crypto (HMAC signature verification) needs the Node.js runtime.
export const runtime = 'nodejs';

const LINK_CODE_RE = /LINK-([0-9A-Fa-f]{8})/;

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
}

// Thai-primary replies, keyed by the link_line_user_id reason code.
function replyText(reason: string, ticketNumber: number | null, deptTh: string | null): string {
  switch (reason) {
    case 'linked':
      return `✅ ผูกบัญชี LINE สำเร็จ — คิวหมายเลข ${ticketNumber} แผนก${deptTh}\nเราจะแจ้งเตือนคุณทาง LINE เมื่อใกล้ถึงคิว`;
    case 'already_linked':
      return `บัญชีนี้ผูกกับคิวหมายเลข ${ticketNumber} อยู่แล้ว`;
    case 'closed':
      return 'คิวนี้สิ้นสุดแล้ว ไม่สามารถผูกบัญชีได้';
    case 'taken':
      return 'รหัสนี้ถูกใช้ผูกกับบัญชี LINE อื่นแล้ว';
    case 'not_found':
    default:
      return 'ไม่พบคิวที่ตรงกับรหัสนี้ กรุณาตรวจสอบรหัสจากหน้าบัตรคิวอีกครั้ง';
  }
}

async function handleEvent(event: LineEvent): Promise<void> {
  if (event.type !== 'message' || event.message?.type !== 'text') return;
  const userId = event.source?.userId;
  const replyToken = event.replyToken;
  if (!userId || !replyToken) return;

  const match = LINK_CODE_RE.exec(event.message.text ?? '');
  if (!match) return; // unrelated message — ignore silently

  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'link_line_user_id', {
    p_link_code: match[1],
    p_line_user_id: userId,
  });
  if (error) {
    console.error('[line-webhook] link_line_user_id failed:', error.message);
    return;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return;

  await replyMessage(replyToken, replyText(row.reason, row.ticket_number, row.department_name_th));
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const secret = process.env.LINE_CHANNEL_SECRET ?? '';
  const signature = req.headers.get('x-line-signature');

  if (!verifyLineSignature(rawBody, signature, secret)) {
    console.error('[line-webhook] signature verification failed');
    return new Response('bad signature', { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    const parsed = JSON.parse(rawBody) as { events?: LineEvent[] };
    events = parsed.events ?? [];
  } catch {
    // Body passed the signature check but is not valid JSON — log and ack.
    // A 401 is the only non-200 we return; everything else is 200 so LINE
    // does not retry outcomes that are already final.
    console.error('[line-webhook] could not parse request body as JSON');
    return new Response('ok', { status: 200 });
  }

  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (e) {
      // One bad event must not abort the batch or trigger a LINE retry.
      console.error('[line-webhook] event handling error:', e);
    }
  }

  return new Response('ok', { status: 200 });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /mnt/d/CareMind && npm test -- route`
Expected: PASS — 4/4.

- [ ] **Step 6: Type-check**

Run: `cd /mnt/d/CareMind && npm run type-check`
Expected: PASS — no type errors (`callRpc(supabase, 'link_line_user_id', ...)` typechecks against the Task 2 registration; `row.reason` / `row.ticket_number` / `row.department_name_th` are typed from the registered `Returns`).

- [ ] **Step 7: Commit**

```bash
cd /mnt/d/CareMind
git add vitest.config.ts web/app/api/line/webhook/route.ts web/app/api/line/webhook/route.test.ts
git commit -m "feat(line): webhook route handler for patient LINE linking"
```

---

## Task 7: Ticket page — "notify on LINE" block

A client React component. There is no Playwright runner wired in this repo and the spec's test plan does not include a ticket-page test; verification is `type-check` plus a manual visual check.

**Files:**

- Modify: `web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx`

- [ ] **Step 1: Insert the LINE block into the ticket card**

In `web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx`, find the end of the SMS-notice block (it is the last child inside the white ticket card). It currently reads:

```tsx
          We&apos;ll SMS you when your turn is nearly here. You don&apos;t need to stay in the
          waiting area.
          <div style={{ marginTop: 4, color: 'var(--fg3)', font: '400 12px/1.5 var(--font-ui)' }}>
            เราจะส่ง SMS แจ้งเตือนเมื่อใกล้ถึงคิวของคุณ
          </div>
        </div>
      </div>
```

Replace with:

```tsx
          We&apos;ll SMS you when your turn is nearly here. You don&apos;t need to stay in the
          waiting area.
          <div style={{ marginTop: 4, color: 'var(--fg3)', font: '400 12px/1.5 var(--font-ui)' }}>
            เราจะส่ง SMS แจ้งเตือนเมื่อใกล้ถึงคิวของคุณ
          </div>
        </div>

        {waitEstimate &&
          process.env.NEXT_PUBLIC_LINE_OA_ID &&
          (waitEstimate.lineUserId ? (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--sev-info-bg)',
                borderRadius: 'var(--r-lg)',
                font: '600 13px/1.5 var(--font-ui)',
                color: 'var(--brand-primary)',
                textAlign: 'center',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              ✅ แจ้งเตือนทาง LINE แล้ว
              <div
                style={{ marginTop: 2, font: '400 12px/1.4 var(--font-ui)', color: 'var(--fg3)' }}
              >
                LINE notifications on
              </div>
            </div>
          ) : (
            <a
              href={`https://line.me/R/oaMessage/${process.env.NEXT_PUBLIC_LINE_OA_ID}/?LINK-${waitEstimate.lineLinkCode}`}
              style={{
                padding: '12px 24px',
                background: '#06C755',
                color: '#fff',
                borderRadius: 'var(--r-lg)',
                font: '600 14px/1.3 var(--font-ui)',
                textDecoration: 'none',
                textAlign: 'center',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              รับแจ้งเตือนทาง LINE
              <div style={{ font: '400 12px/1.4 var(--font-ui)', opacity: 0.9 }}>
                Get notified on LINE
              </div>
            </a>
          ))}
      </div>
```

(`#06C755` is LINE's brand green — used directly because the design tokens have no LINE-brand colour. The "linked" confirmation reuses the existing `--sev-info-bg` / `--brand-primary` tokens, matching the `pending_triage` badge already on this page.)

- [ ] **Step 2: Type-check**

Run: `cd /mnt/d/CareMind && npm run type-check`
Expected: PASS — `waitEstimate.lineUserId` and `waitEstimate.lineLinkCode` resolve against the `TicketWaitEstimate` fields added in Task 2.

- [ ] **Step 3: Manual visual check**

Run: `cd /mnt/d/CareMind && npm run dev:web`
Then in a browser: check in at `http://localhost:3000/GHB`, complete OTP, land on the ticket page. With `NEXT_PUBLIC_LINE_OA_ID` set in `web/.env`, expect a green "รับแจ้งเตือนทาง LINE / Get notified on LINE" button below the SMS notice. (The "linked" state cannot be exercised without a real LINE round-trip — that is the manual tunnel test in Task 9.)
Expected: green button renders, card layout is not broken, no console errors. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/CareMind
git add "web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx"
git commit -m "feat(checkin): notify-on-LINE button on the ticket page"
```

---

## Task 8: Environment variables

**Files:**

- Modify: `web/.env.example`

- [ ] **Step 1: Add the two LINE webhook vars**

`web/.env.example` currently ends:

```
# Notifications for the walk-in queue (Phase C + LINE follow-up).
# dev  → console-logs every message to the server console (default)
# line → LINE Messaging API push (needs LINE_CHANNEL_ACCESS_TOKEN below)
SMS_PROVIDER=dev
LINE_CHANNEL_ACCESS_TOKEN=
```

Replace that block with:

```
# Notifications for the walk-in queue (Phase C + LINE follow-up).
# dev  → console-logs every message to the server console (default)
# line → LINE Messaging API push (needs LINE_CHANNEL_ACCESS_TOKEN below)
SMS_PROVIDER=dev
LINE_CHANNEL_ACCESS_TOKEN=

# LINE OA webhook (patient LINE linking — see
# docs/superpowers/specs/2026-05-14-line-oa-webhook-design.md).
# LINE_CHANNEL_SECRET    -> verifies the X-Line-Signature on inbound webhooks.
# NEXT_PUBLIC_LINE_OA_ID -> basic ID of the hospital LINE OA, used to build the
#                           patient deep link. Public by design.
LINE_CHANNEL_SECRET=
NEXT_PUBLIC_LINE_OA_ID=@202qrttf
```

- [ ] **Step 2: Commit**

```bash
cd /mnt/d/CareMind
git add web/.env.example
git commit -m "chore(env): LINE_CHANNEL_SECRET + NEXT_PUBLIC_LINE_OA_ID"
```

---

## Task 9: Full verification

No code changes — this task confirms the whole feature is green and documents the manual step that cannot be automated.

- [ ] **Step 1: Run the full database test suite**

Run: `cd /mnt/d/CareMind && npx supabase db reset && npx supabase test db`
Expected: all migrations apply cleanly through `00014`; every pgTAP file PASSES, including `walkin_line_link_test.sql` (14/14).

- [ ] **Step 2: Run the full JS test suite**

Run: `cd /mnt/d/CareMind && npm test`
Expected: PASS — 15/15 (6 pre-existing + 5 `signature.test.ts` + 4 `route.test.ts`).

- [ ] **Step 3: Type-check and lint**

Run: `cd /mnt/d/CareMind && npm run type-check && npm run lint`
Expected: PASS — no type errors, no lint errors.

- [ ] **Step 4: Manual end-to-end webhook test (requires LINE setup)**

This step needs the one-time LINE console setup from the spec's runbook (`web/.env` populated with a real `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET`, response mode = Bot). It cannot run in CI.

1. `cd /mnt/d/CareMind && npm run dev:web`
2. In another terminal, start a public tunnel: `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`).
3. In the LINE Developers Console, set the channel's **Webhook URL** to `https://<tunnel-host>/api/line/webhook` and enable **Use webhook**.
4. Check in at `http://localhost:3000/GHB`, complete OTP, reach the ticket page, tap **รับแจ้งเตือนทาง LINE**.
5. In the LINE app, send the prefilled `LINK-XXXXXXXX` message to the OA.
6. Expected: a `✅ ผูกบัญชี LINE สำเร็จ …` reply in LINE; the ticket page's button flips to "✅ แจ้งเตือนทาง LINE แล้ว" within ~30s (next poll); `queue_tickets.line_user_id` is populated (verify in Supabase Studio at `http://127.0.0.1:54323`).

- [ ] **Step 5: Update the PR description**

The feature lands on the open PR #6 (`feat/walkin-queue-complete`). Add a "LINE OA webhook" section to the PR body summarising: the `00014` migration, the webhook route, the patient deep-link button, and a note that the LINE console setup runbook lives in the spec. Move "LINE OA webhook" out of the PR's "follow-ups" list.

Run: `cd /mnt/d/CareMind && gh pr view 6 --json body` to read the current body, then `gh pr edit 6 --body '<updated body>'`.

---

## Self-Review

**Spec coverage:**

- Spec component 1 (schema: `line_link_code`, `link_line_user_id`, extended `get_ticket_wait_estimate`) → Task 1. ✅
- Spec component 2 (webhook route handler) → Task 6. ✅
- Spec component 3 (`web/lib/line/` module: `signature.ts`, `messaging.ts`, `line-provider.ts` refactor) → Tasks 3, 4, 5. ✅
- Spec component 4 (ticket page LINE block + `TicketWaitEstimate` fields) → Task 2 (type fields) + Task 7 (UI). ✅
- Spec component 5 (env vars) → Task 8. ✅
- Spec component 6 (tests: pgTAP + `signature.test.ts` + `route.test.ts`) → Task 1, Task 3, Task 6. ✅
- Spec "LINE Console Setup Runbook" → not code; referenced from Task 9 Step 4 and the spec itself. ✅
- `database.ts` registration (listed in the spec's "Files / Modified") → Task 2. ✅

No spec requirement is left without a task.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Every code step contains complete file contents or exact old→new replacements.

**Type consistency:**

- RPC name `link_line_user_id` and arg keys `p_link_code` / `p_line_user_id` are identical in the migration (Task 1), the `database.ts` registration (Task 2), and the `callRpc` call (Task 6).
- `link_line_user_id` `Returns` fields (`ok`, `reason`, `ticket_number`, `department_name_th`, `department_name_en`, `state`) match between the SQL `RETURNS TABLE` (Task 1) and the `database.ts` registration (Task 2); the route reads only `reason`, `ticket_number`, `department_name_th` (Task 6) — all present.
- `get_ticket_wait_estimate` new columns `line_link_code` / `line_user_id` match across the SQL (Task 1), `database.ts` `Returns` (Task 2), and the `TicketWaitEstimate` mapping `lineLinkCode` / `lineUserId` (Task 2), consumed as `waitEstimate.lineLinkCode` / `waitEstimate.lineUserId` in the ticket page (Task 7).
- `pushMessage` / `replyMessage` signatures match between `messaging.ts` (Task 4), the `line-provider.ts` consumer (Task 5), and the route + its test mock (Task 6).
- `verifyLineSignature(rawBody, signature, channelSecret)` signature matches between `signature.ts` (Task 3) and the route's call (Task 6).

No inconsistencies found.
