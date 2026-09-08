/**
 * How numbers reach the page.
 *
 * These are the cheapest defects in the project to introduce and the hardest to
 * see in a diff, because none of them makes an assertion about the arithmetic
 * fail. "₹4.7 lakh to ₹4.9 lakh" is correct and unreadable. "₹14 lakh" for
 * ₹14,41,000 is correct to the printed digit and contradicts the ₹58,000 gap
 * named in the same sentence. "60 months" is correct and is not how anybody says
 * five years.
 *
 * `tests/copy.test.ts` guards the sentences that come out of the engine. This
 * file guards the pieces those sentences are built from, so a failure points at
 * the formatter rather than at whichever sentence happened to use it.
 */

import { describe, expect, it } from 'vitest';
import { approx, inLakh, money, moneyRange, perMonth, rate, tenure } from '../engine/format';
import { iv } from '../engine/interval';

describe('a range that is not a range collapses', () => {
  it('prints one figure when the two ends are within five percent', () => {
    // The real case: Priya's safe amount, ₹4,71,000 to ₹4,89,000.
    const r = moneyRange(iv(471000, 489000));
    expect(r.collapsed).toBe(true);
    expect(r.text).toBe('about ₹4.8 lakh');
  });

  it('keeps both ends when they are genuinely different situations', () => {
    // Mohan's, ₹29.5 lakh to ₹33.2 lakh: eleven percent apart, and the two ends
    // are different loans.
    const r = moneyRange(iv(2950000, 3320000));
    expect(r.collapsed).toBe(false);
    expect(r.text).toBe('₹30 lakh to ₹33 lakh');
  });

  it('collapses a monthly figure upward, never downward', () => {
    // The rest of the module rounds a range outward. An EMI ceiling is the one
    // place a figure read light is worse than one read heavy, so the collapse
    // goes to the top rather than the middle.
    expect(perMonth(iv(10314, 10402))).toBe('about ₹10,500 a month');
    expect(perMonth(iv(16200, 23200))).toBe('₹16,200 to ₹23,200 a month');
  });

  it('does not collapse across the line where the bottom is nothing', () => {
    // "Almost nothing, and at most ₹X" is a real statement about two kinds of
    // lender. It must survive, and it does, because the ends are far apart.
    const r = moneyRange(iv(0, 130000), { asLender: true });
    expect(r.collapsed).toBe(false);
    expect(r.bottomIsNothing).toBe(true);
  });
});

describe('lakh keeps a decimal exactly where it changes the sentence', () => {
  it('holds the tenth below twenty lakh', () => {
    // Dropping it here made "₹14.41 lakh" print as "₹14 lakh", which then
    // contradicted the "₹58,000 above what is safe" in the same sentence.
    expect(inLakh(1441000)).toBe('₹14.4 lakh');
    expect(inLakh(880000)).toBe('₹8.8 lakh');
  });

  it('drops the tenth above twenty lakh, where it is noise', () => {
    expect(inLakh(2950000)).toBe('₹30 lakh');
    expect(inLakh(7500000)).toBe('₹75 lakh');
  });

  it('leaves a round figure round', () => {
    expect(inLakh(1500000)).toBe('₹15 lakh');
    expect(inLakh(800000)).toBe('₹8 lakh');
  });

  it('switches to crore rather than saying "one hundred and six lakh"', () => {
    // The home loan is what forced this: a product that can run past a crore
    // makes every large figure arithmetic the reader has to do.
    expect(inLakh(10600000)).toBe('₹1.1 crore');
    expect(inLakh(12900000)).toBe('₹1.3 crore');
    expect(inLakh(9900000)).toBe('₹99 lakh');
    expect(inLakh(250000000)).toBe('₹25 crore');
  });
});

describe('a computed amount is rounded before it reaches a sentence', () => {
  it('never hands a sentence a figure to the rupee', () => {
    expect(approx(58028)).toBe('₹58,000');
    expect(approx(3417)).toBe('₹3,500');
    expect(approx(1441000)).toBe('₹14.4 lakh');
  });
});

describe('a term is said the way it is said out loud', () => {
  it('gives years once there are two of them', () => {
    expect(tenure(60)).toBe('5 years');
    expect(tenure(84)).toBe('7 years');
    expect(tenure(180)).toBe('15 years');
  });

  it('keeps months below two years, where years would be clumsy', () => {
    expect(tenure(18)).toBe('18 months');
    expect(tenure(6)).toBe('6 months');
  });

  it('says both where a term is not a whole number of years', () => {
    expect(tenure(30)).toBe('2 years 6 months');
    expect(tenure(25)).toBe('2 years 1 month');
  });
});

describe('the formatters that were already right stay right', () => {
  it('still rounds a rate outward to the half point lenders quote in', () => {
    expect(rate(iv(9.99, 13.6))).toBe('9.5% to 14%');
  });

  it('still says nothing rather than ₹0', () => {
    expect(money(iv(0, 0))).toBe('nothing');
  });
});
