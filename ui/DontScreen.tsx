/**
 * The "don't borrow" screen.
 *
 * A refusal that stops at "no" is the failure mode this whole product is built
 * against, so the screen is organised around what to do instead: the surplus
 * that explains the answer, the debts to clear in the order that frees the most
 * money, and a set of toggles that re-run the engine and show what the answer
 * would become.
 *
 * Two panels were cut from it. "Clear these first, in this order" printed the
 * verdict's next step a second time and then the "do today" toggles a second
 * time, so the same sentence about app loans appeared three times on one
 * screen. And "What a lender would still give you" is now the first bar in the
 * verdict box above, where it sits beside the safe amount it has to be read
 * against.
 *
 * The toggles are the honest part. Each one is a real change to the answers, fed
 * back through `compute`, so the number that appears is the number the engine
 * would actually give — not an illustration.
 */

import { useMemo, useState } from 'react';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { approx, money, perMonth, rupees } from '../engine/format';
import { iv, type Interval } from '../engine/interval';
import {
  nothingUnlocksIt,
  options as allOptions,
  pathToYes,
  smallestUnlockingCombination,
} from '../engine/path-to-yes';
import { VERDICT_TONE, verdictWord } from './words';

/** The engine's option kinds, as a borrower would say them. */
const KIND_WORD: Record<string, string> = {
  'do today': 'You can do this now',
  'takes time': 'Takes a few months',
  'if it is true': 'Only if it is true for you',
};

/**
 * "At most ₹0 to ₹3,000 a month" is what the limit read as when its bottom end
 * is nothing. A range from zero is a ceiling, so it is said as one.
 */
const emiLimit = (x: Interval): string =>
  x.lo < 1000 ? `an EMI of up to ${perMonth(iv(x.hi, x.hi))}` : `an EMI of at most ${perMonth(x)}`;

/** "A, and b" — the labels are written to open a sentence, so only the first keeps its capital. */
const sentenceList = (labels: readonly string[]): string =>
  labels.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))).join(', and ');

export function DontScreen({ answers }: { readonly answers: Answers }) {
  const [on, setOn] = useState<readonly string[]>([]);

  const base = useMemo(() => compute(answers), [answers]);
  const ranked = useMemo(() => pathToYes(answers), [answers]);
  const combo = useMemo(() => smallestUnlockingCombination(answers), [answers]);

  // Apply every toggled option and re-run. This is the same code path the
  // verdict came from, so the projected answer cannot flatter the real one.
  const projected = useMemo(() => {
    let merged: Answers = { ...answers };
    for (const id of on) {
      const option = allOptions.find((o) => o.id === id);
      if (option) merged = { ...merged, ...option.change };
    }
    return compute(merged);
  }, [answers, on]);

  const toggle = (id: string): void =>
    setOn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const surplus = base.surplus;
  const negative = surplus.hi <= 0;

  return (
    <>
      <section className="panel">
        <span className="label">Why the answer is no</span>
        <div className="figure">
          {negative ? 'Nothing is left at the end of the month' : `${money(surplus)} left over`}
        </div>
        <p className="muted">
          {negative
            ? 'Before any new EMI, what comes in does not cover what goes out. A new loan does not fix that. It delays it and makes it bigger.'
            : 'That is what is left after rent, what the house spends, and the EMIs you already pay. A new EMI has to fit inside it and still leave room for a bad month.'}
        </p>

        <details>
          <summary>Show the working</summary>
          <ul className="working">
            {base.trace
              .filter((e) => e.rule.startsWith('affordability.surplus') || e.rule === 'expenses.default' || e.rule.startsWith('rent.'))
              .map((e, i) => (
                <li key={`${e.rule}-${i}`}>
                  <div className="row">
                    <span className="rule-name">{e.label}</span>
                    <span className="out">
                      {typeof e.output === 'object' && e.output !== null && 'lo' in e.output
                        ? money(e.output)
                        : typeof e.output === 'number'
                          ? rupees(e.output)
                          : String(e.output)}
                    </span>
                  </div>
                  <div className="why">{e.why}</div>
                </li>
              ))}
          </ul>
        </details>
      </section>

      <section className="panel">
        <span className="label">What would change the answer</span>
        <p className="muted">
          Tick what you could really do. We work the answer out again each time you tick.
        </p>

        {nothingUnlocksIt(ranked) ? (
          <div className="nudge bad">
            None of these on its own turns this into a yes.
            {combo ? ' Two together would — see below.' : ''}
          </div>
        ) : null}

        <ul className="toggles">
          {ranked.map((r) => (
            <li key={r.option.id} className={on.includes(r.option.id) ? 'on' : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={on.includes(r.option.id)}
                  onChange={() => toggle(r.option.id)}
                />
                <span>
                  <span className="kind">{KIND_WORD[r.option.kind]}</span>
                  <br />
                  {r.option.label}
                  <br />
                  <span className={r.delta > 0 ? 'effect up' : 'effect'}>
                    {r.delta > 0
                      ? `+${approx(r.delta)} you could borrow`
                      : r.delta < 0
                        ? `${approx(r.delta)} — this one costs you`
                        : 'no change on its own'}
                    {r.unlocks ? ' · turns the answer to yes' : ''}
                  </span>
                  {r.option.assumes ? (
                    <>
                      <br />
                      <span className="muted">Assumes {r.option.assumes}.</span>
                    </>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {/* The projection is drawn in the colour of the verdict it lands on,
            so ticking the right pair visibly turns the box from red to amber. */}
        <div className={`projected ${VERDICT_TONE[projected.verdict.kind]}`} role="status">
          <span className="pill">
            {on.length === 0 ? 'Right now' : 'If you did this'}: {verdictWord(projected.verdict.kind)}
          </span>
          <div>
            {projected.verdict.kind === 'dont' ? (
              // While the answer is still "don't", the safe amount is held at zero
              // on purpose. Printing an EMI limit beside it would read as "you
              // can carry nothing, and also ₹4,000 a month" — two true sentences
              // that contradict each other in front of a borrower.
              on.length === 0 ? (
                <>Tick something above to see what it would change.</>
              ) : (
                <>Not enough yet. {projected.verdict.headline}</>
              )
            ) : (
              <>
                Safe for you: <strong>{money(projected.amounts.safe)}</strong>
                {projected.repayment ? `, ${emiLimit(projected.repayment.emiCeiling)}` : ''}
                .
              </>
            )}
          </div>
        </div>
      </section>

      {combo ? (
        <section className="panel">
          <span className="label">The smallest set that works</span>
          <p>
            {sentenceList(combo.options.map((o) => o.label))}. Together, that gets you to{' '}
            <strong>{money(combo.safeAmount)}</strong>.
          </p>
          {combo.stillShortBy > 0 ? (
            <>
              <p className="muted">
                Still {approx(combo.stillShortBy)} short of what you asked for. Ways to close that
                gap that are not a bigger loan:
              </p>
              <ul className="redlines">
                {combo.waysToCloseTheGap.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

    </>
  );
}

/** Kept so the ceiling can be shown where a range collapsed to a point. */
export const pointRange = iv;
