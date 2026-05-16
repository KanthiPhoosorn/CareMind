// SMS provider abstraction. We deliberately keep this tiny — any walk-in
// queue SMS we send is short (≤ 160 chars), unicode-safe, and addressed to
// a single E.164 number. Concrete provider implementations live in sibling
// files (dev-provider.ts, twilio-provider.ts, …) and are picked via
// resolveSmsProvider() in index.ts based on the SMS_PROVIDER env var.

export interface SmsSendResult {
  /** Provider-issued message id, useful for tracing in sms_dispatch_log. */
  messageId: string;
  /** Provider key (e.g. 'dev', 'twilio'); echoed back from the impl. */
  provider: string;
}

export interface SmsProvider {
  readonly key: string;
  send(to: string, body: string, locale?: 'th' | 'en'): Promise<SmsSendResult>;
}

/**
 * Patient-facing SMS bodies. Keep these terse — Thai SMS aggregators bill
 * by 70-char unicode chunks; longer messages cost multiples.
 */
export function ticketCalledMessage(
  ticketNumber: number,
  departmentNameEn: string,
  departmentNameTh: string,
  locale: 'th' | 'en' = 'th',
): string {
  if (locale === 'en') {
    return `CareMind: ticket #${ticketNumber} (${departmentNameEn}) is being called now. Please head to the counter.`;
  }
  return `CareMind: คิวหมายเลข ${ticketNumber} (${departmentNameTh}) เรียกแล้ว กรุณามาที่จุดบริการ`;
}
