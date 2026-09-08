import { describe, expect, it } from 'vitest';
import { compute } from '../engine/compute';
import { anita, mohan, mustSetOnly, priya, ravi } from '../engine/personas';
import { allQuestions } from '../engine/questions';

/**
 * Golden tests.
 *
 * These lock the three borrowers the engine is judged on. They are meant to
 * break when a rule changes — that is the point. When one fails, read which
 * number moved and decide whether the rule change was right, then update the
 * expectation deliberately rather than loosening the assertion.
 *
 * The endpoint assertions use a tolerance of a few hundred rupees so that a
 * change in the solver's last decimal place does not read as a change in
 * lending judgement.
 */

const NEAR = -2; // toBeCloseTo digits: within ~₹50

describe('Priya — two numbers, not one', () => {
  const r = compute(priya.answers);

  it('says borrow less', () => {
    expect(r.verdict.kind).toBe('borrow-less');
  });

  it('has a lender who would sanction far more than she asked for', () => {
    expect(r.amounts.lender.lo).toBeGreaterThan(2000000);
    expect(r.amounts.lender.lo).toBeGreaterThan(priya.answers.amountAsked!);
  });

  it('has a safe amount well below what she asked for — the whole point', () => {
    expect(r.amounts.safe.hi).toBeLessThan(priya.answers.amountAsked! * 0.7);
  });

  it('makes the two numbers diverge several times over', () => {
    expect(r.amounts.lender.lo / r.amounts.safe.hi).toBeGreaterThan(4);
  });

  it('leaves her an instalment she could actually recognise as affordable', () => {
    // A borrower with ₹40,500 spare each month should not be handed a ceiling of
    // ₹2,000. An answer that is obviously wrong is not cautious, it is ignored —
    // along with everything else on the page.
    expect(r.repayment!.emiCeiling.hi).toBeGreaterThan(5000);
    expect(r.repayment!.emiCeiling.hi).toBeLessThan(r.surplus.hi);
  });

  it('locks the endpoints', () => {
    // Moved 2026-09-07 when the personal loan floor was verified down from
    // 10.5% to 9.99%. A cheaper rate buys more principal for the same
    // instalment, so both pairs step up. The gap between them is the point,
    // and it did not narrow.
    expect(r.amounts.safe.lo).toBeCloseTo(474768, NEAR);
    expect(r.amounts.safe.hi).toBeCloseTo(485625, NEAR);
    expect(r.amounts.lender.lo).toBeCloseTo(2139167, NEAR);
    expect(r.amounts.lender.hi).toBeCloseTo(2447966, NEAR);
  });

  it('explains the gap by naming her rent', () => {
    expect(r.verdict.why.toLowerCase()).toContain('rent');
  });

  it('prices her cleanly, because her score is known and high', () => {
    // 780 score, five years at a large employer: the bottom of the band, and
    // narrow. Quoting her the product's full 9.99-24% would be useless to her.
    // She lands exactly on the floor, which is the right answer — 9.99% is
    // quoted by four banks precisely for CIBIL 780+ at a category-A employer,
    // which is her.
    expect(r.pricing!.rateBand.lo).toBeCloseTo(9.99, 6);
    expect(r.pricing!.rateBand.hi).toBeCloseTo(10.99, 6);
    expect(r.confidence).toBe('high');
  });

  it('shows an all-in rate above the headline rate', () => {
    expect(r.pricing!.aprBand.lo).toBeGreaterThan(r.pricing!.rateBand.lo);
  });
});

describe('Ravi — product routing', () => {
  const r = compute(ravi.answers);

  it('routes him to a secured product, not an unsecured personal loan', () => {
    expect(r.routing!.product.id).toBe('loan-against-property');
    expect(r.routing!.product.secured).toBe(true);
  });

  it('shows the unsecured option he is being steered away from, and why', () => {
    expect(r.routing!.alternative!.product.id).toBe('personal-loan');
    expect(r.routing!.alternative!.why.length).toBeGreaterThan(20);
  });

  it('prices the secured route well below the unsecured one', () => {
    const secured = r.pricing!.rateBand;
    const unsecured = r.routing!.alternative!.product.rateBand;
    expect(secured.hi).toBeLessThan(unsecured.hi);
    // Was a hardcoded 12%. That number was pinned to the old, too-narrow
    // 9-12% loan-against-property band; once the band was verified out to
    // 8.75-14% a thin-file borrower priced at 13.25%, and the literal failed
    // without anything actually being wrong. The claim the routing copy makes
    // is that pledging property "roughly halves the rate", so assert that
    // instead of a number that has to be re-pinned every time a band moves.
    expect(secured.hi).toBeLessThanOrEqual(unsecured.hi * 0.6);
  });

  it('recognises less income than he actually earns, and says so', () => {
    expect(r.income!.recognised.lo).toBeLessThan(r.income!.planning.hi);
    expect(r.income!.unprovable.hi).toBeGreaterThan(0);
  });

  it('caps the loan at what the property supports, not just his income', () => {
    const cap = r.routing!.securedCap!;
    expect(cap.lo).toBeCloseTo(2250000, NEAR);
    expect(r.amounts.safe.hi).toBeLessThanOrEqual(cap.hi);
  });

  it('locks the endpoints', () => {
    // Moved 2026-09-07 with the verified loan-against-property band. The top
    // of the band went 12% -> 14%, so his dearest case got dearer and safe.lo
    // fell; the floor went 9% -> 8.75%, so safe.hi rose. The answer got wider
    // in both directions, which is why his confidence is now 'low'.
    // Moved again 2026-09-07 when `rent.owns-premises` stopped asserting a flat
    // zero. Owning property is evidence that he pays no rent, not proof, so it
    // is now an interval from zero to what renting would cost in his city. Only
    // the bottom moved: at the likely end nothing changed, and the new lower
    // bound is what it would be if the guess is wrong.
    expect(r.amounts.safe.lo).toBeCloseTo(883886, NEAR);
    expect(r.amounts.safe.hi).toBeCloseTo(1441972, NEAR);
  });

  it('is honest that a bad turn breaks it if he does pay rent', () => {
    // Was `false`, when his rent was assumed to be flatly nil. With rent
    // allowed up to the middle of his city band, the stressed outflow breaches
    // at that end — so the flag is true, and it should be.
    //
    // The flag collapses an interval to a boolean, and the project's rule is
    // that the conservative end decides. Reporting "holds after a bad month"
    // because it holds in the good case would be the flattering read, and the
    // whole point of this change was to stop doing that.
    expect(r.repayment!.stressBreaches).toBe(true);
  });

  it('still holds after a bad turn if he really pays no rent', () => {
    // The other end of the same assumption. Answering the question settles it.
    const owns = compute({ ...ravi.answers, rent: 0 });
    expect(owns.repayment!.stressBreaches).toBe(false);
    expect(owns.verdict.kind).toBe('borrow');
  });
});

describe('Anita — the answer is do not borrow', () => {
  const r = compute(anita.answers);

  it('says do not borrow', () => {
    expect(r.verdict.kind).toBe('dont');
  });

  it('never suggests an amount she could take', () => {
    expect(r.amounts.safe.hi).toBe(0);
  });

  it('names the bounce and the app loans in its reason', () => {
    const why = r.verdict.why.toLowerCase();
    expect(why).toContain('bounce');
    expect(why).toContain('app loan');
  });

  it('anchors on a surplus that is actually negative', () => {
    expect(r.surplus.hi).toBeLessThan(0);
  });

  it('gives her something to do next', () => {
    expect(r.verdict.nextStep).toBeTruthy();
    expect(r.verdict.nextStep!.length).toBeGreaterThan(20);
  });

  it('uses no shaming language', () => {
    const copy = `${r.verdict.headline} ${r.verdict.why} ${r.verdict.nextStep}`.toLowerCase();
    for (const word of ['unfortunately', 'sorry', 'irresponsible', 'afraid', 'failed', 'poor']) {
      expect(copy).not.toContain(word);
    }
  });
});

describe('every persona', () => {
  for (const persona of [priya, ravi, anita]) {
    describe(persona.name, () => {
      const r = compute(persona.answers);

      it('produces a verdict with a reason', () => {
        expect(r.verdict.why.length).toBeGreaterThan(30);
      });

      it('leaves a trace for every number it showed', () => {
        expect(r.trace.length).toBeGreaterThan(10);
        for (const entry of r.trace) {
          expect(entry.why.length, `${entry.rule} has no why`).toBeGreaterThan(10);
          expect(entry.label.length).toBeGreaterThan(3);
        }
      });

      it('never inverts or loses a range', () => {
        expect(r.amounts.safe.lo).toBeLessThanOrEqual(r.amounts.safe.hi);
        expect(r.amounts.lender.lo).toBeLessThanOrEqual(r.amounts.lender.hi);
        expect(Number.isFinite(r.amounts.safe.lo)).toBe(true);
        expect(Number.isFinite(r.amounts.lender.hi)).toBe(true);
      });

      it('still answers on the must set of nine alone', () => {
        const partial = compute(mustSetOnly(persona.answers));
        expect(partial.verdict.kind).not.toBe('need-more-info');
        expect(partial.verdict.why.length).toBeGreaterThan(20);
      });
    });
  }
});

/**
 * Rent and a home-loan instalment are not the same obligation.
 *
 * They used to share one question — "what do you pay for rent, or on a home
 * loan?" — and the answer was routed borrower-side only, because that is right
 * for rent. A lender ignores rent in its ratios and counts a mortgage in full,
 * so a borrower who typed one in had it hidden from the lender ceiling, and this
 * tool quoted a sanction well above what the lender's own arithmetic allows.
 * Overstating, in the one tool built not to.
 *
 * The home loan now belongs with the other loans, which already reach both
 * ceilings. These tests pin the two halves apart, and pin the copy that routes
 * them — the routing is a sentence on a screen, so the sentence is the fix and
 * has to be tested like one.
 *
 * Priya is the control. Her ₹28,000 is rent, so her lender number must not move
 * at all; if it does, the housing cost has been wired to the wrong side.
 */
describe('rent and a home loan are counted differently', () => {
  const base = {
    purpose: 'education' as const,
    amountAsked: 2000000,
    incomeType: 'salaried' as const,
    monthlyIncome: { lo: 150000, hi: 150000 },
    householdExpenses: 40000,
    age: 38,
    householdSize: 4,
    cityTier: 'metro' as const,
  };
  const asRent = compute({ ...base, rent: 35000, existingEmis: 0 });
  const asHomeLoan = compute({ ...base, rent: 0, existingEmis: 35000 });

  it('leaves the lender ceiling alone for a renter, because lenders ignore rent', () => {
    const noHousingCost = compute({ ...base, rent: 0, existingEmis: 0 });
    expect(asRent.amounts.lender.lo).toBeCloseTo(noHousingCost.amounts.lender.lo, NEAR);
    expect(asRent.amounts.lender.hi).toBeCloseTo(noHousingCost.amounts.lender.hi, NEAR);
  });

  it('takes a home loan off the lender ceiling, because they count it', () => {
    expect(asHomeLoan.amounts.lender.hi).toBeLessThan(asRent.amounts.lender.hi);
    // Not a rounding difference: the same ₹35,000 moves the ceiling by lakhs.
    expect(asRent.amounts.lender.lo - asHomeLoan.amounts.lender.lo).toBeGreaterThan(1000000);
  });

  it('counts either one against the borrower, because the money leaves regardless', () => {
    expect(asHomeLoan.amounts.safe.lo).toBeCloseTo(asRent.amounts.safe.lo, NEAR);
    expect(asHomeLoan.amounts.safe.hi).toBeCloseTo(asRent.amounts.safe.hi, NEAR);
  });

  it('does not move Priya, whose housing cost is rent', () => {
    const r = compute(priya.answers);
    expect(r.amounts.lender.lo).toBeCloseTo(2139166.7, NEAR);
    expect(r.amounts.lender.hi).toBeCloseTo(2447966.05, NEAR);
  });

  it('tells the borrower which box a home loan goes in, on both screens', () => {
    const rent = allQuestions.find((q) => q.id === 'rent')!;
    const loans = allQuestions.find((q) => q.id === 'existing-emis')!;
    // The whole fix is that these two sentences send a mortgage to the right
    // field. If either stops saying so, the overstatement comes back silently.
    expect(`${rent.prompt} ${rent.hint ?? ''}`).toMatch(/home loan/i);
    expect(rent.prompt).not.toMatch(/home loan/i);
    expect(`${loans.hint ?? ''}`).toMatch(/home loan/i);
  });
});

/**
 * Mohan — mine, not the brief's.
 *
 * The three from the brief exercise routing, the two numbers and the refusal.
 * None of them is near retirement, none pledges property, and none pays no rent,
 * so seven real defects were fixed here without a single golden moving. These
 * are the assertions that would have moved.
 *
 * He is not in `personas`, so the three required run-throughs stay three.
 */
describe("Mohan — the lifecycle cases the brief's three do not reach", () => {
  const r = compute(mohan.answers);

  it('routes to the secured product, because he has something to pledge', () => {
    expect(r.routing?.product.secured).toBe(true);
    expect(r.routing?.product.name).toMatch(/property/i);
  });

  it('lets the loan-to-value cap bind instead of income', () => {
    // Both numbers land on the cap, so this is the borrower where blaming
    // income for the gap would be the wrong sentence.
    expect(r.routing?.securedCap).toBeDefined();
    expect(r.amounts.lender.lo).toBeCloseTo(3000000, NEAR);
    expect(r.amounts.lender.hi).toBeCloseTo(4200000, NEAR);
  });

  it('keeps the term the product is written for, rather than inventing a short one', () => {
    // The retirement cap says twelve months; a loan against property is not
    // written for less than sixty. The product wins — quoting a loan nobody
    // offers would be the worse lie.
    expect(r.pricing?.tenureMonths).toBe(60);
  });

  it('says out loud that the term outruns the age it assumed he stops earning', () => {
    const said = r.assumptions.some((a) => /retirement|stop working/i.test(a));
    expect(said, 'the overrun passed in silence, which is the defect').toBe(true);
  });

  it('still shortens the term where the product allows it', () => {
    // Same borrower, nothing to pledge: unsecured, and the cap does bite.
    const unsecured = compute({
      ...mohan.answers,
      ownsProperty: false,
      propertyValue: undefined,
      amountAsked: 800000,
    });
    expect(unsecured.routing?.product.secured).toBe(false);
    expect(unsecured.pricing?.tenureMonths).toBe(12);
    expect(unsecured.assumptions.some((a) => /retirement|stop working/i.test(a))).toBe(false);
  });

  it('never blames rent, because he pays none', () => {
    for (const s of [r.verdict.headline, r.verdict.why, r.verdict.nextStep ?? '']) {
      expect(s).not.toMatch(/your rent/i);
    }
  });

  it('does not promise a full sanction his lender ceiling cannot reach', () => {
    expect(r.amounts.lender.hi).toBeLessThan(mohan.answers.amountAsked!);
    expect(r.verdict.why).not.toMatch(/say yes to the full amount/i);
  });

  it('does not claim the wait for his loan to end changes the answer', () => {
    // It frees ₹25,000 a month and the verdict does not move, because the
    // property value is what is limiting him.
    const cleared = compute({ ...mohan.answers, existingEmis: 0, existingEmiMonthsLeft: 0 });
    expect(cleared.verdict.kind).toBe(r.verdict.kind);
    expect(r.verdict.nextStep ?? '').not.toMatch(/alone changes this answer/i);
  });
});
