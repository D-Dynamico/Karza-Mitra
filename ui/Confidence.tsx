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
 * number stops believing the rest of the page.
 *
 * So during the must set this box does not report a width at all — an empty bar
 * under a generic sentence is decoration. It makes a promise instead: your
 * figures arrive after this many questions, and every answer after that narrows
 * them. `Flow` then replaces the same box with the "what moved" list from the
 * second answer onward, so one box on the page goes from promise to evidence
 * rather than two boxes competing.
 */

import type { Result } from '../engine/compute';
import { money, rate as rateText } from '../engine/format';

const COPY: Record<string, { label: string; why: string }> = {
  high: {
    label: 'Very specific',
    why: 'The range is tight enough to act on. Take it to a lender.',
  },
  medium: {
    label: 'Workable',
    why: 'Wide enough that the two ends mean different things. One or two more answers would close it.',
  },
  low: {
    label: 'Still wide',
    why: 'The top and the bottom of this answer are two different situations. That is honest, not broken. It usually means we are still guessing something important.',
  },
};

export function Confidence({
  result,
  showAmount = true,
  totalEssentials,
}: {
  readonly result: Result;
  /**
   * Whether to print the actual amount, or only how wide it is.
   *
   * Mid-flow, before the essential questions are done, the engine has a real
   * number but it rests on half the facts. Showing it invites anchoring on a
   * figure that is about to move a long way, which is a worse failure than
   * showing nothing — so until the must set is complete this reports movement
   * and width only, and the amount arrives when it has been earned.
   */
  readonly showAmount?: boolean;
  /** How many essentials there are, for the promise made during them. */
  readonly totalEssentials?: number;
}) {
  // Still collecting the essentials: make a promise rather than report a width
  // nobody can use yet. This also covers `need-more-info`, which is what the
  // engine returns until an income is given.
  if (!showAmount) {
    return (
      <section className="confidence none">
        <div className="crow">
          <span className="label">How specific your answer can be</span>
          <strong>Just getting started</strong>
        </div>
        <div className="meter">
          <span style={{ width: '0%' }} />
        </div>
        <p className="muted">
          Your numbers appear after {totalEssentials ?? 10} questions. Each answer after that
          narrows them.
        </p>
      </section>
    );
  }

  // Answered enough to have figures, but not enough to have an income — only
  // reachable by skipping the income question, which is allowed.
  if (result.verdict.kind === 'need-more-info') {
    return (
      <section className="confidence none">
        <div className="crow">
          <span className="label">How specific your answer can be</span>
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
        <span className="label">How specific your answer can be</span>
        <strong>{copy.label}</strong>
      </div>
      <div className="meter">
        <span style={{ width: `${width}%` }} />
      </div>
      <p className="muted">{copy.why}</p>
      <p className="muted">
        So far: safe for you {money(result.amounts.safe)}
        {result.pricing ? `, at ${rateText(result.pricing.rateBand)}` : ''}.
      </p>
    </section>
  );
}
