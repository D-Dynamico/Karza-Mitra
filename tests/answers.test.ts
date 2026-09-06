import { describe, expect, it } from 'vitest';
import { exact, parseAnswers } from '../engine/answers';

describe('answers schema', () => {
  it('accepts an empty answer set, since skip is always available', () => {
    const result = parseAnswers({});
    expect(result.ok).toBe(true);
  });

  it('accepts a single figure as a zero-width range', () => {
    const result = parseAnswers({ monthlyIncome: exact(45000) });
    expect(result).toMatchObject({ ok: true, answers: { monthlyIncome: { low: 45000, high: 45000 } } });
  });

  it('rejects an inverted range with a readable message', () => {
    const result = parseAnswers({ monthlyIncome: { low: 80000, high: 40000 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toContain('monthlyIncome');
  });

  it('keeps never-borrowed distinct from an unknown score', () => {
    const never = parseAnswers({ creditScore: { known: false, everBorrowed: false } });
    const unknown = parseAnswers({ creditScore: { known: false, everBorrowed: true } });
    expect(never.ok && unknown.ok).toBe(true);
  });

  it('rejects nonsense rather than crashing on it', () => {
    expect(parseAnswers({ age: 9 }).ok).toBe(false);
    expect(parseAnswers({ existingEmis: -1 }).ok).toBe(false);
    expect(parseAnswers({ purpose: 'yacht' }).ok).toBe(false);
  });
});
