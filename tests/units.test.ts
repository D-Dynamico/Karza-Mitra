/**
 * The working drawer showed "their ceiling ₹0 to ₹500" for an FOIR ratio of
 * 0.4, and would have shown a four-point credit premium as ₹4. Both were found
 * by opening the drawer and reading it, not by a failing assertion.
 *
 * These tests walk every value every rule emits, for all three borrowers, and
 * fail if any of them would render in an impossible unit. That is a stronger
 * guarantee than checking the two cases that were wrong.
 */

import { describe, expect, it } from 'vitest';
import { compute } from '../engine/compute';
import type { Interval } from '../engine/interval';
import { personas } from '../engine/personas';
import type { TraceValue } from '../engine/trace';
import { renderValue, unitForInput, unitForOutput } from '../ui/units';

const isInterval = (v: TraceValue): v is Interval =>
  typeof v === 'object' && v !== null && 'lo' in v && 'hi' in v;

/** Every (label, value, rendered) triple the drawers would show. */
function everyRendering(): { where: string; value: TraceValue; text: string }[] {
  const out: { where: string; value: TraceValue; text: string }[] = [];
  for (const p of personas) {
    for (const e of compute(p.answers).trace) {
      out.push({
        where: `${p.id} ${e.rule} (output)`,
        value: e.output,
        text: renderValue(e.output, unitForOutput(e.rule), e.rule),
      });
      for (const [k, v] of Object.entries(e.inputs)) {
        if (v === undefined) continue;
        out.push({
          where: `${p.id} ${e.rule} :: ${k}`,
          value: v,
          text: renderValue(v, unitForInput(e.rule, k)),
        });
      }
    }
  }
  return out;
}

const magnitude = (v: TraceValue): number | undefined => {
  if (typeof v === 'number') return Math.abs(v);
  if (isInterval(v)) return Math.max(Math.abs(v.lo), Math.abs(v.hi));
  return undefined;
};

describe('no trace value renders in an impossible unit', () => {
  it('never shows a fraction as an amount of money', () => {
    // Nothing in this engine is a sum of money between zero and one rupee. A
    // value in that range is a ratio, and showing it as rupees rounds it to
    // ₹0 — which is how an FOIR ceiling of 0.4 became "₹0 to ₹500".
    for (const r of everyRendering()) {
      const m = magnitude(r.value);
      if (m === undefined || m === 0 || m >= 1) continue;
      expect(r.text, `${r.where} rendered "${r.text}" for ${JSON.stringify(r.value)}`).not.toMatch(
        /₹/,
      );
    }
  });

  it('never shows a rate adjustment as money', () => {
    // Credit premiums and stability adjustments are points on a rate. They are
    // small integers, which is exactly the range that looks like rupees.
    const rateish = ['credit.', 'stability.', 'pricing.'];
    for (const r of everyRendering()) {
      if (!rateish.some((p) => r.where.includes(p))) continue;
      if (typeof r.value === 'string' || typeof r.value === 'boolean') continue;
      // Secured caps and incomes really are money even inside a pricing rule.
      if (r.where.includes('secured-cap') || r.where.includes('what it is worth')) continue;
      expect(r.text, `${r.where} rendered "${r.text}"`).not.toMatch(/₹/);
    }
  });

  it('never shows an already-multiplied share as a fresh percentage', () => {
    // `stress.outflow` emits 53.4 meaning 53%. Passing that through the ratio
    // formatter would print 5341%.
    for (const r of everyRendering()) {
      if (!r.where.includes('stress.outflow (output)')) continue;
      expect(r.text).toMatch(/^\d{1,3}%( to \d{1,3}%)?$/);
    }
  });

  it('renders the FOIR ceiling as a percentage a borrower can read', () => {
    const found = everyRendering().find((r) => r.where.includes('lender-foir :: their ceiling'));
    expect(found).toBeDefined();
    expect(found!.text).toMatch(/^\d{1,3}%( to \d{1,3}%)?$/);
  });
});
