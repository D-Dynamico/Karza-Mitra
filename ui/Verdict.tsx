/**
 * The answer, at the top of the page: what to do, and the two numbers.
 *
 * This used to be two boxes. The verdict said "Safe for you: about ₹4.8 lakh"
 * and "a lender will approve the full ₹8 lakh"; the panel under it printed
 * both figures again, and a third sentence repeated why they differ. Three
 * readings of one fact, and the fact itself — that the two numbers are far
 * apart — was never shown, only stated.
 *
 * So the two numbers are drawn here as bars on one scale, with the amount asked
 * marked on both. A lender's ₹24 lakh beside a safe ₹4.8 lakh is the whole
 * argument of this tool, and it lands faster as a length than as a sentence.
 * Each bar is an interval: the solid part runs to the low end, the pale part
 * from low to high. Nothing is widened for looks.
 */

import type { ReactNode } from 'react';
import type { Result } from '../engine/compute';
import { inLakh, money } from '../engine/format';
import type { Interval } from '../engine/interval';
import { VERDICT_TONE, verdictWord } from './words';

export function Verdict({
  result,
  caption,
  children,
}: {
  readonly result: Result;
  /** A line under the bars, when the verdict text does not already say why they differ. */
  readonly caption?: string;
  /** The drawer that shows the working, if the page wants one here. */
  readonly children?: ReactNode;
}) {
  const { verdict, amounts } = result;
  const showBars = verdict.kind !== 'need-more-info';

  return (
    <section className={`verdict ${VERDICT_TONE[verdict.kind]}`}>
      <span className="pill">{verdictWord(verdict.kind)}</span>
      <h2>{verdict.headline}</h2>

      {showBars ? (
        <AmountBars lender={amounts.lender} safe={amounts.safe} asked={amounts.asked} />
      ) : null}
      {caption ? <p className="bars-caption">{caption}</p> : null}

      <p>{verdict.why}</p>
      {verdict.nextStep ? (
        <div className="next">
          <span className="next-label">What to do</span>
          {verdict.nextStep}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function AmountBars({
  lender,
  safe,
  asked,
}: {
  readonly lender: Interval;
  readonly safe: Interval;
  readonly asked: number | undefined;
}) {
  const scale = Math.max(lender.hi, safe.hi, asked ?? 0, 1);
  const pct = (n: number): number => Math.max(0, Math.min(100, (n / scale) * 100));
  const askedAt = asked !== undefined && asked > 0 ? pct(asked) : undefined;

  const track = (x: Interval) => (
    <div className="track" aria-hidden="true">
      <span className="solid" style={{ width: `${pct(x.lo)}%` }} />
      <span
        className="spread"
        style={{ left: `${pct(x.lo)}%`, width: `${Math.max(pct(x.hi) - pct(x.lo), x.hi > 0 ? 1.5 : 0)}%` }}
      />
      {askedAt !== undefined ? <span className="asked" style={{ left: `${askedAt}%` }} /> : null}
    </div>
  );

  return (
    <div className="bars">
      <div className="bar theirs">
        <div className="bar-head">
          <span>A lender would approve</span>
          <strong>{money(lender, { asLender: true })}</strong>
        </div>
        {track(lender)}
      </div>
      <div className="bar yours">
        <div className="bar-head">
          <span>Safe for you</span>
          <strong>{money(safe)}</strong>
        </div>
        {track(safe)}
      </div>
      {askedAt !== undefined ? (
        <div className="bars-key">
          <span className="asked-key" aria-hidden="true" /> the {inLakh(asked!)} you asked for
        </div>
      ) : null}
    </div>
  );
}
