# Questions for Lokta — Borrower Copilot

Draft. Send as one message.

---

Subject: Borrower Copilot — time, and six questions

Hello,

Two things in one message: a request on timing, and the questions the brief invited.

**Timing.** The brief was issued 2 Sep with a four-day box, so it closed on the 6th. I would
like until [DATE] to finish. The engine, the rules and the tests are done and the three
borrowers come out where they should; what remains is the question flow, the generated
RULES.md and the run-throughs. Happy to send the repo as it stands right now if you would
rather see where it got to inside the box — say the word and I will send the link today.

**Six questions.** Each one names what I have assumed in the meantime, so nothing is blocked
on your reply. All of them are flagged in the code where they bite.

**1. Do the lenders you have in mind count rent in FOIR?**
Rent is the single biggest reason my two numbers diverge. Priya's lender headroom is about
₹46,000 a month; her safe-carry headroom is ₹2,000, and almost all of that gap is her ₹28,000
rent, which the lender ignores and she cannot. If some of your lenders do count rent, the
divergence is smaller and I should say so rather than presenting the widest possible version.
*Assumed:* lenders do not count rent; the borrower's rulebook does.

**2. Should informal income ever be recognised for unsecured lending?**
I currently haircut stated informal income to 60–80% for the lender's number, and route a
borrower with informal income and no collateral away from unsecured lending altogether. That
is a strong position and it is the one that makes Anita's answer come out as "don't". If your
view is that some NBFCs will lend unsecured against gig income at a price, I would rather
model that price than pretend the door is shut.
*Assumed:* formal unsecured lending is effectively closed to her.

**3. Does Ravi rent the home he lives in?**
The brief says he owns the shop premises, about ₹45 lakh, unencumbered. It does not say where
he lives. A kirana owner who owns his premises very often lives above or beside them, so I
have assumed no rent — but if he rents, his safe-carry number falls and the answer changes.
*Assumed:* no rent, flagged in the app as an assumption.

**4. Does Anita pay rent?**
Same gap, opposite treatment. The brief gives her income, her loans and her household but not
her housing. Here I have deliberately *not* assumed zero: a blank rent read as zero would hand
her a surplus she probably does not have, and "unknown is never zero" seemed to me a principle
rather than a rule about credit scores specifically. So an unanswered rent becomes a range for
her city tier — ₹4,000 to ₹8,000 — flagged as assumed, and it widens her answer rather than
improving it. Her surplus comes out between −₹16,600 and −₹10,600 either way.
*Assumed:* she rents, in that range, pending a real figure.

**5. Should the Negotiation Card be available in Kannada or Hindi?**
Two of the three borrowers are in Karnataka, and the Card is the one screen meant to be held
up across a desk in a branch. If it is going to be used, the language it is in is not a
nice-to-have. It is a few hours of work for the must-set labels and the Card rows, and I would
rather know whether it counts.
*Assumed:* English only, and I have kept the copy plain enough to translate.

**6. Is a "path to yes" in scope for the "don't" verdict?**
I read "something they could act on tomorrow" as meaning a "don't" cannot be a dead end, so
Anita's screen is built around her surplus, an ordered list of what to clear first, and a set
of toggles — app loans cleared, three clean months, a smaller ask — that re-run the engine and
show what the answer becomes. That is a meaningful share of the build. If you consider it out
of scope I would rather put the hours into the rate and product work.
*Assumed:* in scope, and built.

**One thing I want to flag rather than ask.** The product rate, fee and loan-to-value bands in
my rules are currently my own working figures and are marked as such in RULES.md, with the
date and the source column saying "my judgement, not verified". I am checking them against
current lender pages before I submit, and the ones that change will show up as moved golden
tests. I would rather tell you that than have you find it.

Thank you —
Dayanand

---

## Where each of these lives in the code

| Question | Where |
|---|---|
| 1. Rent in FOIR | `engine/rules/affordability.ts` — `lenderFoirCeiling` counts instalments only |
| 2. Informal income unsecured | `engine/rules/income.ts` haircut; `engine/rules/products.ts` routing |
| 3. Ravi's rent | `engine/personas.ts`, `TODO(lokta)`; `engine/rules/rent.ts` owns-premises branch |
| 4. Anita's rent | `engine/personas.ts`, `TODO(lokta)`; `engine/rules/rent.ts` `assumedRentByCity` |
| 5. Card language | Not built; phase 4 |
| 6. Path to yes | phase 4.7 |
| Unverified bands | `engine/rules/products.ts` — `products.bands` source note; phase 3.1 |
