/**
 * Loan arithmetic: EMI, the amount an EMI supports, and the honest all-in rate.
 *
 * All rates here are annual nominal percentages (what a lender quotes: "11.5%"),
 * converted internally to a monthly fraction. Everything is deterministic and
 * has an interval form, because the rules upstream work in ranges.
 */

import { div, iv, mul, point, type Interval } from './interval';

/** GST on a lender's fees. 18% is the standard rate on financial services. */
export const GST_ON_FEES = 0.18;

const monthlyRate = (annualPercent: number): number => annualPercent / 100 / 12;

/**
 * The annuity factor: the present value of ₹1 paid monthly for n months.
 * A zero rate is a real case (a subsidised or interest-free scheme) and the
 * general formula divides by zero there, so it is handled separately.
 */
export function annuityFactor(annualPercent: number, months: number): number {
  if (months <= 0) throw new RangeError('Tenure must be at least one month');
  const r = monthlyRate(annualPercent);
  if (r === 0) return months;
  return (1 - Math.pow(1 + r, -months)) / r;
}

/** The monthly instalment on a loan. */
export function emi(principal: number, annualPercent: number, months: number): number {
  if (principal <= 0) return 0;
  return principal / annuityFactor(annualPercent, months);
}

/** The loan an instalment will support — the direction this engine mostly runs in. */
export function principalFromEmi(
  instalment: number,
  annualPercent: number,
  months: number,
): number {
  if (instalment <= 0) return 0;
  return instalment * annuityFactor(annualPercent, months);
}

export const totalPaid = (instalment: number, months: number): number => instalment * months;

export const totalInterest = (
  principal: number,
  instalment: number,
  months: number,
): number => Math.max(0, totalPaid(instalment, months) - principal);

/**
 * What actually reaches the borrower's account: the sanctioned amount less the
 * processing fee and the GST charged on that fee. This gap is the whole reason
 * the headline rate understates the cost.
 */
export function netDisbursal(principal: number, feePercent: number): number {
  const fee = principal * (feePercent / 100);
  return principal - fee - fee * GST_ON_FEES;
}

/**
 * The all-in annual rate: the rate that makes the EMI stream equal what the
 * borrower actually received. This is an IRR, solved by bisection — slower than
 * Newton's method and completely indifferent to a bad starting guess, which
 * matters more here than speed.
 *
 * Returns the nominal annual percentage, comparable with a quoted rate.
 */
export function apr(
  principal: number,
  annualPercent: number,
  months: number,
  feePercent: number,
): number {
  if (principal <= 0 || months <= 0) return 0;
  const instalment = emi(principal, annualPercent, months);
  const received = netDisbursal(principal, feePercent);
  if (received <= 0) return 0;

  // With no fee, nothing is lost to costs and the all-in rate is the quoted rate.
  if (feePercent === 0) return annualPercent;

  // The true rate is above the quoted one, since fees only ever cost the
  // borrower. Bisect between the quoted rate and a ceiling well past any real
  // product, on the annuity factor, which decreases as the rate rises.
  const target = received / instalment;
  let lo = annualPercent;
  let hi = Math.max(annualPercent * 4, annualPercent + 100);

  for (let i = 0; i < 200; i += 1) {
    const guess = (lo + hi) / 2;
    if (annuityFactor(guess, months) > target) lo = guess;
    else hi = guess;
  }
  return (lo + hi) / 2;
}

/**
 * Interval forms.
 *
 * Each relies on the underlying function being monotone in its arguments, so
 * evaluating the two corners gives the exact range rather than an approximation:
 * EMI rises with principal and with rate; the amount an EMI supports rises with
 * the instalment and falls as the rate rises.
 */

export const emiRange = (
  principal: Interval,
  annualPercent: Interval,
  months: number,
): Interval =>
  iv(emi(principal.lo, annualPercent.lo, months), emi(principal.hi, annualPercent.hi, months));

export const principalFromEmiRange = (
  instalment: Interval,
  annualPercent: Interval,
  months: number,
): Interval =>
  iv(
    principalFromEmi(instalment.lo, annualPercent.hi, months),
    principalFromEmi(instalment.hi, annualPercent.lo, months),
  );

/**
 * EMI range where the amount was itself derived from the rate.
 *
 * `principalFromEmiRange` crosses its ends — the largest loan comes from the
 * lowest rate — so amount and rate are inversely correlated afterwards. Pairing
 * the largest amount with the highest rate would price a combination that cannot
 * occur and overstate the instalment. This pairs each end with the rate it came
 * from.
 */
export const emiRangeCorrelated = (
  principal: Interval,
  annualPercent: Interval,
  months: number,
): Interval =>
  iv(
    emi(principal.lo, annualPercent.hi, months),
    emi(principal.hi, annualPercent.lo, months),
  );

export const aprRange = (
  principal: Interval,
  annualPercent: Interval,
  months: number,
  feePercent: Interval,
): Interval =>
  iv(
    apr(principal.lo, annualPercent.lo, months, feePercent.lo),
    apr(principal.hi, annualPercent.hi, months, feePercent.hi),
  );

/** A percentage of a quantity, e.g. an FOIR ceiling applied to income. */
export const percentOf = (x: Interval, percent: Interval): Interval =>
  mul(x, div(percent, point(100)));

/** Tenure options offered to the borrower, in months. */
export const TENURE_CHOICES_MONTHS = [36, 60, 84] as const;
