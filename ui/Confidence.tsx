/**
 * The confidence meter.
 *
 * Confidence here means one thing only: how narrow the answer is. It is not a
 * progress bar and it is not a reward for answering questions — answering ten
 * questions that change nothing must not make anyone feel more certain, and the
 * copy says so out loud, because every other form a borrower has ever filled in
 * has trained them to expect the opposite.
 *
 * The thresholds live in `confidence.thresholds` in the rule tables, so this
 * component only draws what the engine decided.
 */

import type { Result } from '../engine/compute';
import { money, rate as rateText } from '../engine/format';

const COPY: Record<string, { label: string; why: string }> = {
  high: {
    label: 'Narrow',
    why: 'The range is tight enough to act on. Take it to a lender.',
  },
  medium: {
    label: 'Workable',
    why: 'Wide enough that the ends mean different things. Another answer or two would close it.',
  },
  low: {
    label: 'Wide',
    why: 'The top and bottom of this answer are different situations. That is honest, not broken — it usually means something important is still assumed.',
  },
};

export function Confidence({ result }: { readonly result: Result }) {
  const copy = COPY[result.confidence] ?? COPY.low!;
  const width = result.confidence === 'high' ? 100 : result.confidence === 'medium' ? 62 : 28;

  return (
    <section className={`confidence ${result.confidence}`}>
      <div className="crow">
        <span className="label">How narrow the answer is</span>
        <strong>{copy.label}</strong>
      </div>
      <div className="meter">
        <span style={{ width: `${width}%` }} />
      </div>
      <p className="muted">{copy.why}</p>
      <p className="muted">
        Right now: safe to carry {money(result.amounts.safe)}
        {result.pricing ? `, at ${rateText(result.pricing.rateBand)}` : ''}.
      </p>
    </section>
  );
}
