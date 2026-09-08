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
import { approx, inLakh, money, perMonth, rate as rateText, share, tenure as tenureText } from '../engine/format';
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
            <h2>{question?.promptFor?.(answers) ?? question?.prompt ?? 'One answer decides this'}</h2>
            <p>
              We had to guess this one, and the guess changes the answer. If it is at the low
              end, the answer is <strong>{p.atLow.verdict.replace('-', ' ')}</strong>. At the
              high end it is <strong>{p.atHigh.verdict.replace('-', ' ')}</strong>. Nothing else
              on this page turns on one fact this much.
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
            <div className="muted">A lender would approve</div>
            <div className="figure small">{money(amounts.lender, { asLender: true })}</div>
          </div>
          <div className="yours">
            <div className="muted">Safe for you</div>
            <div className="figure small">{money(amounts.safe)}</div>
          </div>
        </div>
        {/* The sentence comes from the engine, because it is a claim about this
            borrower: the old fixed version blamed rent for someone who paid
            none. See `amounts.whyTheyDiffer`. */}
        <p className="muted" style={{ marginTop: 10 }}>
          {amounts.whyTheyDiffer}
          {amounts.asked !== undefined ? ` You asked for ${inLakh(amounts.asked)}.` : ''}
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
              <dt>Your rate</dt>
              <dd>{rateText(pricing.rateBand)}</dd>
              <dt>All-in rate, with fees</dt>
              <dd>{rateText(pricing.aprBand)}</dd>
              <dt>How long</dt>
              <dd>{tenureText(pricing.tenureMonths)}</dd>
            </>
          ) : null}
          {repayment ? (
            <>
              <dt>Most you should pay</dt>
              <dd>{perMonth(repayment.emiCeiling)}</dd>
            </>
          ) : null}
        </dl>

        {repayment?.stressBreaches ? (
          <div className="nudge bad">
            In a bad month this EMI goes over what you can pay. That is what caps the amount,
            not this month&rsquo;s figures.
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
                {/* "Several points more" is true and useless. The same fact in
                    rupees is one the borrower can repeat at the counter, and it
                    is the argument for pledging something. */}
                {result.alternativeCost ? (
                  <p>
                    <strong>
                      The same {inLakh(result.alternativeCost.amount)} as a{' '}
                      {routing.alternative.product.name.toLowerCase()} would cost you about{' '}
                      {approx(result.alternativeCost.extraInterest)} more in interest over{' '}
                      {tenureText(result.alternativeCost.months)}.
                    </strong>
                  </p>
                ) : null}
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
                        <th>Typical rate</th>
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
                {/* Two rate bands used to sit on this page both labelled
                    "Rate": the borrower's adjusted band above and the product's
                    base band here. On adverse credit they read as a flat
                    contradiction — 13.75–19.25% above, 8.75–14% here — for the
                    same loan. Labelling them is enough; the table's job is
                    product against product, so the base band is the right one
                    to show in it. */}
                <p className="muted">
                  These are the rates lenders publish for each kind of loan, before anything is
                  adjusted for you.
                  {pricing ? ` Your own rate is ${rateText(pricing.rateBand)}.` : ''}
                </p>
              </>
            ) : null}
            {routing.securedCap ? (
              <p className="muted">
                What you pledge is worth {money(routing.securedCap)} to a lender. That caps the
                loan too, not just what you can afford.
              </p>
            ) : null}
          </>
        ) : null}

        {pricing ? (
          <details>
            <summary>What the all-in rate includes</summary>
            <p className="muted">
              The {pricing.feeBand.lo}–{pricing.feeBand.hi}% processing fee and the GST on it
              never reach your account, but you repay as though they did. This rate puts them
              back in. Compare two offers on this number, not the headline one — a lower rate
              with a bigger fee can be the costlier loan.
            </p>
          </details>
        ) : null}

        {repayment ? (
          <details>
            <summary>What a bad month does to this</summary>
            <p className="muted">
              The EMI takes {share(repayment.outflowRatioNow)} of your income now. It would take{' '}
              {share(repayment.outflowRatioStressed)} if your income dropped by a fifth and the
              rate went up.
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
        One page with the amount, the rate, and what to say no to.
      </p>
    </>
  );
}
