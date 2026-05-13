// Dev SMS provider: logs to stderr so SSR server logs surface it, and
// returns a stable-looking message id. The send() promise resolves
// synchronously after a microtask — fine for SSR latency.
import type { SmsProvider, SmsSendResult } from './provider';

export const devSmsProvider: SmsProvider = {
  key: 'dev',
  async send(to: string, body: string): Promise<SmsSendResult> {
    console.log(`[SMS DEV] → ${to}: ${body}`);
    return {
      messageId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      provider: 'dev',
    };
  },
};
