/**
 * The "don't borrow" screen.
 *
 * A refusal that stops at "no" is the failure mode this whole product is built
 * against, so the screen is organised around what to do instead: the surplus
 * that explains the answer, the debts to clear in the order that frees the most
 * money, and a set of toggles that re-run the engine and show what the answer
 * would become.
 *
 * The toggles are the honest part. Each one is a real change to the answers, fed
 * back through `compute`, so the number that appears is the number the engine
 * would actually give — not an illustration.
 */

import { useMemo, useState } from 'react';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { approx, money, perMonth, rupees } from '../engine/format';
import { iv } from '../engine/interval';
import {
  nothingUnlocksIt,
  options as allOptions,
  pathToYes,
  smallestUnlockingCombination,
} from '../engine/path-to-yes';

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
        <span className="label">Clear these first, in this order</span>
        <p className="muted">
          Highest rate first, because that frees the most money per rupee repaid.
        </p>
        <ol className="ordered">
          {base.verdict.nextStep ? <li>{base.verdict.nextStep}</li> : null}
          {ranked
            .filter((r) => r.option.kind === 'do today')
            .map((r) => (
              <li key={r.option.id}>
                {r.option.label}
                {r.delta > 0 ? (
                  <span className="effect up"> — worth {approx(r.delta)} more you could borrow</span>
                ) : null}
              </li>
            ))}
        </ol>
      </section>

      <section className="panel">
        <span className="label">What would change the answer</span>
        <p className="muted">
          Tick anything you could actually do. The number below is what this works out
          afterwards. It is calculated again, not an example.
        </p>

        {nothingUnlocksIt(ranked) ? (
          <div className="nudge bad">
            Nothing on this list, on its own, turns this into a yes. Better to say that plainly
            than to show you a list of near misses.
            {combo ? ' Two of them together would — see below.' : ''}
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
                  <span className="kind">{r.option.kind}</span>
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

        <div className="gap-note">
          <strong>With what you have ticked: {projected.verdict.kind}.</strong>{' '}
          {projected.verdict.headline}
          <br />
          {projected.verdict.kind === 'dont' ? (
            // While the answer is still "don't", the safe amount is held at zero
            // on purpose. Printing an instalment ceiling beside it would read as
            // "you can carry nothing, and also ₹4,000 a month" — two true
            // sentences that contradict each other in front of a borrower.
            <>Still not enough to change the answer: safe for you {money(projected.amounts.safe)}.</>
          ) : (
            <>
              Safe for you {money(projected.amounts.safe)}
              {projected.repayment
                ? `, at most ${perMonth(projected.repayment.emiCeiling)}`
                : ''}
              .
            </>
          )}
        </div>
      </section>

      {combo ? (
        <section className="panel">
          <span className="label">The smallest set that works</span>
          <p>
            {combo.options.map((o) => o.label).join(', and ')} — together, that gets you to{' '}
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

      <section className="panel">
        <span className="label">What a lender would still give you</span>
        <div className="figure small">{money(base.amounts.lender, { asLender: true })}</div>
        <p className="muted">
          Someone will lend you this money today. That does not make it a good idea. This number
          exists here because it is what you are up against: the offer that arrives at exactly
          the wrong moment.
        </p>
      </section>
    </>
  );
}

/** Kept so the ceiling can be shown where a range collapsed to a point. */
export const pointRange = iv;
