/**
 * The outputs a question can claim to move.
 *
 * Questions declare which of these they affect, and a test checks the claim
 * against the real engine. That check only works if there is one agreed list of
 * outputs and one agreed way to read each of them off a result — which is what
 * this file is.
 */

import type { Result } from './compute';
import { point, width, type Interval } from './interval';

export const OUTPUT_IDS = [
  'O1.verdict',
  'O2.lender',
  'O2.safe',
  'O3.rate',
  'O3.apr',
  'O4.emi',
  'O4.stress',
] as const;

export type OutputId = (typeof OUTPUT_IDS)[number];

export const OUTPUT_LABELS: Record<OutputId, string> = {
  'O1.verdict': 'whether to borrow at all',
  'O2.lender': 'what a lender will sanction',
  'O2.safe': 'what you can safely carry',
  'O3.rate': 'your rate band',
  'O3.apr': 'the all-in rate',
  'O4.emi': 'your instalment ceiling',
  'O4.stress': 'how it holds up after a bad month',
};

/**
 * O1 is a decision *and* the sentence that justifies it — the brief asks for "a
 * verdict with a reason", and a borrower who is told something different about
 * why has been given a different answer even when the word is the same. So the
 * text counts as part of the output, and a question that only changes the
 * reasoning has still moved something real.
 */
export const verdictText = (result: Result): string =>
  `${result.verdict.kind}|${result.verdict.why}|${result.verdict.nextStep ?? ''}`;

/**
 * Read one output as a range. The verdict is not a number, so it is projected
 * onto an index — enough to detect a change of decision. Its wording is compared
 * separately, in `compareOutputs`.
 */
export function readOutput(result: Result, id: OutputId): Interval {
  switch (id) {
    case 'O1.verdict': {
      const order = ['dont', 'borrow-less', 'borrow', 'need-more-info'];
      return point(order.indexOf(result.verdict.kind));
    }
    case 'O2.lender':
      return result.amounts.lender;
    case 'O2.safe':
      // The affordability figure, not the recommendation. A question that
      // improves affordability under a "don't" has still moved something real,
      // and the toggles depend on being able to see it.
      return result.amounts.safeOnAffordabilityAlone;
    case 'O3.rate':
      return result.pricing?.rateBand ?? point(0);
    case 'O3.apr':
      return result.pricing?.aprBand ?? point(0);
    case 'O4.emi':
      return result.repayment?.emiCeiling ?? point(0);
    case 'O4.stress':
      return result.repayment?.outflowRatioStressed ?? point(0);
  }
}

/** Everything that changed between two results, and by how much. */
export interface OutputChange {
  readonly id: OutputId;
  /** How far the middle of the range moved, relative to its own size. */
  readonly shifted: number;
  /** How much narrower the range became. Negative means it widened. */
  readonly narrowed: number;
}

const relative = (delta: number, scale: number): number =>
  scale > 0 ? Math.abs(delta) / scale : Math.abs(delta) > 0 ? 1 : 0;

export function compareOutputs(before: Result, after: Result): OutputChange[] {
  return OUTPUT_IDS.map((id) => {
    const a = readOutput(before, id);
    const b = readOutput(after, id);
    const scale = Math.max(Math.abs(a.lo), Math.abs(a.hi), 1);
    const midBefore = (a.lo + a.hi) / 2;
    const midAfter = (b.lo + b.hi) / 2;
    const shifted =
      id === 'O1.verdict' && verdictText(before) !== verdictText(after)
        ? 1
        : relative(midAfter - midBefore, scale);
    return {
      id,
      shifted,
      narrowed: (width(a) - width(b)) / scale,
    };
  });
}

/**
 * The parts of an answer that are words rather than numbers.
 *
 * Choosing a purpose picks the product; saying how you earn decides whether we
 * plan on your good month or your slow one. Both are real changes a borrower
 * should see, and both happen before there is any income figure for a number to
 * move — so a banner that only watches numbers reports "nothing changed" on the
 * two questions that set up everything else.
 */
export interface StateFacts {
  readonly product: string | undefined;
  readonly incomeBasis: string | undefined;
}

export function readFacts(result: Result): StateFacts {
  return {
    product: result.routing?.product.name,
    incomeBasis: (result.trace.find((e) => e.rule === 'income.planning')?.inputs['basis'] ??
      result.trace.find((e) => e.rule === 'income.basis')?.output) as string | undefined,
  };
}

/** Plain sentences for the facts that changed between two results. */
export function factsChanged(before: Result, after: Result): string[] {
  const a = readFacts(before);
  const b = readFacts(after);
  const out: string[] = [];
  if (b.product !== undefined && a.product !== b.product) {
    out.push(
      a.product === undefined
        ? `the loan you should be asking for: ${b.product}`
        : `the loan you should be asking for: ${a.product} → ${b.product}`,
    );
  }
  if (b.incomeBasis !== undefined && a.incomeBasis !== b.incomeBasis) {
    out.push(`what we budget against: ${b.incomeBasis}`);
  }
  return out;
}

/** Whether an output moved enough to be worth a borrower's attention. */
export const MATERIAL = 0.01;

export const movedMaterially = (change: OutputChange): boolean =>
  change.shifted > MATERIAL || Math.abs(change.narrowed) > MATERIAL;
