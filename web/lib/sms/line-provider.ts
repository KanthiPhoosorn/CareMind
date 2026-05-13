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
