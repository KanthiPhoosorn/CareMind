import { createHmac, timingSafeEqual } from 'node:crypto';

// LINE signs every webhook request: the X-Line-Signature header is
// base64(HMAC-SHA256(channelSecret, rawRequestBody)). We must verify it
// against the *raw* body before trusting any event in the payload.
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual throws on length mismatch — guard first, then compare
  // in constant time.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
