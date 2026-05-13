// Resolve the active notification provider from env. Defaults to the dev
// provider so local development without secrets works out of the box.
//
// SMS_PROVIDER=dev    → console-log impl (default)
// SMS_PROVIDER=line   → LINE Messaging API push (requires LINE_CHANNEL_ACCESS_TOKEN)
// SMS_PROVIDER=twilio → not implemented yet — throws on send
// SMS_PROVIDER=thai   → not implemented yet — throws on send
//
// Despite the SMS_PROVIDER name, "line" addresses recipients by LINE userId
// (U + 32 hex), not by phone. The dispatcher in queue/actions.ts picks the
// right address for each ticket.
import type { SmsProvider } from './provider';
import { devSmsProvider } from './dev-provider';
import { createLineProvider } from './line-provider';

export type { SmsProvider, SmsSendResult } from './provider';
export { ticketCalledMessage } from './provider';

function notImplementedProvider(key: string): SmsProvider {
  return {
    key,
    async send() {
      throw new Error(
        `Notification provider '${key}' is not implemented. Set SMS_PROVIDER=dev or =line for local development.`,
      );
    },
  };
}

export function resolveSmsProvider(): SmsProvider {
  const choice = (process.env.SMS_PROVIDER ?? 'dev').toLowerCase();
  if (choice === 'dev') return devSmsProvider;
  if (choice === 'line') {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      // Falling back loudly to dev so the deploy still works, but the ops
      // team sees a clear marker that the LINE wiring is incomplete.
      console.error(
        '[notify] SMS_PROVIDER=line but LINE_CHANNEL_ACCESS_TOKEN is unset — using dev provider',
      );
      return devSmsProvider;
    }
    return createLineProvider(token);
  }
  if (choice === 'twilio') return notImplementedProvider('twilio');
  if (choice === 'thai') return notImplementedProvider('thai');
  return devSmsProvider;
}
