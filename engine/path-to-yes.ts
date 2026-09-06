/**
 * What would have to change.
 *
 * A "don't" that stops at "don't" is only half an answer. The borrower still
 * needs the money; refusing to help them think about it just sends them to the
 * app lender who will say yes. So every refusal comes with the same question
 * answered honestly: what would actually change this, and by how much?
 *
 * Because the engine is pure, each option is one more `compute` with one answer
 * altered. There is no separate model of what-if to keep in step with the rules
 * — the toggles are the rules, run again.
 *
 * The options that make things *worse*, or change nothing, are shown too when
 * they were worth checking. "Even counting what the scooter would earn, the
 * answer is still no" is a far stronger refusal than one that never looked.
 */

import type { Answers } from './answers';
import { compute, type Result } from './compute';
import type { VerdictKind } from './rules/verdict';

export interface Option {
  readonly id: string;
  /** What the borrower would do, in their words. */
  readonly label: string;
  /** Whether this needs an action today or only time. */
  readonly kind: 'do today' | 'takes time' | 'if it is true';
  readonly change: Partial<Answers>;
  /** Only offered when it could apply to this borrower. */
  readonly applies: (a: Answers) => boolean;
}

export interface OptionResult {
  readonly option: Option;
  readonly verdict: VerdictKind;
  readonly headline: string;
  readonly safeAmount: Result['amounts']['safe'];
  /** How much the affordable amount moved, in rupees. Negative means worse. */
  readonly delta: number;
  /** True when this alone turns the answer into a yes of some kind. */
  readonly unlocks: boolean;
}

const has = (a: Answers, k: keyof Answers): boolean => a[k] !== undefined;

export const options: readonly Option[] = [
  {
    id: 'clear-app-loans',
    label: 'You clear the app loans',
    kind: 'do today',
    change: { appOrBnplLoans: false, appLoanOutstanding: 0, existingEmis: 0 },
    applies: (a) => a.appOrBnplLoans === true,
  },
  {
    id: 'three-clean-months',
    label: 'Three months with every payment on time',
    kind: 'takes time',
    change: { bouncedInLast6Months: false },
    applies: (a) => a.bouncedInLast6Months === true,
  },
  {
    id: 'existing-loan-ends',
    label: 'Your current loan finishes',
    kind: 'takes time',
    change: { existingEmis: 0, existingEmiMonthsLeft: 0 },
    applies: (a) => (a.existingEmis ?? 0) > 0 && a.appOrBnplLoans !== true,
  },
  {
    id: 'count-the-earnings',
    label: 'Counting what it would earn you',
    kind: 'if it is true',
    change: {},
    applies: (a) => has(a, 'expectedMonthlyEarnings'),
  },
  {
    id: 'co-applicant',
    label: 'Someone else in the household earns again',
    kind: 'takes time',
    change: { coApplicantIncome: 15000, coApplicantPooled: true },
    applies: (a) => (a.coApplicantIncome ?? 0) === 0,
  },
  {
    id: 'ask-for-less',
    label: 'You ask for half as much',
    kind: 'do today',
    change: {},
    applies: (a) => (a.amountAsked ?? 0) > 0,
  },
  {
    id: 'evidence-income',
    label: 'You can evidence your income — bank statements, a filed return',
    kind: 'takes time',
    change: { incomeType: 'self-employed-itr' },
    applies: (a) => a.incomeType === 'informal' || a.incomeType === 'self-employed-cash',
  },
];

/** Resolve the options that need a value from the borrower's own answers. */
function changeFor(option: Option, answers: Answers): Partial<Answers> {
  if (option.id === 'ask-for-less') {
    return { amountAsked: Math.round((answers.amountAsked ?? 0) / 2) };
  }
  if (option.id === 'count-the-earnings') {
    // The earnings are already in the answers; this option exists to show the
    // borrower what they are worth by taking them away.
    return {};
  }
  return option.change;
}

/**
 * Run every option that applies and report what each would do, best first.
 *
 * `count-the-earnings` is handled in reverse: the baseline already counts the
 * expected earnings, so its counterfactual is the answer *without* them. That is
 * how a borrower sees what the uplift is worth rather than being told it was
 * included somewhere.
 */
export function pathToYes(answers: Answers, limit = 5): OptionResult[] {
  const baseline = compute(answers);
  const base = baseline.amounts.safeOnAffordabilityAlone.hi;

  const results = options
    .filter((o) => o.applies(answers))
    .map((option): OptionResult => {
      const without: Answers =
        option.id === 'count-the-earnings'
          ? { ...answers, expectedMonthlyEarnings: undefined }
          : { ...answers, ...changeFor(option, answers) };

      const r = compute(option.id === 'count-the-earnings' ? answers : without);
      const comparedTo =
        option.id === 'count-the-earnings' ? compute(without).amounts.safeOnAffordabilityAlone.hi : base;

      return {
        option,
        verdict: r.verdict.kind,
        headline: r.verdict.headline,
        safeAmount: r.amounts.safe,
        delta: r.amounts.safeOnAffordabilityAlone.hi - comparedTo,
        unlocks: r.verdict.kind === 'borrow' || r.verdict.kind === 'borrow-less',
      };
    });

  return results
    .sort((a, b) => Number(b.unlocks) - Number(a.unlocks) || b.delta - a.delta)
    .slice(0, limit);
}

export interface Combination {
  readonly options: readonly Option[];
  readonly verdict: VerdictKind;
  readonly headline: string;
  readonly safeAmount: Result['amounts']['safe'];
}

/**
 * The smallest set of changes that actually gets to a yes.
 *
 * Single toggles are not always enough, and pretending otherwise is its own kind
 * of dishonesty. Clearing app loans does not erase a bounce from the record, and
 * three clean months do not help while the app loans are still eating the month
 * — but the two together do. A borrower told only that each one alone fails will
 * conclude nothing works, which is both wrong and the point at which they stop
 * reading and take the loan anyway.
 *
 * Pairs, then triples. Nothing larger: a plan with four simultaneous conditions
 * is not a plan.
 */
export function smallestUnlockingCombination(answers: Answers): Combination | undefined {
  const applicable = options.filter((o) => o.applies(answers));

  const tryThese = (chosen: Option[]): Combination | undefined => {
    let merged: Answers = { ...answers };
    for (const o of chosen) merged = { ...merged, ...changeFor(o, answers) };
    const r = compute(merged);
    if (r.verdict.kind !== 'borrow' && r.verdict.kind !== 'borrow-less') return undefined;
    return {
      options: chosen,
      verdict: r.verdict.kind,
      headline: r.verdict.headline,
      safeAmount: r.amounts.safe,
    };
  };

  for (let size = 2; size <= 3; size += 1) {
    const found: Combination[] = [];
    const walk = (start: number, chosen: Option[]): void => {
      if (chosen.length === size) {
        const c = tryThese(chosen);
        if (c) found.push(c);
        return;
      }
      for (let i = start; i < applicable.length; i += 1) walk(i + 1, [...chosen, applicable[i]!]);
    };
    walk(0, []);
    if (found.length > 0) {
      // Prefer the combination that needs the least waiting.
      found.sort(
        (a, b) =>
          a.options.filter((o) => o.kind === 'takes time').length -
          b.options.filter((o) => o.kind === 'takes time').length,
      );
      return found[0];
    }
  }
  return undefined;
}

/**
 * True when nothing on offer changes the answer. Worth saying plainly rather
 * than showing a list of things that all fail — and it is the strongest possible
 * form of a refusal.
 */
export const nothingUnlocksIt = (results: readonly OptionResult[]): boolean =>
  results.length > 0 && results.every((r) => !r.unlocks);
