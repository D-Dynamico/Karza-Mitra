/**
 * Run the three borrowers and print what the engine says about each.
 *
 * This exists to be read by a person before any UI is trusted. If the numbers
 * here are wrong, nothing downstream can save them.
 */

import { compute, type Result } from '../engine/compute';
import { personas, mustSetOnly } from '../engine/personas';
import type { Interval } from '../engine/interval';

const rupees = (n: number): string =>
  `₹${Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const money = (x: Interval): string =>
  x.lo === x.hi ? rupees(x.lo) : `${rupees(x.lo)} – ${rupees(x.hi)}`;

const pct = (x: Interval): string =>
  x.lo === x.hi ? `${x.lo.toFixed(1)}%` : `${x.lo.toFixed(1)}% – ${x.hi.toFixed(1)}%`;

const ratio = (x: Interval): string =>
  `${(x.lo * 100).toFixed(0)}% – ${(x.hi * 100).toFixed(0)}%`;

function report(name: string, tests: string, r: Result): void {
  console.log(`\n${'='.repeat(76)}`);
  console.log(name.toUpperCase());
  console.log(`Catches: ${tests}`);
  console.log('='.repeat(76));

  console.log(`\nVERDICT   ${r.verdict.kind.toUpperCase()}`);
  console.log(`          ${r.verdict.headline}`);
  console.log(`          ${r.verdict.why}`);
  if (r.verdict.nextStep) console.log(`  NEXT    ${r.verdict.nextStep}`);

  console.log(`\nAMOUNTS`);
  console.log(`  asked            ${r.amounts.asked ? rupees(r.amounts.asked) : '—'}`);
  console.log(`  lender sanctions ${money(r.amounts.lender)}`);
  console.log(`  safe to carry    ${money(r.amounts.safe)}`);
  if (r.amounts.safe.hi !== r.amounts.safeOnAffordabilityAlone.hi) {
    console.log(`  (sums alone would allow ${money(r.amounts.safeOnAffordabilityAlone)})`);
  }

  if (r.income) {
    console.log(`\nINCOME`);
    console.log(`  lender recognises ${money(r.income.recognised)}`);
    console.log(`  you plan on       ${money(r.income.planning)}`);
    console.log(`  cannot prove      ${money(r.income.unprovable)}`);
  }

  if (r.routing) {
    console.log(`\nPRODUCT   ${r.routing.product.name}${r.routing.product.secured ? ' (secured)' : ''}`);
    console.log(`          ${r.routing.why}`);
    if (r.routing.alternative) {
      console.log(`  instead of ${r.routing.alternative.product.name}: ${r.routing.alternative.why}`);
    }
  }

  if (r.pricing) {
    console.log(`\nPRICING`);
    console.log(`  rate band   ${pct(r.pricing.rateBand)}`);
    console.log(`  fee         ${pct(r.pricing.feeBand)}`);
    console.log(`  all-in APR  ${pct(r.pricing.aprBand)}`);
    console.log(`  tenure      ${r.pricing.tenureMonths} months`);
  }

  if (r.repayment) {
    console.log(`\nREPAYMENT`);
    console.log(`  instalment ceiling ${money(r.repayment.emiCeiling)}`);
    console.log(`  outgo now          ${ratio(r.repayment.outflowRatioNow)}`);
    console.log(`  outgo after a bad turn ${ratio(r.repayment.outflowRatioStressed)}${r.repayment.stressBreaches ? '  ** breaches **' : ''}`);
  }

  console.log(`\nsurplus ${money(r.surplus)}   confidence ${r.confidence}`);
  if (r.assumptions.length > 0) {
    console.log(`assumed: ${r.assumptions.join('; ')}`);
  }

  console.log(`\nWORKING (${r.trace.length} rules fired)`);
  for (const e of r.trace) {
    const out =
      typeof e.output === 'object' && e.output !== null
        ? money(e.output as Interval)
        : String(e.output);
    console.log(`  ${e.rule.padEnd(38)} ${out}`);
  }
}

for (const p of personas) {
  report(p.name, p.tests, compute(p.answers));
}

console.log(`\n\n${'#'.repeat(76)}`);
console.log('# WITH THE MUST SET OF NINE ONLY — proving the engine answers early');
console.log('#'.repeat(76));

for (const p of personas) {
  const r = compute(mustSetOnly(p.answers));
  console.log(
    `\n${p.name.padEnd(6)} ${r.verdict.kind.padEnd(15)} safe ${money(r.amounts.safe).padEnd(24)} lender ${money(r.amounts.lender).padEnd(24)} rate ${r.pricing ? pct(r.pricing.rateBand) : '—'}`,
  );
}
