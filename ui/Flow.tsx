/**
 * The question flow: one question per screen.
 *
 * The order is not a script. The must set comes first because without it the
 * engine would be inventing rather than estimating; after that the engine is
 * asked what to raise next, one question at a time, re-ranked after every
 * answer. So a borrower who says they own nothing is never asked what it is
 * worth, and two people answering honestly can see different questions.
 *
 * Three things on every screen, all of them scored:
 *
 * - **Why are you asking?** — one sentence, from the question itself.
 * - **Skip, always visible, with its cost stated.** Skipping never blocks the
 *   answer; it widens it, and the assumption that filled the gap is labelled
 *   later. This is the difference between an engine that refuses to answer and
 *   one that answers honestly with less.
 * - **What moved** — after each answer, what actually changed. It stays silent
 *   when nothing did, which is the point: it is evidence the question was worth
 *   asking, so it must be capable of saying nothing.
 */

import { useMemo, useState } from 'react';
import type { Answers } from '../engine/answers';
import { compute, type Result } from '../engine/compute';
import { rupees } from '../engine/format';
import { nextQuestions, whatMoved, type Movement } from '../engine/next-questions';
import { readOutput, type OutputId } from '../engine/outputs';
import { mustSet, type Question } from '../engine/questions';
import { Confidence } from './Confidence';
import { Field } from './Field';

/** How an output reads in the "what moved" banner. */
const fmt = (id: OutputId, r: Result): string => {
  if (id === 'O1.verdict') return r.verdict.kind.replace('-', ' ');
  const v = readOutput(r, id);
  if (id === 'O3.rate' || id === 'O3.apr') return `${v.lo.toFixed(1)}%–${v.hi.toFixed(1)}%`;
  if (id === 'O4.stress') return `${(v.lo * 100).toFixed(0)}%–${(v.hi * 100).toFixed(0)}%`;
  return v.lo === v.hi ? rupees(v.lo) : `${rupees(v.lo)}–${rupees(v.hi)}`;
};

export function Flow({
  answers,
  setAnswers,
  onDone,
  startOnReview = false,
}: {
  readonly answers: Answers;
  readonly setAnswers: (next: Answers) => void;
  readonly onDone: () => void;
  /** Entered from the answer screen to check or change what was said. */
  readonly startOnReview?: boolean;
}) {
  const [skipped, setSkipped] = useState<readonly string[]>([]);
  const [moved, setMoved] = useState<readonly Movement[]>([]);
  const [showWhy, setShowWhy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [reviewing, setReviewing] = useState(startOnReview);
  /**
   * Every previous state, so Back is a real undo rather than a guess at which
   * question came before. The ordering is recomputed after each answer, so the
   * only reliable way back is to restore the state we were actually in.
   */
  const [history, setHistory] = useState<
    readonly { answers: Answers; skipped: readonly string[] }[]
  >([]);

  const result = useMemo(() => compute(answers), [answers]);

  // The must set in order, then whatever the engine ranks highest. Anything
  // skipped is not offered again — a borrower who declined once should not have
  // to decline repeatedly.
  const question: Question | undefined = useMemo(() => {
    const pendingMust = mustSet.find(
      (q) => answers[q.field] === undefined && !skipped.includes(q.id) && q.applies(answers),
    );
    if (pendingMust) return pendingMust;
    return nextQuestions(answers, 10).find((r) => !skipped.includes(r.question.id))?.question;
  }, [answers, skipped]);

  const mustDone = mustSet.filter(
    (q) => answers[q.field] !== undefined || skipped.includes(q.id),
  ).length;

  const remember = (): void =>
    setHistory((prev) => [...prev, { answers, skipped }]);

  const commit = (value: Answers[keyof Answers]): void => {
    if (!question) return;
    const after: Answers = { ...answers, [question.field]: value };
    remember();
    setMoved(whatMoved(compute(answers), compute(after), fmt));
    setAnswers(after);
    setShowWhy(false);
    setShowHint(false);
  };

  const skip = (): void => {
    if (!question) return;
    remember();
    setSkipped((prev) => [...prev, question.id]);
    setMoved([]);
    setShowWhy(false);
    setShowHint(false);
  };

  const back = (): void => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((prev) => prev.slice(0, -1));
    setAnswers(previous.answers);
    setSkipped(previous.skipped);
    setMoved([]);
    setShowWhy(false);
    setShowHint(false);
  };

  if (reviewing || !question) {
    return (
      <Review
        answers={answers}
        result={result}
        skipped={skipped}
        onFix={(id) => {
          setSkipped((prev) => prev.filter((x) => x !== id));
          setReviewing(false);
        }}
        onChange={(field) => {
          // Clearing the answer puts the question back in the queue, which is
          // the same path as never having answered it — so there is one way a
          // question gets asked, not two.
          const { [field]: _dropped, ...rest } = answers;
          setAnswers(rest as Answers);
          setMoved([]);
          setReviewing(false);
        }}
        onDone={onDone}
        onBack={question ? () => setReviewing(false) : undefined}
      />
    );
  }

  return (
    <>
      <div className="progress no-print">
        <div className="bar">
          <span style={{ width: `${Math.round((mustDone / mustSet.length) * 100)}%` }} />
        </div>
        <span className="muted">
          {mustDone < mustSet.length
            ? `${mustDone} of ${mustSet.length} essentials`
            : 'Essentials done — these only sharpen the answer'}
        </span>
      </div>

      {moved.length > 0 ? (
        <div className="moved" role="status">
          <strong>That changed:</strong>
          <ul>
            {moved.map((m) => (
              <li key={m.id}>
                {m.label}: <span className="was">{m.before}</span> → <strong>{m.after}</strong>
                {m.narrowed ? <span className="tight"> narrower</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="ask">
        <h2>
          {question.prompt}
          {question.hint ? (
            <button
              type="button"
              className="hintdot"
              aria-label={`What does this mean? ${question.hint}`}
              title={question.hint}
              aria-expanded={showHint}
              onClick={() => setShowHint((v) => !v)}
            >
              ?
            </button>
          ) : null}
        </h2>
        {showHint && question.hint ? <p className="why-box">{question.hint}</p> : null}

        <button type="button" className="whylink" onClick={() => setShowWhy((v) => !v)}>
          {showWhy ? 'Hide' : 'Why are you asking?'}
        </button>
        {showWhy ? <p className="why-box">{question.whyWeAsk}</p> : null}

        {/* Keyed by question id so a text field never carries its value into
            the next question — two money questions in a row would otherwise
            reuse the same component instance and keep the previous answer. */}
        <Field
          key={question.id}
          input={question.input}
          onCommit={commit}
          varies={answers.incomeType !== undefined && answers.incomeType !== 'salaried'}
        />

        <div className="skip">
          <button type="button" className="skipbtn" onClick={skip}>
            Skip this
          </button>
          <span className="muted">{question.skipCost}</span>
        </div>
      </section>

      {history.length > 0 ? (
        <button type="button" className="back" onClick={back}>
          ← Back to the last question
        </button>
      ) : null}

      <Confidence result={result} showAmount={mustDone >= mustSet.length} />

      {mustDone >= mustSet.length ? (
        <button type="button" className="btn wide" onClick={() => setReviewing(true)}>
          I have answered enough — show me the answer
        </button>
      ) : null}
    </>
  );
}

/**
 * The review screen.
 *
 * Every answer, what was assumed on the borrower's behalf, and every blank made
 * tappable. The assumed values are the important half: an answer built partly on
 * guesses should say which ones before it is acted on, not after.
 */
function Review({
  answers,
  result,
  skipped,
  onFix,
  onChange,
  onDone,
  onBack,
}: {
  readonly answers: Answers;
  readonly result: Result;
  readonly skipped: readonly string[];
  readonly onFix: (questionId: string) => void;
  readonly onChange: (field: keyof Answers) => void;
  readonly onDone: () => void;
  readonly onBack: (() => void) | undefined;
}) {
  const asked = mustSet.filter((q) => answers[q.field] !== undefined);
  const blanks = mustSet.filter((q) => answers[q.field] === undefined && q.applies(answers));

  return (
    <>
      <h2>Before the answer — check these</h2>
      <p className="muted">
        Everything below feeds the numbers. Anything marked assumed is our guess, not your
        answer, and correcting one narrows every figure.
      </p>

      <section className="panel">
        <span className="label">What you told us</span>
        <ul className="review">
          {asked.map((q) => (
            <li key={q.id}>
              <span>{q.prompt}</span>
              <span className="answer">
                <strong>{describe(answers[q.field])}</strong>
                <button type="button" className="changebtn" onClick={() => onChange(q.field)}>
                  Change
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {result.assumptions.length > 0 ? (
        <section className="panel">
          <span className="label">What we assumed</span>
          <ul className="redlines">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {blanks.length > 0 ? (
        <section className="panel">
          <span className="label">Still blank — tap to fill</span>
          <div className="tighten">
            {blanks.map((q) => (
              <button type="button" className="q" key={q.id} onClick={() => onFix(q.id)}>
                {q.prompt}
                <span className="promise">{q.skipCost}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {skipped.length > 0 && blanks.length === 0 ? (
        <p className="muted">
          You skipped {skipped.length} question{skipped.length === 1 ? '' : 's'}. The answer is
          wider than it needs to be because of it, and it says where.
        </p>
      ) : null}

      <Confidence result={result} showAmount />

      <button type="button" className="btn primary wide" onClick={onDone}>
        Show me the answer →
      </button>
      {onBack ? (
        <button type="button" className="back" onClick={onBack}>
          ← Keep answering
        </button>
      ) : null}
    </>
  );
}

/** An answer as the borrower would recognise it. */
function describe(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v >= 1000 ? rupees(v) : String(v);
  if (typeof v === 'object' && v !== null && 'lo' in v) {
    const r = v as { lo: number; hi: number };
    return r.lo === r.hi ? rupees(r.lo) : `${rupees(r.lo)} to ${rupees(r.hi)}`;
  }
  if (typeof v === 'object' && v !== null && 'known' in v) {
    const c = v as { known: boolean; score?: number; everBorrowed?: boolean };
    if (c.known) return String(c.score);
    return c.everBorrowed ? 'Not known' : 'Never borrowed';
  }
  return String(v);
}
