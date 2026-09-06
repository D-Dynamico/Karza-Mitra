/**
 * Rule tables are data.
 *
 * Every rule value in this engine is a row carrying its own justification and
 * provenance. The types make that mandatory: a row without a `why` or a `source`
 * does not compile. That is what lets `RULES.md` be generated from the same
 * tables the engine reads, so the document cannot drift from the behaviour, and
 * what makes changing a ceiling during a conversation a one-line edit.
 */

import type { Interval } from '../interval';

/**
 * Where a number came from. "My judgement" is a legitimate answer and is stated
 * as such — the dishonest option is an invented citation, not an admitted guess.
 */
export type Source =
  | { readonly kind: 'judgement'; readonly note: string }
  | {
      readonly kind: 'market' | 'regulation' | 'reference';
      readonly cite: string;
      /** ISO date the citation was last checked. Goes into RULES.md. */
      readonly checked: string;
    };

export const judgement = (note: string): Source => ({ kind: 'judgement', note });

/** One rule: a value, why it is that value, and where it came from. */
export interface Rule<T> {
  readonly id: string;
  readonly what: string;
  readonly value: T;
  readonly why: string;
  readonly source: Source;
}

/** A band keyed by a threshold, e.g. FOIR ceilings by income. */
export interface Tier<T> {
  /** Applies when the keyed quantity is below this. Use Infinity for the top tier. */
  readonly upTo: number;
  readonly value: T;
  readonly why: string;
}

export interface TieredRule<T> {
  readonly id: string;
  readonly what: string;
  readonly keyedOn: string;
  readonly tiers: readonly Tier<T>[];
  readonly source: Source;
}

/**
 * Pick the tier a value falls in. Tiers must be listed in ascending order of
 * `upTo`; the last one is the catch-all, so a lookup can never fall through.
 */
export function tierFor<T>(rule: TieredRule<T>, key: number): Tier<T> {
  const found = rule.tiers.find((t) => key < t.upTo);
  const last = rule.tiers[rule.tiers.length - 1];
  if (!found && !last) {
    throw new Error(`Tiered rule ${rule.id} has no tiers`);
  }
  return found ?? last!;
}

/**
 * A tier lookup over an interval. When the interval straddles a boundary the
 * borrower could genuinely be in either tier, so the result spans both rather
 * than picking one and pretending.
 */
export function tiersAcross<T>(rule: TieredRule<T>, key: Interval): readonly Tier<T>[] {
  const spanned = rule.tiers.filter((t, i) => {
    const floor = i === 0 ? -Infinity : rule.tiers[i - 1]!.upTo;
    return key.hi >= floor && key.lo < t.upTo;
  });
  return spanned.length > 0 ? spanned : [tierFor(rule, key.lo)];
}

/**
 * Everything registered here is walked by `scripts/gen-rules-md.ts`. A rule that
 * is not registered will not appear in RULES.md, which is the one way the
 * document and the code can still fall out of step — so register on definition.
 */
const registry: Array<Rule<unknown> | TieredRule<unknown>> = [];

export function register<T extends Rule<unknown> | TieredRule<unknown>>(rule: T): T {
  registry.push(rule);
  return rule;
}

export const allRules = (): readonly (Rule<unknown> | TieredRule<unknown>)[] => registry;

/**
 * How wide an answer may be before we stop calling it confident. Stated as a
 * rule because it is a judgement about what counts as a useful answer, not a
 * display detail: a two-point rate band is worth acting on, a nine-point one is
 * not.
 */
export const confidenceThresholds = register<Rule<{
  highRatePoints: number;
  highAmountShare: number;
  mediumRatePoints: number;
  mediumAmountShare: number;
}>>({
  id: 'confidence.thresholds',
  what: 'Range widths at which an answer counts as high or medium confidence',
  value: {
    highRatePoints: 1.5,
    highAmountShare: 0.25,
    mediumRatePoints: 3.5,
    mediumAmountShare: 0.6,
  },
  why: 'Confidence describes how narrow the answer is, not how many questions were asked. Answering ten questions that change nothing should not make anyone feel more certain.',
  source: judgement('My own lines for what is narrow enough to act on.'),
});
