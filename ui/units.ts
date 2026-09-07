/**
 * What each trace value actually means.
 *
 * The trace carries numbers without units — a deliberate choice in the engine,
 * where everything is an `Interval` and the rules know what they are working in.
 * On screen that is not enough: an FOIR ceiling of 0.4, a credit premium of 4
 * rate points and a household spend of ₹19,500 are all bare numbers, and
 * rendering them all as rupees produced "their ceiling ₹0 to ₹500" for a ratio
 * and would have shown a 4-point rate premium as ₹4.
 *
 * Guessing from the rule id was tried and is not good enough: `stress.outflow`
 * emits an already-multiplied percentage while `affordability.safe-outflow`
 * emits a ratio, and no naming convention separates them. So the mapping is
 * written out. It is presentation, so it lives here rather than in the rules —
 * but it is a table, not a heuristic, and anything missing falls back to money,
 * which is what the overwhelming majority of these values are.
 */

import { money, perMonth, rate as rateText, rupees, share } from '../engine/format';
import type { Interval } from '../engine/interval';
import type { TraceValue } from '../engine/trace';

export type Unit =
  /** Rupees. The default. */
  | 'money'
  /** An annual percentage, e.g. a rate band. */
  | 'percent'
  /** Points added to or taken off a rate, e.g. a credit premium. */
  | 'points'
  /** A fraction in 0..1 that should read as a percentage. */
  | 'ratio'
  /** A share already multiplied out, e.g. 53.4 meaning 53%. */
  | 'percentAlready'
  /** A bare count — a credit score, a number of people, a number of years. */
  | 'plain';

/** Units for rule outputs, keyed by rule id. Anything absent is money. */
const OUTPUT_UNITS: Readonly<Record<string, Unit>> = {
  'credit.never-borrowed': 'points',
  'credit.recent-bounce': 'points',
  'credit.score-premium': 'points',
  'credit.unknown-score': 'points',
  'stability.employer': 'points',
  'stability.years-in-work': 'points',
  'stability.not-stated': 'points',
  'pricing.rate-band': 'percent',
  'pricing.apr': 'percent',
  'products.routing.alternative': 'percent',
  'stress.outflow': 'percentAlready',
};

/** Units for named inputs, keyed by `rule::input name`. */
const INPUT_UNITS: Readonly<Record<string, Unit>> = {
  'affordability.lender-foir::their ceiling': 'ratio',
  'affordability.safe-outflow::ceiling': 'ratio',
  'affordability.stress-headroom::ceiling then': 'ratio',
  'affordability.stress-headroom::months you have put by': 'plain',
  'stress.outflow::ceiling': 'ratio',
  'income.productive-earnings::counted': 'ratio',
  'income.recognised.co-applicant::share counted': 'ratio',
  'credit.recent-bounce::adds': 'points',
  'credit.score-premium::your score': 'plain',
  'credit.unknown-score::assumed range': 'plain',
  'expenses.default::people in the household': 'plain',
  'stability.years-in-work::years': 'plain',
  'pricing.rate-band::added for your credit standing': 'points',
  'pricing.rate-band::adjusted for how steady your income is': 'points',
  'pricing.rate-band::base band for this product': 'percent',
  'pricing.rate-band::spread between lenders': 'points',
  'pricing.apr::processing fee': 'percent',
  'pricing.apr::quoted rate': 'percent',
};

/** Rules whose output is an instalment rather than a lump sum. */
const PER_MONTH = new Set(['affordability.safe-outflow', 'affordability.lender-headroom']);

export const unitForOutput = (rule: string): Unit => OUTPUT_UNITS[rule] ?? 'money';

export const unitForInput = (rule: string, key: string): Unit =>
  INPUT_UNITS[`${rule}::${key}`] ?? 'money';

const isInterval = (v: TraceValue): v is Interval =>
  typeof v === 'object' && v !== null && 'lo' in v && 'hi' in v;

const pts = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return r > 0 ? `+${r}` : String(r);
};

/** Render a trace value in the unit it is actually in. */
export function renderValue(v: TraceValue, unit: Unit, rule?: string): string {
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v;

  if (typeof v === 'number') {
    switch (unit) {
      case 'percent':
        return `${Math.round(v * 100) / 100}%`;
      case 'points':
        return `${pts(v)} points`;
      case 'ratio':
        return `${Math.round(v * 100)}%`;
      case 'percentAlready':
        return `${Math.round(v)}%`;
      case 'plain':
        return String(Math.round(v * 100) / 100);
      default:
        return rupees(v);
    }
  }

  if (isInterval(v)) {
    switch (unit) {
      case 'percent':
        return rateText(v);
      case 'points':
        return v.lo === v.hi ? `${pts(v.lo)} points` : `${pts(v.lo)} to ${pts(v.hi)} points`;
      case 'ratio':
        return share(v);
      case 'percentAlready':
        return v.lo === v.hi
          ? `${Math.round(v.lo)}%`
          : `${Math.round(v.lo)}% to ${Math.round(v.hi)}%`;
      case 'plain':
        return v.lo === v.hi ? String(v.lo) : `${v.lo} to ${v.hi}`;
      default:
        return rule !== undefined && PER_MONTH.has(rule) ? perMonth(v) : money(v);
    }
  }

  return String(v);
}
