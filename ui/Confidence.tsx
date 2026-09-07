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
 *
 * There is one state before any of that applies. Until an income is given the
 * engine returns `need-more-info` and a safe amount of zero — a real zero,
 * meaning "no answer yet", not "you can carry nothing". Printing it read as
 * **"safe to carry nothing"** on the first four screens of the flow, which is
 * not a cautious answer, it is a wrong one, and a borrower who reads one absurd
 * number stops believing the rest of the page. So while there is no answer, this
 * says there is no answer.
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
  // No answer yet. Say that, rather than reporting a zero as though it were one.
  if (result.verdict.kind === 'need-more-info') {
    return (
      <section className="confidence none">
        <div className="crow">
          <span className="label">How narrow the answer is</span>
          <strong>Nothing to narrow yet</strong>
        </div>
        <div className="meter">
          <span style={{ width: '0%' }} />
        </div>
        <p className="muted">{result.verdict.why}</p>
        {result.verdict.nextStep ? <p className="muted">{result.verdict.nextStep}</p> : null}
      </section>
    );
  }

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
