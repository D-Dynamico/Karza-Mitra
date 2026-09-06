import { describe, expect, it } from 'vitest';
import {
  annuityFactor,
  apr,
  aprRange,
  emi,
  emiRange,
  GST_ON_FEES,
  netDisbursal,
  principalFromEmi,
  principalFromEmiRange,
  totalInterest,
} from '../engine/finance';
import { iv, point } from '../engine/interval';

/**
 * Independent check on the closed-form EMI: run the loan month by month, taking
 * interest then principal, and see whether the balance lands on zero. This
 * catches a wrong formula in a way that comparing against another copy of the
 * same formula never could.
 */
function balanceAfterAmortising(
  principal: number,
  annualPercent: number,
  months: number,
  instalment: number,
): number {
  const r = annualPercent / 100 / 12;
  let balance = principal;
  for (let m = 0; m < months; m += 1) {
    balance = balance + balance * r - instalment;
  }
  return balance;
}

describe('EMI', () => {
  it('matches published bank calculator values', () => {
    // Standard figures a borrower can reproduce on any lender's site.
    expect(emi(100000, 12, 12)).toBeCloseTo(8884.88, 2);
    expect(emi(1000000, 10, 240)).toBeCloseTo(9650.22, 2);
    expect(emi(500000, 9, 60)).toBeCloseTo(10379.18, 2);
  });

  it('amortises to a zero balance, checked independently of the formula', () => {
    const cases: Array<[number, number, number]> = [
      [100000, 12, 12],
      [1500000, 10.5, 84],
      [800000, 16, 60],
      [4500000, 9, 180],
    ];
    for (const [principal, rate, months] of cases) {
      const instalment = emi(principal, rate, months);
      expect(balanceAfterAmortising(principal, rate, months, instalment)).toBeCloseTo(0, 4);
    }
  });

  it('handles a zero rate as equal repayments of principal', () => {
    expect(emi(120000, 0, 12)).toBeCloseTo(10000, 6);
    expect(annuityFactor(0, 12)).toBe(12);
  });

  it('returns nothing owed on a zero or negative principal', () => {
    expect(emi(0, 11, 60)).toBe(0);
    expect(emi(-5000, 11, 60)).toBe(0);
  });

  it('rejects a zero or negative tenure rather than dividing by nothing', () => {
    expect(() => emi(100000, 11, 0)).toThrow(RangeError);
  });

  it('rises with principal, rises with rate, falls with tenure', () => {
    expect(emi(200000, 11, 60)).toBeGreaterThan(emi(100000, 11, 60));
    expect(emi(100000, 14, 60)).toBeGreaterThan(emi(100000, 11, 60));
    expect(emi(100000, 11, 84)).toBeLessThan(emi(100000, 11, 60));
  });
});

describe('the amount an instalment supports', () => {
  it('is the exact inverse of the EMI calculation', () => {
    const cases: Array<[number, number, number]> = [
      [800000, 11, 60],
      [2250000, 9.5, 180],
      [150000, 26, 24],
    ];
    for (const [principal, rate, months] of cases) {
      expect(principalFromEmi(emi(principal, rate, months), rate, months)).toBeCloseTo(
        principal,
        6,
      );
    }
  });

  it('supports less as the rate rises, which is the trade-off the borrower feels', () => {
    expect(principalFromEmi(20000, 16, 60)).toBeLessThan(principalFromEmi(20000, 10, 60));
  });

  it('supports more over a longer tenure, at the cost of more interest', () => {
    const short = principalFromEmi(20000, 11, 36);
    const long = principalFromEmi(20000, 11, 84);
    expect(long).toBeGreaterThan(short);
    expect(totalInterest(long, 20000, 84)).toBeGreaterThan(totalInterest(short, 20000, 36));
  });
});

describe('all-in rate', () => {
  it('deducts the fee and the GST charged on it from what reaches the borrower', () => {
    // 2% of ₹10L is ₹20,000, plus 18% GST on that fee, so ₹23,600 never arrives.
    expect(netDisbursal(1000000, 2)).toBeCloseTo(1000000 - 20000 - 20000 * GST_ON_FEES, 6);
    expect(netDisbursal(1000000, 2)).toBeCloseTo(976400, 6);
  });

  it('equals the quoted rate when there is no fee', () => {
    expect(apr(1000000, 11, 60, 0)).toBeCloseTo(11, 10);
  });

  it('always exceeds the quoted rate once a fee is charged', () => {
    for (const fee of [0.5, 1, 2, 3]) {
      expect(apr(1000000, 11, 60, fee)).toBeGreaterThan(11);
    }
  });

  it('rises with the fee', () => {
    const rates = [0.5, 1, 2, 3].map((fee) => apr(1000000, 11, 60, fee));
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    }
  });

  it('is verified by discounting the instalments back at the rate it found', () => {
    // The definition of an IRR: at the true rate, the present value of what the
    // borrower pays equals what they actually received. Checked here by summing
    // the discounted instalments, which never touches the solver.
    const cases: Array<[number, number, number, number]> = [
      [1000000, 11, 60, 2],
      [1500000, 9.5, 84, 1],
      [150000, 26, 24, 3],
      [800000, 16, 36, 2.5],
    ];
    for (const [principal, rate, months, fee] of cases) {
      const found = apr(principal, rate, months, fee);
      const instalment = emi(principal, rate, months);
      const monthly = found / 100 / 12;
      let presentValue = 0;
      for (let m = 1; m <= months; m += 1) {
        presentValue += instalment / Math.pow(1 + monthly, m);
      }
      expect(presentValue).toBeCloseTo(netDisbursal(principal, fee), 2);
    }
  });

  it('costs more on a short loan than a long one for the same fee', () => {
    // A one-off fee spread over two years bites harder than over seven.
    const shortLoan = apr(1000000, 11, 24, 2) - 11;
    const longLoan = apr(1000000, 11, 84, 2) - 11;
    expect(shortLoan).toBeGreaterThan(longLoan);
  });

  it('lands where a borrower would expect on a typical personal loan', () => {
    // ₹8L at 11% over 5 years with a 2% fee: the all-in rate should be roughly a
    // point higher, not a rounding error and not double.
    const found = apr(800000, 11, 60, 2);
    expect(found).toBeGreaterThan(11.8);
    expect(found).toBeLessThan(12.4);
  });
});

describe('interval forms', () => {
  it('gives the exact range of EMIs across a principal and rate band', () => {
    const range = emiRange(iv(500000, 800000), iv(9, 12), 60);
    expect(range.lo).toBeCloseTo(emi(500000, 9, 60), 6);
    expect(range.hi).toBeCloseTo(emi(800000, 12, 60), 6);
    expect(range.lo).toBeLessThan(range.hi);
  });

  it('crosses the ends when inverting, since a higher rate supports less', () => {
    const range = principalFromEmiRange(iv(10000, 20000), iv(9, 12), 60);
    expect(range.lo).toBeCloseTo(principalFromEmi(10000, 12, 60), 6);
    expect(range.hi).toBeCloseTo(principalFromEmi(20000, 9, 60), 6);
  });

  it('covers every combination inside the input bands', () => {
    const principal = iv(500000, 800000);
    const rate = iv(9, 12);
    const range = emiRange(principal, rate, 60);
    for (let p = principal.lo; p <= principal.hi; p += 50000) {
      for (let r = rate.lo; r <= rate.hi; r += 0.5) {
        const value = emi(p, r, 60);
        expect(value).toBeGreaterThanOrEqual(range.lo - 1e-9);
        expect(value).toBeLessThanOrEqual(range.hi + 1e-9);
      }
    }
  });

  it('produces an all-in band that sits above the quoted band', () => {
    const quoted = iv(10.5, 14);
    const range = aprRange(point(800000), quoted, 60, iv(1, 3));
    expect(range.lo).toBeGreaterThan(quoted.lo);
    expect(range.hi).toBeGreaterThan(quoted.hi);
  });
});
