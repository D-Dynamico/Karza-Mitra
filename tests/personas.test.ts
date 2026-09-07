import { describe, expect, it } from 'vitest';
import { compute } from '../engine/compute';
import { anita, mustSetOnly, priya, ravi } from '../engine/personas';

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
    const owns = compute({ ...ravi.answers, rentOrHomeEmi: 0 });
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
