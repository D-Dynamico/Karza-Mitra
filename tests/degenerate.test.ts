import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';

/**
 * The inputs that break calculators: nothing filled in, nothing earned, more
 * spent than earned, an ask of zero, someone near retirement. Every one of them
 * has to come out as a verdict with a reason. A blank screen is the one answer
 * this product is not allowed to give.
 */

const cases: Array<[string, Answers]> = [
  ['nothing answered at all', {}],
  ['no income stated', { amountAsked: 500000, purpose: 'medical' }],
  [
    'zero income',
    {
      amountAsked: 200000,
      incomeType: 'informal',
      monthlyIncome: { lo: 0, hi: 0 },
      existingEmis: 0,
      rentOrHomeEmi: 0,
      householdExpenses: 0,
      age: 40,
    },
  ],
  [
    'spends more than it earns',
    {
      amountAsked: 300000,
      incomeType: 'salaried',
      monthlyIncome: { lo: 20000, hi: 20000 },
      existingEmis: 4000,
      rentOrHomeEmi: 12000,
      householdExpenses: 15000,
      age: 33,
      creditScore: { known: true, score: 710 },
    },
  ],
  [
    'asks for nothing',
    {
      amountAsked: 0,
      incomeType: 'salaried',
      monthlyIncome: { lo: 60000, hi: 60000 },
      existingEmis: 0,
      rentOrHomeEmi: 10000,
      householdExpenses: 15000,
      age: 30,
      creditScore: { known: true, score: 760 },
    },
  ],
  [
    'is seventy years old',
    {
      amountAsked: 400000,
      purpose: 'medical',
      incomeType: 'salaried',
      monthlyIncome: { lo: 40000, hi: 40000 },
      existingEmis: 0,
      rentOrHomeEmi: 0,
      householdExpenses: 12000,
      age: 70,
      creditScore: { known: true, score: 800 },
    },
  ],
  [
    'earns an enormous amount',
    {
      amountAsked: 50000000,
      incomeType: 'salaried',
      monthlyIncome: { lo: 5000000, hi: 5000000 },
      existingEmis: 0,
      rentOrHomeEmi: 200000,
      householdExpenses: 300000,
      age: 45,
      creditScore: { known: true, score: 820 },
    },
  ],
  [
    'has a very wide income range',
    {
      amountAsked: 600000,
      incomeType: 'self-employed-cash',
      monthlyIncome: { lo: 5000, hi: 500000 },
      existingEmis: 0,
      rentOrHomeEmi: 8000,
      age: 38,
    },
  ],
  [
    'owes more in instalments than it earns',
    {
      amountAsked: 100000,
      incomeType: 'salaried',
      monthlyIncome: { lo: 30000, hi: 30000 },
      existingEmis: 40000,
      rentOrHomeEmi: 10000,
      householdExpenses: 10000,
      age: 35,
      creditScore: { known: true, score: 690 },
    },
  ],
];

describe.each(cases)('%s', (_name, answers) => {
  const r = compute(answers);

  it('returns a verdict', () => {
    expect(['borrow', 'borrow-less', 'dont', 'need-more-info']).toContain(r.verdict.kind);
  });

  it('explains itself', () => {
    expect(r.verdict.headline.length).toBeGreaterThan(10);
    expect(r.verdict.why.length).toBeGreaterThan(20);
  });

  it('produces finite, ordered ranges', () => {
    for (const range of [r.amounts.safe, r.amounts.lender, r.surplus]) {
      expect(Number.isFinite(range.lo)).toBe(true);
      expect(Number.isFinite(range.hi)).toBe(true);
      expect(range.lo).toBeLessThanOrEqual(range.hi);
    }
  });

  it('never suggests a negative amount', () => {
    expect(r.amounts.safe.lo).toBeGreaterThanOrEqual(0);
    expect(r.amounts.lender.lo).toBeGreaterThanOrEqual(0);
  });

  it('leaves a trace', () => {
    expect(r.trace.length).toBeGreaterThan(0);
  });
});

describe('specific expectations for the difficult cases', () => {
  it('asks for income rather than inventing one', () => {
    const r = compute({ amountAsked: 500000, purpose: 'medical' });
    expect(r.verdict.kind).toBe('need-more-info');
    expect(r.verdict.why.toLowerCase()).toContain('income');
  });

  it('refuses when nothing is left at the end of the month', () => {
    const r = compute(cases.find(([n]) => n === 'spends more than it earns')![1]);
    expect(r.verdict.kind).toBe('dont');
    expect(r.amounts.safe.hi).toBe(0);
  });

  it('refuses when instalments already exceed income', () => {
    const r = compute(cases.find(([n]) => n === 'owes more in instalments than it earns')![1]);
    expect(r.verdict.kind).toBe('dont');
  });

  it('caps tenure for a borrower near retirement', () => {
    const older = compute(cases.find(([n]) => n === 'is seventy years old')![1]);
    expect(older.pricing!.tenureMonths).toBeLessThanOrEqual(60);
  });

  it('stays wide rather than confident when the income range is huge', () => {
    const r = compute(cases.find(([n]) => n === 'has a very wide income range')![1]);
    expect(r.confidence).toBe('low');
  });
});
