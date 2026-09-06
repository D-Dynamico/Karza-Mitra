import { describe, expect, it } from 'vitest';

// Proves the test runner, the TypeScript setup and the @engine alias all work.
// Replaced by real coverage in phase 1; kept until interval.test.ts lands.
describe('test harness', () => {
  it('runs TypeScript tests', () => {
    const rate: [number, number] = [9, 12];
    expect(rate[1] - rate[0]).toBe(3);
  });
});
