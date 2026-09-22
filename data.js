// ============================================================
// Content banks — every item is sourced from the 4 uploaded materials:
//  L2 = Lecture Note Week 02 (Proposition Logics)
//  L3 = Lecture Note Week 03.a (Logical Equivalence)
//  E1 = Exercise 1 - Propositional Logic
//  E2 = Exercise 2 - Logical Equivalence
// ============================================================
const DATA = (function () {

  // ---- Proposition vs non-proposition pool (L2 slides 7-8) ----
  const PROP_ITEMS = [
    { text: "Surabaya is the capital of West Java province", kind: 'false', src: 'L2' },
    { text: "Sidoarjo is adjacent to Surabaya", kind: 'true', src: 'L2' },
    { text: "1 + 1 = 2", kind: 'true', src: 'L2' },
    { text: "2 + 2 = 5", kind: 'false', src: 'L2' },
    { text: "If x is an odd number, then x + 1 is an odd number", kind: 'false', src: 'L2' },
    { text: "There is an integer number between integer number x and x + 1", kind: 'false', src: 'L2' },
    { text: "Is 2 an odd number?", kind: 'not', src: 'L2' },
    { text: "x + 5 is an odd number", kind: 'not', src: 'L2' },
    { text: "What time is it?", kind: 'not', src: 'L2' },
    { text: "Read this carefully", kind: 'not', src: 'L2' },
    { text: "If x is an odd number, then x + y is an even number", kind: 'not', src: 'L2' },
    { text: "x + 1 < x − 1", kind: 'not', src: 'L2' },
  ];

  // ---- Named contexts with p/q propositions used for translation & conditional exercises ----
  // Each context provides plain-English atomic propositions to slot into p, q (and sometimes r/s).
  const CONTEXTS = [
    { id: 'weather', p: "today is cloudy", q: "today is rainy", src: 'E1 Q1' },
    { id: 'friday', p: "today is Friday", q: "it is raining today", src: 'L2 p.13,15,17,26' },
    { id: 'speeding', p: "you drive over 65 miles per hour", q: "you get a speeding ticket", src: 'L2 Exercise' },
    { id: 'freezing', p: "it is below freezing", q: "it is snowing", src: 'L2 Exercise' },
    { id: 'exam', p: "I have given help on this exam", q: "I have received help on this exam", src: 'L2 Exercise' },
    { id: 'flight', p: "you can take the flight", q: "you buy a ticket", src: 'L2 p.30' },
    { id: 'maria', p: "Maria learns discrete mathematics", q: "she will find a good job", src: 'L2 p.24' },
    { id: 'safari', p: "you use Safari", q: "Mac is the operating system", src: 'L2 p.22' },
    { id: 'buffer', p: "the diagnostic message is stored in the buffer", q: "the diagnostic message is retransmitted", src: 'L2 p.40-42' },
    { id: 'autoreply', p: "the automated reply can be sent", q: "the file system is full", src: 'L2 p.39' },
  ];

  // English translations of Exercise 1 Q1 (a–g), using CONTEXTS.weather (p=cloudy, q=rainy)
  const WEATHER_TRANSLATIONS = [
    { text: "Today is cloudy and today is rainy.", expr: "p AND q" },
    { text: "Today is cloudy, but it is not rainy.", expr: "p AND NOT q" },
    { text: "Today is not cloudy and it is not rainy.", expr: "NOT p AND NOT q" },
    { text: "Today is rainy, or cloudy, or both.", expr: "p OR q" },
    { text: "If today is cloudy, then today is also rainy.", expr: "p IMP q" },
    { text: "Today is cloudy or rainy, but it is not rainy if it is cloudy.", expr: "(p OR q) AND (p IMP NOT q)" },
    { text: "That today is cloudy is necessary and sufficient for today to be rainy.", expr: "p IFF q" },
  ];

  // speeding-ticket exercise, verbatim structure from L2 (p=drive>65mph, q=speeding ticket)
  const SPEEDING_TRANSLATIONS = [
    { text: "You do not drive over 65 miles per hour.", expr: "NOT p" },
    { text: "You drive over 65 miles per hour, but you do not get a speeding ticket.", expr: "p AND NOT q" },
    { text: "You will get a speeding ticket if you drive over 65 miles per hour.", expr: "p IMP q" },
    { text: "If you do not drive over 65 miles per hour, then you will not get a speeding ticket.", expr: "NOT p IMP NOT q" },
    { text: "Driving over 65 miles per hour is sufficient for getting a speeding ticket.", expr: "p IMP q" },
    { text: "You get a speeding ticket, but you do not drive over 65 miles per hour.", expr: "q AND NOT p" },
    { text: "Whenever you get a speeding ticket, you are driving over 65 miles per hour.", expr: "q IMP p" },
  ];

  // Freezing/snowing exercise, verbatim structure from L2 (p=below freezing, q=snowing)
  const FREEZING_TRANSLATIONS = [
    { text: "It is below freezing and it is snowing.", expr: "p AND q" },
    { text: "It is below freezing but not snowing.", expr: "p AND NOT q" },
    { text: "It is not below freezing and it is not snowing.", expr: "NOT p AND NOT q" },
    { text: "It is either snowing or below freezing (or both).", expr: "p OR q" },
    { text: "If it is below freezing, it is also snowing.", expr: "p IMP q" },
    { text: "It is either below freezing or it is snowing, but it is not snowing if it is below freezing.", expr: "(p OR q) AND (p IMP NOT q)" },
    { text: "That it is below freezing is necessary and sufficient for it to be snowing.", expr: "p IFF q" },
  ];

  // Multi-variable translations (L2 p.37, p.50)
  const MULTI_VAR_TRANSLATIONS = [
    {
      vars: { p: "you can access the internet from campus", q: "you are a computer science major", r: "you are a freshman" },
      text: "You can access the internet from campus only if you are a computer science major or you are not a freshman.",
      expr: "p IMP (q OR NOT r)",
      src: 'L2 p.37'
    },
    {
      vars: { r: "you can ride the roller coaster", f: "you are under 4 feet tall", s: "you are older than 16 years old" },
      text: "You cannot ride the roller coaster if you are under 4 feet tall unless you are older than 16 years old.",
      expr: "(f AND NOT s) IMP NOT r",
      src: 'L2 p.50'
    },
  ];

  // ---- Necessary/sufficient phrasing bank (L2 p.20-24) — each maps a phrase to p IMP q ----
  const COND_PHRASES = [
    "If {p}, then {q}",
    "{p} implies {q}",
    "If {p}, {q}",
    "{p} only if {q}",
    "{p} is sufficient for {q}",
    "a sufficient condition for {q} is {p}",
    "{q} if {p}",
    "{q} whenever {p}",
    "{q} when {p}",
    "{q} is necessary for {p}",
    "a necessary condition for {p} is {q}",
    "{q} follows from {p}",
    "{q} unless not {p}",
  ];

  // ---- Logical equivalence laws (L3 slide 7-8, summary tables) ----
  const LAWS = [
    { id: 'identity', name: 'Identity Law', rule: 'p ∧ T ≡ p,  p ∨ F ≡ p' },
    { id: 'domination', name: 'Domination Law', rule: 'p ∨ T ≡ T,  p ∧ F ≡ F' },
    { id: 'idempotent', name: 'Idempotent Law', rule: 'p ∨ p ≡ p,  p ∧ p ≡ p' },
    { id: 'doubleneg', name: 'Double Negation Law', rule: '¬(¬p) ≡ p' },
    { id: 'commutative', name: 'Commutative Law', rule: 'p ∨ q ≡ q ∨ p,  p ∧ q ≡ q ∧ p' },
    { id: 'associative', name: 'Associative Law', rule: '(p ∨ q) ∨ r ≡ p ∨ (q ∨ r),  (p ∧ q) ∧ r ≡ p ∧ (q ∧ r)' },
    { id: 'distributive', name: 'Distributive Law', rule: 'p ∨ (q ∧ r) ≡ (p ∨ q) ∧ (p ∨ r),  p ∧ (q ∨ r) ≡ (p ∧ q) ∨ (p ∧ r)' },
    { id: 'demorgan', name: "De Morgan's Law", rule: '¬(p ∧ q) ≡ ¬p ∨ ¬q,  ¬(p ∨ q) ≡ ¬p ∧ ¬q' },
    { id: 'absorption', name: 'Absorption Law', rule: 'p ∨ (p ∧ q) ≡ p,  p ∧ (p ∨ q) ≡ p' },
    { id: 'negation', name: 'Negation Law', rule: 'p ∨ ¬p ≡ T,  p ∧ ¬p ≡ F' },
    { id: 'implication', name: 'Definition of Implication', rule: 'p → q ≡ ¬p ∨ q' },
    { id: 'biconditional', name: 'Definition of Biconditional', rule: 'p ↔ q ≡ (p → q) ∧ (q → p)' },
  ];
  const LAW_BY_ID = {}; LAWS.forEach(l => LAW_BY_ID[l.id] = l);

  // ---- Verified multi-step equivalence proofs (L3 worked examples + E1 Q5,Q6 + E2 Q5-Q9,10,11) ----
  // Every start/end pair here was computationally verified equivalent (see build notes).
  // Variables are the template's "native" letters; randomization substitutes letters at generation time.
  const PROOF_TEMPLATES = [
    {
      id: 'proof1', src: 'L3 slide 9 (worked example)',
      start: '(p IMP r) OR (q IMP r)', end: '(p AND q) IMP r',
      steps: [
        { expr: '(¬p ∨ r) ∨ (¬q ∨ r)', law: 'implication' },
        { expr: '¬p ∨ r ∨ ¬q ∨ r', law: 'associative' },
        { expr: '¬p ∨ ¬q ∨ r ∨ r', law: 'commutative' },
        { expr: '(¬p ∨ ¬q) ∨ (r ∨ r)', law: 'associative' },
        { expr: '¬(p ∧ q) ∨ r', law: 'demorgan' },
        { expr: '(p ∧ q) → r', law: 'implication' },
      ]
    },
    {
      id: 'proof2', src: 'L3 slide 10 (Tautology worked example)',
      start: '(p AND q) IMP (p OR q)', end: 'T', isTautology: true,
      steps: [
        { expr: '¬(p ∧ q) ∨ (p ∨ q)', law: 'implication' },
        { expr: '(¬p ∨ ¬q) ∨ (p ∨ q)', law: 'demorgan' },
        { expr: '(¬p ∨ p) ∨ (¬q ∨ q)', law: 'associative' },
        { expr: 'T ∨ T', law: 'negation' },
        { expr: 'T', law: 'domination' },
      ]
    },
    {
      id: 'proof3', src: 'L3 slide 11 / E1 Q6 / E2 Q9',
      start: 'NOT(p OR (NOT p AND q))', end: 'NOT p AND NOT q',
      steps: [
        { expr: '¬p ∧ ¬(¬p ∧ q)', law: 'demorgan' },
        { expr: '¬p ∧ (¬(¬p) ∨ ¬q)', law: 'demorgan' },
        { expr: '¬p ∧ (p ∨ ¬q)', law: 'doubleneg' },
        { expr: '(¬p ∧ p) ∨ (¬p ∧ ¬q)', law: 'distributive' },
        { expr: 'F ∨ (¬p ∧ ¬q)', law: 'negation' },
        { expr: '¬p ∧ ¬q', law: 'identity' },
      ]
    },
    {
      id: 'proof4', src: 'L3 slide 12 (worked example)',
      start: 'p IFF q', end: 'NOT p IFF NOT q',
      steps: [
        { expr: '(p → q) ∧ (q → p)', law: 'biconditional' },
        { expr: '(¬p ∨ q) ∧ (¬q ∨ p)', law: 'implication' },
        { expr: '(p ∨ ¬q) ∧ (q ∨ ¬p)', law: 'commutative' },
        { expr: '(¬p → ¬q) ∧ (¬q → ¬p)', law: 'implication' },
        { expr: '¬p ↔ ¬q', law: 'biconditional' },
      ]
    },
    {
      id: 'proof5', src: 'L3 slide 8 (Summary — equivalences involving conditionals)',
      start: '(p IMP q) AND (p IMP r)', end: 'p IMP (q AND r)',
      steps: [
        { expr: '(¬p ∨ q) ∧ (¬p ∨ r)', law: 'implication' },
        { expr: '¬p ∨ (q ∧ r)', law: 'distributive' },
        { expr: 'p → (q ∧ r)', law: 'implication' },
      ]
    },
    {
      id: 'proof6', src: 'L3 slide 8 (Summary — equivalences involving conditionals)',
      start: '(p IMP r) AND (q IMP r)', end: '(p OR q) IMP r',
      steps: [
        { expr: '(¬p ∨ r) ∧ (¬q ∨ r)', law: 'implication' },
        { expr: '(¬p ∧ ¬q) ∨ r', law: 'distributive' },
        { expr: '¬(p ∨ q) ∨ r', law: 'demorgan' },
        { expr: '(p ∨ q) → r', law: 'implication' },
      ]
    },
    {
      id: 'proof7', src: 'L3 slide 8 (Summary — equivalences involving conditionals)',
      start: '(p IMP q) OR (p IMP r)', end: 'p IMP (q OR r)',
      steps: [
        { expr: '(¬p ∨ q) ∨ (¬p ∨ r)', law: 'implication' },
        { expr: '¬p ∨ ¬p ∨ q ∨ r', law: 'associative' },
        { expr: '¬p ∨ (q ∨ r)', law: 'idempotent' },
        { expr: 'p → (q ∨ r)', law: 'implication' },
      ]
    },
    {
      id: 'proof8', src: 'E2 Q3 (reconstructed & verified)',
      start: '(p IMP q) AND NOT q', end: 'NOT (p OR q)',
      steps: [
        { expr: '(¬p ∨ q) ∧ ¬q', law: 'implication' },
        { expr: '(¬p ∧ ¬q) ∨ (q ∧ ¬q)', law: 'distributive' },
        { expr: '(¬p ∧ ¬q) ∨ F', law: 'negation' },
        { expr: '¬p ∧ ¬q', law: 'identity' },
        { expr: '¬(p ∨ q)', law: 'demorgan' },
      ]
    },
    {
      id: 'proof9', src: 'E2 Q4 (reconstructed & verified)',
      start: '(p OR q) AND (NOT p IMP NOT q)', end: 'p',
      steps: [
        { expr: '(p ∨ q) ∧ (p ∨ ¬q)', law: 'implication' },
        { expr: 'p ∨ (q ∧ ¬q)', law: 'distributive' },
        { expr: 'p ∨ F', law: 'negation' },
        { expr: 'p', law: 'identity' },
      ]
    },
    {
      id: 'proof10', src: 'E1 Q5 / E2 Q10',
      start: 'p OR (p AND q) OR (NOT p AND r)', end: 'NOT p IMP r',
      steps: [
        { expr: 'p ∨ (¬p ∧ r)', law: 'absorption' },
        { expr: '(p ∨ ¬p) ∧ (p ∨ r)', law: 'distributive' },
        { expr: 'T ∧ (p ∨ r)', law: 'negation' },
        { expr: 'p ∨ r', law: 'identity' },
        { expr: '¬p → r', law: 'implication' },
      ]
    },
    {
      id: 'proof11', src: 'E2 Q11 (reconstructed & verified)',
      start: 'p AND (q AND r) AND (NOT p OR r)', end: 'p AND q AND r',
      steps: [
        { expr: '(p ∧ q ∧ r) ∧ (¬p ∨ r)', law: 'associative' },
        { expr: '(p ∧ q ∧ r ∧ ¬p) ∨ (p ∧ q ∧ r ∧ r)', law: 'distributive' },
        { expr: 'F ∨ (p ∧ q ∧ r ∧ r)', law: 'negation' },
        { expr: 'F ∨ (p ∧ q ∧ r)', law: 'idempotent' },
        { expr: 'p ∧ q ∧ r', law: 'identity' },
      ]
    },
  ];

  // ---- System-specification consistency scenarios (L2 p.40-42, generalized) ----
  const CONSISTENCY_SCENARIOS = [
    {
      context: 'buffer',
      pLabel: "the diagnostic message is stored in the buffer",
      qLabel: "the diagnostic message is retransmitted",
      consistentSet: ["p ∨ q", "¬p", "p → q"],
      note: "Setting p = False, q = True satisfies all three.",
      inconsistentAddition: "¬q",
      src: 'L2 p.40-42'
    },
    {
      context: 'autoreply',
      pLabel: "the automated reply can be sent",
      qLabel: "the file system is full",
      consistentSet: ["q → ¬p", "q", "¬p"],
      note: "Setting q = True, p = False satisfies all three.",
      inconsistentAddition: "p",
      src: 'L2 p.39'
    },
  ];

  // ---- Logic gates (L2 p.10, 43) ----
  const GATES = [
    { name: 'Inverter (NOT gate)', input: 'x', output: '¬x', desc: 'a single input line into a bubble-tipped triangle' },
    { name: 'OR gate', input: 'x, y', output: 'x ∨ y', desc: 'two input lines into a curved-back gate shape' },
    { name: 'AND gate', input: 'x, y', output: 'x ∧ y', desc: 'two input lines into a flat-back D-shaped gate' },
  ];

  return {
    PROP_ITEMS, CONTEXTS, WEATHER_TRANSLATIONS, SPEEDING_TRANSLATIONS, FREEZING_TRANSLATIONS,
    MULTI_VAR_TRANSLATIONS, COND_PHRASES, LAWS, LAW_BY_ID, PROOF_TEMPLATES, CONSISTENCY_SCENARIOS, GATES
  };
})();
