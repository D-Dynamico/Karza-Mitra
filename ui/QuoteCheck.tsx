/**
 * Put a real lender quote against the band.
 *
 * This is the screen a borrower opens while somebody is quoting at them, so it
 * answers two questions and no others: is this rate inside the fair band, and
 * what does it actually cost once the fee is folded back in.
 *
 * The nudge is one line and never a modal, and "use it anyway" always works.
 * A tool that blocks a borrower from recording the offer in front of them is a
 * tool they close.
 *
 * It starts folded. Most people reading the answer have no quote yet, and two
 * empty number boxes in the middle of the page read as one more form to fill.
 * The line that opens it says when to use it, which is all they need until then.
 */

import { useState } from 'react';
import type { Result } from '../engine/compute';
import { apr, emi } from '../engine/finance';
import { inLakh, perMonth, rate as rateText, tenure as tenureText } from '../engine/format';
import { iv } from '../engine/interval';

export function QuoteCheck({ result }: { readonly result: Result }) {
  const [text, setText] = useState('');
  const [feeText, setFeeText] = useState('');
  const [overridden, setOverridden] = useState(false);

  const pricing = result.pricing;
  if (!pricing) return null;

  const quoted = Number.parseFloat(text);
  const hasQuote = Number.isFinite(quoted) && quoted > 0;
  const fee = Number.parseFloat(feeText);
  const quotedFee = Number.isFinite(fee) && fee >= 0 ? fee : pricing.feeBand.hi;

  // Price the quote on the amount the borrower should actually be asking for.
  const principal = result.amounts.safe.hi > 0 ? result.amounts.safe.hi : result.amounts.lender.hi;

  const allIn = hasQuote ? apr(principal, quoted, pricing.tenureMonths, quotedFee) : 0;
  const instalment = hasQuote ? emi(principal, quoted, pricing.tenureMonths) : 0;
  const above = hasQuote && quoted > pricing.rateBand.hi;
  const below = hasQuote && quoted < pricing.rateBand.lo;

  const ceiling = result.repayment?.emiCeiling;
  const overCeiling = hasQuote && ceiling !== undefined && instalment > ceiling.hi;

  return (
    <details className="panel fold no-print">
      <summary>Got a rate from a lender? Check it here</summary>
      <p className="muted" style={{ marginTop: 8 }}>
        Type the rate they quoted. A fair rate for you is{' '}
        <strong>{rateText(pricing.rateBand)}</strong>.
      </p>

      <div className="quote">
        <label>
          <span className="muted">Rate quoted </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.05"
            placeholder="e.g. 14.5"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOverridden(false);
            }}
            aria-label="Rate quoted, percent per year"
          />
        </label>
        <label>
          <span className="muted">Fee % </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder={String(pricing.feeBand.hi)}
            value={feeText}
            onChange={(e) => setFeeText(e.target.value)}
            aria-label="Processing fee, percent of the amount"
          />
        </label>
      </div>

      {hasQuote ? (
        <>
          <div className="figure small" style={{ marginTop: 12 }}>
            All-in, that offer is {rateText(iv(allIn, allIn))}
          </div>
          <p className="muted">
            On {inLakh(principal)} over {tenureText(pricing.tenureMonths)}, that is{' '}
            {perMonth(iv(instalment, instalment))}. The all-in figure adds the{' '}
            {quotedFee}% fee and its GST back into the rate — it is{' '}
            {(allIn - quoted).toFixed(2)} points above the headline.
          </p>

          {above && !overridden ? (
            <div className="nudge bad">
              That is more than a fair rate for you ({rateText(pricing.rateBand)}). Ask what in
              your file justifies the difference, and get the answer in writing.{' '}
              <button type="button" onClick={() => setOverridden(true)}>
                Use it anyway
              </button>
            </div>
          ) : null}

          {overCeiling && !overridden ? (
            <div className="nudge bad">
              At that rate the EMI is {perMonth(iv(instalment, instalment))}, above the most that
              is safe for you ({perMonth(ceiling!)}). Borrow less rather than
              stretching the tenure to hide it.{' '}
              <button type="button" onClick={() => setOverridden(true)}>
                Use it anyway
              </button>
            </div>
          ) : null}

          {!above && !overCeiling ? (
            <div className="nudge ok">
              {below
                ? 'That is lower than we expected — a good offer. Check there is no insurance added to the loan making up the difference.'
                : 'That is a fair rate for you.'}
            </div>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
