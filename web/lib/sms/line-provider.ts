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
