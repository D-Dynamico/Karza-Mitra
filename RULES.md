# RULES

**Generated from the rule tables by `npm run gen`. Do not edit by hand — your changes will be overwritten.**

Every number this engine uses lives in a table in `engine/rules/`, carrying its own justification and its own provenance. The types make that mandatory: a rule without a `why` or a `source` does not compile. This document is a view of those same tables, so it cannot drift from the behaviour of the code.

Where a row says **My judgement**, that is exactly what it means — the figure is mine, reasoned but uncited. Where it says **Market** or **Regulation**, the citation and the date it was checked are in the last two columns.

## How a missing answer is treated

**An unknown is an interval. Its full width shows in the range, its conservative end decides
the verdict, and where the interval sits says what we think is likeliest.**

That single sentence settles what used to be two rules pulling against each other — that an
unknown must never flatter the borrower, and that not knowing something must never be punished
as though it were bad news. Both are true, because they are about different parts of the same
interval.

Two examples, both live in this engine:

- A borrower who does not state their rent and owns no property gets their city's rent band,
  say ₹4,000 to ₹10,000. The interval is centred where a modest home in that city actually
  costs, because that is the likeliest value. Its top decides whether they are told to borrow.
- A borrower who owns property gets **₹0 to about the middle of that same band**. Zero sits at
  the likely end, because owning premises is real evidence that they pay no rent — that is the
  domain knowledge, and throwing it away by handing them the same band as everybody else would
  be its own kind of dishonesty. But it is evidence, not proof, so the interval has width, and
  the verdict is still decided at the top of it.

The practical consequence is that saying nothing can never produce a better answer than saying
the favourable thing. It can only produce a wider one.

Where the two ends of an assumed range disagree about what the borrower should *do*, the engine
detects it and the app asks that question before any other — because at that point the answer
is not resting on the arithmetic, it is resting on a guess, and one question settles it.

## Products and pricing

Which loan a borrower is routed to, and what it costs. Getting the product wrong is more expensive than negotiating the rate badly, so routing runs before pricing.

### The products themselves

| Product | Rate | Fee | Tenure | Loan-to-value | Smallest loan | Why it prices this way |
|---|---|---|---|---|---|---|
| **Business loan**<br>unsecured | 8.4 – 24% | 1 – 2% | 12 – 60 months | n/a — nothing is pledged | ₹50,000 | Government-backed schemes sit at the bottom of this band and unsecured lenders at the top, so which door you walk through matters more than the product name. |
| **Gold loan**<br>secured | 8.5 – 14% | 0.25 – 1% | 6 – 36 months | set by `products.gold-ltv` | ₹10,000 | Quick, cheap and short. Good for an urgent gap, poor for anything you will still be repaying in three years. |
| **Loan against property**<br>secured | 8.75 – 14% | 0.35 – 2% | 60 – 180 months | 50–70% | ₹5,00,000 | The property stands behind the loan, so the rate drops sharply and the tenure can stretch. The risk you take is real: the asset is on the line. |
| **Microfinance or SHG loan**<br>unsecured | 18 – 26% | 0 – 1% | 12 – 24 months | n/a — nothing is pledged | ₹15,000 | Expensive, but honest about it and built for incomes that cannot be evidenced. Cheaper than any app loan. |
| **Two-wheeler loan from an NBFC or platform financier**<br>secured | 18 – 28% | 2 – 6% | 18 – 60 months | 70–95% | ₹25,000 | A bank will not write this loan for someone whose income cannot be evidenced, whatever the vehicle is worth. The lenders who will — NBFCs and the finance arms attached to delivery platforms — charge a great deal more for taking the risk a bank would not. |
| **Personal loan**<br>unsecured | 9.99 – 24% | 1 – 3% | 12 – 60 months | n/a — nothing is pledged | ₹50,000 | Nothing is pledged, so the lender prices for the risk that you simply stop paying. |
| **Vehicle loan**<br>secured | 8.5 – 15% | 0.5 – 2.5% | 12 – 60 months | 75–90% | ₹30,000 | The vehicle itself is the security, so it is far cheaper than borrowing the same amount unsecured to buy one. |

Where each product’s bands come from:

| Product | Source | Checked |
|---|---|---|
| Business loan | Market: MUDRA / PMMY lender rate tables, Sep 2026: public sector banks roughly 8.40-12%, private banks and NBFCs 10-15% and above, scheme band overall about 9-24%. Each lending institution prices within its own policy, which is why the band is this wide. The MUDRA ceiling rose from 10 to 20 lakh in 2024. | 2026-09-07 |
| Gold loan | My judgement — The rate band is still my own working figure: bank gold loans sit near the bottom and NBFC gold lenders well above it, but I did not find a rate table I was willing to cite. The loan-to-value beside it is regulated and is sourced separately. | — |
| Loan against property | Market: Bank loan-against-property rate cards, Sep 2026: SBI 8.95-10.50%, HDFC 9.00-11.00%, Axis 9.25-10.95%, ICICI 10.60-12.25%; NBFCs and housing finance companies run to 14%. Processing fees 0.35% (SBI) to 2% (private banks). Loan-to-value is 60-70% on commercial premises against 75-80% residential, so a shop sits at the lower end of this band. | 2026-09-07 |
| Microfinance or SHG loan | Market: NBFC-MFI effective lending rates, Sep 2026: sector band roughly 18-26%. ICICI reports a maximum of 21.50% to microfinance borrowers for Q4 FY2026; Tata Capital microfinance starts at 24.25%. RBI removed the margin cap on NBFC-MFI pricing in 2022, so the band is set by the market rather than by a formula. | 2026-09-07 |
| Two-wheeler loan from an NBFC or platform financier | Market: BankBazaar two-wheeler loan rate table, page updated 07 Sep 2026: NBFC lenders from 9.47% up to 24% (Bajaj Auto Finance), with the two-wheeler market as a whole reaching 36%; NBFC processing fees 4-7%; NBFCs finance up to 95% of on-road price and write tenures to 60 months. The band starts at 18% rather than 9.47% because the low NBFC quotes go to borrowers a bank would also accept, and this product exists for the ones a bank would not. | 2026-09-07 |
| Personal loan | Market: Paisabazaar and BankBazaar personal-loan rate tables, Sep 2026. Floor of 9.99% quoted by HDFC, ICICI, Axis and IndusInd for CIBIL 780+ at category-A employers; public sector teaser rates from 8.75%, which are not what an ordinary applicant is written at. Top of band 24%. | 2026-09-07 |
| Vehicle loan | Market: BankBazaar two-wheeler loan rate table, page updated 07 Sep 2026: bank rates from 7.60% (Bank of India) to 14.50% onwards (HDFC), SBI from 8.50%, ICICI 10.25-26.10%. Bank processing fees 0.5-2.5%. Banks ask a larger down payment than NBFCs, so loan-to-value is lower. | 2026-09-07 |

### The rules around them

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `products.gold-ltv` | Share of pledged gold that can be borrowed, by size of loan<br>*keyed on amount being borrowed, in rupees* | below 2,50,000: 0.75 – 0.85<br>below 5,00,000: 0.75 – 0.8<br>above that: 0.75 | Small gold loans get the most generous treatment: the RBI allows up to 85% from April 2026, against the 75% most lenders still write to. Between two and a half and five lakh the ceiling steps down to 80%. Above five lakh the old 75% cap still applies, so there is no spread to quote. | Regulation: RBI gold loan directions effective 1 April 2026: tiered loan-to-value of 85% for loans up to 2.5 lakh, 80% from 2.5 to 5 lakh, 75% above. Limits must hold through the life of the loan, not only at sanction; bullet-repayment gold loans must clear within 12 months; only jewellery, ornaments and specially minted coins are eligible collateral, not bars, bullion or gold ETFs. | 2026-09-07 |
| `products.lap-threshold` | Amount above which pledging property is worth the trouble | 5,00,000 | Below about five lakh the paperwork, valuation and time involved in a property loan outweigh what you save on the rate. | My judgement — My own line, balancing the rate saving against the effort and the risk to the asset. | — |
| `products.notional-amount` | Amount the all-in rate is illustrated on when no other amount is available | 1,00,000 | The all-in rate barely changes with the size of the loan, but it has to be worked out on some amount. A lakh is used only when nothing is safe to borrow and no amount was asked for. | My judgement — A round illustrative figure; it affects the displayed rate only marginally. | — |
| `products.tenure-policy` | Tenure used for the headline figures, and the age it is capped at | **retirementAge**: 60<br>**unsecuredPreferredMonths**: 60<br>**securedPreferredMonths**: 84 | Lenders rarely write a loan that runs past working life, so age caps the tenure. Five years is the usual shape of an unsecured loan; a secured one can stretch further, which lowers the instalment at the cost of more interest. | My judgement — Standard practice. The preferred tenures are a starting point the borrower can move. | — |

## Income

What a lender will count, and what the borrower should plan on. These are different numbers, and the gap is the part of their income they cannot evidence.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `income.co-applicant` | Share of a co-applicant's income counted by a lender | 0.5 – 1 | How much of a co-applicant a lender counts depends on the relationship and how stable their job is, so the honest answer is a range. | My judgement — Common practice; banks vary between half and all of a spouse's income. | — |
| `income.productive-earnings` | Share of expected earnings from the purchase counted in the borrower budget | 0.5 | If the loan buys something that earns — a delivery vehicle, stock for the shop — that income is real and should count. But it has not happened yet, projections disappoint, and it takes time to build up, so only half of it is counted. No lender will count any of it. | My judgement — Halving a projection is my own line. The principle that a lender counts none of it is standard: they underwrite what you earn now. | — |
| `income.recognition` | How much of stated income each side counts | **salaried**: **lenderFactor**: 1<br>**planningFactor**: 1<br>**planOnWorstMonth**: false<br>**why**: A salary slip and a bank credit are all the proof anyone needs, and the amount is the same every month.<br>**self-employed-itr**: **lenderFactor**: 1<br>**planningFactor**: 1<br>**planOnWorstMonth**: true<br>**why**: Lenders work from the filed return, which is usually below what the business actually brings in. You should still budget on a slow month.<br>**self-employed-cash**: **lenderFactor**: 0.5 – 0.7<br>**planningFactor**: 0.95<br>**planOnWorstMonth**: true<br>**why**: With no filed return there is nothing to verify, so lenders discount hard and many decline unsecured lending outright.<br>**informal**: **lenderFactor**: 0.6 – 0.8<br>**planningFactor**: 0.9<br>**planOnWorstMonth**: true<br>**why**: Gig and daily-wage earnings swing month to month and cannot be evidenced, so both sides have to allow for a bad stretch. | A lender lends against what it can verify; a borrower has to survive their worst month. Neither number is wrong, and they are rarely the same. | My judgement — Haircuts reflect common underwriting practice rather than any one lender's policy. Directionally standard; the exact factors are mine. | — |
| `income.unknown-type` | Recognition factor when the income type is not stated | 0.5 – 1 | Until you say how you earn, the answer has to cover everyone from a salaried employee to a daily-wage earner. | My judgement — Spans the range of the recognition factors above. | — |

## Affordability — the two ceilings

The lender's ceiling and the borrower's are computed by separate rules. The lender's leaves out rent; the borrower's cannot. That is the main reason the two headline numbers diverge.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `affordability.emergency-savings` | Monthly saving reserved when the household has little put by | **months**: 3<br>**setAside**: 0.1 | With less than three months of expenses saved, the next emergency becomes another loan. A tenth of income is held back so the instalment does not consume the whole surplus. | My judgement — Three months is the common rule of thumb for an emergency fund. | — |
| `affordability.large-expense` | Months over which a known upcoming expense is set aside | 12 | A school admission or a wedding you already know about is not a surprise, and an instalment that only works if it does not happen is not affordable. It is spread across the year rather than deducted all at once. | My judgement — A year is the horizon the question asks about, so it is the horizon it is spread over. | — |
| `affordability.lender-foir` | Share of recognised income a lender will let go to loan instalments<br>*keyed on recognised monthly income* | below 30,000: 0.4<br>below 1,00,000: 0.5<br>above that: 0.55 – 0.6 | On a smaller income the fixed costs of living take a bigger share, so lenders leave more room. The standard band most retail lending is written in. Above a lakh a month there is more slack after essentials, and lenders will stretch further. | My judgement — Standard FOIR banding. Individual lenders differ by a few points and stretch for salaried borrowers at large employers. | — |
| `affordability.safe-outflow` | Share of planning income that should go to rent plus all instalments<br>*keyed on planning monthly income* | below 30,000: 0.35<br>below 1,00,000: 0.4<br>above that: 0.5 | On a smaller income, food, power and school take most of what is left, so very little can be committed to a loan before an ordinary bad month becomes a missed payment. Beyond about 40% on rent and loans together, an ordinary setback — a medical bill, a slow fortnight — has to be met by borrowing again. Above a lakh a month, half your income still leaves enough to absorb a bad month, so a higher share is genuinely survivable rather than merely permitted. | My judgement — Mirrors the shape of the FOIR banding lenders use, set a few points tighter at each tier and counting rent, which they do not. | — |
| `affordability.stressed-outflow` | Extra percentage points of outgo tolerated after a bad turn, by months of savings<br>*keyed on months of expenses saved* | below 1: 0.05<br>below 3: 0.1<br>below 6: 0.15<br>above that: 0.2 | With nothing put by there is no cushion at all, so almost no extra strain is survivable — the first bad month has to be met by borrowing again. A month or two of savings absorbs a small shock but not a lost quarter. Three months put by is the usual line for riding out a bad patch without new borrowing. With half a year banked you can carry a heavier instalment through a lean spell, because you are not one setback away from missing it. | My judgement — The 55% mid-point is the common line for where a household becomes fragile. Scaling it by savings is my own rule: the stress case models an income drop, and savings are what determine how long one can be absorbed. Capped at 60% because savings are self-reported. | — |

## Credit history

What a file does to the price. Bad news widens the band; it never sharpens it.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `credit.lender-spread` | Points of variation between lenders for the same borrower | 1.5 | Two lenders looking at the same file will still quote differently, so the band stays a band even when everything about you is known. It is also roughly what shopping around is worth. | My judgement — Observed spread between banks and NBFCs on comparable profiles. | — |
| `credit.never-borrowed` | Rate premium for a borrower with no credit history | 1 – 3 | With no record, banks have nothing to price against, so unsecured lending comes at a premium or is declined. Lending against an asset is barely affected — the asset is the evidence. | My judgement — New-to-credit borrowers are treated cautiously on unsecured lending, generously on secured. | — |
| `credit.predatory-rate` | Rate at which a loan is flagged as predatory | 30 | Above about 30% a year, an instalment loan costs more than it can realistically earn for the borrower, and clearing it comes before anything else. | My judgement — App-based lenders commonly price at these levels; the threshold is my own line. | — |
| `credit.recent-bounce` | Effect of a missed or bounced instalment in the recent past | **premium**: 4<br>**monthsCounted**: 6 | A bounce in the last six months is the single loudest signal in the file. Most lenders will decline unsecured lending, and it is the clearest sign that another instalment is not the answer right now. | My judgement — Bureau records show a bounce for years; lenders weigh a recent one heavily. | — |
| `credit.score-premium` | Rate premium over the best available, by credit score<br>*keyed on credit score* | below 650: 5 – 9<br>below 700: 3 – 5<br>below 750: 1 – 2<br>above that: 0 | Below 650 most banks decline unsecured lending outright, and the lenders who do say yes price it steeply. In the 650s and 690s you will be quoted several points over the best rate, and plenty of banks will still decline. A point or two over the best rate. Worth pushing back on, since you are close to the top band. At 750 and above you qualify for the bottom of the band. If you are quoted more, ask why. | My judgement — Directionally how risk-based pricing works in Indian retail lending. Exact steps vary by lender and are not published. | — |
| `credit.unknown-score` | Score assumed when the borrower has borrowed before but does not know it | 650 – 780 | Someone repaying loans now is unlikely to be at either extreme, but the honest answer spans from "banks will hesitate" to "you qualify for the best rate". Checking it is free and narrows this immediately. | My judgement — A deliberately wide band. Narrowing it without evidence would be inventing a score. | — |

## The bad month

Every answer is re-run against a worse version of the same borrower.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `stress.scenario` | The bad turn every plan is tested against | **incomeDrop**: 0.2<br>**rateRise**: 2 | A fifth off your income and two points on the rate is an ordinary bad year, not a disaster. If the plan only works while nothing goes wrong, it is not a plan. | My judgement — A 20% drop is roughly a slow quarter for a self-employed borrower or a lost increment for a salaried one; two points is well within the range floating rates have moved in recent cycles. | — |

## The verdict

The thresholds that decide borrow, borrow less, or do not borrow.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `verdict.borrow-less-threshold` | How far below the ask the safe amount must fall before we say borrow less | 0.8 | A safe amount within a fifth of what you asked for is close enough to negotiate or trim. Further below that, the gap is the story. | My judgement — A round line; the exact figure matters less than having one and stating it. | — |
| `verdict.obligation-danger-line` | Share of planning income already committed to loans at which we say stop | 0.5 | With more than half your income already going to instalments before this loan, another one does not solve the problem — it postpones it and makes it larger. | My judgement — Sits above every lender ceiling used here, so it only fires when things are genuinely bad. | — |
| `verdict.productive-coverage` | How much of the instalment a productive loan should earn back | 1 | If the thing you are borrowing for earns more each month than the instalment costs, the loan pays for itself and the usual caution about borrowing does not apply in the same way. | My judgement — Covering the instalment is the minimum bar for calling a loan productive. | — |

## Household spending

What it costs to run the household before any instalment.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `expenses.city-multiplier` | Household spending adjustment by city tier | **metro**: 1.25<br>**tier-2**: 1<br>**tier-3**: 0.85<br>**unknown**: 1 | The same shopping list costs noticeably more in Bengaluru than in Hubballi. Tier 2 is the baseline because two of the three borrowers live there. | My judgement — Rough relative cost of living. The direction is not in doubt; the exact multipliers are mine. | — |
| `expenses.default` | Assumed monthly household spending when it is not stated | **base**: 9,000<br>**perExtraPerson**: 3,500 | A working figure for food, power, transport, phone and school costs, rising with each extra person the income has to cover, so that a blank answer does not read as "spends nothing". | My judgement — A round starting figure, not survey data. It is shown to the borrower as an assumption and is meant to be corrected. Known simplification: it charges the same for a child as for an adult, and ignores that a larger household shares costs. | — |
| `expenses.floor-share` | Minimum assumed spending as a share of income | 0.25 | A household earning more generally spends more. Assuming a flat figure for everyone would flatter higher earners and overstate what they can carry. | My judgement — A conservative floor; the intent is not to under-assume for a higher income. | — |

## Rent

Unknown is never zero. An unanswered rent becomes a conservative range, because reading it as nothing would hand the borrower a surplus they may not have.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `rent.assumed-by-city` | Rent assumed when it is not stated, by city tier | **metro**: 8,000 – 20,000<br>**tier-2**: 4,000 – 10,000<br>**tier-3**: 3,000 – 7,000<br>**unknown**: 3,000 – 20,000 | Somebody has to be paying for the roof. Assuming nothing would hand you a surplus you may not have, so we assume a range for your city and widen the answer rather than narrow it. | My judgement — Rough rental bands for a modest home in each tier. Not survey data, and deliberately wide — the borrower is meant to correct it. | — |

## How steady the income is

Employer and tenure, which move the rate rather than the amount.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `stability.employer` | Rate adjustment for the kind of employer | **mnc**: -1 – -0.5<br>**psu-govt**: -1.5 – -0.75<br>**small-firm**: 0 – 0.75<br>**other**: 0 | A government or large-company payslip is the strongest evidence of a steady income a lender can see, and several will shave the rate for it. A small employer carries the risk that the job goes before the loan does. | My judgement — Employer categories are a standard underwriting input. The sizes of the adjustments are mine. | — |
| `stability.years-in-work` | Rate adjustment for time in the job or the business<br>*keyed on years in the current job or business* | below 1: 1 – 2.5<br>below 3: 0 – 1<br>above that: -0.75 – 0 | Under a year, many lenders decline outright and the rest price for the chance you do not stay. Past the first year the file reads normally, but you are not yet getting the best of the band. Several years in the same work is exactly what a lender wants to see, and it is worth asking for a better rate on the strength of it. | My judgement — Reflects the probation and vintage rules most lenders apply. | — |

## What would change the answer

The figures behind the what-if options shown after a refusal. The co-applicant income is the one number on that screen the borrower did not supply, so the option prints it rather than folding it into the arithmetic.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `path.assumed-co-applicant-income` | Second household income assumed when showing what another earner would change | 15,000 | A figure has to be picked to show what a second income is worth at all, and this is roughly what part-time or entry-level work pays in the cities these borrowers live in. It is an illustration, not a prediction — which is why the amount is printed in the option itself rather than hidden inside the arithmetic. | My judgement — My own round figure, chosen to be modest rather than flattering. | — |
| `path.gap-closers` | Ways to bridge a shortfall without borrowing more | **vehicle**: Put down the difference yourself. Platform finance partners commonly expect 15 to 25% up front, and the loan is cheaper for it.; Check the subsidy on the sticker price before you agree a figure — electric two-wheelers carry central and state support that is applied at the dealer.; A model one step down, or a good used one, closes most gaps this size on its own.<br>**business-stock**: Buy the stock in two rounds rather than one, and let the first round pay for the second.; Ask your supplier for credit terms. Thirty days from a supplier costs nothing and is the cheapest working capital there is.<br>**wedding**: The date is negotiable in a way an instalment is not. A few months of saving closes a gap this size without any lender involved.<br>**medical**: Ask the hospital about instalments directly, and check any scheme you are covered by before borrowing. | A shortfall is not automatically a reason to borrow more. Putting part down, taking a subsidy, or buying in stages closes most gaps at a lower cost than the extra lending would. | My judgement — Practical options rather than lending rules. The subsidy point is specific to electric two-wheelers. | — |

## Confidence

How narrow an answer has to be before it is worth acting on. Confidence describes the width of the answer, not the number of questions asked.

| Rule | What it sets | Value | Why | Source | Checked |
|---|---|---|---|---|---|
| `confidence.thresholds` | Range widths at which an answer counts as high or medium confidence | **highRatePoints**: 1.5<br>**highAmountShare**: 0.25<br>**mediumRatePoints**: 3.5<br>**mediumAmountShare**: 0.6 | Confidence describes how narrow the answer is, not how many questions were asked. Answering ten questions that change nothing should not make anyone feel more certain. | My judgement — My own lines for what is narrow enough to act on. | — |

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

- `affordability.emergency-savings`
- `affordability.large-expense`
- `affordability.lender-foir`
- `affordability.safe-outflow`
- `affordability.stressed-outflow`
- `confidence.thresholds`
- `credit.lender-spread`
- `credit.never-borrowed`
- `credit.predatory-rate`
- `credit.recent-bounce`
- `credit.score-premium`
- `credit.unknown-score`
- `expenses.city-multiplier`
- `expenses.default`
- `expenses.floor-share`
- `income.co-applicant`
- `income.productive-earnings`
- `income.recognition`
- `income.unknown-type`
- `path.assumed-co-applicant-income`
- `path.gap-closers`
- `products.lap-threshold`
- `products.notional-amount`
- `products.tenure-policy`
- `rent.assumed-by-city`
- `stability.employer`
- `stability.years-in-work`
- `stress.scenario`
- `verdict.borrow-less-threshold`
- `verdict.obligation-danger-line`
- `verdict.productive-coverage`
- `products.bands → gold-loan`

That is 32 of 40 rows.

## Which questions get asked, and why

A question earns its place by moving an output. Every question in the flow declares the
outputs it `moves`, and a test fails if a question moves nothing. Five questions were written
and then cut for exactly this reason; they are listed in `engine/questions.ts` under
`cutQuestions`, each with the reason it was dropped, and a test fails if one reappears.

Questions are tiered. **Must** questions are asked of everyone, because without them the
answer would be invented rather than estimated. **Should** and **could** questions are asked
only when the borrower's answers so far make them capable of changing something — a question
about property is pointless for someone who has already said they own none.

Every question can be skipped, and every skip states its consequence in one line rather than
hiding it. Skipping does not block the answer; it widens it, and the assumption that filled
the gap is labelled in the result. This is the difference between an engine that refuses to
answer and one that answers honestly with less information.
