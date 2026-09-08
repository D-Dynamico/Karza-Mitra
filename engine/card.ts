/**
 * The Negotiation Card.
 *
 * One page a borrower can hold up across a desk. It is not a summary of the
 * result — it is the subset of the result that is useful while someone on the
 * other side of the desk is quoting numbers at you, phrased as things to hold
 * them to rather than things to know.
 *
 * The card is a view of the same computed result as everything else, so it can
 * never say something the working does not support. Phase 4 renders these rows
 * on screen; the generated run-throughs render the same rows as markdown.
 */

import type { Result } from './compute';
import { money, perMonth, rate, rupees, tenure as tenureText } from './format';

export interface CardRow {
  readonly label: string;
  readonly value: string;
  /** The line that makes the number usable in the room. */
  readonly note: string;
}

export interface NegotiationCard {
  readonly title: string;
  /** The single sentence to open with. */
  readonly ask: string;
  readonly rows: readonly CardRow[];
  /** Things to say no to. Every one of these is a real, common branch tactic. */
  readonly redLines: readonly string[];
  /** Present only when the honest answer is not to take a loan at all. */
  readonly walkAway: string | undefined;
  /** True when the verdict is "don't". The rows are then terms to insist on
   *  only if the borrower goes ahead anyway — not an invitation to. */
  readonly advisesAgainst: boolean;
}

export function negotiationCard(r: Result): NegotiationCard {
  const rows: CardRow[] = [];

  const safeTop = r.amounts.safe.hi;
  const dont = r.verdict.kind === 'dont' || safeTop <= 0;

  if (!dont) {
    rows.push({
      label: 'Amount to ask for',
      value: money(r.amounts.safe),
      note: `A lender may offer more — up to ${money(r.amounts.lender, { asLender: true })}. That is what they are willing to risk, not what you can pay. The bigger number is not a compliment.`,
    });
  }

  if (r.routing) {
    rows.push({
      label: 'Product to ask for',
      value: r.routing.product.name,
      note: r.routing.alternative
        ? `If you are offered a ${r.routing.alternative.product.name.toLowerCase()} instead, ask why. ${r.routing.alternative.why}`
        : r.routing.why,
    });
  }

  if (r.pricing) {
    rows.push({
      label: 'Rate to hold them to',
      value: rate(r.pricing.rateBand),
      note: `Anything above the top of this needs a reason you find convincing. Ask for that reason in writing.`,
    });
    rows.push({
      label: 'All-in rate, with fees',
      value: rate(r.pricing.aprBand),
      note: `The rate with the processing fee and its GST added back in. Compare two offers on this number, not the headline one — a lower rate with a bigger fee can be the costlier loan.`,
    });
    rows.push({
      label: 'Processing fee',
      value: `${r.pricing.feeBand.lo}% – ${r.pricing.feeBand.hi}% of the amount, plus GST`,
      note: 'Easier to get down than the rate is. Ask for it to be dropped or halved before you agree to anything else.',
    });
    rows.push({
      label: 'How long',
      value: tenureText(r.pricing.tenureMonths),
      note: 'A longer loan means a smaller EMI and more interest in total. Do not let a longer loan be used to make an amount you cannot afford look affordable.',
    });
  }

  if (r.repayment && !dont) {
    rows.push({
      label: 'Most you should agree to pay each month',
      value: perMonth(r.repayment.emiCeiling),
      note: `Above this, an ordinary bad month becomes a missed payment. This figure counts your rent. The lender's does not.`,
    });
  }

  const redLines = [
    'No to any insurance, membership or "protection" added to the loan. It is almost never required, and you pay interest on it too.',
    'No to signing before you have seen the Key Facts Statement with the all-in rate on it. You are entitled to it.',
    'No to a charge for paying the loan off early, on a floating rate loan. On personal and property loans it should not be there.',
  ];
  if (r.pricing && r.pricing.feeBand.hi > 2) {
    redLines.push(
      `No to a processing fee at the top of ${r.pricing.feeBand.lo}–${r.pricing.feeBand.hi}% without a reason. On this loan it is the part of the price with the most room in it.`,
    );
  }

  return {
    advisesAgainst: dont,
    title: dont ? 'Before you borrow anything' : 'Take this to the lender',
    ask: dont
      ? 'The honest answer today is not to take this loan. This card is what to do instead.'
      : `I am asking for ${money(r.amounts.safe)} as a ${r.routing?.product.name.toLowerCase() ?? 'loan'}, over ${tenureText(r.pricing?.tenureMonths ?? 60)}, at ${r.pricing ? rate(r.pricing.rateBand) : 'the rate below'}.`,
    rows,
    redLines,
    walkAway: dont
      ? `${r.verdict.why} ${r.verdict.nextStep ?? ''}`.trim()
      : r.repayment && r.repayment.stressBreaches
        ? `If your income fell by a fifth, this EMI would take ${Math.round(r.repayment.outflowRatioStressed.hi * 100)}% of it. Walk away rather than stretch the loan out to hide that.`
        : undefined,
  };
}

/** The card as plain markdown, used by the generated run-throughs. */
export function cardAsMarkdown(card: NegotiationCard): string {
  const out: string[] = [];
  out.push(`### ${card.title}`);
  out.push('');
  out.push(`> ${card.ask}`);
  out.push('');
  if (card.advisesAgainst && card.rows.length > 0) {
    out.push(
      'The answer above stands. These rows are here only so that a borrower who goes ahead anyway does not walk in uninformed. They are the terms to insist on, not a reason to borrow.',
    );
    out.push('');
  }
  if (card.rows.length > 0) {
    out.push('| | | |');
    out.push('|---|---|---|');
    for (const row of card.rows) {
      out.push(`| **${row.label}** | ${row.value} | ${row.note} |`);
    }
    out.push('');
  }
  out.push('**Say no to:**');
  out.push('');
  for (const line of card.redLines) out.push(`- ${line}`);
  if (card.walkAway) {
    out.push('');
    out.push(
      card.advisesAgainst
        ? `**Why not now:** ${card.walkAway}`
        : `**Walk away if:** ${card.walkAway}`,
    );
  }
  return out.join('\n');
}

/** Re-exported so callers rendering a card do not reach past it for formatting. */
export { rupees };
