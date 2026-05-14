import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyLineSignature } from './signature';

const SECRET = 'test-channel-secret';
const BODY = '{"events":[{"type":"message"}]}';
const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64');

describe('verifyLineSignature', () => {
  it('accepts a signature computed with the right secret over the exact body', () => {
    expect(verifyLineSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyLineSignature(BODY + ' ', sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it('rejects a signature computed with a different secret', () => {
    expect(verifyLineSignature(BODY, sign(BODY, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature header without throwing', () => {
    expect(verifyLineSignature(BODY, null, SECRET)).toBe(false);
  });

  it('rejects when the channel secret is empty', () => {
    expect(verifyLineSignature(BODY, sign(BODY, SECRET), '')).toBe(false);
  });
});
