# Walkthrough

One borrower, end to end, with nothing left out. You should not need to run the app to follow
this — the numbers below are the ones the engine actually produces, and
[`runs/priya.md`](runs/priya.md) is the generated long form of the same thing.

The borrower is **Priya** because she is the case the whole product exists for: a lender would
say yes to her, enthusiastically, for an amount that would quietly wreck her.

---

## What Priya tells us

She is 31, salaried at ₹1,10,000 a month, five years at a large employer, CIBIL 780. She pays
₹28,000 in rent and ₹14,000 a month on an existing loan with 24 months left. She wants
**₹8,00,000**.

Ten of those facts come from the must set — the questions everybody answers, because without
them the answer would be invented rather than estimated. The rest the engine asks for only
because her earlier answers made them capable of changing something.

## What a lender sees

A lender's arithmetic is a ratio: how much of your income is already going out on instalments,
and how much more they can add before the regulator or their own policy stops them. It counts
her salary, it counts the ₹14,000 loan.

It does not count her rent. That is not an oversight — a lender is pricing the risk of not
being repaid, and if it comes to it, she can move somewhere cheaper. It is a rational thing
for them to leave out.

Run that arithmetic and a lender will sanction **₹21.4 lakh to ₹24.5 lakh**. She asked for ₹8
lakh. They would say yes three times over, and they would be right to, on their own terms.

## What she can actually carry

The borrower's rulebook is a different one. It starts from what is genuinely left at the end
of her month:

| | |
|---|---|
| Income | ₹1,10,000 |
| Rent | −₹28,000 |
| Existing instalment | −₹14,000 |
| Household spending (estimated, because she did not say) | −₹27,500 |
| **Surplus** | **₹40,500** |

Then it applies a ceiling to how much of that surplus a new instalment may take, and re-runs
the whole thing against a bad month — a fifth off her income, two points on the rate. The
tighter of the two answers wins.

That gives an instalment ceiling of about **₹10,300 a month**, and a safe amount of
**₹4.75 lakh to ₹4.86 lakh**.

## The two numbers, side by side

> A lender would sanction **₹21.4L – ₹24.5L**.
> She can safely carry **₹4.75L – ₹4.86L**.

Roughly four and a half times apart. Almost all of that gap is one line: the ₹28,000 of rent
that appears in her rulebook and not in theirs.

This is the entire point of the product. A borrower who is told only the first number has been
told something true and useless. The verdict is **borrow less**, and the reason names the rent
rather than gesturing at "affordability".

## What she should do about it

The engine does not stop at a smaller number. Her existing loan has **24 months left**, and
when it ends the ₹14,000 comes back to her — which changes this answer on its own, without her
doing anything except waiting. That is a more useful thing to tell her than "borrow ₹4.8 lakh",
so the verdict says it.

## What it costs

Priya has a 780 score and five years at a large employer, so she prices at the very bottom of
the personal loan band: **9.99% – 10.99%**.

That floor is not a round number by accident. It is the rate four large banks quote for CIBIL
780+ at a category-A employer, checked on 7 Sep 2026 — a profile she can verify she is in.
Public sector banks advertise from 8.75%, but that is a teaser for the narrowest possible
applicant, and quoting it to her would be the same flattery this tool exists to correct.

Then the fee goes back in. A 1–3% processing fee plus GST, spread over the loan, makes the
**all-in rate 10.5% – 12.6%**. That is the number worth comparing between two offers, and it
is shown next to the headline rate rather than in a footnote, because a lower rate with a
bigger fee is often the dearer loan.

## The card

She walks into a branch with one page: ask for ₹4.75–4.86 lakh, personal loan, 60 months, hold
them to 9.99–10.99%, all-in 10.5–12.6%, do not agree to more than about ₹10,300 a month. Then
a short list of things to say no to — bundled insurance, signing before seeing the Key Facts
Statement, a pre-payment penalty on a floating rate.

The card also tells her that a lender may offer far more, and that the larger number is not a
compliment.

---

## How this is put together

Rules are data, the engine is pure, the UI renders.

Every number lives in a table in `engine/rules/`, and the types will not compile a rule without
a `why` and a `source`. [`RULES.md`](RULES.md) is generated from those same tables, so the
document cannot drift from the behaviour — and neither can the run-throughs in `runs/`.

Every quantity is an interval `[lo, hi]`, never a point estimate with a fudge factor. Ranges
narrow because the arithmetic narrows them, and an unanswered question widens the answer rather
than silently defaulting. Confidence is a statement about how wide the answer is, not about how
many questions were asked.

Every rule that fires emits a reason into a trace. The verdict text, the "show working"
drawers, the card and these generated documents are all views of that one trace, which is why
none of them can say something the arithmetic does not support.

## What is next

- **The results screens and the Card in the browser.** The card is already computed in
  `engine/card.ts`; what is missing is the rendering, the "show working" drawers, and the box
  that takes a real lender quote and places it on the band.
- **The question flow on screen.** One question per screen, a visible skip with its
  consequence, and the "what moved" banner after each answer. The engine side of that banner
  (`whatMoved` in `engine/next-questions.ts`) is written and has no caller yet.
- **The path-to-yes toggles for Anita** — clear the app loans, three clean months, a smaller
  ask — re-running the engine and showing what the answer becomes.

## What I cut, and why

- **Five questions**, listed in `engine/questions.ts` under `cutQuestions`, each with its
  reason. A question that moves no output is a question that wastes a borrower's patience, and
  a test fails if one comes back.
- **Kannada and Hindi on the Card.** Two of the three borrowers are in Karnataka and the Card
  is the one screen meant to be held up across a desk, so this is a real loss rather than a
  tidy scope cut. It went because the rate and product work is what the tool is judged on.
- **A gold loan rate band I could cite.** Bank and NBFC gold lenders differ sharply and I did
  not find a table I trusted, so that row still says "my judgement" while every other product
  says where its numbers came from. Leaving it honest was better than dressing it up.
- **Two-wheeler as a fully separate product from vehicle loans.** They share a band, split only
  by whether a bank or an NBFC would write it — which is the distinction that actually changes
  Anita's answer.
- **Regional lenders entirely** — cooperative banks, chit funds, moneylenders. They are a real
  part of this market, particularly for the borrowers this tool would help most, and none of
  them are modelled. That is the largest single gap in the product table, and
  [`RULES.md`](RULES.md#what-i-do-not-know) says so.
