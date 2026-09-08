# Karza Mitra

Karza — debt. Mitra — friend.

Every lender has a model that decides what a borrower gets. The borrower has nothing. This is
the borrower's side of that table. Answer a handful of questions and it tells you **two
different numbers** — what a lender will probably give you, and what is actually safe for
you — routes you to the right product, shows the honest all-in rate with fees and GST folded in,
and is willing to tell you not to borrow.

It is written to be read at a branch counter, by someone reading English as a second
language. `tests/copy.test.ts` enforces that: every sentence the borrower sees is checked
against a list of banned terms, and against the numbers it claims.

Everything runs in the browser. No account, no server, nothing leaves the device.

## Run it

```bash
npm install
npm run dev
```

Then open the URL printed in the terminal.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests on change |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run gen` | Regenerate `RULES.md` and the persona run-throughs in `runs/` |

`RULES.md` and `runs/*.md` are generated from the same rule tables the engine reads, so the
documentation cannot drift from the behaviour. Never edit them by hand.

## Layout

```
engine/     the rules and the maths — pure, no React, no DOM
  rules/    one table per rule area, every row carrying its own "why"
ui/         flow, results, negotiation card
scripts/    generators for RULES.md and the persona run-throughs
tests/      algebra, finance, formatting, copy guards, golden personas, invariants
docs/       architecture, design and session notes
```

## Where to read next

- `WALKTHROUGH.md` — one borrower end to end, then what is next and what was cut
- `RULES.md` — every rule, its value, its reasoning and where the number came from (generated)
- `runs/priya.md`, `runs/ravi.md`, `runs/anita.md` — the three borrowers, question by question (generated)
- `CLAUDE.md` — short orientation, guiding rules, working agreement
- `docs/SYSTEM_DESIGN.md` — architecture and the lending rules in detail
- `phases.md` — build order and current progress
- `plan.md` — the original strategy and reasoning

## Status

The engine is built and tested — two amounts, product routing, honest all-in rate, and a
verdict that will say don't borrow. Every product band is now cited and dated. Run
`npx tsx scripts/run-personas.ts` to see what it says about three very different borrowers,
or read `runs/` for the same thing written out.

The interface is built: a question flow that asks one thing at a time and shows what each
answer moved, results screens with the working behind every number, and a Negotiation Card
that prints to one page.
