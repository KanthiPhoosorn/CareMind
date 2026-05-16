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
