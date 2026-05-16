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
      return `✅ ผูกบัญชี LINE สำเร็จ — คิวหมายเลข ${ticketNumber} แผนก${deptTh ?? 'ไม่ทราบ'}\nเราจะแจ้งเตือนคุณทาง LINE เมื่อใกล้ถึงคิว`;
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

  if (!secret) {
    console.error('[line-webhook] LINE_CHANNEL_SECRET is not configured');
    return new Response('bad signature', { status: 401 });
  }

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
