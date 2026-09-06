/**
 * How numbers are shown.
 *
 * The engine works to the rupee. Showing that to a borrower would be a lie of
 * precision: "₹10,314 to ₹1,42,500" claims we know the lower bound to the rupee
 * about a figure that rests on an assumed rent and a guessed credit score. A
 * range printed that exactly reads as a calculation rather than an estimate, and
 * the whole point of the ranges is that they are estimates.
 *
 * So everything on screen is rounded outward — never inward, which would narrow
 * a range we have no business narrowing — and the raw values stay in the trace
 * for anyone who wants to check the arithmetic.
 */

import type { Interval } from './interval';

/** Round outward to a step, so a displayed range always contains the real one. */
const floorTo = (n: number, step: number): number => Math.floor(n / step) * step;
const ceilTo = (n: number, step: number): number => Math.ceil(n / step) * step;

/** Coarser steps for larger amounts: ₹500 under a lakh, ₹1,000 above it. */
const moneyStep = (n: number): number => (Math.abs(n) < 100000 ? 500 : 1000);

export const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** In lakh, the unit borrowers actually think in for anything sizeable. */
export function inLakh(n: number): string {
  if (Math.abs(n) < 100000) return rupees(n);
  const lakh = n / 100000;
  const rounded = lakh >= 10 ? lakh.toFixed(0) : lakh.toFixed(1).replace(/\.0$/, '');
  return `₹${rounded} lakh`;
}

export interface MoneyRangeText {
  /** The range as a borrower should read it. */
  readonly text: string;
  /** True when the bottom of the range is effectively nothing. */
  readonly bottomIsNothing: boolean;
}

const NOTHING_MUCH = 20000;

/**
 * A money range, rounded and in words where words are clearer.
 *
 * The bottom of a lender range is usually "a cautious bank" and the top "an NBFC
 * that will take the risk". Where the two are far apart, saying so is more
 * useful than two numbers, because the gap is not uncertainty — it is a real
 * difference between the sort of lender who would say yes and the sort who
 * would not.
 */
export function moneyRange(x: Interval, opts: { asLender?: boolean } = {}): MoneyRangeText {
  const lo = Math.max(0, floorTo(x.lo, moneyStep(x.lo)));
  const hi = ceilTo(x.hi, moneyStep(x.hi));
  const bottomIsNothing = lo < NOTHING_MUCH && hi >= NOTHING_MUCH;

  if (hi <= 0) return { text: 'nothing', bottomIsNothing: true };
  if (lo === hi) return { text: inLakh(lo), bottomIsNothing: false };

  if (bottomIsNothing && opts.asLender === true) {
    return {
      text: `close to nothing at a bank, up to ${inLakh(hi)} from an NBFC or a platform's finance partner`,
      bottomIsNothing: true,
    };
  }
  if (bottomIsNothing) {
    return { text: `almost nothing, and at most ${inLakh(hi)}`, bottomIsNothing: true };
  }
  return { text: `${inLakh(lo)} to ${inLakh(hi)}`, bottomIsNothing: false };
}

export const money = (x: Interval, opts?: { asLender?: boolean }): string =>
  moneyRange(x, opts).text;

/** A rate band, rounded outward to the half point lenders actually quote in. */
export function rate(x: Interval): string {
  const lo = floorTo(x.lo, 0.5);
  const hi = ceilTo(x.hi, 0.5);
  const fmt = (n: number): string => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
  return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
}

/** A share of income, as whole percentage points. */
export function share(x: Interval): string {
  const lo = Math.floor(x.lo * 100);
  const hi = Math.ceil(x.hi * 100);
  return lo === hi ? `${lo}%` : `${lo}% to ${hi}%`;
}

/** A monthly instalment. Always rounded up, so nobody plans against a figure that is too low. */
export const perMonth = (x: Interval): string =>
  x.lo === x.hi
    ? `${rupees(ceilTo(x.hi, 100))} a month`
    : `${rupees(floorTo(x.lo, 100))} to ${rupees(ceilTo(x.hi, 100))} a month`;
