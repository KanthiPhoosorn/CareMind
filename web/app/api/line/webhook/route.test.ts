import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// Mock the Supabase server helpers and the LINE messaging client so the test
// exercises only the webhook's own logic: signature gate, code extraction,
// RPC dispatch, reply.
const callRpc = vi.fn();
const replyMessage = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
  callRpc: (...args: unknown[]) => callRpc(...args),
}));
vi.mock('@/lib/line/messaging', () => ({
  replyMessage: (...args: unknown[]) => replyMessage(...args),
}));

import { POST } from './route';

const SECRET = 'test-secret';
const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('base64');

function lineRequest(body: string, signature: string = sign(body)): Request {
  return new Request('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: { 'x-line-signature': signature, 'content-type': 'application/json' },
    body,
  });
}

const textEvent = (text: string) => ({
  type: 'message',
  replyToken: 'reply-token-1',
  source: { userId: 'U00000000000000000000000000000001' },
  message: { type: 'text', text },
});

beforeEach(() => {
  vi.stubEnv('LINE_CHANNEL_SECRET', SECRET);
  callRpc.mockReset();
  replyMessage.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/line/webhook', () => {
  it('rejects a request with a bad signature and never calls the RPC', async () => {
    const body = JSON.stringify({ events: [textEvent('LINK-A1B2C3D4')] });
    const res = await POST(lineRequest(body, 'wrong-signature'));
    expect(res.status).toBe(401);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('links a valid LINK-code message and replies to the patient', async () => {
    callRpc.mockResolvedValue({
      data: [
        {
          ok: true,
          reason: 'linked',
          ticket_number: 42,
          department_name_th: 'อายุรกรรม',
          department_name_en: 'Internal Medicine',
          state: 'waiting',
        },
      ],
      error: null,
    });
    const body = JSON.stringify({ events: [textEvent('LINK-A1B2C3D4')] });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(callRpc).toHaveBeenCalledWith(expect.anything(), 'link_line_user_id', {
      p_link_code: 'A1B2C3D4',
      p_line_user_id: 'U00000000000000000000000000000001',
    });
    expect(replyMessage).toHaveBeenCalledWith('reply-token-1', expect.stringContaining('42'));
  });

  it('returns 200 and does not reply when the RPC returns an error', async () => {
    callRpc.mockResolvedValue({ data: null, error: new Error('DB unavailable') });
    const body = JSON.stringify({ events: [textEvent('LINK-A1B2C3D4')] });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(replyMessage).not.toHaveBeenCalled();
  });

  it('ignores a non-text event and still returns 200', async () => {
    const body = JSON.stringify({
      events: [{ type: 'follow', replyToken: 'rt', source: { userId: 'U1' } }],
    });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('ignores a text message with no LINK code and returns 200', async () => {
    const body = JSON.stringify({ events: [textEvent('สวัสดีครับ')] });
    const res = await POST(lineRequest(body));
    expect(res.status).toBe(200);
    expect(callRpc).not.toHaveBeenCalled();
  });
});
