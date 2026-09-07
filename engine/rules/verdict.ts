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
import { money, rupees } from '../format';
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
  /** Whether the borrower actually pays rent or a home loan. */
  readonly rentCounted: boolean;
  /**
   * True when the asset being pledged, not income, is what holds both numbers
   * down. Without this the "borrow less" copy blames income in a case where
   * income was never the constraint.
   */
  readonly collateralBindsBoth: boolean;
  /**
   * The verdict this borrower would get with the existing instalment gone.
   * Undefined when there was nothing to clear. It is the engine re-run on a
   * changed answer, not a guess — see the note on `waitingNote` below.
   */
  readonly verdictIfExistingEmisCleared: VerdictKind | undefined;
  /** Whether stated earnings from the purchase cover the instalment. */
  readonly paysForItself: boolean | undefined;
  /** The smallest loan this product is actually written for. */
  readonly minTicket: number;
  readonly productName: string;
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
  // The old version of this sentence ended "and that alone changes this answer"
  // unconditionally, having never checked. For a borrower capped by collateral
  // it is simply false: the instalment comes back and the verdict does not move.
  // `clearingExistingEmisChangesVerdict` is the same change actually run through
  // the engine, so the claim is only made when it holds.
  const freed = ` Your existing loan has ${monthsLeft} months left. When it ends, the ₹${input.existingEmis.toLocaleString('en-IN')} you pay each month comes back to you`;
  const waitingNote = (kind: VerdictKind): string => {
    if (!waitingIsWorthIt) return '';
    const then = input.verdictIfExistingEmisCleared;
    if (then === undefined) return `${freed}.`;
    return then !== kind
      ? `${freed}, and that alone changes this answer.`
      : `${freed} — though on its own that does not change this answer, so it is worth doing for its own sake rather than as a route to this loan.`;
  };

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
        waitingNote('dont'),
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
        waitingNote('dont'),
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

  // 5. Affordable in principle, but only for an amount nobody lends.
  //
  // Without this the engine says "borrow less" and quotes a few thousand rupees,
  // as though a ₹3,000 two-wheeler loan were a thing you could walk in and ask
  // for. It is not a smaller version of the loan; it is no loan. Saying so is
  // both more honest and more useful than a number that cannot be acted on.
  if (input.safeAmount.hi < input.minTicket) {
    return emit({
      kind: 'dont',
      headline: 'Not at any amount you could actually get.',
      why: `What you can safely carry works out below ₹${input.minTicket.toLocaleString('en-IN')}, and no lender writes a ${input.productName.toLowerCase()} smaller than that. This is not a case of borrowing less — there is no loan here to take.`,
      nextStep:
        'The options below show what would have to change to bring a real loan within reach.',
    });
  }

  // 5. Affordable, but well short of the ask.
  if (asked !== undefined && asked > 0 && input.safeAmount.hi < asked * borrowLessThreshold.value) {
    const stressNote = input.stressBreaches
      ? ' The binding constraint is what happens after a bad month, not today.'
      : '';

    // Three separate things in this sentence used to be asserted rather than
    // read off the numbers, and all three could be false at once: that a lender
    // would fund the full ask, that rent is why our figure is smaller, and that
    // income is the constraint at all. Each is now checked.
    const lenderWouldFund = input.lenderAmount.hi >= asked!;
    const lead = lenderWouldFund
      ? 'A lender will likely say yes to the full amount.'
      : `A lender will not go to the full amount either — their own arithmetic stops at ${money(input.lenderAmount)}.`;
    const reason = input.collateralBindsBoth
      ? 'Both figures are held down by what the asset you would pledge is worth, not by what you earn.'
      : input.rentCounted
        ? 'What you can carry without the plan getting fragile is smaller, because your rent counts against you even though lenders leave it out.'
        : 'What you can carry without the plan getting fragile is smaller, because we count what the household spends and what a bad month would do, and lenders leave both out.';

    return emit({
      kind: 'borrow-less',
      headline: 'You can borrow, but less than you asked for.',
      why: `${lead} ${reason}${stressNote}${earnsNote}`,
      nextStep:
        'Either trim the amount to the safe figure, or change one of the things below and come back to it.' +
        waitingNote('borrow-less'),
    });
  }

  // "Borrow" does not always mean the amount asked for fits. `borrow-less` only
  // fires once the safe ceiling falls below four fifths of the ask, so a
  // borrower can land here still asking for slightly more than they can carry.
  // Saying "the amount fits" to that borrower is a plainly false sentence, and
  // one obviously wrong line costs more trust than a number that is quietly off.
  // So the copy reads the numbers rather than asserting a fit.
  const fitsOutright = asked === undefined || asked <= 0 || asked <= input.safeAmount.lo;
  const fitsAtBest = asked !== undefined && asked > 0 && asked <= input.safeAmount.hi;
  const over = asked !== undefined && asked > 0 ? asked - input.safeAmount.hi : 0;

  const fitNote = fitsOutright
    ? 'The amount fits under all three affordability tests and still holds after a bad month.'
    : fitsAtBest
      ? `The amount fits on the better reading of your position, but not on the cautious one — it sits inside the top of what you can safely carry, ${money(input.safeAmount)}, rather than below all of it. Treat the lower figure as the one to plan on.`
      : `You asked for ${rupees(asked!)}, which is ${rupees(over)} above the most you can safely carry, ${money(input.safeAmount)}. It is close enough to be worth doing — trim the ask by that much and it holds under every test, including after a bad month.`;

  return emit({
    kind: 'borrow',
    headline: fitsOutright
      ? 'This works, on the terms below.'
      : 'This works, with the amount trimmed a little.',
    why: fitNote + earnsNote,
    nextStep: fitsOutright
      ? 'Take the card below to the lender and hold them to the rate band on it.'
      : `Ask for ${rupees(Math.floor(input.safeAmount.hi / 1000) * 1000)} rather than ${rupees(asked!)}, then take the card below to the lender and hold them to the rate band on it.`,
  });
}
