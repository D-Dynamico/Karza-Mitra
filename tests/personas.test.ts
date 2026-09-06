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

  it('has a safe amount far below what she asked for — the whole point', () => {
    expect(r.amounts.safe.hi).toBeLessThan(priya.answers.amountAsked! * 0.2);
  });

  it('makes the two numbers diverge by more than an order of magnitude', () => {
    expect(r.amounts.lender.lo / r.amounts.safe.hi).toBeGreaterThan(10);
  });

  it('locks the endpoints', () => {
    expect(r.amounts.safe.lo).toBeCloseTo(86919, NEAR);
    expect(r.amounts.safe.hi).toBeCloseTo(88897, NEAR);
    expect(r.amounts.lender.lo).toBeCloseTo(2114347, NEAR);
    expect(r.amounts.lender.hi).toBeCloseTo(2419291, NEAR);
  });

  it('explains the gap by naming her rent', () => {
    expect(r.verdict.why.toLowerCase()).toContain('rent');
  });

  it('prices her cleanly, because her score is known and high', () => {
    // 780 score, five years at a large employer: the bottom of the band, and
    // narrow. Quoting her the product's full 10.5-24% would be useless to her.
    expect(r.pricing!.rateBand.lo).toBeCloseTo(10.5, 6);
    expect(r.pricing!.rateBand.hi).toBeCloseTo(11.5, 6);
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
    expect(secured.hi).toBeLessThanOrEqual(12);
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
    expect(r.amounts.safe.lo).toBeCloseTo(1314244, NEAR);
    expect(r.amounts.safe.hi).toBeCloseTo(1430664, NEAR);
  });

  it('holds after a bad turn', () => {
    expect(r.repayment!.stressBreaches).toBe(false);
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
