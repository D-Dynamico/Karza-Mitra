/**
 * The four outputs, on screen.
 *
 * Every sentence here is either fixed framing or comes out of the trace. There
 * is no per-borrower copy in this file — if a panel needs to say something
 * different about one borrower than another, a rule says it, not a branch here.
 *
 * The page is deliberately short. An earlier version put the Negotiation Card
 * inline underneath these panels, which meant the amount, product, rate, all-in
 * rate, fee, tenure and instalment were each printed twice — around 370 words of
 * pure duplication, and a scroll long enough that the answer was hard to find.
 * Explainability is not the same as putting everything on one screen: a page
 * nobody can navigate explains nothing. So the Card is its own view and most
 * rationale sits one tap away in a drawer.
 *
 * Product routing is the exception and stays on the surface, comparison table
 * and all. It is the heaviest thing here in domain terms, and a costed
 * side-by-side of the option the borrower is being steered away from is the
 * argument itself, not a footnote to it.
 */

import type { Answers } from '../engine/answers';
import type { Result } from '../engine/compute';
import { money, perMonth, rate as rateText, rupees, share } from '../engine/format';
import { pivotalAssumptions } from '../engine/pivotal';
import { allQuestions } from '../engine/questions';
import { QuoteCheck } from './QuoteCheck';
import { TightenThis, WorkingDrawer } from './Working';

const VERDICT_CLASS: Record<string, string> = {
  borrow: 'go',
  'borrow-less': 'less',
  dont: 'stop',
  'need-more-info': 'less',
};

export function Results({
  result,
  answers,
  onTighten,
  onOpenCard,
}: {
  readonly result: Result;
  readonly answers: Answers;
  readonly onTighten: (field: keyof Answers) => void;
  readonly onOpenCard: () => void;
}) {
  const { amounts, pricing, repayment, routing } = result;

  // An assumption whose two ends disagree about what to do is not a detail to
  // be tightened later — it is the answer. Ask it before anything else.
  const pivotal = pivotalAssumptions(answers);

  return (
    <>
      <section className={`verdict ${VERDICT_CLASS[result.verdict.kind] ?? 'less'}`}>
        <div className="kind">{result.verdict.kind.replace('-', ' ')}</div>
        <h2>{result.verdict.headline}</h2>
        <p>{result.verdict.why}</p>
        {result.verdict.nextStep ? <div className="next">{result.verdict.nextStep}</div> : null}
      </section>

      {pivotal.map((p) => {
        const question = allQuestions.find((q) => q.field === p.field);
        return (
          <section className="pivotal no-print" key={String(p.field)}>
            <span className="label">Confirm this one thing</span>
            <h2>{question?.prompt ?? 'One answer decides this'}</h2>
            <p>
              Your answer below rests on a guess, and the two ends of that guess disagree. At the
              low end the answer is <strong>{p.atLow.verdict.replace('-', ' ')}</strong>; at the
              high end it is <strong>{p.atHigh.verdict.replace('-', ' ')}</strong>. Everything
              else on this page is steadier than this one fact.
            </p>
            <p className="muted">{p.assumption}</p>
            <button
              type="button"
              className="btn primary wide"
              onClick={() => onTighten(p.field)}
            >
              Answer it now
            </button>
          </section>
        );
      })}

      {/* O2 — the two numbers. The whole point, so it goes first. */}
      <section className="panel">
        <span className="label">How much</span>
        <div className="two-up">
          <div className="theirs">
            <div className="muted">A lender would sanction</div>
            <div className="figure small">{money(amounts.lender, { asLender: true })}</div>
          </div>
          <div className="yours">
            <div className="muted">You can safely carry</div>
            <div className="figure small">{money(amounts.safe)}</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Two rulebooks, not one number with a margin of error. A lender counts what you owe; it
          does not count your rent. You have to.
          {amounts.asked !== undefined ? ` You asked for ${rupees(amounts.asked)}.` : ''}
        </p>
        <WorkingDrawer
          trace={result.trace}
          rules={['affordability.', 'amounts.', 'income.', 'expenses.', 'rent.']}
        />
        <TightenThis answers={answers} output="O2.safe" onAnswer={onTighten} limit={1} />
      </section>

      {/* O2/O3/O4 — one spec block. These were three panels of prose; the prose
          moved into the drawers and the numbers stayed. */}
      <section className="panel">
        <span className="label">The deal to ask for</span>
        <dl className="spec">
          {routing ? (
            <>
              <dt>Product</dt>
              <dd>
                {routing.product.name}
                {routing.product.secured ? ' · secured' : ''}
              </dd>
            </>
          ) : null}
          {pricing ? (
            <>
              <dt>Rate</dt>
              <dd>{rateText(pricing.rateBand)}</dd>
              <dt>All-in, fees included</dt>
              <dd>{rateText(pricing.aprBand)}</dd>
              <dt>Tenure</dt>
              <dd>{pricing.tenureMonths} months</dd>
            </>
          ) : null}
          {repayment ? (
            <>
              <dt>Instalment ceiling</dt>
              <dd>{perMonth(repayment.emiCeiling)}</dd>
            </>
          ) : null}
        </dl>

        {repayment?.stressBreaches ? (
          <div className="nudge bad">
            After a bad month this breaches the ceiling. That, not today&rsquo;s arithmetic, is
            what is limiting the amount.
          </div>
        ) : null}

        {/* Product routing is the single heaviest thing this engine is judged
            on, and the rejected option costed beside it is the whole argument.
            It was briefly folded into a drawer to shorten the page; that made
            the reasoning one tap less visible than the number it justifies,
            which is the wrong trade on this panel specifically. It stays out. */}
        {routing ? (
          <>
            <p style={{ marginTop: 12 }}>{routing.why}</p>
            {routing.alternative ? (
              <>
                <h3>Why not a {routing.alternative.product.name.toLowerCase()}</h3>
                <p className="muted">{routing.alternative.why}</p>
                <div className="scroll-x">
                  <table className="compare">
                    <thead>
                      <tr>
                        <th />
                        <th>{routing.product.name}</th>
                        <th>{routing.alternative.product.name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>Rate</th>
                        <td>{rateText(routing.product.rateBand)}</td>
                        <td>{rateText(routing.alternative.product.rateBand)}</td>
                      </tr>
                      <tr>
                        <th>Fee</th>
                        <td>
                          {routing.product.feeBand.lo}–{routing.product.feeBand.hi}%
                        </td>
                        <td>
                          {routing.alternative.product.feeBand.lo}–
                          {routing.alternative.product.feeBand.hi}%
                        </td>
                      </tr>
                      <tr>
                        <th>Secured on</th>
                        <td>{routing.product.secured ? 'an asset you pledge' : 'nothing'}</td>
                        <td>
                          {routing.alternative.product.secured ? 'an asset you pledge' : 'nothing'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            {routing.securedCap ? (
              <p className="muted">
                What you pledge supports {money(routing.securedCap)} — the loan is capped by that
                as well as by what you can afford.
              </p>
            ) : null}
          </>
        ) : null}

        {pricing ? (
          <details>
            <summary>What the all-in rate includes</summary>
            <p className="muted">
              It folds the {pricing.feeBand.lo}–{pricing.feeBand.hi}% processing fee and its GST
              back into the rate. It is the only number worth comparing between two offers — a
              lower headline rate with a bigger fee can be the dearer loan.
            </p>
          </details>
        ) : null}

        {repayment ? (
          <details>
            <summary>What a bad month does to this</summary>
            <p className="muted">
              The instalment takes {share(repayment.outflowRatioNow)} of your income now, and{' '}
              {share(repayment.outflowRatioStressed)} after a fifth off your income and two points
              on the rate.
            </p>
          </details>
        ) : null}

        <WorkingDrawer
          trace={result.trace}
          rules={['products.', 'pricing.', 'credit.', 'stability.', 'stress.']}
        />
        <TightenThis answers={answers} output="O3.rate" onAnswer={onTighten} limit={1} />
      </section>

      <QuoteCheck result={result} />

      {/* Was a full panel with its own heading and intro paragraph. The list is
          worth keeping — it is what a borrower can correct — but it is not worth
          a panel, and the same facts are already flagged inside the drawers. */}
      {result.assumptions.length > 0 ? (
        <section className="panel no-print" id="guessed">
          <details>
            <summary>
              {result.assumptions.length} answer{result.assumptions.length === 1 ? ' was' : 's were'}{' '}
              assumed — each one widened your answer
            </summary>
            <ul className="redlines">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      <button type="button" className="btn primary wide no-print" onClick={onOpenCard}>
        Take this to the lender →
      </button>
      <p className="muted centred no-print">
        One page with the amount, the rate and what to say no to.
      </p>
    </>
  );
}
