/**
 * Generate RULES.md from the rule tables.
 *
 * The document is a view of the same data the engine reads, so it cannot drift
 * from the behaviour. Nothing here is hand-written except the section prose at
 * the bottom of this file, and that prose is about what the rules do *not*
 * cover — which is the one thing the tables cannot say about themselves.
 *
 * Determinism matters: `npm run gen` twice must produce no diff. So there is no
 * clock, no randomness, and no reliance on module import order — rules are
 * sorted by id within a fixed section order.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allRules, type Rule, type Source, type TieredRule } from '../engine/rules/table';
import { products, type Product } from '../engine/rules/products';
import type { Interval } from '../engine/interval';

// Importing the engine pulls in every module that registers a rule. Without
// this, a rule defined in a file nothing else imports would silently vanish
// from the document — the one way the tables and the doc can fall out of step.
import '../engine/compute';

type AnyRule = Rule<unknown> | TieredRule<unknown>;

const isTiered = (r: AnyRule): r is TieredRule<unknown> => 'tiers' in r;
const isInterval = (v: unknown): v is Interval =>
  typeof v === 'object' && v !== null && 'lo' in v && 'hi' in v && Object.keys(v).length === 2;

/** Escape the one character that would break a markdown table cell. */
const cell = (s: string): string => s.replace(/\|/g, '\\|');

function num(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? 'no limit' : '−no limit';
  if (Number.isInteger(n) && Math.abs(n) >= 1000) return n.toLocaleString('en-IN');
  return String(n);
}

function value(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string' || typeof v === 'boolean') return String(v);
  if (isInterval(v)) return v.lo === v.hi ? num(v.lo) : `${num(v.lo)} – ${num(v.hi)}`;
  if (Array.isArray(v)) return v.map(value).join('; ');
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `**${k}**: ${value(x)}`)
    .join('<br>');
}

function source(s: Source): string {
  return s.kind === 'judgement'
    ? `My judgement — ${s.note}`
    : `${s.kind === 'regulation' ? 'Regulation' : s.kind === 'market' ? 'Market' : 'Reference'}: ${s.cite}`;
}

const checked = (s: Source): string => (s.kind === 'judgement' ? '—' : s.checked);

/** Sections, in the order a reader should meet them. */
const SECTIONS: readonly { prefix: string; title: string; blurb: string }[] = [
  {
    prefix: 'products',
    title: 'Products and pricing',
    blurb:
      'Which loan a borrower is routed to, and what it costs. Getting the product wrong is more expensive than negotiating the rate badly, so routing runs before pricing.',
  },
  {
    prefix: 'income',
    title: 'Income',
    blurb:
      'What a lender will count, and what the borrower should plan on. These are different numbers, and the gap is the part of their income they cannot evidence.',
  },
  {
    prefix: 'affordability',
    title: 'Affordability — the two ceilings',
    blurb:
      "The lender's ceiling and the borrower's are computed by separate rules. The lender's leaves out rent; the borrower's cannot. That is the main reason the two headline numbers diverge.",
  },
  {
    prefix: 'credit',
    title: 'Credit history',
    blurb: 'What a file does to the price. Bad news widens the band; it never sharpens it.',
  },
  {
    prefix: 'stress',
    title: 'The bad month',
    blurb: 'Every answer is re-run against a worse version of the same borrower.',
  },
  {
    prefix: 'verdict',
    title: 'The verdict',
    blurb: 'The thresholds that decide borrow, borrow less, or do not borrow.',
  },
  {
    prefix: 'expenses',
    title: 'Household spending',
    blurb: 'What it costs to run the household before any instalment.',
  },
  {
    prefix: 'rent',
    title: 'Rent',
    blurb:
      'Unknown is never zero. An unanswered rent becomes a conservative range, because reading it as nothing would hand the borrower a surplus they may not have.',
  },
  {
    prefix: 'stability',
    title: 'How steady the income is',
    blurb: 'Employer and tenure, which move the rate rather than the amount.',
  },
  {
    prefix: 'confidence',
    title: 'Confidence',
    blurb:
      'How narrow an answer has to be before it is worth acting on. Confidence describes the width of the answer, not the number of questions asked.',
  },
];

function ruleRows(rules: readonly AnyRule[]): string {
  const out: string[] = [];
  out.push('| Rule | What it sets | Value | Why | Source | Checked |');
  out.push('|---|---|---|---|---|---|');
  for (const r of rules) {
    if (isTiered(r)) {
      const tiers = r.tiers
        .map(
          (t) =>
            `${Number.isFinite(t.upTo) ? `below ${num(t.upTo)}` : 'above that'}: ${value(t.value)}`,
        )
        .join('<br>');
      const whys = r.tiers.map((t) => t.why).join(' ');
      out.push(
        `| \`${r.id}\` | ${cell(r.what)}<br>*keyed on ${cell(r.keyedOn)}* | ${cell(tiers)} | ${cell(whys)} | ${cell(source(r.source))} | ${checked(r.source)} |`,
      );
    } else {
      out.push(
        `| \`${r.id}\` | ${cell(r.what)} | ${cell(value(r.value))} | ${cell(r.why)} | ${cell(source(r.source))} | ${checked(r.source)} |`,
      );
    }
  }
  return out.join('\n');
}

/** Loan-to-value as a percentage, or a pointer where a rule sets it instead. */
function ltv(p: Product): string {
  if (p.id === 'gold-loan') return 'set by `products.gold-ltv`';
  if (!p.loanToValue) return 'n/a — nothing is pledged';
  return `${(p.loanToValue.lo * 100).toFixed(0)}–${(p.loanToValue.hi * 100).toFixed(0)}%`;
}

function productTable(): string {
  const out: string[] = [];
  out.push('| Product | Rate | Fee | Tenure | Loan-to-value | Smallest loan | Why it prices this way |');
  out.push('|---|---|---|---|---|---|---|');
  const entries = Object.values(products.value).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of entries) {
    out.push(
      `| **${cell(p.name)}**<br>${p.secured ? 'secured' : 'unsecured'} | ${value(p.rateBand)}% | ${value(p.feeBand)}% | ${value(p.tenureMonths)} months | ${ltv(p)} | ₹${num(p.minTicket)} | ${cell(p.why)} |`,
    );
  }
  out.push('');
  out.push('Where each product’s bands come from:');
  out.push('');
  out.push('| Product | Source | Checked |');
  out.push('|---|---|---|');
  for (const p of entries) {
    out.push(`| ${cell(p.name)} | ${cell(source(p.source))} | ${checked(p.source)} |`);
  }
  return out.join('\n');
}

/**
 * The limits of this document, written by hand because no table can state what
 * it fails to model. Kept here rather than in RULES.md so the generated file
 * stays generated.
 */
const WHAT_I_DO_NOT_KNOW = `
## What I do not know

The tables above state what each rule is and where it came from. This section states where
they are weakest. It is specific on purpose: a limitations section that only says "rates may
vary" is a formality, not an admission.

**Rates are national bands, not offers.** Every figure marked *Market* is a band assembled
from published rate cards, checked on the date beside it. Several of the low ends are
"onwards" figures — marketing floors quoted for the strongest possible applicant. A borrower
who matches that profile can reach them; most cannot. The bands should be read as the range a
conversation starts in, not as a quote.

**Nothing here is underwritten.** This engine has no access to a credit bureau, a bank
statement, or a lender's internal policy. It estimates what a lender is likely to do from what
the borrower says. A real application can come back cheaper, dearer, or declined for a reason
no public rule captures.

**Rates move with the repo rate.** Every band shifts when the RBI does. The *Checked* column is
what tells a reader how stale a row is; there is no mechanism here that refreshes them.

**Regional lending is not modelled.** Cooperative banks, chit funds and local moneylenders are
a real part of how this market works, particularly for the borrowers this tool is most useful
to. None of them appear in the product table.

**The stress test is one scenario, not a distribution.** Income falls by a fixed share and the
rate rises by a fixed amount. Real bad months are correlated and lumpy — a medical bill and a
lost customer arrive together. A borrower who passes the stress test here has passed one
specific bad month, not every plausible one.

**Household spending is a default, not a budget.** Where the borrower does not give a figure,
it is estimated from household size and city tier. That estimate is the single largest source
of error in the safe-carry number for anyone who does not answer the question.

**Tax is not modelled.** Income figures are treated as take-home throughout. For a
self-employed borrower quoting a filed return, that is optimistic.

### Which numbers are my judgement rather than a source

These rows carry no external citation. That is a legitimate answer — the dishonest option
would be an invented one — but they are the rows to argue with first.
`;

const QUESTION_POLICY = `
## Which questions get asked, and why

A question earns its place by moving an output. Every question in the flow declares the
outputs it \`moves\`, and a test fails if a question moves nothing. Five questions were written
and then cut for exactly this reason; they are listed in \`engine/questions.ts\` under
\`cutQuestions\`, each with the reason it was dropped, and a test fails if one reappears.

Questions are tiered. **Must** questions are asked of everyone, because without them the
answer would be invented rather than estimated. **Should** and **could** questions are asked
only when the borrower's answers so far make them capable of changing something — a question
about property is pointless for someone who has already said they own none.

Every question can be skipped, and every skip states its consequence in one line rather than
hiding it. Skipping does not block the answer; it widens it, and the assumption that filled
the gap is labelled in the result. This is the difference between an engine that refuses to
answer and one that answers honestly with less information.
`;

function main(): void {
  const rules = [...allRules()];
  const bySection = new Map<string, AnyRule[]>();
  for (const r of rules) {
    const prefix = r.id.split('.')[0]!;
    const list = bySection.get(prefix) ?? [];
    list.push(r);
    bySection.set(prefix, list);
  }

  const out: string[] = [];
  out.push('# RULES');
  out.push('');
  out.push(
    '**Generated from the rule tables by `npm run gen`. Do not edit by hand — your changes will be overwritten.**',
  );
  out.push('');
  out.push(
    'Every number this engine uses lives in a table in `engine/rules/`, carrying its own justification and its own provenance. The types make that mandatory: a rule without a `why` or a `source` does not compile. This document is a view of those same tables, so it cannot drift from the behaviour of the code.',
  );
  out.push('');
  out.push(
    'Where a row says **My judgement**, that is exactly what it means — the figure is mine, reasoned but uncited. Where it says **Market** or **Regulation**, the citation and the date it was checked are in the last two columns.',
  );
  out.push('');

  // Products get a dedicated table first: each band carries its own source, and
  // a generic renderer would bury that in one unreadable cell.
  const productsSection = SECTIONS.find((s) => s.prefix === 'products')!;
  out.push(`## ${productsSection.title}`);
  out.push('');
  out.push(productsSection.blurb);
  out.push('');
  out.push('### The products themselves');
  out.push('');
  out.push(productTable());
  out.push('');
  out.push('### The rules around them');
  out.push('');
  const productRules = (bySection.get('products') ?? [])
    .filter((r) => r.id !== 'products.bands')
    .sort((a, b) => a.id.localeCompare(b.id));
  out.push(ruleRows(productRules));
  out.push('');

  for (const section of SECTIONS) {
    if (section.prefix === 'products') continue;
    const list = (bySection.get(section.prefix) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    if (list.length === 0) continue;
    out.push(`## ${section.title}`);
    out.push('');
    out.push(section.blurb);
    out.push('');
    out.push(ruleRows(list));
    out.push('');
  }

  // Any section not named above, so a new rule prefix can never vanish silently.
  const known = new Set(SECTIONS.map((s) => s.prefix));
  const leftovers = [...bySection.keys()].filter((k) => !known.has(k)).sort();
  for (const prefix of leftovers) {
    out.push(`## ${prefix}`);
    out.push('');
    out.push(ruleRows(bySection.get(prefix)!.sort((a, b) => a.id.localeCompare(b.id))));
    out.push('');
  }

  out.push(WHAT_I_DO_NOT_KNOW.trim());
  out.push('');
  const judged = rules
    .filter((r) => r.source.kind === 'judgement')
    .map((r) => r.id)
    .sort();
  const judgedProducts = Object.values(products.value)
    .filter((p: Product) => p.source.kind === 'judgement')
    .map((p) => `products.bands → ${p.id}`)
    .sort();
  for (const id of [...judged, ...judgedProducts]) out.push(`- \`${id}\``);
  out.push('');
  out.push(
    `That is ${judged.length + judgedProducts.length} of ${rules.length + Object.keys(products.value).length} rows.`,
  );
  out.push('');
  out.push(QUESTION_POLICY.trim());
  out.push('');

  const path = join(process.cwd(), 'RULES.md');
  writeFileSync(path, out.join('\n'), 'utf8');
  console.log(`Wrote RULES.md — ${rules.length} rules, ${Object.keys(products.value).length} products.`);
}

main();
