/** What the engine would ask each borrower next, and what each question is worth. */
import { compute } from '../engine/compute';
import { nextQuestions } from '../engine/next-questions';
import { mustSetOnly, personas } from '../engine/personas';
import { adaptiveSet, allQuestions, cutQuestions, mustSet } from '../engine/questions';
import { unansweredApplicable } from '../engine/questions';

console.log(`Registry: ${mustSet.length} must, ${adaptiveSet.length} adaptive, ${allQuestions.length} total`);
console.log(`Cut: ${cutQuestions.map((c) => c.id).join(', ')}\n`);

for (const p of personas) {
  const answers = mustSetOnly(p.answers);
  const r = compute(answers);
  console.log('='.repeat(72));
  console.log(`${p.name} — after the must set only`);
  console.log(`  verdict ${r.verdict.kind}   confidence ${r.confidence}`);
  console.log(`  applicable and unanswered: ${unansweredApplicable(answers).length} of ${adaptiveSet.length} adaptive`);
  console.log('  next, best first:');
  for (const q of nextQuestions(answers, 5)) {
    const tag = q.question.tier === 'must' ? 'MUST ' : q.wouldMove.includes('O1.verdict') ? 'VERD ' : '     ';
    console.log(`    ${tag}${q.worth.toFixed(2).padStart(7)}  ${q.question.prompt}`);
    console.log(`             ${q.promise}`);
  }
}
