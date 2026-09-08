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
 *
 * With one deliberate exception. A range whose two ends are within a few percent
 * of each other is not a range the borrower can act on differently; it is one
 * number wearing two hats. "₹4.7 lakh to ₹4.9 lakh" invites the reader to work
 * out what separates the ends, and nothing does. Below `NARROW_ENOUGH` the two
 * ends collapse into a single figure prefixed with "about", which is the honest
 * reading and one the reader can repeat at a counter. This narrows a displayed
 * range, which the paragraph above forbids — the justification is that the word
 * "about" restores the width the digits lost, and that a range nobody can use is
 * worse than a rounded figure everybody can.
 */

import type { Interval } from './interval';

/** Round outward to a step, so a displayed range always contains the real one. */
const floorTo = (n: number, step: number): number => Math.floor(n / step) * step;
const ceilTo = (n: number, step: number): number => Math.ceil(n / step) * step;

/** Coarser steps for larger amounts: ₹500 under a lakh, ₹1,000 above it. */
const moneyStep = (n: number): number => (Math.abs(n) < 100000 ? 500 : 1000);

/**
 * How close the ends of a range must be before it stops being shown as a range.
 * Five percent: at that width the two ends round to the same figure in lakh, so
 * printing both only advertises a precision the arithmetic does not have.
 */
const NARROW_ENOUGH = 0.05;

export const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** In lakh, the unit borrowers actually think in for anything sizeable. */
export function inLakh(n: number): string {
  if (Math.abs(n) < 100000) return rupees(n);
  const lakh = n / 100000;
  // One decimal below twenty lakh, none above. Dropping it at ten made
  // "₹14.41 lakh" read as "₹14 lakh", which contradicted the ₹58,000 gap named
  // in the same sentence — the reader does the subtraction and it does not come
  // out. Keeping it above twenty is the opposite error: "₹29.5 lakh to
  // ₹33.2 lakh" claims a tenth of a lakh matters on a figure resting on an
  // assumed rent.
  const rounded = Math.abs(lakh) >= 20 ? lakh.toFixed(0) : lakh.toFixed(1).replace(/\.0$/, '');
  return `₹${rounded} lakh`;
}

/**
 * A single amount, rounded to something a borrower would say out loud.
 *
 * `rupees` is right for a figure the borrower gave us and wrong for one we
 * worked out: "₹58,028 above what you can carry" is arithmetic showing off. Use
 * this wherever a computed amount reaches a sentence.
 */
export function approx(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100000) return inLakh(n);
  const step = abs >= 10000 ? 1000 : abs >= 1000 ? 500 : 100;
  return rupees(Math.round(n / step) * step);
}

/**
 * A term, in the unit people say it in. "60 months" is a spreadsheet's way of
 * writing five years, and a borrower comparing two offers at a counter is
 * thinking in years.
 */
export function tenure(months: number): string {
  if (months < 24) return `${Math.round(months)} months`;
  const years = Math.floor(months / 12);
  const rest = Math.round(months - years * 12);
  if (rest === 0) return `${years} years`;
  return `${years} years ${rest} month${rest === 1 ? '' : 's'}`;
}

export interface MoneyRangeText {
  /** The range as a borrower should read it. */
  readonly text: string;
  /** True when the bottom of the range is effectively nothing. */
  readonly bottomIsNothing: boolean;
  /**
   * True when the two ends were close enough to print as one figure. The text
   * already says "about", so callers must not add their own hedge.
   */
  readonly collapsed: boolean;
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

  if (hi <= 0) return { text: 'nothing', bottomIsNothing: true, collapsed: false };
  if (lo === hi) return { text: inLakh(lo), bottomIsNothing: false, collapsed: false };

  if (bottomIsNothing && opts.asLender === true) {
    return {
      text: `close to nothing at a bank, up to ${inLakh(hi)} from an NBFC or a platform's finance partner`,
      bottomIsNothing: true,
      collapsed: false,
    };
  }
  if (bottomIsNothing) {
    return { text: `almost nothing, and at most ${inLakh(hi)}`, bottomIsNothing: true, collapsed: false };
  }

  // Two ends within a few percent are one number. Collapse to the middle,
  // rounded, and say "about" so the reader is not handed false precision.
  if ((hi - lo) / hi < NARROW_ENOUGH) {
    return { text: `about ${approx((lo + hi) / 2)}`, bottomIsNothing: false, collapsed: true };
  }

  return { text: `${inLakh(lo)} to ${inLakh(hi)}`, bottomIsNothing: false, collapsed: false };
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

/**
 * A monthly EMI. Always rounded up, so nobody plans against a figure that is too
 * low — which is also why a narrow range collapses to its top rather than its
 * middle. An EMI ceiling read a hundred rupees light is a worse error than one
 * read a hundred rupees heavy.
 */
export function perMonth(x: Interval): string {
  if (x.lo === x.hi) return `${rupees(ceilTo(x.hi, 100))} a month`;
  const lo = floorTo(x.lo, 100);
  const hi = ceilTo(x.hi, 100);
  if (hi > 0 && (hi - lo) / hi < NARROW_ENOUGH) return `about ${rupees(hi)} a month`;
  return `${rupees(lo)} to ${rupees(hi)} a month`;
}
