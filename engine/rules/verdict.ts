/**
 * The verdict.
 *
 * Most tools that compare loans cannot say "don't". They earn on the click, so
 * the worst answer they give is a longer list. This one says it, and the whole
 * value of saying it rests on saying it for a reason the borrower can check and
 * act on — so every branch below carries its own sentence, and the "don't"
 * branches carry the thing to do next.
 *
 * **Who these sentences are written for.** A rider in Hubballi reading English
 * as a second language, at a counter, with a lender waiting. Not a reviewer of
 * this project. An earlier draft failed that test badly — "without the plan
 * getting fragile", "two rulebooks, not one number with a margin of error" —
 * clever sentences about lending where plain sentences about her money were
 * wanted. Five rules hold here now, and they hold in `card.ts` and the UI too:
 *
 * 1. **Use the borrower's words.** EMI, not instalment. Approve or give, not
 *    sanction. Rate, not band. Never "points": a rate difference is said in
 *    rupees over the term, which is the form she can repeat at the counter.
 * 2. **Number first, reason second, one sentence each.** Not an idea that
 *    arrives at its figure three clauses later.
 * 3. **No metaphors.** No rulebooks, doors, levers, fragile plans. If a bank
 *    clerk could not say it in Kannada, it does not belong here.
 * 4. **Say each thing once.** The rent explanation appeared twice on one screen
 *    and the safe-versus-lender explanation three times in different words.
 * 5. **Never show a range that is not one.** `format.ts` collapses two ends
 *    within five percent into one "about" figure, prints terms in years, and
 *    rounds a computed amount before it reaches a sentence.
 */

import type { Answers } from '../answers';
import { approx, inLakh, money, moneyRange, tenure as tenureText } from '../format';
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
  why: 'A safe amount within a fifth of what you asked for is close enough to trim or negotiate. Further below that, the gap is the answer.',
  source: judgement('A round line; the exact figure matters less than having one and stating it.'),
});

export const obligationDangerLine = register<Rule<number>>({
  id: 'verdict.obligation-danger-line',
  what: 'Share of planning income already committed to loans at which we say stop',
  value: 0.5,
  why: 'Another loan does not fix that. It delays it and makes it bigger.',
  source: judgement('Sits above every lender ceiling used here, so it only fires when things are genuinely bad.'),
});

export interface VerdictInputs {
  readonly answers: Answers;
  readonly safeAmount: Interval;
  readonly lenderAmount: Interval;
  readonly surplus: Interval;
  readonly planning: Interval;
  /** The instalment that can actually end, used for the "wait for it" line. */
  readonly existingEmis: number;
  /** Everything committed each month: existing instalments plus a home loan. */
  readonly obligations: number;
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
  const freed = ` Your loan has ${tenureText(monthsLeft ?? 0)} left. When it ends, the ${approx(input.existingEmis)} you pay each month comes back to you`;
  const waitingNote = (kind: VerdictKind): string => {
    if (!waitingIsWorthIt) return '';
    const then = input.verdictIfExistingEmisCleared;
    if (then === undefined) return `${freed}.`;
    return then !== kind
      ? `${freed}, and that on its own changes this answer.`
      : `${freed}. On its own that does not change this answer, so do it for its own sake, not to get this loan.`;
  };

  // A loan that earns more than it costs is a different proposition, and it is
  // the strongest argument for borrowing that exists.
  const earnsNote =
    input.paysForItself === true
      ? ' The extra income you expect covers the EMI, so the loan largely pays for itself.'
      : input.paysForItself === false
        ? ' The extra income you expect is smaller than the EMI. The gap comes out of your other income every month.'
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
      headline: 'Tell us what you earn.',
      why: 'Without your income, every number here would be a guess.',
      nextStep: 'Add what you take home in a month. A rough figure is fine.',
    });
  }

  // 1. A recent bounce. The loudest signal there is.
  if (input.recentBounce) {
    // Name every reason that is actually present, not just the first one. A
    // borrower told only about the bounce will fix the bounce and come back to
    // the same answer, because the app loans were the real problem.
    const alsoAppLoans = input.hasAppLoans
      ? ' You also have app loans. Those cost the most of any loan you can get, and they are why the month does not stretch.'
      : '';
    const alsoNegative = input.surplus.hi <= 0
      ? ' And nothing is left at the end of the month, even before a new EMI.'
      : '';
    return emit({
      kind: 'dont',
      headline: 'Not now. Clear what you owe first.',
      why: `A payment bounced in the last six months. Most lenders will say no, and the ones who say yes will charge a much higher rate. Taking a new EMI while one is already slipping turns a hard month into a hard year.${alsoAppLoans}${alsoNegative}`,
      nextStep:
        (input.hasAppLoans
          ? 'Clear the app loans first. They cost the most, so paying them off frees the most money. Three months with every payment on time after that changes this answer.'
          : 'Three months with every payment on time changes this answer. It costs you nothing but the wait.') +
        waitingNote('dont'),
    });
  }

  // 2. Already carrying more than half of income in instalments.
  const committedShare = input.obligations / Math.max(input.planning.lo, 1);
  if (committedShare > obligationDangerLine.value) {
    return emit({
      kind: 'dont',
      headline: 'Your loans are the problem to fix first.',
      why: `More than half of what you earn in a slow month already goes to EMIs. ${obligationDangerLine.why}`,
      // "Clear the dearest loan first" claimed a ranking this engine cannot
      // make: it knows one instalment total, not what any of it costs. Where
      // the app-loan flag is set there is a real ordering to give, because app
      // and BNPL lending is the dearest money in the market as a category. Where
      // it is not, the honest sentence names no order at all.
      nextStep:
        (input.hasAppLoans
          ? 'Clear the app loans first. They cost the most, so every rupee off them does the most for you.'
          : 'Paying off what you already owe does more for you than a new loan would.') +
        waitingNote('dont'),
    });
  }

  // 3. Nothing left over, so the instalment would have to come from somewhere
  // that does not exist.
  if (input.surplus.hi <= 0) {
    return emit({
      kind: 'dont',
      headline: 'There is no money left each month for an EMI.',
      why: 'After rent, the EMIs you pay now and what the house spends, nothing is left. A new EMI would have to be paid by borrowing again.',
      nextStep: 'Start with the biggest of those three. That is where the room is.',
    });
  }

  // 4. Income that cannot be evidenced, nothing to pledge, and the money is not
  // going to earn. Formal lending is not built for this and app lenders will
  // fill the gap at a price that makes things worse.
  if (input.informalIncome && !input.securedAvailable && !input.productive) {
    return emit({
      kind: 'dont',
      headline: 'A loan is the wrong answer here.',
      why:
        'Your income cannot be shown on paper, you have nothing to pledge, and the money will not earn anything back. Any lender who says yes on those terms charges a rate that makes things worse.' +
        earnsNote,
      nextStep:
        'If the money would earn — stock for a shop, a vehicle you work with — say so. That changes the answer.',
    });
  }

  if (input.safeAmount.hi <= 0) {
    return emit({
      kind: 'dont',
      headline: 'No amount is safe for you right now.',
      why: 'All three checks come out at zero: the most you should pay each month, what is left over, and what a bad month would do.',
      nextStep: 'The list below shows what would have to change, and by how much.',
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
      headline: 'There is no loan here to take.',
      why: `What is safe for you comes to less than ${approx(input.minTicket)}, and no lender writes a ${input.productName.toLowerCase()} smaller than that. This is not about borrowing less. At this size there is no loan.`,
      nextStep: 'The list below shows what would bring a real loan within reach.',
    });
  }

  // 5. Affordable, but well short of the ask.
  if (asked !== undefined && asked > 0 && input.safeAmount.hi < asked * borrowLessThreshold.value) {
    const stressNote = input.stressBreaches
      ? ' What limits this is a bad month, not this month.'
      : '';

    // Three separate things in this sentence used to be asserted rather than
    // read off the numbers, and all three could be false at once: that a lender
    // would fund the full ask, that rent is why our figure is smaller, and that
    // income is the constraint at all. Each is now checked.
    const lenderWouldFund = input.lenderAmount.hi >= asked!;
    const lead = lenderWouldFund
      ? `A lender will likely approve the full ${inLakh(asked!)}.`
      : `A lender will not go that far either. Their own limit is ${money(input.lenderAmount)}.`;
    // Three claims here used to be asserted rather than read off the numbers,
    // and all three could be false at once: that a lender would fund the full
    // ask, that rent is why our figure is smaller, and that income is the
    // constraint at all. Each is checked. `tests/copy.test.ts` holds them.
    const reason = input.collateralBindsBoth
      ? 'Both figures are held down by what your property is worth, not by what you earn.'
      : input.rentCounted
        ? 'Lenders do not count your rent. You have to pay it, so your real limit is lower.'
        : 'Lenders do not count what your house spends, or what a bad month would do. You have to. That is why our figure is lower.';

    const safeText = moneyRange(input.safeAmount);
    return emit({
      kind: 'borrow-less',
      headline: `You can borrow, but not ${inLakh(asked!)}. Safe for you: ${safeText.text}.`,
      why: `${lead} ${reason}${stressNote}${earnsNote}`,
      nextStep:
        `Borrow ${safeText.text}, or change one of the things below and check again.` +
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

  const trimmedTo = approx(Math.floor(input.safeAmount.hi / 1000) * 1000);
  const stressNote = input.stressBreaches ? ' What limits this is a bad month, not this month.' : '';

  const fitNote = fitsOutright
    ? 'The amount passes all three checks and still holds in a bad month.'
    : fitsAtBest
      ? `${inLakh(asked!)} fits only if things go well for you, not if they go badly. Plan on the lower figure: ${money(input.safeAmount)}.`
      : `You asked for ${inLakh(asked!)}. That is about ${approx(over)} more than is safe for you. Ask for ${trimmedTo} instead and it holds in a bad month too.`;

  return emit({
    kind: 'borrow',
    headline: fitsOutright ? 'Yes. This works, on the terms below.' : 'Yes, with a smaller amount.',
    why: fitNote + stressNote + earnsNote,
    nextStep: fitsOutright
      ? 'Take the card below to the lender and hold them to the rate on it.'
      : `Ask for ${trimmedTo}, not ${inLakh(asked!)}. Then take the card below to the lender and hold them to the rate on it.`,
  });
}
