import { describe, it, expect } from 'vitest';
import { APP_NAME } from './constants';

describe('constants', () => {
  it('should export correct APP_NAME', () => {
    expect(APP_NAME).toBe('CareMind');
  });
});
