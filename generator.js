// ==========================================================
// Question generators. Each generator returns a question object:
// { qtype, difficulty, topic, prompt, render-data..., correct, explanation, mistakeTag, lawTrace? }
// qtype in: mcq | tf | symbolic | truthtable | selectexpr | equivalence | proof | consistency
// ==========================================================
const QGEN = (function () {
  const { parseExpr, toStr, equivalent, classify, truthTable, substitute, evalNode } = Logic;

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickN(arr, n) { const c = arr.slice(); const out = []; while (out.length < n && c.length) { out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); } return out; }
  function shuffle(arr) { const c = arr.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[c[i], c[j]] = [c[j], c[i]]; } return c; }
  function uid() { return 'q' + Math.random().toString(36).slice(2, 10); }

  const VARPOOL = ['p', 'q', 'r', 's', 'm', 'n', 'u', 'w']; // 't','f' reserved as constants

  function randomVarMap(nativeLetters) {
    const chosen = pickN(VARPOOL, nativeLetters.length);
    const map = {};
    nativeLetters.forEach((l, i) => map[l] = chosen[i]);
    return map;
  }

  function fmtExpr(str) { return toStr(parseExpr(str)); }

  // ============================================================
  // EASY GENERATORS
  // ============================================================

  // E-1: Proposition vs non-proposition classification
  function genPropClassify() {
    const item = pick(DATA.PROP_ITEMS);
    const opts = ['True proposition', 'False proposition', 'Not a proposition'];
    const correctIdx = item.kind === 'true' ? 0 : item.kind === 'false' ? 1 : 2;
    return {
      qtype: 'mcq', difficulty: 'easy', topic: 'Propositions',
      prompt: `Classify the following sentence:\n\n“${item.text}”`,
      options: opts,
      correct: correctIdx,
      explanation: item.kind === 'not'
        ? `This sentence is not a proposition: it is ${/\?$/.test(item.text) ? 'a question' : /^(read|write|compute)/i.test(item.text) ? 'an instruction/command' : 'a statement whose truth value cannot be fixed because it contains an undetermined variable'}, so it cannot be assigned a single fixed truth value.`
        : `This is a declarative sentence with a definite, fixed truth value (${item.kind === 'true' ? 'True' : 'False'}), so it is a proposition.`,
      mistakeTag: 'prop-vs-nonprop',
    };
  }

  // E-2: Basic operator truth-value evaluation (single operator)
  function genBasicOperatorEval() {
    const ops = [
      { sym: 'NOT p', op: 'NOT' }, { sym: 'p AND q', op: 'AND' }, { sym: 'p OR q', op: 'OR' },
      { sym: 'p XOR q', op: 'XOR' }, { sym: 'p IMP q', op: 'IMP' }, { sym: 'p IFF q', op: 'IFF' },
    ];
    const chosen = pick(ops);
    const map = randomVarMap(chosen.op === 'NOT' ? ['p'] : ['p', 'q']);
    const pv = Math.random() < 0.5, qv = Math.random() < 0.5;
    const node = substitute(parseExpr(chosen.sym), map);
    const assign = {}; assign[map.p] = pv; if (map.q) assign[map.q] = qv;
    const val = evalNode(node, assign);
    const pName = map.p, qName = map.q;
    let givenStr = `${pName} = ${pv ? 'True' : 'False'}` + (qName ? `, ${qName} = ${qv ? 'True' : 'False'}` : '');
    return {
      qtype: 'tf', difficulty: 'easy', topic: 'Operators & Truth Values',
      prompt: `Given ${givenStr}, is the statement “${toStr(node)}” True or False?`,
      correct: val,
      explanation: `${toStr(node)} evaluates by the truth table for its operator: with ${givenStr}, the result is ${val ? 'True' : 'False'}.`,
      mistakeTag: 'operator-precedence',
    };
  }

  // E-3: Simple English -> symbol translation (single operator, weather/speeding/freezing contexts)
  function genSimpleTranslation() {
    const bank = pick([
      { list: DATA.WEATHER_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'weather') },
      { list: DATA.SPEEDING_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'speeding') },
      { list: DATA.FREEZING_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'freezing') },
    ]);
    const simpleOnes = bank.list.filter(it => !/AND NOT|OR|IMP|IFF/.test(it.expr) || (it.expr.match(/ /g) || []).length <= 2);
    const item = pick(simpleOnes.length ? simpleOnes : bank.list);
    const map = randomVarMap(['p', 'q']);
    const node = substitute(parseExpr(item.expr), map);
    const correctStr = toStr(node);
    const distractors = buildExprDistractors(node, map);
    const options = shuffle([correctStr, ...distractors.slice(0, 3)]);
    return {
      qtype: 'mcq', difficulty: 'easy', topic: 'Translation',
      prompt: `Let ${map.p} = "${bank.ctx.p}" and ${map.q} = "${bank.ctx.q}".\n\nWhich symbolic expression matches:\n“${item.text}”`,
      options,
      correct: options.indexOf(correctStr),
      explanation: `“${item.text}” translates directly to ${correctStr}, using ${map.p} = "${bank.ctx.p}" and ${map.q} = "${bank.ctx.q}".`,
      mistakeTag: 'translation',
    };
  }

  function buildExprDistractors(node, map) {
    const out = [];
    // swap AND/OR, negate one side, swap implication direction — all common-mistake distractors
    try { out.push(flipTopOp(node)); } catch (e) { }
    try { out.push(negateOneSide(node)); } catch (e) { }
    if (node.op === 'IMP') out.push({ op: 'IMP', a: node.b, b: node.a }); // reversed conditional (common mistake)
    // swapping the two named variables only yields a *distinct* statement when the
    // top operator is non-commutative (IMP); for AND/OR/XOR/IFF it reproduces the same
    // truth table and would create a duplicate "correct" option, so skip it there.
    if (map.p && map.q && node.op === 'IMP') {
      out.push(substitute(node, { [map.p]: map.q, [map.q]: map.p }));
    }
    // Final safety net: drop any candidate that is semantically equivalent to the
    // correct answer (would make the question ambiguous) or a literal string repeat.
    const correctStr = toStr(node);
    const seen = new Set([correctStr]);
    const cleaned = [];
    out.forEach(cand => {
      let s; try { s = toStr(cand); } catch (e) { return; }
      if (seen.has(s)) return;
      let eq = false; try { eq = equivalent(cand, node); } catch (e) { }
      if (eq) return;
      seen.add(s); cleaned.push(s);
    });
    return shuffle(cleaned).slice(0, 4);
  }
  function flipTopOp(node) {
    const swap = { AND: 'OR', OR: 'AND', IMP: 'IFF', IFF: 'IMP' };
    if (swap[node.op]) return { op: swap[node.op], a: node.a, b: node.b };
    if (node.op === 'NOT') return node.a;
    return { op: 'NOT', a: node };
  }
  function negateOneSide(node) {
    if (node.op === 'NOT' || node.op === 'VAR') return { op: 'NOT', a: node };
    return { op: node.op, a: { op: 'NOT', a: node.a }, b: node.b };
  }

  // E-4: Logic gate reading
  function genLogicGate() {
    const gate = pick(DATA.GATES);
    const isTwoInput = gate.input.includes(',');
    const map = randomVarMap(isTwoInput ? ['x', 'y'] : ['x']);
    const exprNode = substitute(parseExpr(gate.output.replace('¬', 'NOT ')), map);
    const correctStr = toStr(exprNode);
    let options;
    if (isTwoInput) {
      const wrongPool = DATA.GATES.filter(g => g !== gate && g.input.includes(',')).map(g => toStr(substitute(parseExpr(g.output.replace('¬', 'NOT ')), map)));
      options = shuffle([correctStr, ...pickN(wrongPool, Math.min(1, wrongPool.length)), toStr(substitute(parseExpr('x XOR y'), map)), toStr(substitute(parseExpr('NOT x AND NOT y'), map))]);
    } else {
      // single-input (Inverter): distractors must only reference the one real variable
      options = shuffle([correctStr, map.x, toStr(substitute(parseExpr('x AND x'), map))]);
    }
    options = options.filter((v, i, a) => a.indexOf(v) === i);
    const article = /^[AEIOU]/.test(gate.name) ? 'an' : 'a';
    return {
      qtype: 'mcq', difficulty: 'easy', topic: 'Logic Gates',
      prompt: `A circuit diagram shows ${article} ${gate.name}: ${gate.desc}, with input${isTwoInput ? 's' : ''} ${isTwoInput ? `${map.x} and ${map.y}` : map.x}.\n\nWhich boolean expression represents its output?`,
      options,
      correct: options.indexOf(correctStr),
      explanation: `${article[0].toUpperCase() + article.slice(1)} ${gate.name} outputs ${correctStr}, matching the standard gate definition from the lecture notes.`,
      mistakeTag: 'logic-gates',
    };
  }

  // ============================================================
  // MEDIUM GENERATORS
  // ============================================================

  // M-1: Complex translation with 2-3 variables (internet/roller-coaster contexts)
  function genComplexTranslation() {
    const item = pick(DATA.MULTI_VAR_TRANSLATIONS);
    const letters = Object.keys(item.vars);
    const map = randomVarMap(letters);
    const node = substitute(parseExpr(item.expr), map);
    const correctStr = toStr(node);
    const distractors = buildExprDistractors(node, map);
    const options = shuffle([correctStr, ...distractors.slice(0, 3)]).filter((v, i, a) => a.indexOf(v) === i);
    const legend = letters.map(l => `${map[l]} = "${item.vars[l]}"`).join('; ');
    return {
      qtype: 'mcq', difficulty: 'medium', topic: 'Translation',
      prompt: `Let ${legend}.\n\nWhich symbolic expression matches:\n“${item.text}”`,
      options, correct: options.indexOf(correctStr),
      explanation: `“${item.text}” translates to ${correctStr}. Watch for "only if" (translates to →, not ←) and "unless" (¬p in "q unless ¬p" means q holds whenever p is false).`,
      mistakeTag: 'translation',
    };
  }

  // M-2: Necessary / sufficient condition identification
  function genNecessarySufficient() {
    const ctx = pick(DATA.CONTEXTS);
    const map = randomVarMap(['p', 'q']);
    const phraseTemplate = pick(DATA.COND_PHRASES);
    const sentence = phraseTemplate.replace('{p}', ctx.p).replace('{q}', ctx.q);
    const askType = pick(['direction', 'necessary', 'sufficient']);
    if (askType === 'direction') {
      const options = shuffle([`${map.p} → ${map.q}`, `${map.q} → ${map.p}`, `${map.p} ↔ ${map.q}`, `${map.p} ∧ ${map.q}`]);
      const correctStr = `${map.p} → ${map.q}`;
      return {
        qtype: 'mcq', difficulty: 'medium', topic: 'Conditional Statements',
        prompt: `Let ${map.p} = "${ctx.p}" and ${map.q} = "${ctx.q}".\n\nWhich symbolic expression correctly captures:\n“${sentence}”`,
        options, correct: options.indexOf(correctStr),
        explanation: `The phrase "${phraseTemplate.replace('{p}', 'p').replace('{q}', 'q')}" is one of the standard phrasings of p → q from the lecture notes. A common mistake is reversing it to q → p — remember "p only if q" means p → q, not q → p.`,
        mistakeTag: 'necessary-sufficient',
      };
    } else {
      const isNecessary = askType === 'necessary';
      const options = [ctx.p, ctx.q].map(x => x);
      const correctLabel = isNecessary ? ctx.q : ctx.p;
      const distractorLabel = isNecessary ? ctx.p : ctx.q;
      const opts = shuffle([correctLabel, distractorLabel]);
      return {
        qtype: 'mcq', difficulty: 'medium', topic: 'Conditional Statements',
        prompt: `In the conditional statement "${map.p} → ${map.q}" (i.e. "If ${ctx.p}, then ${ctx.q}"), which condition is ${isNecessary ? 'necessary' : 'sufficient'}?`,
        options: opts.map(o => `${o === ctx.p ? map.p : map.q}: "${o}"`),
        correct: opts.indexOf(correctLabel),
        explanation: isNecessary
          ? `In p → q, q is the necessary condition: q must hold for p to hold (q is necessary for p).`
          : `In p → q, p is the sufficient condition: p being true guarantees q (p is sufficient for q).`,
        mistakeTag: 'necessary-sufficient',
      };
    }
  }

  // M-3: Truth table completion — ask for value of one row / one column cell
  function genTruthTableQuestion(forceCells) {
    const templates = [
      'p AND (q OR NOT r)', 'NOT p OR (q AND r)', '(p OR q) AND NOT r', 'p IMP (q AND r)',
      '(p AND q) OR (NOT p AND r)', 'NOT (p AND q) OR r', 'p XOR (q AND r)', '(p OR NOT q) IMP r',
    ];
    const tpl = pick(templates);
    const map = randomVarMap(['p', 'q', 'r']);
    const node = substitute(parseExpr(tpl), map);
    const vars = [map.p, map.q, map.r];
    const tt = truthTable(node, vars);
    const rowIdx = Math.floor(Math.random() * tt.rows.length);
    const row = tt.rows[rowIdx];
    const assignStr = vars.map(v => `${v}=${row.assign[v] ? 'T' : 'F'}`).join(', ');
    return {
      qtype: 'tf', difficulty: 'medium', topic: 'Truth Tables',
      prompt: `For the expression ${toStr(node)}, with ${assignStr}, is the result True or False?`,
      correct: row.value,
      explanation: `Substituting ${assignStr} into ${toStr(node)} and evaluating step by step (respecting precedence ¬ > ∧ > ∨ > →) gives ${row.value ? 'True' : 'False'}.`,
      mistakeTag: 'truth-tables',
      fullTable: forceCells ? tt : undefined,
    };
  }

  // full truth-table completion type (grid input)
  function genTruthTableCompletion() {
    const templates = ['p AND (q OR r)', '(p OR q) IMP r', 'p XOR (q AND r)', 'NOT (p AND q) OR NOT r', '(p IMP q) AND (q IMP r)'];
    const tpl = pick(templates);
    const map = randomVarMap(['p', 'q', 'r']);
    const node = substitute(parseExpr(tpl), map);
    const vars = [map.p, map.q, map.r];
    const tt = truthTable(node, vars);
    // hide 3 random cells for the student to fill
    const hideIdx = pickN([0, 1, 2, 3, 4, 5, 6, 7], 3).sort((a, b) => a - b);
    return {
      qtype: 'truthtable', difficulty: 'medium', topic: 'Truth Tables',
      prompt: `Complete the missing cells (marked ?) in the truth table for ${toStr(node)}.`,
      vars, exprStr: toStr(node),
      rows: tt.rows.map(r => ({ assign: r.assign, value: r.value })),
      hideIdx,
      explanation: `Each row is evaluated by substituting the row's truth values into ${toStr(node)} and applying the operator definitions in order of precedence.`,
      mistakeTag: 'truth-tables',
    };
  }

  // M-4: Converse / inverse / contrapositive
  function genConverseInverse() {
    const ctx = pick(DATA.CONTEXTS);
    const map = randomVarMap(['p', 'q']);
    const kind = pick(['converse', 'inverse', 'contrapositive']);
    const base = `${map.p} → ${map.q}`;
    const forms = {
      converse: `${map.q} → ${map.p}`,
      inverse: `¬${map.p} → ¬${map.q}`,
      contrapositive: `¬${map.q} → ¬${map.p}`,
    };
    const correctStr = forms[kind];
    const options = shuffle(Object.values(forms).concat([base])).filter((v, i, a) => a.indexOf(v) === i);
    return {
      qtype: 'mcq', difficulty: 'medium', topic: 'Converse / Inverse / Contrapositive',
      prompt: `Given the conditional statement "${map.p} → ${map.q}" (If ${ctx.p}, then ${ctx.q}), which expression is its ${kind}?`,
      options, correct: options.indexOf(correctStr),
      explanation: `The ${kind} of p → q is ${correctStr.replace(new RegExp(map.p, 'g'), 'p').replace(new RegExp(map.q, 'g'), 'q')}. Converse swaps p and q; inverse negates both without swapping; contrapositive negates both AND swaps — and the contrapositive is always logically equivalent to the original conditional, while the converse and inverse are only equivalent to each other, not to the original.`,
      mistakeTag: 'converse-inverse-contrapositive',
    };
  }

  // M-4b: Which pair is logically equivalent (converse/inverse/contrapositive concept check)
  function genCICEquivalencePair() {
    const map = randomVarMap(['p', 'q']);
    const pairs = [
      { a: `${map.p} → ${map.q}`, b: `¬${map.q} → ¬${map.p}`, equiv: true, label: 'a conditional and its contrapositive' },
      { a: `${map.p} → ${map.q}`, b: `${map.q} → ${map.p}`, equiv: false, label: 'a conditional and its converse' },
      { a: `${map.p} → ${map.q}`, b: `¬${map.p} → ¬${map.q}`, equiv: false, label: 'a conditional and its inverse' },
      { a: `${map.q} → ${map.p}`, b: `¬${map.p} → ¬${map.q}`, equiv: true, label: 'a converse and its corresponding inverse' },
    ];
    const item = pick(pairs);
    return {
      qtype: 'tf', difficulty: 'medium', topic: 'Converse / Inverse / Contrapositive',
      prompt: `True or False: "${item.a}" and "${item.b}" (${item.label}) always have the same truth value.`,
      correct: item.equiv,
      explanation: item.equiv
        ? `Correct — these are logically equivalent (verifiable by truth table): a conditional and its contrapositive always match, and so do a statement's converse and inverse (since the inverse is the contrapositive of the converse).`
        : `These are NOT equivalent in general — a conditional and its converse (or inverse) can differ in truth value. Only a conditional and its contrapositive are guaranteed equivalent.`,
      mistakeTag: 'converse-inverse-contrapositive',
    };
  }

  // M-5: Tautology / Contradiction / Contingency classification
  function genClassification(hard) {
    const easyPool = ['p OR NOT p', 'p AND NOT p', 'p AND q', 'p OR q', 'p IMP p', 'p AND (NOT p OR q)'];
    const hardPool = ['(p AND q) IMP (p OR q)', '(p IMP q) IFF (NOT p OR q)', '(p OR q) AND (NOT p AND NOT q)', '(p IMP q) AND (p AND NOT q)', 'p XOR p', '(p IFF q) OR (p XOR q)', '((p IMP q) AND p) IMP q'];
    const tpl = pick(hard ? hardPool : easyPool);
    const map = randomVarMap(['p', 'q']);
    const node = substitute(parseExpr(tpl), map);
    const cls = classify(node);
    const options = ['Tautology', 'Contradiction', 'Contingency'];
    const correctIdx = { tautology: 0, contradiction: 1, contingency: 2 }[cls];
    return {
      qtype: 'mcq', difficulty: hard ? 'hard' : 'medium', topic: 'Tautology / Contradiction / Contingency',
      prompt: `Is the statement ${toStr(node)} a tautology, a contradiction, or a contingency?`,
      options, correct: correctIdx,
      explanation: `Building the truth table for ${toStr(node)} shows it is ${cls === 'tautology' ? 'always True (a tautology)' : cls === 'contradiction' ? 'always False (a contradiction)' : 'True for some rows and False for others (a contingency)'}.`,
      mistakeTag: 'tautology-classification',
      showTable: node,
    };
  }

  // M-6: Equivalence determination between two expressions (via truth table)
  function genEquivalenceCheck() {
    const equivPairs = [
      ['NOT (p AND q)', 'NOT p OR NOT q'], ['NOT (p OR q)', 'NOT p AND NOT q'],
      ['p IMP q', 'NOT p OR q'], ['p IMP q', 'NOT q IMP NOT p'],
      ['p IFF q', '(p AND q) OR (NOT p AND NOT q)'], ['p OR (p AND q)', 'p'], ['p AND (p OR q)', 'p'],
    ];
    const nonEquivPairs = [
      ['p IMP q', 'q IMP p'], ['p IMP q', 'NOT p IMP NOT q'], ['p OR q', 'p XOR q'],
      ['p IMP q', 'p AND q'], ['NOT (p AND q)', 'NOT p AND NOT q'], ['p XOR q', 'p IFF q'],
    ];
    const useEquiv = Math.random() < 0.5;
    const [a, b] = pick(useEquiv ? equivPairs : nonEquivPairs);
    const map = randomVarMap(['p', 'q']);
    const na = substitute(parseExpr(a), map), nb = substitute(parseExpr(b), map);
    const isEq = equivalent(na, nb);
    return {
      qtype: 'tf', difficulty: 'medium', topic: 'Logical Equivalence',
      prompt: `True or False: ${toStr(na)}  ≡  ${toStr(nb)}`,
      correct: isEq,
      explanation: isEq
        ? `These are logically equivalent — every row of their truth tables matches.`
        : `These are NOT equivalent — at least one row of their truth tables differs. A common trap: OR is not the same as XOR (OR is true when both are true; XOR is false in that case), and p → q is not equivalent to its converse q → p.`,
      mistakeTag: isEq ? 'equivalence-laws' : 'or-vs-xor',
      pairNodes: [na, nb],
    };
  }

  // M-7: consistency of a 2-spec system (medium)
  function genConsistencySimple() {
    const scenario = pick(DATA.CONSISTENCY_SCENARIOS);
    const map = randomVarMap(['p', 'q']);
    const specs = scenario.consistentSet.map(s => toStr(substitute(parseExpr(s.replace(/¬/g, 'NOT ')), map)));
    return {
      qtype: 'tf', difficulty: 'medium', topic: 'System Specification Consistency',
      prompt: `Let ${map.p} = "${scenario.pLabel}" and ${map.q} = "${scenario.qLabel}".\n\nAre these specifications consistent?\n${specs.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      correct: true,
      explanation: `${scenario.note.replace(/p/g, map.p).replace(/q/g, map.q)} Since some assignment of truth values makes all the specifications simultaneously True, the set is consistent.`,
      mistakeTag: 'consistency',
    };
  }

  // M-8: common-mistake targeted (p->q vs q->p / OR vs XOR / "only if" direction)
  function genCommonMistakeCheck() {
    const kind = pick(['direction', 'onlyif', 'orxor', 'falsecond']);
    const map = randomVarMap(['p', 'q']);
    if (kind === 'direction') {
      return {
        qtype: 'tf', difficulty: 'medium', topic: 'Conditional Statements',
        prompt: `True or False: the statement "${map.p} → ${map.q}" always has the exact same truth value as "${map.q} → ${map.p}".`,
        correct: false,
        explanation: `False — p → q and its converse q → p are NOT logically equivalent in general. For example, when p is False and q is True, p → q is True but q → p is False.`,
        mistakeTag: 'p-vs-q-implication',
      };
    }
    if (kind === 'onlyif') {
      const options = shuffle([`${map.p} → ${map.q}`, `${map.q} → ${map.p}`]);
      const correctText = `${map.p} → ${map.q}`;
      return {
        qtype: 'mcq', difficulty: 'medium', topic: 'Conditional Statements',
        prompt: `"${map.p} only if ${map.q}" is best translated as:`,
        options,
        correct: options.indexOf(correctText),
        explanation: `"p only if q" means p → q, NOT q → p. This is one of the most common translation mistakes — do not use "q only if p" to express p → q.`,
        mistakeTag: 'only-if-direction',
      };
    }
    if (kind === 'orxor') {
      const pv = true, qv = true;
      return {
        qtype: 'tf', difficulty: 'medium', topic: 'Operators & Truth Values',
        prompt: `If ${map.p} = True and ${map.q} = True, is "${map.p} ∨ ${map.q}" True?`,
        correct: true,
        explanation: `True. Disjunction (∨) is true whenever at least one side is true — including when both are true. Only exclusive or (⊕) would be False here, since ⊕ requires exactly one side to be true.`,
        mistakeTag: 'or-vs-xor',
      };
    }
    // falsecond: p false, does p->q automatically true?
    return {
      qtype: 'mcq', difficulty: 'medium', topic: 'Conditional Statements',
      prompt: `If ${map.p} = False and ${map.q} = False, what is the truth value of "${map.p} → ${map.q}"?`,
      options: ['True', 'False', 'Cannot be determined'],
      correct: 0,
      explanation: `p → q is False only when p is True and q is False. In every other case (including p False, q False) it is True. A common mistake is assuming p → q is automatically False whenever q is False — but the premise's truth value matters too.`,
      mistakeTag: 'false-antecedent',
    };
  }

  // ============================================================
  // HARD GENERATORS
  // ============================================================

  // H-1: full symbolic step-by-step proof with law selection (multiple choice per step)
  function genProof() {
    const tpl = pick(DATA.PROOF_TEMPLATES);
    const nativeVars = Array.from(Logic.collectVars(parseExpr(tpl.start.replace(/T|F/g, m => m))));
    const map = randomVarMap(nativeVars.filter(v => v !== 't' && v !== 'f'));
    const startNode = substitute(parseExpr(tpl.start), map);
    const endNode = substitute(parseExpr(tpl.end), map);
    const steps = tpl.steps.map(s => ({
      expr: toStr(substitute(parseExpr(s.expr), map)),
      law: s.law,
      lawName: DATA.LAW_BY_ID[s.law].name,
    }));
    return {
      qtype: 'proof', difficulty: 'hard', topic: 'Proving Equivalence (Logical Laws)',
      prompt: `Prove that ${toStr(startNode)} ≡ ${toStr(endNode)}${tpl.isTautology ? ' (i.e. show it is a Tautology)' : ''} using logical equivalence laws. For each step, select the law that justifies the transformation.`,
      startExpr: toStr(startNode), endExpr: toStr(endNode),
      steps, // {expr, law, lawName}
      lawChoices: DATA.LAWS,
      explanation: `Full derivation:\n${toStr(startNode)}\n` + steps.map(s => `≡ ${s.expr}   [${s.lawName}]`).join('\n'),
      mistakeTag: 'equivalence-laws',
      src: tpl.src,
    };
  }

  // H-2: consistency analysis with an added inconsistent requirement (hard)
  function genConsistencyHard() {
    const scenario = pick(DATA.CONSISTENCY_SCENARIOS);
    const map = randomVarMap(['p', 'q']);
    const withAddition = Math.random() < 0.6;
    const specs = scenario.consistentSet.map(s => toStr(substitute(parseExpr(s.replace(/¬/g, 'NOT ')), map)));
    if (withAddition) specs.push(toStr(substitute(parseExpr(scenario.inconsistentAddition.replace(/¬/g, 'NOT ')), map)));
    // verify programmatically
    const nodes = specs.map(s => parseExpr(s));
    const vars = Array.from(new Set(nodes.flatMap(n => Array.from(Logic.collectVars(n))))).sort();
    let consistent = false;
    for (let i = 0; i < (1 << vars.length); i++) {
      const assign = {}; vars.forEach((v, idx) => assign[v] = !!((i >> (vars.length - 1 - idx)) & 1));
      if (nodes.every(n => evalNode(n, assign))) { consistent = true; break; }
    }
    return {
      qtype: 'consistency', difficulty: 'hard', topic: 'System Specification Consistency',
      prompt: `Let ${map.p} = "${scenario.pLabel}" and ${map.q} = "${scenario.qLabel}".\n\nDetermine whether this set of system specifications is consistent:\n${specs.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      correct: consistent,
      explanation: consistent
        ? `Consistent. ${scenario.note.replace(/\bp\b/g, map.p).replace(/\bq\b/g, map.q)}`
        : `Inconsistent. No assignment of truth values to ${vars.join(', ')} makes every specification True simultaneously — check each combination against all ${specs.length} statements.`,
      mistakeTag: 'consistency',
      specs,
    };
  }

  // H-3: classify a nested/complex expression (reuses genClassification hard pool)
  function genHardClassification() { return genClassification(true); }

  // H-4: nested equivalence determination (3-variable) — the correct option must be a
  // *different textual form* that is nonetheless equivalent to the stem expression;
  // reusing hand-verified equivalence pairs guarantees this rather than ever repeating
  // the stem's own string as an option.
  const HARD_EQUIV_PAIRS = [
    ['NOT (p AND q)', 'NOT p OR NOT q'],
    ['NOT (p OR q)', 'NOT p AND NOT q'],
    ['p IMP (q OR r)', 'NOT p OR (q OR r)'],
    ['(p OR q) IMP r', 'NOT p AND NOT q OR r'],
    ['NOT p OR (q AND r)', 'p IMP (q AND r)'],
    ['p AND (q OR r)', '(p AND q) OR (p AND r)'],
    ['NOT (p IMP q)', 'p AND NOT q'],
  ];
  function genHardEquivalenceSelect() {
    const [stemTpl, correctTpl] = pick(HARD_EQUIV_PAIRS);
    const nativeVars = Array.from(Logic.collectVars(parseExpr(stemTpl)));
    const map = randomVarMap(nativeVars);
    const stemNode = substitute(parseExpr(stemTpl), map);
    const correctNode = substitute(parseExpr(correctTpl), map);
    const stemStr = toStr(stemNode);
    const correctStr = toStr(correctNode);

    // Build distractors: mutate the correct form (flip a top operator, negate a side,
    // or swap a non-commutative implication's direction) so they are NOT equivalent to
    // the stem. The mcq validator will still re-verify and reject if anything slips through.
    const mutations = [
      flipTopOp(correctNode),
      negateOneSide(correctNode),
    ];
    if (correctNode.op === 'IMP') mutations.push({ op: 'IMP', a: correctNode.b, b: correctNode.a });
    if (correctNode.b && (correctNode.b.op === 'OR' || correctNode.b.op === 'AND')) {
      mutations.push({ op: correctNode.op, a: correctNode.a, b: flipTopOp(correctNode.b) });
    }
    let distractorStrs = [];
    mutations.forEach(m => {
      let s; try { s = toStr(m); } catch (e) { return; }
      if (s === stemStr || s === correctStr) return;
      let eq = false; try { eq = equivalent(m, stemNode); } catch (e) { }
      if (eq) return;
      distractorStrs.push(s);
    });
    distractorStrs = shuffle(distractorStrs.filter((v, i, a) => a.indexOf(v) === i)).slice(0, 3);
    // top up with generic contingencies if we don't have 3 distinct, non-equivalent distractors
    const fillerPool = ['p AND q', 'p OR NOT r', 'q IMP r', 'NOT p AND q', 'p XOR q'];
    let fi = 0;
    while (distractorStrs.length < 3 && fi < fillerPool.length) {
      const cand = toStr(substitute(parseExpr(fillerPool[fi]), map));
      fi++;
      if (cand === stemStr || cand === correctStr || distractorStrs.includes(cand)) continue;
      let eq = false; try { eq = equivalent(parseExpr(cand), stemNode); } catch (e) { }
      if (eq) continue;
      distractorStrs.push(cand);
    }
    const options = shuffle([correctStr, ...distractorStrs]);
    return {
      qtype: 'selectexpr', difficulty: 'hard', topic: 'Logical Equivalence',
      prompt: `Which of the following expressions is logically equivalent to ${stemStr}? (The correct option is written in a different but equivalent form — verify by truth table or equivalence laws, not by matching text.)`,
      options,
      correct: options.indexOf(correctStr),
      explanation: `${correctStr} is logically equivalent to ${stemStr} — their truth tables match on every assignment. The other options differ in at least one row.`,
      mistakeTag: 'equivalence-laws',
      _node: stemNode,
    };
  }

  // M-9 / E-5: Symbolic expression input — type the translation, graded by equivalence
  function genSymbolicInput(tier) {
    let item, legend, promptText;
    if (tier === 'easy') {
      const bank = pick([
        { list: DATA.WEATHER_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'weather') },
        { list: DATA.SPEEDING_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'speeding') },
        { list: DATA.FREEZING_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'freezing') },
      ]);
      const simpleOnes = bank.list.filter(it => (it.expr.match(/AND|OR|IMP|IFF/g) || []).length <= 1);
      item = pick(simpleOnes.length ? simpleOnes : bank.list);
      const map = randomVarMap(['p', 'q']);
      const node = substitute(parseExpr(item.expr), map);
      legend = `${map.p} = "${bank.ctx.p}"; ${map.q} = "${bank.ctx.q}"`;
      promptText = item.text;
      return {
        qtype: 'symbolic', difficulty: 'easy', topic: 'Translation',
        prompt: `Let ${legend}.\n\nType the symbolic expression for:\n“${promptText}”`,
        targetExpr: toStr(node),
        explanation: `“${promptText}” translates to ${toStr(node)}. Any logically equivalent way of writing it (different but equivalent parenthesization, or an equivalent rearrangement) is also accepted.`,
        mistakeTag: 'translation',
      };
    }
    if (tier === 'medium') {
      const useMulti = Math.random() < 0.5;
      if (useMulti) {
        item = pick(DATA.MULTI_VAR_TRANSLATIONS);
        const letters = Object.keys(item.vars);
        const map = randomVarMap(letters);
        const node = substitute(parseExpr(item.expr), map);
        legend = letters.map(l => `${map[l]} = "${item.vars[l]}"`).join('; ');
        return {
          qtype: 'symbolic', difficulty: 'medium', topic: 'Translation',
          prompt: `Let ${legend}.\n\nType the symbolic expression for:\n“${item.text}”`,
          targetExpr: toStr(node),
          explanation: `“${item.text}” translates to ${toStr(node)}. Watch for "only if" (→, not ←) and "unless".`,
          mistakeTag: 'translation',
        };
      } else {
        const bank = pick([
          { list: DATA.WEATHER_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'weather') },
          { list: DATA.SPEEDING_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'speeding') },
          { list: DATA.FREEZING_TRANSLATIONS, ctx: DATA.CONTEXTS.find(c => c.id === 'freezing') },
        ]);
        item = pick(bank.list);
        const map = randomVarMap(['p', 'q']);
        const node = substitute(parseExpr(item.expr), map);
        return {
          qtype: 'symbolic', difficulty: 'medium', topic: 'Translation',
          prompt: `Let ${map.p} = "${bank.ctx.p}" and ${map.q} = "${bank.ctx.q}".\n\nType the symbolic expression for:\n“${item.text}”`,
          targetExpr: toStr(node),
          explanation: `“${item.text}” translates to ${toStr(node)}.`,
          mistakeTag: 'translation',
        };
      }
    }
    // hard: type an equivalent form using only ¬, ∧, ∨ (eliminate → via the Implication law)
    const impPool = ['p IMP q', '(p AND q) IMP r', 'p IMP (q OR r)', 'NOT p IMP (q AND r)'];
    const tpl = pick(impPool);
    const nativeVars = Array.from(Logic.collectVars(parseExpr(tpl)));
    const map = randomVarMap(nativeVars);
    const node = substitute(parseExpr(tpl), map);
    const targetNode = eliminateImplications(node);
    return {
      qtype: 'symbolic', difficulty: 'hard', topic: 'Proving Equivalence (Logical Laws)',
      prompt: `Type an expression logically equivalent to ${toStr(node)} that uses only ¬, ∧, and ∨ (no →), by applying the Definition of Implication (p → q ≡ ¬p ∨ q).`,
      targetExpr: toStr(targetNode),
      explanation: `Applying p → q ≡ ¬p ∨ q throughout gives ${toStr(targetNode)}, which is logically equivalent to ${toStr(node)} and uses only ¬, ∧, ∨.`,
      mistakeTag: 'equivalence-laws',
    };
  }
  function eliminateImplications(node) {
    if (node.op === 'VAR' || node.op === 'TRUE' || node.op === 'FALSE') return node;
    if (node.op === 'NOT') return { op: 'NOT', a: eliminateImplications(node.a) };
    if (node.op === 'IMP') return { op: 'OR', a: { op: 'NOT', a: eliminateImplications(node.a) }, b: eliminateImplications(node.b) };
    return { op: node.op, a: eliminateImplications(node.a), b: eliminateImplications(node.b) };
  }

  // ============================================================
  // DISPATCH TABLE
  // ============================================================
  const EASY_GENS = [genPropClassify, genBasicOperatorEval, genSimpleTranslation, genLogicGate, () => genSymbolicInput('easy')];
  const MEDIUM_GENS = [genComplexTranslation, genNecessarySufficient, () => genTruthTableQuestion(false), genTruthTableCompletion,
    genConverseInverse, genCICEquivalencePair, () => genClassification(false), genEquivalenceCheck, genConsistencySimple, genCommonMistakeCheck, () => genSymbolicInput('medium')];
  const HARD_GENS = [genProof, genConsistencyHard, genHardClassification, genHardEquivalenceSelect, () => genSymbolicInput('hard')];

  function generateOne(difficulty) {
    const pool = difficulty === 'easy' ? EASY_GENS : difficulty === 'medium' ? MEDIUM_GENS : HARD_GENS;
    let attempt = 0, q = null;
    while (attempt < 8) {
      try {
        q = pick(pool)();
        if (validateQuestion(q)) break;
        q = null;
      } catch (e) { q = null; }
      attempt++;
    }
    if (!q) { // fallback guaranteed-valid question
      q = genBasicOperatorEval();
    }
    q.id = uid();
    q.flagged = false;
    q.userAnswer = null;
    return q;
  }

  // Validation layer: re-derive correctness programmatically before accepting a question (Section 8 requirement)
  function validateQuestion(q) {
    if (!q) return false;
    if (q.qtype === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) return false;
      if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) return false;
      // Defense-in-depth: if every option parses as a logic expression, make sure
      // exactly one is semantically equivalent to the correct option (no ambiguity,
      // no accidental duplicate "correct" answers among the distractors).
      const parsed = q.options.map(o => Logic.tryParse(o));
      if (parsed.every(p => p.ok)) {
        const correctNode = parsed[q.correct].node;
        const matches = parsed.filter(p => equivalent(p.node, correctNode)).length;
        if (matches !== 1) return false;
      }
      // also reject literal duplicate option text
      if (new Set(q.options).size !== q.options.length) return false;
      return true;
    }
    if (q.qtype === 'tf') return typeof q.correct === 'boolean';
    if (q.qtype === 'truthtable') return Array.isArray(q.rows) && q.rows.length > 0;
    if (q.qtype === 'proof') return Array.isArray(q.steps) && q.steps.every(s => s.law && DATA.LAW_BY_ID[s.law]);
    if (q.qtype === 'consistency') return typeof q.correct === 'boolean';
    if (q.qtype === 'symbolic') {
      if (!q.targetExpr) return false;
      try { parseExpr(q.targetExpr); } catch (e) { return false; }
      return true;
    }
    if (q.qtype === 'selectexpr') {
      // finalize correctness by real equivalence check against node
      if (!q._node) return false;
      const idx = q.options.findIndex(optStr => {
        try { return equivalent(parseExpr(optStr), q._node); } catch (e) { return false; }
      });
      if (idx < 0) return false;
      const dupCount = q.options.filter(optStr => { try { return equivalent(parseExpr(optStr), q._node); } catch (e) { return false; } }).length;
      if (dupCount !== 1) return false; // ambiguous — reject, regenerate (Section 8 rule)
      q.correct = idx;
      q.explanation = `${q.options[idx]} is logically equivalent to ${toStr(q._node)} — verified by matching truth tables across all variable assignments. The other options differ in at least one row.`;
      delete q._node;
      return true;
    }
    return false;
  }

  function generateExam(n) {
    n = n || 20;
    const nEasy = Math.round(n * 0.30), nMedium = Math.round(n * 0.45);
    const nHard = n - nEasy - nMedium;
    const diffList = shuffle([
      ...Array(nEasy).fill('easy'),
      ...Array(nMedium).fill('medium'),
      ...Array(nHard).fill('hard'),
    ]);
    return diffList.map(d => generateOne(d));
  }

  function generateByTopicPool(topicFilterFn, count, difficulty) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard < count * 20) {
      const d = difficulty || pick(['easy', 'medium', 'hard']);
      const q = generateOne(d);
      if (!topicFilterFn || topicFilterFn(q)) out.push(q);
      guard++;
    }
    return out;
  }

  return { generateOne, generateExam, generateByTopicPool, VARPOOL };
})();
