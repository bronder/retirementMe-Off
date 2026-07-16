import { describe, it, expect } from 'vitest';
import { MAX_CHAT_HISTORY } from './store';

/**
 * Tripwire tests for the chat-history cap.
 *
 * Testing the store actions end-to-end requires localStorage and a DOM, which
 * the vitest config (environment: 'node') deliberately does not provide — the
 * store is wired against `localStorage` by default and isn't worth swapping
 * to an in-memory adapter just for one cap test. These tests instead lock in
 * the constant that's exported so the cap can only be changed intentionally.
 */
describe('MAX_CHAT_HISTORY', () => {
  it('is exported and is a positive integer', () => {
    expect(typeof MAX_CHAT_HISTORY).toBe('number');
    expect(Number.isInteger(MAX_CHAT_HISTORY)).toBe(true);
    expect(MAX_CHAT_HISTORY).toBeGreaterThan(0);
  });

  it('is even (one user + one assistant per turn keeps turns intact)', () => {
    // The cap slices the array to its last N entries. If N is odd, a single
    // new turn can leave a stray assistant message without its preceding
    // user message. Keep N even.
    expect(MAX_CHAT_HISTORY % 2).toBe(0);
  });

  it('is large enough to keep recent context but bounded', () => {
    // Lower bound: at least 10 turns (20 messages) — enough to keep the
    // most recent conversation flow coherent for typical use.
    expect(MAX_CHAT_HISTORY).toBeGreaterThanOrEqual(20);
    // Upper bound: 200 messages. Anything larger starts to bloat localStorage
    // and request body size for marginal context gain.
    expect(MAX_CHAT_HISTORY).toBeLessThanOrEqual(200);
  });
});
