# LINE OA Webhook — Patient LINE Linking

**Date:** 2026-05-14
**Status:** Design — approved, pending implementation plan
**Builds on:** `2026-05-11-walk-in-queue-design.md` (Phase F.1 added the LINE _push_ provider and the `line_user_id` column in migration 00013)

## Problem

Migration 00013 added `queue_tickets.line_user_id` and the dispatcher in
`web/app/(dashboard)/queue/actions.ts` already branches on it — but nothing
ever populates the column. Today every LINE dispatch logs
`skipped: no line_user_id on ticket`.

LINE never gives us a patient's phone number, so we cannot auto-match a LINE
account to a ticket. The patient must take one explicit action that ties their
anonymous LINE `userId` to their specific ticket. This spec covers that linking
mechanism: a prefilled-message deep link plus a webhook that captures the
`userId`.

## Scope

In scope:

- Schema: a per-ticket `line_link_code` and a `link_line_user_id` RPC.
- A LINE webhook endpoint as a Next.js route handler.
- A small `web/lib/line/` module (signature verification + reply API), with the
  existing push logic refactored into it.
- A "notify me on LINE" button on the patient ticket page.
- Env vars and a one-time LINE-console setup runbook.
- pgTAP + vitest coverage.

Out of scope (future follow-ups):

- `follow`-event auto-greeting / onboarding message.
- Rich or flex messages (plain text only).
- Unlinking on `unfollow`.
- A kiosk QR-code variant of the deep link.

## Decisions

| Decision          | Choice                                                                     | Why                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linking flow      | Prefilled-message deep link                                                | Patient is already on their phone after OTP; one tap + one send. No phone-number matching, no LINE account-link handshake.                                                                                                           |
| Webhook host      | Next.js route handler (`web/app/api/line/webhook/route.ts`)                | Deploys with the app, testable locally, calls a `SECURITY DEFINER` RPC with the anon key — the same pattern the rest of the check-in flow uses. The repo has no edge functions; this sets the API-route convention.                  |
| Link-code carrier | Dedicated `line_link_code` column, surfaced via `get_ticket_wait_estimate` | Keeps the cancel credential (`patient_token`) out of the patient's LINE chat history. The ticket page already polls `get_ticket_wait_estimate`, so no new client plumbing and no change to the sensitive `create_walkin_ticket` RPC. |

## Architecture

Two halves. This spec builds the **linking** half; the **delivery** half already
exists from Phase F.1 and starts working automatically once `line_user_id` is
populated.

```
ONE-TIME (operator, in LINE consoles — see Runbook below):
  OA Manager  → Settings → Messaging API → Enable → links @202qrttf to a channel
  Dev Console → issue channel access token + copy channel secret → web/.env
  Dev Console → Webhook URL = https://<domain>/api/line/webhook, Use webhook ON
  OA Manager  → Settings → Response settings → response mode = Bot

PER PATIENT (automatic — this spec):

  PATIENT                  CAREMIND APP              SUPABASE            LINE PLATFORM
    │ check in + OTP            │                       │                     │
    │──────────────────────────▶ create_walkin_ticket ─▶ ticket row;          │
    │                           │                       │ line_link_code      │
    │                           │                       │ defaulted server-   │
    │                           │                       │ side                │
    │ ticket page               │ get_ticket_wait_      │                     │
    │◀──────────────────────────│ estimate (poll 30s) ◀─│ returns code +      │
    │  shows queue #, position, │                       │ line_user_id (null) │
    │  + [notify on LINE] button│                       │                     │
    │                           │                       │                     │
    │ tap button → opens LINE chat with @202qrttf,       │                     │
    │ message "LINK-A1B2C3D4" prefilled ─────────────────────────────────────▶ │
    │ tap SEND ──────────────────────────────────────────────────────────────▶ │
    │                           │                       │                     │
    │                           │ POST /api/line/webhook │                     │
    │                           │◀──────────────────────────────────────────── │
    │                           │ verify X-Line-Signature│                     │
    │                           │ extract "A1B2C3D4"     │                     │
    │                           │ link_line_user_id ────▶ ticket.line_user_id  │
    │                           │                       │   = 'Uxxx'          │
    │                           │◀──────────────────────│ ok, queue #, dept   │
    │                           │ reply via replyToken ──────────────────────▶ │
    │ "✅ ผูกบัญชีแล้ว — คิว 42" ◀──────────────────────────────────────────── │
    │                           │                       │                     │
    │ ticket page poll picks up line_user_id → button flips to "✅ LINE linked"│
    │                           │                       │                     │
    │ ····· later: nurse calls the ticket (Phase F.1 — already built) ·····    │
    │                           │ call_next_ticket → dispatcher sees           │
    │                           │ line_user_id → pushMessage('Uxxx', …) ─────▶ │
    │ "🔔 ถึงคิวคุณแล้ว คิว 42" ◀──────────────────────────────────────────── │
```

If the patient never taps the button, nothing breaks: `line_user_id` stays
`NULL`, the dispatcher falls back to the configured SMS provider (or dev-log),
and the ticket page's 30s poll still shows live position. LINE is purely
additive.

## Components

### 1. Schema — `supabase/migrations/00014_walkin_line_link.sql`

- **`ADD COLUMN line_link_code`**

  ```sql
  ALTER TABLE queue_tickets
    ADD COLUMN line_link_code TEXT NOT NULL
      DEFAULT upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  ```

  8 uppercase hex chars. The `DEFAULT` backfills existing rows automatically.
  `pgcrypto` already lives in the `extensions` schema (used elsewhere in the
  schema). Collision space is 16^8 ≈ 4.3e9; the RPC only ever matches against
  _active_ tickets (a window of at most a few hundred), so a practical collision
  is effectively impossible. No unique index — not worth the write cost for that
  probability.

- **`DROP` + `CREATE get_ticket_wait_estimate`** — add two columns to the
  existing `RETURNS TABLE`: `line_link_code TEXT`, `line_user_id TEXT`. Must
  `DROP FUNCTION` first (Postgres rejects `CREATE OR REPLACE` that changes the
  return type — same constraint hit in migration 00012). Body otherwise
  unchanged; it already takes `p_patient_token` and the ticket page already
  passes it.

- **`CREATE FUNCTION link_line_user_id`**

  ```
  link_line_user_id(p_link_code TEXT, p_line_user_id TEXT)
    RETURNS TABLE(
      ok BOOLEAN,
      reason TEXT,                 -- 'linked' | 'already_linked' | 'not_found' | 'closed' | 'taken'
      ticket_number INT,
      department_name_th TEXT,
      department_name_en TEXT,
      state TEXT
    )
  ```

  `SECURITY DEFINER`, `SET search_path`. Behaviour:
  - Look up the ticket by `line_link_code = upper(p_link_code)` among active
    states (`pending_triage`, `waiting`, `called`).
  - Not found / not active → `ok = false`, `reason = 'not_found'` or `'closed'`,
    other columns `NULL`.
  - Found, `line_user_id` is `NULL` → set it to `p_line_user_id`, return
    `ok = true, reason = 'linked'` plus ticket number + department names (joined
    from `departments`) so the webhook can compose a reply.
  - Found, `line_user_id` already equals `p_line_user_id` → no-op,
    `ok = true, reason = 'already_linked'` (idempotent — covers the patient
    re-sending the code).
  - Found, `line_user_id` set to a _different_ userId → `ok = false,
reason = 'taken'`. One ticket links to one LINE account; the webhook replies
    that the code already belongs to someone else.

  `p_line_user_id` is validated by the existing
  `queue_tickets_line_user_id_check` constraint (`^U[0-9a-f]{32}$`) on write —
  a malformed userId raises and the webhook logs it.

  `GRANT EXECUTE ON FUNCTION link_line_user_id TO anon, authenticated;` — the
  webhook calls it with the anon key, consistent with the check-in actions.

- No `queue_ticket_events` row is emitted. Linking is not a state transition;
  the events table tracks the queue state machine only.

### 2. Webhook — `web/app/api/line/webhook/route.ts`

`export async function POST(req: Request)`:

1. Read the **raw** body as text (needed verbatim for signature verification —
   do not `await req.json()` first).
2. `verifyLineSignature(rawBody, req.headers.get('x-line-signature'), secret)`.
   On mismatch or missing header → `return new Response('bad signature', { status: 401 })`.
   If `LINE_CHANNEL_SECRET` is unset → log an error and `401` (fail closed).
3. `JSON.parse` the body → `{ events: LineWebhookEvent[] }`.
4. For each event:
   - Only handle `event.type === 'message'` with `event.message.type === 'text'`.
     Everything else (`follow`, `unfollow`, `postback`, non-text messages) is
     ignored.
   - Extract the code: `/LINK-([0-9A-Fa-f]{8})/` against `event.message.text`.
     No match → skip this event (patient typed something unrelated).
   - Call `link_line_user_id(code, event.source.userId)` via the anon Supabase
     client (`callRpc`, same helper as check-in actions).
   - Compose a Thai reply from the RPC result (see reply copy below) and send it
     with `replyMessage(event.replyToken, text)`.
   - Wrap each event in try/catch — one bad event must not abort the batch.
5. Always `return new Response('ok', { status: 200 })` after processing (even
   when individual events failed). LINE retries non-2xx responses; our
   business-logic outcomes are final and must not trigger retries. The only
   non-200 we return is `401` for a failed signature check.

Reply copy (Thai primary, matches the bilingual style used across the check-in
UI):

| RPC `reason`     | Reply text                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `linked`         | `✅ ผูกบัญชี LINE สำเร็จ — คิวหมายเลข {n} แผนก{dept_th}\nเราจะแจ้งเตือนคุณทาง LINE เมื่อใกล้ถึงคิว` |
| `already_linked` | `บัญชีนี้ผูกกับคิวหมายเลข {n} อยู่แล้ว`                                                             |
| `not_found`      | `ไม่พบคิวที่ตรงกับรหัสนี้ กรุณาตรวจสอบรหัสจากหน้าบัตรคิวอีกครั้ง`                                   |
| `closed`         | `คิวนี้สิ้นสุดแล้ว ไม่สามารถผูกบัญชีได้`                                                            |
| `taken`          | `รหัสนี้ถูกใช้ผูกกับบัญชี LINE อื่นแล้ว`                                                            |

`LineWebhookEvent` is a minimal local type — only the fields used (`type`,
`replyToken`, `source.userId`, `message.type`, `message.text`). We do not pull
in the LINE SDK; two `fetch` calls and an HMAC do not justify the dependency.

### 3. LINE module — `web/lib/line/`

- **`signature.ts`** — `verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean`.
  Computes `base64(HMAC-SHA256(channelSecret, rawBody))` with node `crypto` and
  compares to `signature` using `crypto.timingSafeEqual` (constant-time; guard
  for length mismatch first since `timingSafeEqual` throws on unequal lengths).
- **`messaging.ts`** — the LINE Messaging API client:
  - `pushMessage(to: string, text: string): Promise<{ messageId: string }>` —
    moved out of `line-provider.ts`; the `https://api.line.me/v2/bot/message/push`
    call.
  - `replyMessage(replyToken: string, text: string): Promise<void>` — new;
    `POST https://api.line.me/v2/bot/message/reply`.
  - Both share a private helper for the base URL + `Authorization: Bearer`
    header built from `LINE_CHANNEL_ACCESS_TOKEN`.
- **`line-provider.ts`** is refactored to a thin `SmsProvider` wrapper that
  delegates `send()` to `messaging.pushMessage`. This removes the duplicated
  fetch/header logic. `resolveSmsProvider()` in `web/lib/sms/index.ts` and its
  missing-token fallback to the dev provider are unchanged.

### 4. Ticket page — `web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx`

- `TicketWaitEstimate` (in `web/app/(checkin)/actions.ts`) gains
  `lineLinkCode: string` and `lineUserId: string | null`, mapped from the two
  new `get_ticket_wait_estimate` columns.
- A new block in the ticket card, below the existing SMS-notice box:
  - `waitEstimate.lineUserId` is falsy → a green LINE button linking to
    `https://line.me/R/oaMessage/{NEXT_PUBLIC_LINE_OA_ID}/?LINK-{lineLinkCode}`,
    label `รับแจ้งเตือนทาง LINE / Get notified on LINE`.
  - `waitEstimate.lineUserId` is set → a static `✅ แจ้งเตือนทาง LINE แล้ว /
LINE notifications on` confirmation, no button.
- No new state or effects — the existing 30s `getTicketWaitEstimate` poll flips
  the block when the webhook lands. Until the first poll resolves
  (`waitEstimate` is `null`), render nothing for this block to avoid a flash of
  the wrong state.
- If `NEXT_PUBLIC_LINE_OA_ID` is unset, render nothing (LINE not configured for
  this deployment).

### 5. Env — `web/.env.example`

Add:

```
# LINE webhook (patient LINE linking)
LINE_CHANNEL_SECRET=
NEXT_PUBLIC_LINE_OA_ID=@202qrttf
```

`LINE_CHANNEL_ACCESS_TOKEN` already exists (Phase F.1). `NEXT_PUBLIC_LINE_OA_ID`
defaults to CareMind's real basic ID — it is a `NEXT_PUBLIC_` value (public by
definition) and hardcoding the real default saves a config step. `LINE_CHANNEL_SECRET`
stays blank in the example and is filled per-environment in the gitignored
`web/.env`.

### 6. Tests

**pgTAP — `supabase/tests/walkin_line_link_test.sql`**

- `line_link_code` column exists, is `TEXT`, is `NOT NULL`, has a default.
- A freshly inserted ticket gets a non-null 8-char `line_link_code`.
- `link_line_user_id` on an active ticket sets `line_user_id` and returns
  `ok = true, reason = 'linked'` with the right ticket number + department.
- `link_line_user_id` on a `done`/`cancelled` ticket returns
  `ok = false, reason = 'closed'` and leaves `line_user_id` untouched.
- `link_line_user_id` with an unknown code returns `ok = false, reason = 'not_found'`.
- Re-calling with the same userId is idempotent → `ok = true, reason = 'already_linked'`.
- Calling with a different userId on an already-linked ticket → `ok = false, reason = 'taken'`.
- `get_ticket_wait_estimate` returns the `line_link_code` and `line_user_id`
  columns.

**vitest — `web/lib/line/signature.test.ts`**

- A signature computed with the right secret over the exact body verifies true.
- A tampered body verifies false.
- A signature computed with a different secret verifies false.
- A `null` / missing signature header verifies false (no throw).

**vitest — `web/app/api/line/webhook/route.test.ts`** (logic-level)

- The `LINK-XXXXXXXX` extraction regex matches valid codes (case-insensitive)
  and rejects non-matching text.
- A request with a bad signature gets `401` and never calls the RPC.
- A valid `message` event calls `link_line_user_id` with the extracted code and
  `source.userId`, then calls `replyMessage` (RPC + LINE fetch mocked).
- A non-text event (`follow`) is ignored and still returns `200`.

Manual end-to-end webhook testing needs a public tunnel
(`cloudflared tunnel --url http://localhost:3000`) registered as the webhook URL
in the LINE console — documented in the runbook, not automated.

## LINE Console Setup Runbook (one-time, per environment)

This is operator config, not code. The code references env-var _names_ only;
nothing in the build waits on these values.

1. **Enable Messaging API.** In **LINE Official Account Manager** for the OA
   (`@202qrttf`): **Settings → Messaging API → Enable**. Pick or create a
   Provider. This auto-creates the linked Messaging API channel (since
   2024-09-04 channels can no longer be created directly in the Developers
   Console). Skip if already enabled — the channel shows status
   `กำลังใช้งาน` / _active_.
2. **Collect credentials** in the **LINE Developers Console** for that channel:
   - **Basic settings → Channel secret** → `LINE_CHANNEL_SECRET` in `web/.env`.
   - **Messaging API → Issue channel access token (long-lived)** →
     `LINE_CHANNEL_ACCESS_TOKEN` in `web/.env`.
   - Treat both as secrets: `web/.env` only, never committed, never pasted into
     logs or chat. Rotate immediately if exposed (Basic settings has a reissue
     button for the secret; the access token can be re-issued on its tab).
3. **Register the webhook.** Developers Console → **Messaging API**:
   - **Webhook URL** = `https://<domain>/api/line/webhook` (deployed domain, or
     a `cloudflared`/`ngrok` tunnel for local testing).
   - **Use webhook** = ON.
4. **Set response mode to Bot.** OA Manager → **Settings → Response settings** →
   response mode **Bot**. If left on **Chat**, inbound messages stay in the
   manual chat console and LINE never calls the webhook.

## Error Handling Summary

| Situation                                       | Behaviour                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Patient sends unrelated text to the OA          | No code match → event skipped, `200` returned                            |
| Forged / unsigned webhook request               | `verifyLineSignature` fails → `401`, no RPC call, nothing mutated        |
| `LINE_CHANNEL_SECRET` unset                     | Fail closed → `401` and an error log                                     |
| Code belongs to a closed/cancelled ticket       | RPC `ok = false, reason = 'closed'` → patient gets a clear reply         |
| Patient re-sends the same code                  | RPC idempotent → `reason = 'already_linked'`                             |
| Code already linked to a different LINE account | RPC `ok = false, reason = 'taken'`                                       |
| `replyMessage` LINE API call fails              | Caught + logged; `line_user_id` is already saved so delivery still works |
| One event in a batch throws                     | Caught per-event; remaining events still processed; `200` returned       |
| `NEXT_PUBLIC_LINE_OA_ID` unset                  | Ticket page renders no LINE block; rest of the page unaffected           |

### Enumeration oracle note

`link_line_user_id` is `anon`-callable, and the RPC returns distinguishable
`linked` / `already_linked` / `taken` / `not_found` responses, which
constitutes a weak enumeration oracle over the `line_link_code` space. This is
acceptable at the current product stage: the 16^8 (~4.3 billion) code space
against a window of at most a few hundred active tickets makes brute force
impractical, and the worst-case outcome of a successful guess is linking one's
own LINE account to a stranger's ticket (a single-ticket notification hijack)
— no PII is disclosed, since the RPC returns only a ticket number and
department name.

## Files

New:

- `supabase/migrations/00014_walkin_line_link.sql`
- `supabase/tests/walkin_line_link_test.sql`
- `web/app/api/line/webhook/route.ts`
- `web/app/api/line/webhook/route.test.ts`
- `web/lib/line/signature.ts`
- `web/lib/line/signature.test.ts`
- `web/lib/line/messaging.ts`

Modified:

- `web/lib/sms/line-provider.ts` — thin wrapper over `messaging.pushMessage`
- `web/app/(checkin)/actions.ts` — `TicketWaitEstimate` gains two fields
- `web/app/(checkin)/[hospitalCode]/ticket/[ticketId]/page.tsx` — LINE block
- `web/.env.example` — two new vars
- `shared/src/types/database.ts` — register `link_line_user_id`, update
  `get_ticket_wait_estimate` return shape, add `line_link_code` to the
  `queue_tickets` row type

## Build Sequence

1. Migration 00014 + pgTAP test → `supabase db reset`, run the suite (RED→GREEN
   at the DB layer first).
2. `web/lib/line/` module + signature test.
3. Webhook route + route test.
4. `line-provider.ts` refactor onto `messaging.pushMessage` — confirm the
   existing SMS dispatch test still passes.
5. `database.ts` type updates, `actions.ts` `TicketWaitEstimate` fields.
6. Ticket page LINE block.
7. `.env.example`.
8. Full local suite (pgTAP + vitest), then manual tunnel test.
