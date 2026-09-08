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
import { judgement, register, type Rule } from './rules/table';
import type { VerdictKind } from './rules/verdict';

/**
 * The most options the search will combine over. Well above what any real
 * borrower triggers, and it keeps the pair-and-triple walk bounded rather than
 * growing with every option added later.
 */
const MAX_OPTIONS_CONSIDERED = 8;

/**
 * The second income assumed when showing what a household earner would change.
 *
 * This is the one figure on this screen the borrower did not supply, and it was
 * a bare literal until it was caught being ranked first for a borrower who had
 * just answered "nobody else earns". It is a rule now, so it appears in
 * RULES.md and can be argued with, and the option's label prints it.
 */
export const assumedCoApplicantIncome = register<Rule<number>>({
  id: 'path.assumed-co-applicant-income',
  what: 'Second household income assumed when showing what another earner would change',
  value: 15000,
  why: 'A figure has to be picked to show what a second income is worth at all, and this is roughly what part-time or entry-level work pays in the cities these borrowers live in. It is an illustration, not a prediction — which is why the amount is printed in the option itself rather than hidden inside the arithmetic.',
  source: judgement('My own round figure, chosen to be modest rather than flattering.'),
});

export interface Option {
  readonly id: string;
  /** What the borrower would do, in their words. */
  readonly label: string;
  /** Whether this needs an action today or only time. */
  readonly kind: 'do today' | 'takes time' | 'if it is true';
  readonly change: Partial<Answers>;
  /** Only offered when it could apply to this borrower. */
  readonly applies: (a: Answers) => boolean;
  /**
   * True when the option supplies a number the borrower never gave. Such an
   * option is still worth showing — a second wage really is a way out — but it
   * must not outrank something the borrower can act on today, because its size
   * is our choice rather than their situation.
   */
  readonly assumesAnInput?: boolean;
  /**
   * What this option takes for granted, in the borrower's words, shown beside
   * it. Set wherever the arithmetic leans on something they were never asked.
   */
  readonly assumes?: string;
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
    // The engine knows one instalment total, not which part of it is the app
    // loans, so clearing them here clears the lot. For a borrower whose other
    // debt is a bank loan that keeps running, this figure is too high. Saying
    // so is the honest half of a fix that otherwise needs a second question.
    id: 'clear-app-loans',
    label: 'You clear the app loans',
    kind: 'do today',
    change: { appOrBnplLoans: false, existingEmis: 0 },
    applies: (a) => a.appOrBnplLoans === true,
    assumes:
      'the whole of what you pay each month is app loans — if some of it is a bank loan that carries on, the gain is smaller',
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
    label: `If someone else in the household earned ₹${assumedCoApplicantIncome.value.toLocaleString('en-IN')} a month`,
    kind: 'if it is true',
    change: { coApplicantIncome: assumedCoApplicantIncome.value, coApplicantPooled: true },
    applies: (a) => (a.coApplicantIncome ?? 0) === 0,
    assumesAnInput: true,
    assumes: 'nobody in the household earns today, so the figure is ours rather than yours',
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

  // Sorting on the delta alone put "if someone else earned ₹15,000" above "clear
  // the app loans" for Anita — our own assumption ranked ahead of the one thing
  // she could do this week, on the strength of a figure she had just told us was
  // zero. So an option carrying an invented number sits below anything that
  // actually moves the arithmetic, and above the ones that move nothing: it is
  // still a real way out, it is just not evidence.
  const tier = (r: OptionResult): number => {
    if (r.unlocks) return 0;
    if (r.option.assumesAnInput === true) return 2;
    return r.delta > 0 ? 1 : 3;
  };

  return results.sort((a, b) => tier(a) - tier(b) || b.delta - a.delta).slice(0, limit);
}

export interface Combination {
  readonly options: readonly Option[];
  readonly verdict: VerdictKind;
  readonly headline: string;
  readonly safeAmount: Result['amounts']['safe'];
  /** How far the unlocked amount still falls short of the ask, if it does. */
  readonly stillShortBy: number;
  /** Ways to close that gap that are not more borrowing. */
  readonly waysToCloseTheGap: readonly string[];
}

/**
 * Ways to close a gap that do not involve borrowing more.
 *
 * A combination that unlocks ₹1 lakh against a ₹1.5 lakh scooter reads as "still
 * not enough" unless the last fifty thousand is accounted for. It usually can
 * be, and none of the ways involve a bigger loan.
 */
export const gapClosers = register<Rule<Record<string, readonly string[]>>>({
  id: 'path.gap-closers',
  what: 'Ways to bridge a shortfall without borrowing more',
  value: {
    vehicle: [
      'Put down the difference yourself. Platform finance partners commonly expect 15 to 25% up front, and the loan is cheaper for it.',
      'Check the subsidy on the sticker price before you agree a figure — electric two-wheelers carry central and state support that is applied at the dealer.',
      'A model one step down, or a good used one, closes most gaps this size on its own.',
    ],
    'business-stock': [
      'Buy the stock in two rounds rather than one, and let the first round pay for the second.',
      'Ask your supplier for credit terms. Thirty days from a supplier costs nothing and is the cheapest working capital there is.',
    ],
    wedding: [
      'The date can move in a way an EMI cannot. A few months of saving closes a gap this size with no lender involved.',
    ],
    medical: [
      'Ask the hospital about paying in parts, and check any scheme you are covered by, before you borrow.',
    ],
  },
  why: 'A shortfall is not automatically a reason to borrow more. Putting part down, taking a subsidy, or buying in stages closes most gaps at a lower cost than the extra lending would.',
  source: judgement('Practical options rather than lending rules. The subsidy point is specific to electric two-wheelers.'),
});

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
  const applicable = options.filter((o) => o.applies(answers)).slice(0, MAX_OPTIONS_CONSIDERED);
  const asked = answers.amountAsked ?? 0;
  const closers = gapClosers.value[answers.purpose ?? ''] ?? [];

  const tryThese = (chosen: Option[]): Combination | undefined => {
    let merged: Answers = { ...answers };
    for (const o of chosen) merged = { ...merged, ...changeFor(o, answers) };
    const r = compute(merged);
    if (r.verdict.kind !== 'borrow' && r.verdict.kind !== 'borrow-less') return undefined;
    const short = Math.max(0, asked - r.amounts.safe.hi);
    return {
      options: chosen,
      verdict: r.verdict.kind,
      headline: r.verdict.headline,
      safeAmount: r.amounts.safe,
      stillShortBy: short,
      waysToCloseTheGap: short > 0 ? closers : [],
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
