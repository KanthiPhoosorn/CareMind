# Walk-in Queue — Complete Build (M3b + M4 + M5 + Staff Auth)

**Date:** 2026-05-13
**Branch:** `feat/walkin-queue-complete`
**Replaces / extends:**

- `docs/superpowers/plans/2026-05-11-walkin-queue-m0.md` (delivered via PR #4)
- `docs/superpowers/plans/2026-05-11-walkin-queue-m3a.md` (delivered via PR #4)
- `feat: walk-in queue M1 (Patient PWA) + M2 (Staff Queue Dashboard)` (delivered via PR #5)

## Goal

Take the walk-in queue from "patient flow works against real RPCs, staff flow is fully mocked" to "every clinically meaningful flow runs against real data". Four phases, all in one branch:

1. **Phase A — Staff Auth.** Supabase email/password login, middleware-gated dashboard, seeded demo staff profile. Prerequisite for everything else because the staff RPCs read `current_hospital_id()` from `auth.uid()`.
2. **Phase B — M3b: Real staff queue.** Drop `mock-queue-data.ts`. Fetch departments and tickets from the DB. Wire `callNext` / `markDone` / `markNoShow` to the existing migration-00007 RPCs. Add Supabase Realtime so a second staff terminal sees the same state.
3. **Phase C — M4: SMS dispatch + no-show sweeper.** `SmsProvider` interface with a console-log dev impl and a stub prod impl. DB trigger or post-RPC dispatch on `state → 'called'`. `pg_cron` no-show sweeper that flips `called` tickets to `no_show` after a configurable timeout.
4. **Phase D — M5: Wait-time math.** Function computing expected wait per department from recent call intervals. Surface on the patient ticket page and as aggregate stats on the staff dashboard.

## Constraints

- **No new mocks.** Anywhere code touches mocks, replace with real queries.
- **Don't break M1.** Patient flow on main is already wired correctly — leave it alone except where M4 replaces the dev OTP banner.
- **Husky-only gating.** No GitHub Actions. Pre-commit hooks run lint+type+test on the changed package only.
- **TDD.** Every DB change ships with a pgTAP test in the same commit. Every server action ships with a vitest covering the success path and at least one error path.
- **One PR at the end.** Phase boundaries are commits, not PRs. Reviewer pulls the branch and runs `supabase db reset` + `pnpm test` + `pnpm dev`.

## Open questions / decisions taken

| Question              | Decision                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Staff auth method     | Email + password via Supabase Auth                                                                         |
| SMS provider          | Stub for dev (console.log + DB log row); abstract `SmsProvider` interface; concrete prod provider deferred |
| Realtime on dashboard | Yes — `supabase.channel().on('postgres_changes')`                                                          |
| Login flow scope      | Just `/login` + middleware. Forgot-password, MFA, magic link out of scope.                                 |
| Profile creation flow | Seed one demo staff profile. Self-service signup out of scope.                                             |
| Cancel-from-dashboard | Out of scope — staff cancels via "no-show"                                                                 |
| No-show timeout       | 10 minutes after `called`, configurable via env var                                                        |

---

## Phase A — Staff Auth

### A1. Seed a demo staff profile

**File:** `supabase/seed.sql`

Append a deterministic auth user + matching profile. Use the same UUID for both so RLS works.

```sql
-- Demo staff user (password: caremind-dev)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, ...)
VALUES (
  '99999999-9999-9999-9999-999999999991',
  'staff@demo.caremind.local',
  crypt('caremind-dev', gen_salt('bf')),
  NOW(),
  ...
) ON CONFLICT DO NOTHING;

INSERT INTO profiles (id, email, full_name, role, hospital_id)
VALUES (
  '99999999-9999-9999-9999-999999999991',
  'staff@demo.caremind.local',
  'Demo Staff',
  'doctor',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT DO NOTHING;
```

Caveat: seeding `auth.users` directly is non-trivial because some columns are not nullable and don't have defaults. Use Supabase's `auth.admin.createUser` from a small migration helper if seeding via SQL turns out flaky.

**Test:** `supabase/tests/staff_seed_test.sql` — assert one row in `profiles` with `role='doctor'` and `hospital_id` set.

### A2. Login page

**File:** `web/app/login/page.tsx`

Client component. Two inputs (email, password). On submit, call `supabase.auth.signInWithPassword`. Redirect to `/queue` on success. Inline error banner on failure.

Keep the styling consistent with the rest of the dashboard — design tokens only, no Tailwind utility soup.

**File:** `web/app/login/actions.ts`

Server actions are not strictly needed since `signInWithPassword` runs client-side via the browser SDK, but we'll add a `logoutAction` server action so the sign-out button can `revalidatePath('/')` and clear cookies cleanly.

### A3. Middleware

**File:** `web/middleware.ts`

Use `@supabase/ssr`'s `createServerClient` + `getUser()`. If `getUser()` returns null and the request path matches `/queue/:*` or `/patients/:*` or `/pharmacy/:*`, redirect to `/login?next=<original-path>`. Excluded paths: `/`, `/(checkin)/:*`, `/login`, static assets.

Inspired by the Next.js + Supabase SSR example, but the matcher excludes `(checkin)` because the patient flow is intentionally anonymous.

### A4. Replace `RoleContext` stub

**File:** `web/lib/RoleContext.tsx`

Read the current user's profile on mount via `supabase.auth.getUser()` + `select role from profiles where id = ?`. Expose `{ role, hospitalId, displayName }`. Throw if called outside an authenticated route — middleware guarantees it.

**Test:** `web/lib/__tests__/role-context.test.tsx` — render with a mocked Supabase client, assert role flows from profile to context.

### A5. Sidebar logout button

**File:** `web/components/ui/Sidebar.tsx`

Add a "Sign out" item at the bottom that calls `logoutAction` and routes to `/login`.

**Phase A acceptance:**

- Visiting `/queue` while unauthenticated redirects to `/login?next=/queue`.
- After signing in as `staff@demo.caremind.local`, the user lands on `/queue` and sees the (still mocked) queue board.
- Sidebar shows "Demo Staff" and a working sign-out button.
- pgTAP test for seeded profile passes.
- vitest for `RoleContext` passes.

---

## Phase B — M3b: Real staff queue

### B1. Drop mock departments — fetch from DB

**File:** `web/lib/queries/departments.ts` (new)

```ts
export async function listDepartments(supabase) {
  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name_th, name_en')
    .order('code');
  if (error) throw new Error(error.message);
  return data;
}
```

**File:** `web/app/(dashboard)/queue/page.tsx`

Make it async server component. Call `listDepartments` and render cards. Delete the `MOCK_DEPARTMENTS` import.

**Test:** `web/lib/queries/__tests__/departments.test.ts`

### B2. Drop mock tickets — fetch from DB

**File:** `web/lib/queries/queue-tickets.ts` (new)

```ts
export async function listActiveTickets(supabase, departmentCode: string) {
  // resolves dept by code then pulls active tickets ordered by priority then number
  ...
}
```

The query must mirror what `call_next_ticket` will pick:

- Filter by `state IN ('waiting', 'called')` (we render both).
- Order by `priority ASC, ticket_number ASC`.
- Include a computed `waited_minutes = floor(extract(epoch from (now() - created_at))/60)`.

**File:** `web/app/(dashboard)/queue/[departmentCode]/page.tsx`

Make it async server component. Resolve dept by code, fetch tickets, pass to `WalkinQueueBoard`. 404 if dept doesn't exist for the staff's hospital.

### B3. Rewrite `WalkinQueueBoard` against real shapes

**File:** `web/components/ui/WalkinQueueBoard.tsx`

- Change `MockTicket` → `QueueTicket` type from `@caremind/shared`.
- Replace `callNext` stub → call `call_next_ticket` RPC, optimistic-update, roll back on error.
- Replace `markDone` stub → call `mark_ticket_done`.
- Replace `markNoShow` stub → call `mark_ticket_no_show`.
- Each action wraps a `useTransition` + toast on error.

**Test:** `web/components/ui/__tests__/walkin-queue-board.test.tsx` — render with fixture tickets, click "Call next", assert RPC called with right args.

### B4. Supabase Realtime subscription

**File:** `web/components/ui/WalkinQueueBoard.tsx`

```ts
useEffect(() => {
  const channel = supabase
    .channel(`queue:${department.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue_tickets',
        filter: `department_id=eq.${department.id}`,
      },
      (payload) => reconcile(payload),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}, [department.id]);
```

Reconcile logic must handle INSERT (new ticket arriving), UPDATE (state transitions from another staff terminal), and DELETE (rare — soft delete only).

**Decision:** keep local state primary; Realtime is a sync mechanism, not the source of truth. On reconnect, the page does a fresh fetch.

### B5. Delete `web/lib/mock-queue-data.ts`

Verify no remaining imports first.

**Phase B acceptance:**

- `/queue` lists exactly the 7 departments from `supabase/seed.sql`.
- `/queue/INTMED` shows real tickets created via the patient flow.
- Opening two browsers, calling "Call next" in one, sees the change in the other within ~1s.
- "Mark done" emits a `queue_ticket_events` audit row.
- All vitest specs green.

---

## Phase C — M4: SMS dispatch + no-show sweeper

### C1. SMS provider interface

**File:** `web/lib/sms/provider.ts` (new)

```ts
export interface SmsProvider {
  send(to: string, body: string, locale?: 'th' | 'en'): Promise<{ messageId: string }>;
}
```

**File:** `web/lib/sms/dev-provider.ts` (new)

```ts
export const devSmsProvider: SmsProvider = {
  async send(to, body) {
    console.log(`[SMS DEV] → ${to}: ${body}`);
    return { messageId: `dev-${Date.now()}` };
  },
};
```

**File:** `web/lib/sms/index.ts` (new)

Reads `SMS_PROVIDER` env var. Defaults to `dev`. `prod` value throws "not implemented — wire Twilio/aggregator" until concrete provider lands.

### C2. Dispatch on `state → 'called'`

Two options:

- **a)** Add SMS dispatch as a second step inside the `call_next_ticket` RPC (via `pg_net` HTTP request to an Edge Function).
- **b)** After successful RPC in the server action, call `smsProvider.send()` from Next.js.

Pick **(b)**. Reasons: the RPC stays pure-DB; SMS provider creds stay in Next env, not Postgres; testing is easier; pgTAP doesn't need to mock HTTP.

**File:** `web/app/(dashboard)/queue/actions.ts` (new)

Server actions wrapping the three staff RPCs. After `call_next_ticket` returns success, look up the ticket's phone, call `smsProvider.send()`. Log to a new `sms_dispatch_log` table (id, ticket_id, sent_at, message_id, provider, error?).

### C3. `sms_dispatch_log` table + migration

**File:** `supabase/migrations/00008_sms_dispatch_log.sql`

Tracks every SMS we attempt. Important for ops debugging.

**Test:** `supabase/tests/sms_dispatch_log_test.sql` — schema only (the actual SMS round-trip is mocked in vitest).

### C4. No-show sweeper

**File:** `supabase/migrations/00009_no_show_sweeper.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION sweep_stale_called_tickets()
RETURNS INTEGER ...
$$
DECLARE
  v_timeout_minutes INTEGER := 10;
  v_count INTEGER;
BEGIN
  WITH stale AS (
    UPDATE queue_tickets
       SET state = 'no_show', no_show_at = NOW()
     WHERE state = 'called'
       AND called_at < NOW() - (v_timeout_minutes * INTERVAL '1 minute')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM stale;
  -- emit audit rows ...
  RETURN v_count;
END;
$$;

SELECT cron.schedule('walkin-sweep-no-shows', '* * * * *', $$SELECT sweep_stale_called_tickets()$$);
```

**Test:** `supabase/tests/walkin_sweeper_test.sql` — insert a `called` ticket with `called_at = NOW() - 15 minutes`, run `sweep_stale_called_tickets()`, assert state = 'no_show'.

**Caveat:** `pg_cron` is only available on Supabase hosted. Local dev runs the function manually. Plan exposes a `/api/admin/run-sweeper` route guarded by service-role for local testing.

**Phase C acceptance:**

- Calling a ticket logs `[SMS DEV] → +66...` to the dev server console and inserts an `sms_dispatch_log` row.
- A ticket called and ignored for 10+ minutes appears as `no_show` after running the sweeper.
- pgTAP suite passes.

---

## Phase D — M5: Wait-time math

### D1. Per-department wait estimate function

**File:** `supabase/migrations/00010_wait_time_estimator.sql`

```sql
CREATE OR REPLACE FUNCTION estimate_wait_minutes(p_department_id UUID, p_position INTEGER)
RETURNS INTEGER ...
$$
DECLARE
  v_avg_interval NUMERIC;
BEGIN
  SELECT EXTRACT(EPOCH FROM AVG(called_at - created_at)) / 60
    INTO v_avg_interval
    FROM queue_tickets
   WHERE department_id = p_department_id
     AND state IN ('done', 'no_show')
     AND called_at > NOW() - INTERVAL '24 hours';

  -- fall back to a sensible default if no history yet
  IF v_avg_interval IS NULL OR v_avg_interval < 1 THEN
    v_avg_interval := 8;  -- 8 min per ticket
  END IF;

  RETURN GREATEST(0, ROUND(p_position * v_avg_interval));
END;
$$;
```

**Test:** `supabase/tests/wait_time_test.sql` — fixture: 5 historical tickets with known intervals; assert estimate is within ±10% of expected.

### D2. Surface on patient ticket page

**File:** `web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx`

After fetching ticket, call `supabase.rpc('estimate_wait_minutes', { p_department_id, p_position })`. Show "Estimated wait: ~25 minutes / รอประมาณ 25 นาที" beneath the position number. Hide if estimate is < 2 min ("คุณกำลังจะถูกเรียก").

### D3. Aggregate stats on dashboard

**File:** `web/components/ui/WalkinQueueBoard.tsx`

Below the "Call next" button, show:

- Average wait today: X min
- Calls processed today: N

Pull from a new `queue_dept_stats_today` view in migration 00010.

**Phase D acceptance:**

- Patient ticket page shows a wait estimate that updates after they sit in the queue for a while.
- Staff dashboard shows the daily averages and updates after each `mark_ticket_done`.
- pgTAP for `estimate_wait_minutes` passes.

---

## Test inventory (target)

| Suite                        | Tests                  | New     |
| ---------------------------- | ---------------------- | ------- |
| pgTAP existing               | 80 (M0+M3a)            | —       |
| pgTAP staff seed             | 3                      | A1      |
| pgTAP sms_dispatch_log       | 4                      | C3      |
| pgTAP no-show sweeper        | 5                      | C4      |
| pgTAP wait estimator         | 4                      | D1      |
| **pgTAP total**              | **96**                 | **+16** |
| vitest existing              | (existing M1+M2 specs) | —       |
| vitest RoleContext           | 3                      | A4      |
| vitest queries/departments   | 2                      | B1      |
| vitest queries/queue-tickets | 3                      | B2      |
| vitest WalkinQueueBoard      | 5                      | B3      |
| vitest sms/dev-provider      | 2                      | C1      |
| vitest queue server actions  | 6                      | C2      |

## Commit plan

1. `docs: walk-in queue complete-build plan`
2. `feat(db): seed demo staff profile + auth user`
3. `feat(web): login page + middleware + signout`
4. `feat(web): real RoleContext backed by profile`
5. `feat(web): real department list query + page`
6. `feat(web): real queue ticket query + page`
7. `feat(web): wire WalkinQueueBoard to staff RPCs`
8. `feat(web): Supabase Realtime subscription for queue board`
9. `chore(web): delete mock-queue-data and dead imports`
10. `feat(web): SMS provider abstraction + dev provider`
11. `feat(db): sms_dispatch_log table`
12. `feat(web): queue server actions with SMS dispatch on call`
13. `feat(db): pg_cron no-show sweeper`
14. `feat(db): estimate_wait_minutes function`
15. `feat(web): surface wait estimate on patient ticket page`
16. `feat(web): daily stats on staff dashboard`

Branch lands as one PR titled `feat: complete walk-in queue (auth + M3b + M4 + M5)`.

## Risks

- **Seeding `auth.users` from SQL is fragile.** May have to do it via a one-off migration that calls `auth.admin.createUser` via plv8 or pg_net. Falls back to a script invoked manually after `supabase db reset`.
- **`pg_cron` not on local Supabase.** Sweeper has to be exposed as an HTTP endpoint for local testing. Production-on-Supabase gets pg_cron for free.
- **Realtime reconnect storms.** Two staff terminals + many tickets can chatter. The channel filter is dept-scoped; this should be fine.
- **WSL2 + subagent crashes.** Last session's autocompact thrashing means I should run this phase inline rather than dispatching subagents per task.
