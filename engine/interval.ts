/**
 * Interval arithmetic.
 *
 * Every quantity in this engine is a range, because almost nothing a borrower
 * tells us is exact and nothing a lender will do is certain. Ranges widen when
 * we are told less and narrow when we are told more, and that happens through
 * the arithmetic rather than through a fudge factor applied at the end.
 *
 * Two invariants hold everywhere, and are enforced at construction:
 *   - lo <= hi
 *   - both ends finite; never NaN, never Infinity
 */

export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

export class IntervalError extends Error {}

/**
 * Build an interval. Ends are ordered for you, so a caller that has a low and a
 * high the wrong way round gets a valid interval rather than a silent bug.
 * Non-finite input is a programming error and throws — a NaN that propagates
 * would surface as a blank screen three rules later, which is far harder to
 * find than a throw at the source.
 */
export function iv(a: number, b: number = a): Interval {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new IntervalError(`Interval ends must be finite, got [${a}, ${b}]`);
  }
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** A quantity we know exactly: a range of zero width. */
export const point = (n: number): Interval => iv(n, n);

export const ZERO: Interval = { lo: 0, hi: 0 };

export const isPoint = (x: Interval): boolean => x.lo === x.hi;
export const width = (x: Interval): number => x.hi - x.lo;
export const mid = (x: Interval): number => (x.lo + x.hi) / 2;
export const contains = (x: Interval, n: number): boolean => n >= x.lo && n <= x.hi;
export const containsZero = (x: Interval): boolean => contains(x, 0);

export const add = (a: Interval, b: Interval): Interval => iv(a.lo + b.lo, a.hi + b.hi);

/** Note the crossed ends: the smallest difference is the smallest minus the largest. */
export const sub = (a: Interval, b: Interval): Interval => iv(a.lo - b.hi, a.hi - b.lo);

export const neg = (a: Interval): Interval => iv(-a.hi, -a.lo);

/** Signs make the ordering of products unobvious, so take the extremes of all four. */
export function mul(a: Interval, b: Interval): Interval {
  const products = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi];
  return iv(Math.min(...products), Math.max(...products));
}

/** Multiply by a plain number, the common case (a percentage, a haircut). */
export const scale = (a: Interval, k: number): Interval => mul(a, point(k));

/**
 * Divide, where the divisor is known not to span zero.
 *
 * A divisor spanning zero makes the true result unbounded, and this engine has
 * no way to render "unbounded" honestly — so the caller must decide what that
 * case means in its own terms. `divOr` is how you say it.
 */
export function div(a: Interval, b: Interval): Interval {
  if (containsZero(b)) {
    throw new IntervalError(
      `Division by an interval spanning zero: [${b.lo}, ${b.hi}]. Use divOr and say what an unbounded result means here.`,
    );
  }
  const quotients = [a.lo / b.lo, a.lo / b.hi, a.hi / b.lo, a.hi / b.hi];
  return iv(Math.min(...quotients), Math.max(...quotients));
}

/**
 * Divide, with an explicit answer for the unbounded case. Used wherever the
 * denominator is something a borrower might not have told us, or might genuinely
 * be zero — income is the one that matters. The fallback is never "assume zero";
 * it is a deliberate statement like "treat the ratio as fully unaffordable".
 */
export const divOr = (a: Interval, b: Interval, whenUnbounded: Interval): Interval =>
  containsZero(b) ? whenUnbounded : div(a, b);

export const minOf = (a: Interval, b: Interval): Interval =>
  iv(Math.min(a.lo, b.lo), Math.min(a.hi, b.hi));

export const maxOf = (a: Interval, b: Interval): Interval =>
  iv(Math.max(a.lo, b.lo), Math.max(a.hi, b.hi));

/** Squeeze an interval inside bounds. Used to stop a range running below zero. */
export const clamp = (x: Interval, lo: number, hi: number): Interval =>
  iv(Math.min(Math.max(x.lo, lo), hi), Math.min(Math.max(x.hi, lo), hi));

/** Money and rates are never negative here; this says so at the point it matters. */
export const atLeastZero = (x: Interval): Interval => clamp(x, 0, Number.MAX_SAFE_INTEGER);

/** The smallest interval containing both — how two possible worlds combine. */
export const union = (a: Interval, b: Interval): Interval =>
  iv(Math.min(a.lo, b.lo), Math.max(a.hi, b.hi));

/**
 * The overlap of two constraints, e.g. a rate band narrowed by a second rule.
 * Returns undefined when the constraints contradict each other, which is a real
 * outcome the caller should notice rather than have papered over.
 */
export function intersect(a: Interval, b: Interval): Interval | undefined {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo <= hi ? iv(lo, hi) : undefined;
}

/**
 * Narrow towards a value by a fraction: 0 leaves the interval alone, 1 collapses
 * it to the point. How an answer tightens a range without pretending to certainty.
 */
export function narrowTowards(x: Interval, target: number, fraction: number): Interval {
  const f = Math.min(Math.max(fraction, 0), 1);
  return iv(x.lo + (target - x.lo) * f, x.hi + (target - x.hi) * f);
}

/** Round both ends to whole rupees for display, keeping the range honest by widening. */
export const roundOut = (x: Interval): Interval => iv(Math.floor(x.lo), Math.ceil(x.hi));
