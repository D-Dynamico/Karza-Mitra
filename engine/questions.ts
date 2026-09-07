/**
 * The question registry.
 *
 * Two rules govern everything here.
 *
 * **Every question must move a number.** Each one declares the outputs it
 * affects, and `tests/questions.test.ts` re-runs the engine with real answers to
 * check the claim. A question that cannot be shown to move a declared output for
 * at least one borrower is deleted — not exempted, not given a looser test. Some
 * have already gone that way; they are listed at the bottom of this file with
 * the reason, because what was cut is part of the design.
 *
 * **Nothing is asked that cannot apply.** `applies` gates every question on what
 * we already know, so a salaried engineer is never asked about her filed return
 * and a shopkeeper is never asked who his employer is.
 */

import type { Answers } from './answers';
import type { OutputId } from './outputs';

export type QuestionTier = 'must' | 'adaptive';

export type InputKind =
  | { kind: 'money' }
  | { kind: 'money-range' }
  /**
   * An amount that is very often nothing. Asking "does anyone else earn?" with
   * a bare money box makes the common answer — no — the hardest one to give:
   * the borrower has to work out that zero is what we want. So the "no" is a
   * button, and the box only appears if they say yes.
   */
  | { kind: 'money-optional'; noLabel: string; yesLabel: string }
  | { kind: 'number'; unit: string; max?: number }
  | { kind: 'boolean' }
  | { kind: 'choice'; options: ReadonlyArray<{ value: string; label: string }> }
  | { kind: 'credit-score' };

export interface Question {
  readonly id: string;
  /** The answer this question fills in. */
  readonly field: keyof Answers;
  readonly tier: QuestionTier;
  /** What the borrower reads. */
  readonly prompt: string;
  /** One sentence behind the "why are you asking?" link. */
  readonly whyWeAsk: string;
  /**
   * A few words explaining a term the borrower may not know, behind a "?" on
   * the question itself. Distinct from `whyWeAsk`, which justifies the question;
   * this one just says what a word means. Only set where there is jargon.
   */
  readonly hint?: string;
  /** What the borrower loses by skipping. Shown next to the skip button. */
  readonly skipCost: string;
  readonly input: InputKind;
  /** The outputs this question claims to move. Checked by the moves test. */
  readonly moves: readonly OutputId[];
  /** Whether the question makes sense given what we already know. */
  readonly applies: (a: Answers) => boolean;
  /**
   * Rules whose assumption this question would replace with a real answer.
   *
   * A question can be worth asking even when it moves no number: if the app is
   * showing "we assumed you live alone" to a woman supporting three other
   * people, she should be able to correct it. Being visibly wrong about
   * something the borrower can see costs more trust than the arithmetic gains.
   */
  readonly corrects?: readonly string[];
  /**
   * Two or three answers a real borrower might give. Used to measure what the
   * question is worth before it is asked, and by the moves test.
   */
  readonly probes: readonly Partial<Answers>[];
}

const always = () => true;
const answered = (a: Answers, field: keyof Answers): boolean => a[field] !== undefined;

const selfEmployed = (a: Answers): boolean =>
  a.incomeType === 'self-employed-itr' || a.incomeType === 'self-employed-cash';
const informalOrCash = (a: Answers): boolean =>
  a.incomeType === 'informal' || a.incomeType === 'self-employed-cash';
const hasExistingDebt = (a: Answers): boolean => (a.existingEmis ?? 0) > 0;

// ---------------------------------------------------------------------------
// The must set. Nine questions, and with only these the engine still answers.
// ---------------------------------------------------------------------------

export const mustSet: readonly Question[] = [
  {
    id: 'purpose',
    field: 'purpose',
    tier: 'must',
    prompt: 'What is the loan for?',
    whyWeAsk:
      'It decides which kind of loan you should be asking for, and the cheapest loan for a shop is not the cheapest loan for a wedding.',
    skipCost: 'Without it we cannot route you to the right product, only price a general one.',
    input: {
      kind: 'choice',
      options: [
        { value: 'wedding', label: 'A wedding' },
        { value: 'medical', label: 'Medical treatment' },
        { value: 'education', label: 'Education' },
        { value: 'business-stock', label: 'Stock or working capital' },
        { value: 'vehicle', label: 'A vehicle' },
        { value: 'home', label: 'A home or repairs' },
        { value: 'debt-consolidation', label: 'Clearing other loans' },
        { value: 'other', label: 'Something else' },
      ],
    },
    // We ask the purpose rather than the loan type, because a borrower knows why
    // they need money and should not have to know that the answer is called a
    // loan against property. Working out the product is our job.
    moves: ['O2.safe', 'O3.rate', 'O3.apr', 'O4.emi'],
    applies: always,
    probes: [{ purpose: 'wedding' }, { purpose: 'business-stock' }, { purpose: 'vehicle' }],
  },
  {
    id: 'amount-asked',
    field: 'amountAsked',
    tier: 'must',
    prompt: 'How much do you want to borrow?',
    whyWeAsk: 'Everything else is measured against it — including whether you should borrow at all.',
    skipCost: 'We can still tell you your ceiling, but not whether what you had in mind fits under it.',
    input: { kind: 'money' },
    moves: ['O1.verdict'],
    applies: always,
    probes: [{ amountAsked: 200000 }, { amountAsked: 1500000 }],
  },
  {
    id: 'income-type',
    field: 'incomeType',
    tier: 'must',
    prompt: 'How do you earn?',
    whyWeAsk:
      'Lenders believe a salary slip in full and discount cash income heavily. This is usually the single biggest thing separating what they will lend from what you actually earn.',
    skipCost: 'Your rate band stays much wider, because we have to allow for every kind of earner.',
    input: {
      kind: 'choice',
      options: [
        { value: 'salaried', label: 'A salary' },
        { value: 'self-employed-itr', label: 'Self-employed, I file returns' },
        { value: 'self-employed-cash', label: 'Self-employed, mostly cash' },
        { value: 'informal', label: 'Daily wage, gig or informal work' },
      ],
    },
    moves: ['O2.lender', 'O2.safe', 'O3.rate'],
    applies: always,
    probes: [
      { incomeType: 'salaried' },
      { incomeType: 'self-employed-itr' },
      { incomeType: 'informal' },
    ],
  },
  {
    id: 'monthly-income',
    field: 'monthlyIncome',
    tier: 'must',
    prompt: 'What do you take home in a month?',
    whyWeAsk: 'Both of your numbers are built on it. If it varies, give us the low and the high.',
    hint: 'What actually reaches your account each month, after deductions — not your CTC or the figure on your offer letter.',
    skipCost: 'We cannot answer at all without this one.',
    input: { kind: 'money-range' },
    moves: ['O1.verdict', 'O2.lender', 'O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ monthlyIncome: { lo: 25000, hi: 25000 } }, { monthlyIncome: { lo: 90000, hi: 90000 } }],
  },
  {
    id: 'existing-emis',
    field: 'existingEmis',
    tier: 'must',
    prompt: 'What do you already pay each month on loans?',
    whyWeAsk:
      'It comes straight off both ceilings. It is also the fastest number to change, since a loan ending frees the whole instalment at once.',
    skipCost: 'Both amounts will be too generous, because we will assume you owe nothing.',
    input: { kind: 'money' },
    moves: ['O2.lender', 'O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ existingEmis: 0 }, { existingEmis: 15000 }],
  },
  {
    id: 'rent',
    corrects: ['rent.assumed-by-city', 'rent.owns-premises'],
    field: 'rentOrHomeEmi',
    tier: 'must',
    prompt: 'What do you pay for rent, or on a home loan?',
    whyWeAsk:
      'Most lenders leave rent out of their arithmetic entirely. You cannot, so we count it — and it is usually the biggest reason our number is smaller than theirs.',
    skipCost: 'We will assume a range for your city, which keeps your safe amount wider than it needs to be.',
    input: { kind: 'money' },
    moves: ['O2.safe', 'O4.emi', 'O4.stress'],
    applies: always,
    probes: [{ rentOrHomeEmi: 0 }, { rentOrHomeEmi: 20000 }],
  },
  {
    id: 'household-expenses',
    corrects: ['expenses.default'],
    field: 'householdExpenses',
    tier: 'must',
    prompt: 'Roughly what does the household spend in a month, apart from rent and loans?',
    whyWeAsk:
      'Food, power, school, travel. What is left after these is what an instalment actually comes out of.',
    skipCost:
      'We will fill in a figure from your city and household size and mark it as assumed. Your own number is better.',
    input: { kind: 'money' },
    moves: ['O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ householdExpenses: 8000 }, { householdExpenses: 40000 }],
  },
  {
    id: 'household-size',
    corrects: ['expenses.default'],
    field: 'householdSize',
    tier: 'must',
    prompt: 'How many people does your income support?',
    whyWeAsk:
      'The same income supports one person comfortably and four with nothing to spare. It sets what we assume the household spends, and it is the cheapest question here to answer.',
    skipCost: 'We will assume you are supporting only yourself, which almost certainly understates what the household spends.',
    input: { kind: 'number', unit: 'people', max: 20 },
    moves: ['O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ householdSize: 1 }, { householdSize: 5 }],
  },
  {
    id: 'age',
    field: 'age',
    tier: 'must',
    prompt: 'How old are you?',
    whyWeAsk:
      'Lenders rarely write a loan that runs past working life, so your age sets how long the loan can be spread — which sets the instalment.',
    skipCost: 'We will assume the product\'s full tenure is open to you, which may be optimistic.',
    input: { kind: 'number', unit: 'years', max: 100 },
    moves: ['O2.lender', 'O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ age: 30 }, { age: 56 }],
  },
  {
    id: 'credit-score',
    corrects: ['credit.unknown-score'],
    field: 'creditScore',
    tier: 'must',
    prompt: 'Do you know your credit score?',
    whyWeAsk:
      'It moves your rate more than anything else you can tell us. Not knowing is fine and common — we will show you the range instead of pretending.',
    skipCost: 'Your rate band stays several points wide. Checking it is free and takes a minute.',
    input: { kind: 'credit-score' },
    moves: ['O3.rate', 'O3.apr'],
    applies: always,
    probes: [
      { creditScore: { known: true, score: 780 } },
      { creditScore: { known: true, score: 660 } },
      { creditScore: { known: false, everBorrowed: false } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Adaptive. Each is gated on what we already know, so nobody sees all of them.
// ---------------------------------------------------------------------------

export const adaptiveSet: readonly Question[] = [
  // --- Everyone, once we know where and who they support -------------------
  {
    id: 'city-tier',
    corrects: ['expenses.default', 'rent.assumed-by-city'],
    field: 'cityTier',
    tier: 'adaptive',
    prompt: 'What kind of place do you live in?',
    whyWeAsk: 'Rent and everyday costs differ enough between a metro and a small town to change the answer.',
    skipCost: 'We assume the widest range across all of them.',
    input: {
      kind: 'choice',
      options: [
        { value: 'metro', label: 'A big city' },
        { value: 'tier-2', label: 'A smaller city or district town' },
        { value: 'tier-3', label: 'A town or village' },
      ],
    },
    moves: ['O2.safe', 'O4.emi'],
    applies: (a) => !answered(a, 'rentOrHomeEmi') || !answered(a, 'householdExpenses'),
    probes: [{ cityTier: 'metro' }, { cityTier: 'tier-3' }],
  },
  {
    id: 'emergency-savings',
    field: 'emergencySavingsMonths',
    tier: 'adaptive',
    prompt: 'If your income stopped, how many months could you cover?',
    whyWeAsk:
      'With less than three months put by, we hold part of your surplus back rather than letting an instalment take all of it — because the next emergency would otherwise become another loan.',
    skipCost: 'We assume you have little put by and hold back a tenth of your income.',
    input: { kind: 'number', unit: 'months', max: 60 },
    moves: ['O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ emergencySavingsMonths: 0 }, { emergencySavingsMonths: 6 }],
  },
  {
    id: 'large-expense',
    field: 'largeExpenseNext12Months',
    tier: 'adaptive',
    prompt: 'Is there a big expense coming in the next year?',
    whyWeAsk:
      'A school admission or a wedding you already know about is not a surprise. An instalment that only works if it does not happen is not affordable.',
    skipCost: 'We assume nothing is coming, which makes your safe amount look larger than it is.',
    input: { kind: 'money' },
    moves: ['O2.safe', 'O4.emi'],
    applies: always,
    probes: [{ largeExpenseNext12Months: 0 }, { largeExpenseNext12Months: 240000 }],
  },
  {
    id: 'co-applicant-income',
    field: 'coApplicantIncome',
    tier: 'adaptive',
    prompt: 'Does anyone else in the household earn?',
    whyWeAsk:
      'A lender will count part of their income towards what you can borrow. We only count it towards what you can safely carry if you tell us it is genuinely shared.',
    skipCost: 'We treat you as the only earner, which is the cautious reading.',
    input: {
      kind: 'money-optional',
      noLabel: 'No, I am the only earner',
      yesLabel: 'Yes — and they take home',
    },
    moves: ['O2.lender', 'O2.safe'],
    applies: always,
    probes: [{ coApplicantIncome: 0 }, { coApplicantIncome: 30000, coApplicantPooled: true }],
  },

  {
    id: 'co-applicant-pooled',
    field: 'coApplicantPooled',
    tier: 'adaptive',
    prompt: 'Is that income actually shared with the household?',
    whyWeAsk:
      'A lender will count part of it either way. We only count it towards what you can safely carry if it genuinely goes into the same pot — otherwise it is their money, not yours to commit.',
    skipCost:
      'We leave their income out of your safe amount, which is the cautious reading and may understate what you can carry.',
    input: { kind: 'boolean' },
    moves: ['O2.safe', 'O4.emi'],
    applies: (a) => (a.coApplicantIncome ?? 0) > 0,
    probes: [{ coApplicantPooled: false }, { coApplicantPooled: true }],
  },

  // --- Salaried ------------------------------------------------------------
  {
    id: 'employer-type',
    field: 'employerType',
    tier: 'adaptive',
    prompt: 'What kind of employer do you work for?',
    whyWeAsk:
      'A government or large-company payslip is the strongest evidence of steady income a lender sees, and several will shave up to a point off the rate for it.',
    skipCost: 'You may be quoted a rate that does not reflect how safe your job makes you look.',
    input: {
      kind: 'choice',
      options: [
        { value: 'mnc', label: 'A large or multinational company' },
        { value: 'psu-govt', label: 'Government or a public-sector body' },
        { value: 'small-firm', label: 'A small firm' },
        { value: 'other', label: 'Something else' },
      ],
    },
    moves: ['O3.rate', 'O3.apr'],
    applies: (a) => a.incomeType === 'salaried',
    probes: [{ employerType: 'psu-govt' }, { employerType: 'small-firm' }],
  },
  {
    id: 'years-in-job',
    field: 'yearsInJob',
    tier: 'adaptive',
    prompt: 'How long have you been in this job?',
    whyWeAsk:
      'Under a year, many lenders will not lend at all. Past three, you should be asking for the bottom of the band.',
    skipCost: 'Your rate band stays wider than it needs to be.',
    input: { kind: 'number', unit: 'years', max: 50 },
    moves: ['O3.rate', 'O3.apr'],
    applies: (a) => a.incomeType === 'salaried',
    probes: [{ yearsInJob: 0.5 }, { yearsInJob: 8 }],
  },

  // --- Self-employed -------------------------------------------------------
  {
    id: 'itr-income',
    field: 'itrIncomeMonthly',
    tier: 'adaptive',
    prompt: 'What does your filed return show, as a monthly figure?',
    whyWeAsk:
      'This is the number a lender underwrites you on, whatever the business actually takes. The gap between it and your real income is why pledging an asset may be your best lever.',
    skipCost: 'We have to discount your stated income heavily instead, which lowers what a lender will offer.',
    input: { kind: 'money' },
    moves: ['O2.lender', 'O2.safe'],
    applies: selfEmployed,
    probes: [{ itrIncomeMonthly: 20000 }, { itrIncomeMonthly: 60000 }],
  },
  {
    id: 'years-in-business',
    field: 'yearsInBusiness',
    tier: 'adaptive',
    prompt: 'How long have you been running the business?',
    whyWeAsk: 'Vintage is what a lender has instead of a payslip. Several years of it is worth asking for a better rate on.',
    skipCost: 'Your rate band stays wider than it needs to be.',
    input: { kind: 'number', unit: 'years', max: 60 },
    moves: ['O3.rate', 'O3.apr'],
    applies: selfEmployed,
    probes: [{ yearsInBusiness: 0.5 }, { yearsInBusiness: 15 }],
  },

  // --- Anyone who might own something ---------------------------------------
  {
    id: 'owns-property',
    field: 'ownsProperty',
    tier: 'adaptive',
    prompt: 'Do you own a house, shop or land?',
    whyWeAsk:
      'Pledging property roughly halves the rate on a large loan. It is almost always the single biggest lever a borrower has, and most people do not know it is available to them.',
    skipCost: 'We can only price you for a loan with nothing behind it, which is the dearest kind.',
    input: { kind: 'boolean' },
    moves: ['O2.lender', 'O2.safe', 'O3.rate', 'O3.apr'],
    applies: (a) => a.purpose !== 'vehicle',
    probes: [
      { ownsProperty: false },
      { ownsProperty: true, propertyValue: 4000000, propertyHasCharge: false },
    ],
  },
  {
    id: 'property-value',
    field: 'propertyValue',
    tier: 'adaptive',
    prompt: 'Roughly what is it worth?',
    whyWeAsk: 'Lenders advance about half to two-thirds of the value, so it caps the loan regardless of your income.',
    skipCost: 'We cannot tell you how much the property would support.',
    input: { kind: 'money' },
    moves: ['O2.lender', 'O2.safe', 'O3.rate'],
    applies: (a) => a.ownsProperty === true,
    probes: [{ propertyValue: 1500000 }, { propertyValue: 6000000 }],
  },
  {
    id: 'property-charge',
    field: 'propertyHasCharge',
    tier: 'adaptive',
    prompt: 'Is there already a loan against it?',
    whyWeAsk: 'A property already pledged cannot be pledged again, so it stops being a lever.',
    skipCost: 'We assume it is free of any charge, which may overstate what you can borrow.',
    input: { kind: 'boolean' },
    moves: ['O2.safe', 'O3.rate', 'O3.apr'],
    applies: (a) => a.ownsProperty === true,
    probes: [{ propertyHasCharge: false }, { propertyHasCharge: true }],
  },
  {
    id: 'gold',
    field: 'goldValue',
    tier: 'adaptive',
    prompt: 'Is there gold in the household you could pledge?',
    whyWeAsk:
      'For a smaller amount over a short period, a gold loan is usually the cheapest and fastest money available, and you keep the gold if you repay.',
    skipCost: 'We may route you to a dearer loan than you need.',
    input: { kind: 'money' },
    moves: ['O2.safe', 'O3.rate', 'O3.apr'],
    applies: (a) => informalOrCash(a) || (a.amountAsked ?? 0) <= 500000,
    probes: [{ goldValue: 0 }, { goldValue: 400000 }],
  },

  // --- Anyone already carrying debt ----------------------------------------
  {
    id: 'bounced',
    field: 'bouncedInLast6Months',
    tier: 'adaptive',
    prompt: 'Has any payment bounced or been missed in the last six months?',
    whyWeAsk:
      'It is the loudest signal in your file. Most lenders will decline unsecured lending on it, and it usually means the right answer is to wait rather than borrow.',
    skipCost: 'We assume nothing has, which may make our answer more optimistic than a lender will be.',
    input: { kind: 'boolean' },
    moves: ['O1.verdict', 'O3.rate', 'O3.apr'],
    applies: hasExistingDebt,
    probes: [{ bouncedInLast6Months: false }, { bouncedInLast6Months: true }],
  },
  {
    id: 'app-loans',
    field: 'appOrBnplLoans',
    tier: 'adaptive',
    prompt: 'Are any of those loans from an app, or buy-now-pay-later?',
    whyWeAsk:
      'They are the dearest money in the market, often above 30% a year. Clearing them frees more each month than a new loan would give you.',
    skipCost: 'We cannot tell you which loan to clear first.',
    input: { kind: 'boolean' },
    moves: ['O1.verdict'],
    applies: hasExistingDebt,
    probes: [{ appOrBnplLoans: false }, { appOrBnplLoans: true, bouncedInLast6Months: true }],
  },
  {
    id: 'existing-emi-months-left',
    field: 'existingEmiMonthsLeft',
    tier: 'adaptive',
    prompt: 'How many months are left on what you already pay?',
    whyWeAsk:
      'A loan ending soon frees its whole instalment at once. If it is close, waiting may get you more than borrowing now would.',
    skipCost: 'We cannot tell you whether waiting would be worth it.',
    input: { kind: 'number', unit: 'months', max: 600 },
    moves: ['O1.verdict'],
    applies: hasExistingDebt,
    probes: [{ existingEmiMonthsLeft: 6 }, { existingEmiMonthsLeft: 48 }],
  },

  // --- Buying a vehicle -----------------------------------------------------
  {
    id: 'vehicle-price',
    field: 'vehicleOnRoadPrice',
    tier: 'adaptive',
    prompt: 'What is the on-road price?',
    whyWeAsk: 'A vehicle loan is capped at a share of the price, so this sets the ceiling as much as your income does.',
    hint: 'The total you actually pay the dealer — the showroom price plus registration, road tax and insurance. It is the number on the final invoice, not the price on the advertisement.',
    skipCost: 'We cannot cap the loan at what the vehicle supports.',
    input: { kind: 'money' },
    moves: ['O2.lender', 'O2.safe'],
    applies: (a) => a.purpose === 'vehicle',
    probes: [{ vehicleOnRoadPrice: 90000 }, { vehicleOnRoadPrice: 900000 }],
  },
  // --- Borrowing to earn ----------------------------------------------------
  {
    id: 'expected-earnings',
    field: 'expectedMonthlyEarnings',
    tier: 'adaptive',
    prompt: 'How much more do you expect to earn each month because of this?',
    whyWeAsk:
      'If it earns more than the instalment costs, the loan largely pays for itself, and that is the strongest case for borrowing there is.',
    skipCost: 'We judge the loan on your current income alone.',
    input: { kind: 'money' },
    moves: ['O1.verdict'],
    applies: (a) =>
      a.purpose === 'business-stock' || a.purpose === 'vehicle' || a.vehicleIsProductive === true,
    probes: [{ expectedMonthlyEarnings: 0 }, { expectedMonthlyEarnings: 40000 }],
  },
];

export const allQuestions: readonly Question[] = [...mustSet, ...adaptiveSet];

export const questionById = (id: string): Question | undefined =>
  allQuestions.find((q) => q.id === id);

/** Everything that applies and has not been answered yet. */
export const unansweredApplicable = (a: Answers): Question[] =>
  allQuestions.filter((q) => !answered(a, q.field) && q.applies(a));

/**
 * Questions that were considered and cut, with the reason. Kept here because the
 * policy is only real if it has actually removed something, and because the next
 * person to want one of these should see why it went.
 */
export const cutQuestions = [
  {
    id: 'gst-registered',
    prompt: 'Are you registered for GST?',
    why: 'It changes which door you walk through, not the number that comes out of it. A business purpose already routes to scheme-backed lending, and GST registration moved no output for any borrower we tried.',
  },
  {
    id: 'card-utilisation',
    prompt: 'How much of your credit card limit do you use?',
    why: 'A real signal in a bureau file, but we do not pull a bureau file. It would only move a number by feeding a credit score we are already asking for directly, so it earns nothing here.',
  },
  {
    id: 'offers-received',
    prompt: 'Have you been offered a loan already?',
    why: 'Belongs on the Negotiation Card, where the quote is placed against the fair band, not in the flow. It does not change what you can afford — only whether the offer in front of you is a good one.',
  },
  {
    id: 'vehicle-productive',
    prompt: 'Will you earn with it?',
    why: 'Merged into the question below it, which asks how much it will earn. A yes-or-no answer and a number were competing to express the same thing, and only the number changes an output — knowing a scooter earns is worth nothing next to knowing it earns ₹12,000 a month against a ₹4,000 instalment.',
  },
  {
    id: 'variable-income-share',
    prompt: 'How much of your income is variable?',
    why: 'Duplicates the low-to-high range we already ask for in the income question. Two questions competing to express the same uncertainty is worse than one.',
  },
] as const;
