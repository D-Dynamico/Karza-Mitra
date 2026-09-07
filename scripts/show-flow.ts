/**
 * The questions one borrower actually sees, in the order the engine asks them,
 * with their answers and what each one changed.
 *
 * Run: npx tsx scripts/show-flow.ts anita
 */

import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { nextQuestions } from '../engine/next-questions';
import { factsChanged, OUTPUT_LABELS, readOutput, type OutputId } from '../engine/outputs';
import { personas } from '../engine/personas';
import { money, rate as rateText } from '../engine/format';
import { adaptiveSet, allQuestions, mustSet, type Question } from '../engine/questions';

const name = (process.argv[2] ?? 'anita').toLowerCase();
const found = personas.find((p) => p.id === name);
if (!found) {
  console.error(`No such borrower. Try: ${personas.map((p) => p.id).join(', ')}`);
  process.exit(1);
}
const persona = found;

const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

function show(value: unknown): string {
  if (value === undefined) return '(skipped)';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return value > 1000 ? rupees(value) : String(value);
  if (typeof value === 'object' && value !== null && 'lo' in value) {
    const r = value as { lo: number; hi: number };
    return r.lo === r.hi ? rupees(r.lo) : `${rupees(r.lo)} to ${rupees(r.hi)}`;
  }
  if (typeof value === 'object' && value !== null && 'known' in value) {
    const c = value as { known: boolean; score?: number; everBorrowed?: boolean };
    if (c.known) return String(c.score);
    return c.everBorrowed ? "doesn't know it" : 'has never borrowed';
  }
  return String(value);
}

const fmt = (id: OutputId, answers: Answers): string => {
  const r = compute(answers);
  if (id === 'O1.verdict') return r.verdict.kind;
  const v = readOutput(r, id);
  const pct = id === 'O3.rate' || id === 'O3.apr';
  const ratio = id === 'O4.stress';
  if (pct) return `${v.lo.toFixed(1)}%–${v.hi.toFixed(1)}%`;
  if (ratio) return `${(v.lo * 100).toFixed(0)}%–${(v.hi * 100).toFixed(0)}%`;
  return v.lo === v.hi ? rupees(v.lo) : `${rupees(v.lo)}–${rupees(v.hi)}`;
};

console.log(`\n${'='.repeat(74)}`);
console.log(`${persona.name.toUpperCase()} — the questions actually asked`);
console.log('='.repeat(74));

// Walk the flow the way the borrower would: must set in order, then whatever the
// engine ranks next, one at a time, re-running after every answer.
let asked: Answers = {};
let step = 0;
const declined = new Set<string>();

const answerOf = (q: Question): unknown => persona.answers[q.field];

function ask(q: Question, why: string): void {
  step += 1;
  const before = compute(asked);
  const value = answerOf(q);
  const after: Answers = value === undefined ? asked : { ...asked, [q.field]: value };
  const changed: string[] = [];

  for (const id of q.moves) {
    const b = fmt(id, asked);
    const a = fmt(id, after);
    if (b !== a) {
      changed.push(`      ${OUTPUT_LABELS[id]}: ${b}  →  ${a}`);
    } else if (id === 'O1.verdict') {
      // The word can stay the same while the reasoning changes, and the engine
      // counts that as a real movement — so the display has to as well.
      const wasWhy = compute(asked).verdict.why;
      const nowWhy = compute(after).verdict.why;
      if (wasWhy !== nowWhy) {
        changed.push(`      the verdict is still "${a}", but the reason changed:`);
        changed.push(`        now: ${nowWhy.slice(nowWhy.indexOf(wasWhy) === 0 ? wasWhy.length : 0).trim()}`);
      }
    }
  }

  // Words as well as numbers: choosing a purpose picks the product, and saying
  // how you earn decides which month we budget against. Both happen before any
  // amount exists to move, so a banner watching only numbers reports nothing.
  for (const fact of factsChanged(compute(asked), compute(after))) {
    changed.unshift(`      ${fact}`);
  }

  console.log(`\n${String(step).padStart(2)}. ${q.prompt}`);
  console.log(`    ${persona.name} answers: ${show(value)}`);
  if (why) console.log(`    asked because: ${why}`);
  if (changed.length > 0) {
    console.log(`    what moved:`);
    changed.forEach((c) => console.log(c));
  } else {
    console.log(`    what moved: nothing yet — it needs another answer first`);
  }
  asked = after;
  void before;
}

console.log(`
--- THE MUST SET: everyone answers these ${mustSet.length} ---`);
for (const q of mustSet) ask(q, '');

const afterMust = compute(asked);
console.log(`\n  >> After ${mustSet.length} questions: ${afterMust.verdict.kind}, confidence ${afterMust.confidence}`);
console.log(`     safe to carry ${fmt('O2.safe', asked)}   rate ${fmt('O3.rate', asked)}`);

console.log('\n--- THEN, WHATEVER THE ENGINE RANKS HIGHEST, ONE AT A TIME ---');
for (let i = 0; i < 20; i += 1) {
  const ranked = nextQuestions(asked, 10).filter((r) => !declined.has(r.question.id));
  if (ranked.length === 0) break;
  const top = ranked[0]!;
  if (answerOf(top.question) === undefined) {
    // The brief does not say what they would answer, so they skip it. That is a
    // real outcome rather than a gap: the engine falls back to an assumption and
    // says so. Not offered again.
    declined.add(top.question.id);
    console.log(`\n    (offered "${top.question.prompt}" — skipped, so we assume instead)`);
    continue;
  }
  ask(top.question, top.promise);
}

const final = compute(asked);
console.log(`\n${'-'.repeat(74)}`);
console.log(`FINAL: ${final.verdict.kind} — ${final.verdict.headline}`);
console.log(`  ${final.verdict.why}`);
if (final.verdict.nextStep) console.log(`  next: ${final.verdict.nextStep}`);
// The final figures use the display formatting: rounded outward, in lakh, and
// in words where the bottom of a range is effectively nothing. The rupee-exact
// values above are for reading the mechanism, not for showing a borrower.
console.log(`\n  a lender would sanction  ${money(final.amounts.lender, { asLender: true })}`);
console.log(`  safe for you to carry    ${money(final.amounts.safe)}`);
if (final.pricing) {
  console.log(`  rate band                ${rateText(final.pricing.rateBand)}`);
  console.log(`  all-in rate              ${rateText(final.pricing.aprBand)}`);
}
console.log(`  confidence               ${final.confidence}`);
if (final.assumptions.length > 0) {
  console.log(`
  WHERE WE GUESSED:`);
  for (const a of final.assumptions) console.log(`    - ${a}`);
}

console.log(`\n${'-'.repeat(74)}`);
console.log(`NEVER ASKED — these do not apply to ${persona.name}:`);
for (const q of adaptiveSet) {
  if (!q.applies(persona.answers) && asked[q.field] === undefined) {
    console.log(`  - ${q.prompt}`);
  }
}
console.log(
  `\n(${allQuestions.length} questions exist. ${persona.name} sees ${step} of them.)`,
);
