// Resolve the active SMS provider from env. Defaults to the dev provider so
// local development without secrets works out of the box.
//
// SMS_PROVIDER=dev    → console-log impl (default)
// SMS_PROVIDER=twilio → not implemented yet — throws on send
// SMS_PROVIDER=thai   → not implemented yet — throws on send
import type { SmsProvider } from './provider';
import { devSmsProvider } from './dev-provider';

export type { SmsProvider, SmsSendResult } from './provider';
export { ticketCalledMessage } from './provider';

function notImplementedProvider(key: string): SmsProvider {
  return {
    key,
    async send() {
      throw new Error(
        `SMS provider '${key}' is not implemented. Set SMS_PROVIDER=dev for local development.`,
      );
    },
  };
}

export function resolveSmsProvider(): SmsProvider {
  const choice = (process.env.SMS_PROVIDER ?? 'dev').toLowerCase();
  if (choice === 'dev') return devSmsProvider;
  if (choice === 'twilio') return notImplementedProvider('twilio');
  if (choice === 'thai') return notImplementedProvider('thai');
  // Unknown values fall back to dev so a typo doesn't break dispatch.
  return devSmsProvider;
}
