/**
 * The Negotiation Card on screen.
 *
 * The rows come from `engine/card.ts`, the same function the generated
 * run-throughs render, so the printed page and the markdown cannot disagree.
 * Nothing here decides what goes on the card — this file only draws it.
 *
 * Row order follows the Key Facts Statement a lender must hand over: amount,
 * product, rate, all-in rate, fees, tenure, instalment. A borrower comparing
 * this against the KFS should be reading the same things in the same order.
 */

import { negotiationCard } from '../engine/card';
import type { Result } from '../engine/compute';

export function Card({ result }: { readonly result: Result }) {
  const card = negotiationCard(result);

  return (
    <section className="card" id="negotiation-card" aria-label="Negotiation card">
      <span className="label">{card.title}</span>
      <p className="ask">{card.ask}</p>

      {card.advisesAgainst && card.rows.length > 0 ? (
        <p className="muted">
          The answer above stands. These are only the terms to insist on if you go ahead
          regardless — not a reason to borrow.
        </p>
      ) : null}

      <div className="card-rows">
        {card.rows.map((row) => (
          <div className="crow" key={row.label}>
            <div className="clabel">{row.label}</div>
            <div className="cvalue">{row.value}</div>
            <div className="cnote">{row.note}</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 16 }}>Say no to</h3>
      <ul className="redlines">
        {card.redLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {card.walkAway ? (
        <div className="walkaway">
          <strong>{card.advisesAgainst ? 'Why not now: ' : 'Walk away if: '}</strong>
          {card.walkAway}
        </div>
      ) : null}

      <div className="card-actions no-print">
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
    </section>
  );
}
