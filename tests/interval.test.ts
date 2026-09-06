import { describe, expect, it } from 'vitest';
import {
  add,
  atLeastZero,
  clamp,
  containsZero,
  div,
  divOr,
  intersect,
  IntervalError,
  isPoint,
  iv,
  maxOf,
  mid,
  minOf,
  mul,
  narrowTowards,
  neg,
  point,
  roundOut,
  scale,
  sub,
  union,
  width,
  type Interval,
} from '../engine/interval';

/** A spread of intervals to assert invariants over, including degenerate ones. */
const samples: Interval[] = [
  iv(0, 0),
  iv(1, 1),
  iv(-5, -1),
  iv(-3, 4),
  iv(0, 100),
  iv(35000, 80000),
  iv(9, 12),
  iv(0.0001, 0.0002),
];

describe('construction', () => {
  it('orders the ends, so a caller cannot build an inverted interval', () => {
    expect(iv(10, 2)).toEqual({ lo: 2, hi: 10 });
  });

  it('treats a single argument as a point', () => {
    expect(iv(7)).toEqual({ lo: 7, hi: 7 });
    expect(isPoint(point(7))).toBe(true);
  });

  it('throws on non-finite ends rather than letting NaN travel', () => {
    expect(() => iv(NaN, 1)).toThrow(IntervalError);
    expect(() => iv(0, Infinity)).toThrow(IntervalError);
    expect(() => iv(1, 0 / 0)).toThrow(IntervalError);
  });
});

describe('algebra', () => {
  it('adds ends to ends', () => {
    expect(add(iv(1, 2), iv(10, 20))).toEqual({ lo: 11, hi: 22 });
  });

  it('subtracts with crossed ends', () => {
    // Smallest possible difference is smallest minus largest.
    expect(sub(iv(10, 20), iv(1, 2))).toEqual({ lo: 8, hi: 19 });
  });

  it('negates by swapping the ends', () => {
    expect(neg(iv(2, 5))).toEqual({ lo: -5, hi: -2 });
  });

  it('multiplies correctly across sign changes', () => {
    expect(mul(iv(2, 3), iv(4, 5))).toEqual({ lo: 8, hi: 15 });
    expect(mul(iv(-2, 3), iv(4, 5))).toEqual({ lo: -10, hi: 15 });
    expect(mul(iv(-2, 3), iv(-5, -4))).toEqual({ lo: -15, hi: 10 });
    expect(mul(iv(-2, 3), iv(-1, 4))).toEqual({ lo: -8, hi: 12 });
  });

  it('scales by a plain number', () => {
    expect(scale(iv(100, 200), 0.4)).toEqual({ lo: 40, hi: 80 });
    expect(scale(iv(100, 200), -1)).toEqual({ lo: -200, hi: -100 });
  });

  it('divides when the divisor stays clear of zero', () => {
    expect(div(iv(10, 20), iv(2, 4))).toEqual({ lo: 2.5, hi: 10 });
    expect(div(iv(-10, 20), iv(2, 4))).toEqual({ lo: -5, hi: 10 });
  });

  it('refuses to divide by an interval spanning zero', () => {
    expect(() => div(iv(1, 2), iv(-1, 1))).toThrow(IntervalError);
    expect(() => div(iv(1, 2), iv(0, 5))).toThrow(IntervalError);
    expect(() => div(iv(1, 2), point(0))).toThrow(IntervalError);
  });

  it('lets the caller name what an unbounded division means', () => {
    const unaffordable = iv(1, 1);
    expect(divOr(iv(5000, 5000), point(0), unaffordable)).toEqual(unaffordable);
    expect(divOr(iv(10, 10), iv(2, 2), unaffordable)).toEqual({ lo: 5, hi: 5 });
  });
});

describe('combining and bounding', () => {
  it('takes elementwise min and max', () => {
    expect(minOf(iv(1, 10), iv(5, 6))).toEqual({ lo: 1, hi: 6 });
    expect(maxOf(iv(1, 10), iv(5, 6))).toEqual({ lo: 5, hi: 10 });
  });

  it('clamps both ends inside the bounds', () => {
    expect(clamp(iv(-50, 500), 0, 100)).toEqual({ lo: 0, hi: 100 });
    expect(clamp(iv(-50, 50), 0, 100)).toEqual({ lo: 0, hi: 50 });
  });

  it('floors a range at zero, since money here is never negative', () => {
    expect(atLeastZero(iv(-2000, 5000))).toEqual({ lo: 0, hi: 5000 });
    expect(atLeastZero(iv(-9, -1))).toEqual({ lo: 0, hi: 0 });
  });

  it('unions to the smallest interval covering both', () => {
    expect(union(iv(1, 3), iv(10, 12))).toEqual({ lo: 1, hi: 12 });
  });

  it('intersects, and reports a contradiction rather than hiding it', () => {
    expect(intersect(iv(9, 14), iv(11, 20))).toEqual({ lo: 11, hi: 14 });
    expect(intersect(iv(1, 2), iv(5, 6))).toBeUndefined();
  });

  it('narrows towards a value without overshooting', () => {
    expect(narrowTowards(iv(0, 10), 5, 0)).toEqual({ lo: 0, hi: 10 });
    expect(narrowTowards(iv(0, 10), 5, 1)).toEqual({ lo: 5, hi: 5 });
    expect(narrowTowards(iv(0, 10), 5, 0.5)).toEqual({ lo: 2.5, hi: 7.5 });
    // Out-of-range fractions are clamped, not honoured.
    expect(narrowTowards(iv(0, 10), 5, 2)).toEqual({ lo: 5, hi: 5 });
  });

  it('rounds outward so display never claims more precision than it has', () => {
    expect(roundOut(iv(1.2, 3.4))).toEqual({ lo: 1, hi: 4 });
  });
});

describe('invariants hold across every operation', () => {
  const binary: Array<[string, (a: Interval, b: Interval) => Interval]> = [
    ['add', add],
    ['sub', sub],
    ['mul', mul],
    ['minOf', minOf],
    ['maxOf', maxOf],
    ['union', union],
  ];

  it('never produces an inverted or non-finite interval', () => {
    for (const [name, op] of binary) {
      for (const a of samples) {
        for (const b of samples) {
          const r = op(a, b);
          expect(Number.isFinite(r.lo), `${name} lo finite`).toBe(true);
          expect(Number.isFinite(r.hi), `${name} hi finite`).toBe(true);
          expect(r.lo <= r.hi, `${name} ordered`).toBe(true);
        }
      }
    }
  });

  it('never produces an inverted interval when dividing legally', () => {
    for (const a of samples) {
      for (const b of samples) {
        if (containsZero(b)) continue;
        const r = div(a, b);
        expect(Number.isFinite(r.lo) && Number.isFinite(r.hi)).toBe(true);
        expect(r.lo <= r.hi).toBe(true);
      }
    }
  });

  it('contains the true result for every pair of points inside the inputs', () => {
    // The point of interval arithmetic: whatever the real values turn out to be,
    // the answer we showed the borrower covered them.
    const a = iv(35000, 80000);
    const b = iv(9, 12);
    const product = mul(a, b);
    for (let x = a.lo; x <= a.hi; x += 1000) {
      for (let y = b.lo; y <= b.hi; y += 0.25) {
        expect(x * y).toBeGreaterThanOrEqual(product.lo);
        expect(x * y).toBeLessThanOrEqual(product.hi);
      }
    }
  });

  it('never narrows a range by adding an unknown', () => {
    // Widening is monotone: combining with something uncertain cannot make us
    // more certain. This is the engine-level version of the product promise.
    // Compared with a tolerance: the invariant is exact in the maths, but
    // floating-point addition loses the last bit or two on small values.
    const epsilon = 1e-9;
    for (const a of samples) {
      for (const b of samples) {
        expect(width(add(a, b))).toBeGreaterThanOrEqual(width(a) - epsilon);
        expect(width(sub(a, b))).toBeGreaterThanOrEqual(width(a) - epsilon);
      }
    }
  });

  it('keeps the midpoint inside the interval', () => {
    for (const a of samples) {
      expect(mid(a)).toBeGreaterThanOrEqual(a.lo);
      expect(mid(a)).toBeLessThanOrEqual(a.hi);
    }
  });
});
