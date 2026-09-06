/**
 * The verdict.
 *
 * Most tools that compare loans cannot say "don't". They earn on the click, so
 * the worst answer they give is a longer list. This one says it, and the whole
 * value of saying it rests on saying it for a reason the borrower can check and
 * act on — so every branch below carries its own sentence, and the "don't"
 * branches carry the thing to do next.
 */

import type { Answers } from '../answers';
import type { Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, type Rule } from './table';

export type VerdictKind = 'borrow' | 'borrow-less' | 'dont' | 'need-more-info';

export interface Verdict {
  readonly kind: VerdictKind;
  /** One sentence, in the borrower's terms. */
  readonly headline: string;
  /** Why this and not the neighbouring verdict. */
  readonly why: string;
  /** The single most useful thing to do next. */
  readonly nextStep?: string;
}

export const borrowLessThreshold = register<Rule<number>>({
  id: 'verdict.borrow-less-threshold',
  what: 'How far below the ask the safe amount must fall before we say borrow less',
  value: 0.8,
  why: 'A safe amount within a fifth of what you asked for is close enough to negotiate or trim. Further below that, the gap is the story.',
  source: judgement('A round line; the exact figure matters less than having one and stating it.'),
});

export const obligationDangerLine = register<Rule<number>>({
  id: 'verdict.obligation-danger-line',
  what: 'Share of planning income already committed to loans at which we say stop',
  value: 0.5,
  why: 'With more than half your income already going to instalments before this loan, another one does not solve the problem — it postpones it and makes it larger.',
  source: judgement('Sits above every lender ceiling used here, so it only fires when things are genuinely bad.'),
});

export interface VerdictInputs {
  readonly answers: Answers;
  readonly safeAmount: Interval;
  readonly lenderAmount: Interval;
  readonly surplus: Interval;
  readonly planning: Interval;
  readonly existingEmis: number;
  readonly recentBounce: boolean;
  readonly unsecuredLikelyDeclined: boolean;
  readonly securedAvailable: boolean;
  readonly productive: boolean;
  readonly informalIncome: boolean;
  readonly hasAppLoans: boolean;
  readonly stressBreaches: boolean;
  /** Whether stated earnings from the purchase cover the instalment. */
  readonly paysForItself: boolean | undefined;
}

/**
 * Decide. The "don't" tests run first and in order of how loud the signal is,
 * because any one of them is enough on its own — a borrower with a bounce last
 * month does not need the arithmetic finished before being told to wait.
 */
export function decide(input: VerdictInputs, log: TraceLog): Verdict {
  const asked = input.answers.amountAsked;

  // A loan ending soon is the most concrete thing a borrower can be told: wait
  // this many months and the whole instalment comes back to you.
  const monthsLeft = input.answers.existingEmiMonthsLeft;
  const waitingIsWorthIt =
    monthsLeft !== undefined && monthsLeft > 0 && monthsLeft <= 30 && input.existingEmis > 0;
  const waitingNote = waitingIsWorthIt
    ? ` Your existing loan has ${monthsLeft} months left. When it ends, the ₹${input.existingEmis.toLocaleString('en-IN')} you pay each month comes back to you, and that alone changes this answer.`
    : '';

  // A loan that earns more than it costs is a different proposition, and it is
  // the strongest argument for borrowing that exists.
  const earnsNote =
    input.paysForItself === true
      ? ' What you expect this to earn covers the instalment, so it largely pays for itself.'
      : input.paysForItself === false
        ? ' What you expect this to earn does not cover the instalment, so the difference comes out of the rest of your income every month.'
        : '';
  const emit = (v: Verdict): Verdict => {
    log.record({
      rule: `verdict.${v.kind}`,
      label: 'The answer',
      inputs: {
        'you asked for': asked,
        'safe for you': input.safeAmount,
        'a lender would offer': input.lenderAmount,
      },
      output: v.kind,
      why: v.why,
    });
    return v;
  };

  if (input.planning.hi <= 0) {
    return emit({
      kind: 'need-more-info',
      headline: 'Tell us what you earn and we can answer this properly.',
      why: 'Without an income figure, every number here would be invented.',
      nextStep: 'Add your monthly income, even as a rough range.',
    });
  }

  // 1. A recent bounce. The loudest signal there is.
  if (input.recentBounce) {
    // Name every reason that is actually present, not just the first one. A
    // borrower told only about the bounce will fix the bounce and come back to
    // the same answer, because the app loans were the real problem.
    const alsoAppLoans = input.hasAppLoans
      ? ' You are also carrying app loans, which are the dearest money in the market and the reason the rest of the month does not stretch.'
      : '';
    const alsoNegative = input.surplus.hi <= 0
      ? ' On top of that, nothing is left at the end of the month even before a new instalment.'
      : '';
    return emit({
      kind: 'dont',
      headline: 'Not right now — clear what you have first.',
      why: `A payment bounced in the last six months. Lenders who see that will decline or price it steeply, and taking on another instalment while one is already slipping is how a difficult month becomes a difficult year.${alsoAppLoans}${alsoNegative}`,
      nextStep:
        (input.hasAppLoans
          ? 'Clear the app loans first, highest rate first — that frees the most per month. Three clean months after that changes this answer materially.'
          : 'Three months of every payment landing on time changes this materially, and costs you nothing but the wait.') +
        waitingNote,
    });
  }

  // 2. Already carrying more than half of income in instalments.
  const committedShare = input.existingEmis / Math.max(input.planning.lo, 1);
  if (committedShare > obligationDangerLine.value) {
    return emit({
      kind: 'dont',
      headline: 'Your existing loans are the problem to solve first.',
      why: `More than half of what you earn in a slow month already goes to instalments. ${obligationDangerLine.why}`,
      nextStep:
        'Clear the dearest loan first. Every rupee off that instalment does more for you than a new loan would.' +
        waitingNote,
    });
  }

  // 3. Nothing left over, so the instalment would have to come from somewhere
  // that does not exist.
  if (input.surplus.hi <= 0) {
    return emit({
      kind: 'dont',
      headline: 'There is nothing left each month for an instalment.',
      why: 'After rent, the loans you already have and what the household spends, no money remains. A new instalment would have to be met by borrowing again.',
      nextStep: 'Look at the biggest of those four numbers first — that is where the room is.',
    });
  }

  // 4. Income that cannot be evidenced, nothing to pledge, and the money is not
  // going to earn. Formal lending is not built for this and app lenders will
  // fill the gap at a price that makes things worse.
  if (input.informalIncome && !input.securedAvailable && !input.productive) {
    return emit({
      kind: 'dont',
      headline: 'A loan is the wrong tool for this right now.',
      why:
        'Your income cannot be evidenced, there is nothing to pledge, and the money would not earn anything back. Every lender who says yes on those terms will charge a rate that makes the problem worse.' +
        earnsNote,
      nextStep:
        'If this is for something that would earn — stock, a vehicle you work with — say so, because that changes the answer.',
    });
  }

  if (input.safeAmount.hi <= 0) {
    return emit({
      kind: 'dont',
      headline: 'Nothing you could take on now would be safe.',
      why: 'Every one of the three affordability tests comes out at zero: the outflow ceiling, what is left over, and what happens after a bad month.',
      nextStep: 'The path-to-yes options below show what would have to change, and by how much.',
    });
  }

  // 5. Affordable, but well short of the ask.
  if (asked !== undefined && asked > 0 && input.safeAmount.hi < asked * borrowLessThreshold.value) {
    const stressNote = input.stressBreaches
      ? ' The binding constraint is what happens after a bad month, not today.'
      : '';
    return emit({
      kind: 'borrow-less',
      headline: 'You can borrow, but less than you asked for.',
      why: `A lender will likely say yes to the full amount. What you can carry without the plan getting fragile is smaller, because your rent counts against you even though lenders leave it out.${stressNote}${earnsNote}`,
      nextStep:
        'Either trim the amount to the safe figure, or change one of the things below and come back to it.' +
        waitingNote,
    });
  }

  return emit({
    kind: 'borrow',
    headline: 'This works, on the terms below.',
    why:
      'The amount fits under all three affordability tests and still holds after a bad month.' +
      earnsNote,
    nextStep: 'Take the card below to the lender and hold them to the rate band on it.',
  });
}
