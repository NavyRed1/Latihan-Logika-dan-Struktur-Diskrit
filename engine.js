// =======================================================
// Propositional Logic Engine
// AST: {op:'VAR',name} | {op:'NOT',a} | {op:'AND'|'OR'|'XOR'|'IMP'|'IFF',a,b}
// =======================================================
const Logic = (function () {
  function V(name) { return { op: 'VAR', name }; }
  const TRUE = { op: 'TRUE' };
  const FALSE = { op: 'FALSE' };
  function NOT(a) { return { op: 'NOT', a }; }
  function AND(a, b) { return { op: 'AND', a, b }; }
  function OR(a, b) { return { op: 'OR', a, b }; }
  function XOR(a, b) { return { op: 'XOR', a, b }; }
  function IMP(a, b) { return { op: 'IMP', a, b }; }
  function IFF(a, b) { return { op: 'IFF', a, b }; }

  function evalNode(node, assign) {
    switch (node.op) {
      case 'TRUE': return true;
      case 'FALSE': return false;
      case 'VAR': return !!assign[node.name];
      case 'NOT': return !evalNode(node.a, assign);
      case 'AND': return evalNode(node.a, assign) && evalNode(node.b, assign);
      case 'OR': return evalNode(node.a, assign) || evalNode(node.b, assign);
      case 'XOR': return evalNode(node.a, assign) !== evalNode(node.b, assign);
      case 'IMP': return (!evalNode(node.a, assign)) || evalNode(node.b, assign);
      case 'IFF': return evalNode(node.a, assign) === evalNode(node.b, assign);
      default: throw new Error('bad node');
    }
  }

  function collectVars(node, set) {
    set = set || new Set();
    if (node.op === 'VAR') set.add(node.name);
    else if (node.op === 'TRUE' || node.op === 'FALSE') { /* constant */ }
    else if (node.op === 'NOT') collectVars(node.a, set);
    else { collectVars(node.a, set); collectVars(node.b, set); }
    return set;
  }

  function truthTable(node, forcedVars) {
    const vars = forcedVars ? forcedVars.slice() : Array.from(collectVars(node)).sort();
    const n = vars.length;
    const rows = [];
    for (let i = 0; i < (1 << n); i++) {
      const assign = {};
      vars.forEach((v, idx) => { assign[v] = !!((i >> (n - 1 - idx)) & 1); });
      rows.push({ assign, value: evalNode(node, assign) });
    }
    return { vars, rows };
  }

  function isTautology(node) { return truthTable(node).rows.every(r => r.value === true); }
  function isContradiction(node) { return truthTable(node).rows.every(r => r.value === false); }
  function classify(node) {
    if (isTautology(node)) return 'tautology';
    if (isContradiction(node)) return 'contradiction';
    return 'contingency';
  }

  function equivalent(n1, n2) {
    const vars = Array.from(new Set([...collectVars(n1), ...collectVars(n2)])).sort();
    const n = vars.length;
    for (let i = 0; i < (1 << n); i++) {
      const assign = {};
      vars.forEach((v, idx) => { assign[v] = !!((i >> (n - 1 - idx)) & 1); });
      if (evalNode(n1, assign) !== evalNode(n2, assign)) return false;
    }
    return true;
  }

  const LEVEL = { NOT: 5, AND: 4, OR: 3, XOR: 3.5, IMP: 2, IFF: 1 };
  const SYM = { NOT: '¬', AND: '∧', OR: '∨', XOR: '⊕', IMP: '→', IFF: '↔' };

  function toStr(node, parentLevel) {
    parentLevel = parentLevel || 0;
    if (node.op === 'TRUE') return 'T';
    if (node.op === 'FALSE') return 'F';
    if (node.op === 'VAR') return node.name;
    if (node.op === 'NOT') return '¬' + toStr(node.a, LEVEL.NOT);
    const lvl = LEVEL[node.op];
    const bumpRight = (node.op === 'IMP' || node.op === 'IFF') ? 0.01 : 0;
    const s = toStr(node.a, lvl) + ' ' + SYM[node.op] + ' ' + toStr(node.b, lvl + bumpRight);
    return (lvl < parentLevel) ? '(' + s + ')' : s;
  }

  // substitute variable names (for randomizing letters in templates)
  function substitute(node, map) {
    if (node.op === 'TRUE' || node.op === 'FALSE') return node;
    if (node.op === 'VAR') return V(map[node.name] || node.name);
    if (node.op === 'NOT') return NOT(substitute(node.a, map));
    return { op: node.op, a: substitute(node.a, map), b: substitute(node.b, map) };
  }

  // ---- Parser: accepts unicode + ascii aliases ----
  function tokenize(str) {
    let s = str
      .replace(/<->|<=>|↔/g, ' IFF ')
      .replace(/->|=>|→/g, ' IMP ')
      .replace(/\bxor\b|⊕/gi, ' XOR ')
      .replace(/[∧&]/g, ' AND ')
      .replace(/[∨]/g, ' OR ')
      .replace(/[¬~!]/g, ' NOT ')
      .replace(/\(/g, ' ( ').replace(/\)/g, ' ) ');
    const parts = s.split(/\s+/).filter(Boolean);
    const tokens = [];
    for (let p of parts) {
      if (/^(AND|OR|NOT|IMP|IFF|XOR)$/i.test(p)) tokens.push(p.toUpperCase());
      else if (p === '(' || p === ')') tokens.push(p);
      else if (/^and$/i.test(p)) tokens.push('AND');
      else if (/^or$/i.test(p)) tokens.push('OR');
      else if (/^not$/i.test(p)) tokens.push('NOT');
      else if (p === 'T') tokens.push({ op: 'TRUE' });
      else if (p === 'F') tokens.push({ op: 'FALSE' });
      else if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(p)) tokens.push({ op: 'VAR', name: p.toLowerCase() });
      else throw new Error('Unrecognized symbol: ' + p);
    }
    return tokens;
  }

  function parseExpr(str) {
    const tokens = tokenize(str);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    function parseIff() {
      let left = parseImp();
      while (peek() === 'IFF') { next(); left = IFF(left, parseImp()); }
      return left;
    }
    function parseImp() {
      let left = parseOr();
      if (peek() === 'IMP') { next(); return IMP(left, parseImp()); }
      return left;
    }
    function parseOr() {
      let left = parseXor();
      while (peek() === 'OR') { next(); left = OR(left, parseXor()); }
      return left;
    }
    function parseXor() {
      let left = parseAnd();
      while (peek() === 'XOR') { next(); left = XOR(left, parseAnd()); }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (peek() === 'AND') { next(); left = AND(left, parseNot()); }
      return left;
    }
    function parseNot() {
      if (peek() === 'NOT') { next(); return NOT(parseNot()); }
      return parseAtom();
    }
    function parseAtom() {
      const t = peek();
      if (t === '(') { next(); const e = parseIff(); if (peek() !== ')') throw new Error('Expected )'); next(); return e; }
      if (t && typeof t === 'object' && (t.op === 'VAR' || t.op === 'TRUE' || t.op === 'FALSE')) { next(); return t; }
      throw new Error('Unexpected token');
    }
    if (tokens.length === 0) throw new Error('Empty expression');
    const result = parseIff();
    if (pos !== tokens.length) throw new Error('Trailing input after expression');
    return result;
  }

  function tryParse(str) {
    try { return { ok: true, node: parseExpr(str) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  return {
    V, NOT, AND, OR, XOR, IMP, IFF,
    evalNode, collectVars, truthTable, isTautology, isContradiction, classify,
    equivalent, toStr, substitute, parseExpr, tryParse
  };
})();
