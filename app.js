// ============================================================
// UI Application: state, router, renderers, event delegation
// ============================================================
const App = (function () {
  const state = {
    view: 'dashboard',
    session: null,        // active exam/practice session
    lastEntry: null,      // last completed history entry (for results view)
    reviewEntry: null,    // history entry being viewed from History list
    timerId: null,
    practiceDraft: { mode: 'topic', topic: null, difficulty: null, count: 10, timed: false },
  };

  const TOPICS = [
    'Propositions', 'Operators & Truth Values', 'Translation', 'Conditional Statements',
    'Truth Tables', 'Converse / Inverse / Contrapositive', 'Tautology / Contradiction / Contingency',
    'Logical Equivalence', 'System Specification Consistency', 'Logic Gates', 'Proving Equivalence (Logical Laws)',
  ];

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  // ---------------- THEME ----------------
  function initTheme() {
    const saved = Store.getTheme();
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    Store.saveTheme(t);
    renderShellChrome();
  }
  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const cur = Store.getTheme() || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setTheme(next);
  }

  // ---------------- ROUTER ----------------
  function goto(view, opts) {
    if (state.session && !state.session.submitted && state.view === 'exam' && view !== 'exam') {
      openLeaveConfirm(view, opts);
      return;
    }
    state.view = view;
    Object.assign(state, opts || {});
    render();
    window.scrollTo(0, 0);
  }

  function openLeaveConfirm(view, opts) {
    state._pendingNav = { view, opts };
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    root.appendChild(el(`
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>Leave this exam?</h3>
          <p>Your progress is auto-saved — you can resume from the Dashboard. Leaving now will not submit or grade your answers.</p>
          <div class="btn-row" style="margin-top:16px;">
            <button class="btn secondary" data-action="close-modal">Stay</button>
            <button class="btn accent" data-action="confirm-leave">Leave exam</button>
          </div>
        </div>
      </div>
    `));
  }

  function render() {
    renderShellChrome();
    const main = document.getElementById('main-content');
    main.innerHTML = '';
    let node;
    switch (state.view) {
      case 'dashboard': node = renderDashboard(); break;
      case 'exam': node = renderExamSession(); break;
      case 'results': node = renderResults(state.lastEntry); break;
      case 'practice-setup': node = renderPracticeSetup(); break;
      case 'weaknesses': node = renderWeaknesses(); break;
      case 'history': node = renderHistory(); break;
      case 'history-detail': node = renderResults(state.reviewEntry, true); break;
      default: node = renderDashboard();
    }
    main.appendChild(node);
    manageTimer();
  }

  function renderShellChrome() {
    document.querySelectorAll('.navlink').forEach(b => b.classList.toggle('active', b.dataset.view === state.view || (state.view === 'history-detail' && b.dataset.view === 'history')));
    const themeSaved = Store.getTheme() || 'auto';
    document.querySelectorAll('.theme-toggle button').forEach(b => b.classList.toggle('active', b.dataset.theme === themeSaved));
    const label = document.getElementById('theme-cycle-label');
    if (label) label.textContent = 'Theme: ' + themeSaved[0].toUpperCase() + themeSaved.slice(1);
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function renderDashboard() {
    const history = Store.getHistory();
    const mockAttempts = history.filter(h => h.mode === 'mock');
    const avg = mockAttempts.length ? Math.round(mockAttempts.reduce((s, h) => s + h.percent, 0) / mockAttempts.length) : null;
    const last = history[0];
    const inProgress = Store.getInProgress();

    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`
      <div class="page-head">
        <h1>ES234103 · Logics and Discrete Structures</h1>
        <p>A mock-exam simulator built strictly from your propositional logic course materials: propositions &amp; operators, conditional statements, converse/inverse/contrapositive, truth tables, tautology/contradiction/contingency, and proving logical equivalence.</p>
      </div>
    `));

    if (inProgress) {
      wrap.appendChild(el(`
        <div class="card" style="border-color:var(--accent);margin-bottom:14px;">
          <strong>You have an exam in progress</strong>
          <p style="color:var(--ink-soft);margin:6px 0 12px;">${inProgress.questions.filter(q=>q.userAnswer!==null&&q.userAnswer!==undefined).length} of ${inProgress.questions.length} questions answered · resume where you left off.</p>
          <button class="btn accent" data-action="resume-exam">Resume exam</button>
        </div>
      `));
    }

    const stats = el(`<div class="grid-3" style="margin-bottom:16px;"></div>`);
    stats.appendChild(el(`<div class="card stat-card"><div class="stat-num">${mockAttempts.length}</div><div class="stat-label">Mock exams completed</div></div>`));
    stats.appendChild(el(`<div class="card stat-card"><div class="stat-num">${avg === null ? '—' : avg + '%'}</div><div class="stat-label">Average mock score</div></div>`));
    stats.appendChild(el(`<div class="card stat-card"><div class="stat-num">${last ? last.percent + '%' : '—'}</div><div class="stat-label">Most recent score</div></div>`));
    wrap.appendChild(stats);

    const actions = el(`<div class="grid-2"></div>`);
    actions.appendChild(el(`
      <div class="card">
        <h3>Mock exam</h3>
        <p style="color:var(--ink-soft);font-size:.87rem;">20 questions · mixed difficulty (30% easy / 45% medium / 25% hard) · 30-minute timer · flagging, navigation &amp; auto-save.</p>
        <button class="btn accent" data-action="start-mock" style="margin-top:10px;">Start mock exam</button>
      </div>
    `));
    actions.appendChild(el(`
      <div class="card">
        <h3>Practice</h3>
        <p style="color:var(--ink-soft);font-size:.87rem;">Choose a topic, a difficulty, or let Weakness Mode build a set from your past mistakes. Timed or untimed.</p>
        <button class="btn secondary" data-action="goto-practice" style="margin-top:10px;">Open practice</button>
      </div>
    `));
    wrap.appendChild(actions);

    wrap.appendChild(el(`
      <div class="card" style="margin-top:14px;">
        <h3>What's covered</h3>
        <div class="btn-row" style="margin-top:8px;">
          ${TOPICS.map(t => `<span class="badge" style="background:var(--paper);color:var(--ink-soft);">${esc(t)}</span>`).join('')}
        </div>
      </div>
    `));
    return wrap;
  }

  // ============================================================
  // EXAM SESSION (mock + practice share this renderer)
  // ============================================================
  function renderExamSession() {
    const s = state.session;
    if (!s) { setTimeout(() => goto('dashboard'), 0); return el('<div class="empty-state"><h3>No active session</h3></div>'); }
    const q = s.questions[s.currentIndex];
    const wrap = el('<div></div>');

    // topbar
    const remaining = Exam.remainingSec(s);
    const answeredCount = s.questions.filter(qq => qq.userAnswer !== null && qq.userAnswer !== undefined).length;
    const pct = Math.round((answeredCount / s.questions.length) * 100);
    const topbar = el(`
      <div class="exam-topbar">
        <div style="display:flex;align-items:center;gap:10px;">
          <strong style="font-family:var(--serif);">${s.mode === 'mock' ? 'Mock Exam' : 'Practice'}</strong>
          <span style="color:var(--ink-soft);font-size:.82rem;">${answeredCount}/${s.questions.length} answered</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        ${remaining !== null ? `<div class="timer ${remaining < 120 ? 'low' : ''}" id="timer-display">${fmtTime(remaining)}</div>` : `<div class="timer">Untimed</div>`}
        <button class="btn secondary" data-action="open-submit-modal">Submit</button>
      </div>
    `);
    wrap.appendChild(topbar);

    // question nav strip
    const strip = el('<div class="qnav-strip"></div>');
    s.questions.forEach((qq, i) => {
      const answered = qq.userAnswer !== null && qq.userAnswer !== undefined;
      const dot = el(`<div class="qnav-dot ${i === s.currentIndex ? 'current' : ''} ${answered ? 'answered' : ''} ${qq.flagged ? 'flagged' : ''}" role="button" tabindex="0" aria-label="Go to question ${i + 1}${answered ? ', answered' : ', unanswered'}${qq.flagged ? ', flagged' : ''}" data-action="jump-q" data-idx="${i}">${i + 1}</div>`);
      strip.appendChild(dot);
    });
    wrap.appendChild(strip);

    // question card
    const card = el('<div class="card qcard"></div>');
    const head = el(`
      <div class="qcard-head">
        <div>
          <div class="qnum">Question ${s.currentIndex + 1} <span style="font-size:1rem;color:var(--ink-soft);">/ ${s.questions.length}</span></div>
          <div class="qmeta" style="margin-top:6px;">
            <span class="badge ${q.difficulty}">${q.difficulty}</span>
            <span class="badge" style="color:var(--ink-soft);">${esc(q.topic)}</span>
          </div>
        </div>
        <button class="flag-btn ${q.flagged ? 'active' : ''}" data-action="toggle-flag">${q.flagged ? '★ Flagged' : '☆ Flag'}</button>
      </div>
    `);
    card.appendChild(head);
    card.appendChild(el(`<div class="qprompt">${nl2br(q.prompt)}</div>`));
    card.appendChild(renderQuestionBody(q, false));
    wrap.appendChild(card);

    // nav buttons
    const navRow = el(`
      <div class="btn-row" style="margin-top:16px;justify-content:space-between;">
        <button class="btn secondary" data-action="prev-q" ${s.currentIndex === 0 ? 'disabled' : ''}>← Previous</button>
        ${s.currentIndex === s.questions.length - 1
          ? `<button class="btn accent" data-action="open-submit-modal">Submit exam</button>`
          : `<button class="btn" data-action="next-q">Next →</button>`}
      </div>
    `);
    wrap.appendChild(navRow);
    return wrap;
  }

  function renderQuestionBody(q, reviewMode) {
    const c = el('<div></div>');
    const disabled = reviewMode ? 'data-review="1"' : '';
    switch (q.qtype) {
      case 'mcq':
      case 'selectexpr': {
        q.options.forEach((opt, i) => {
          const selected = q.userAnswer === i;
          const row = el(`
            <div class="option-row ${selected ? 'selected' : ''}" ${reviewMode ? '' : `data-action="answer-choice" data-idx="${i}"`}>
              <span class="option-letter">${String.fromCharCode(65 + i)}</span>
              <span class="option-text">${esc(opt)}</span>
            </div>
          `);
          if (reviewMode) {
            if (i === q.correct) row.style.borderColor = 'var(--good)', row.style.boxShadow = '0 0 0 1px var(--good)';
            if (selected && i !== q.correct) row.style.borderColor = 'var(--accent)', row.style.boxShadow = '0 0 0 1px var(--accent)';
          }
          c.appendChild(row);
        });
        break;
      }
      case 'tf': {
        const row = el(`
          <div class="tf-row">
            <div class="tf-btn ${q.userAnswer === true ? 'selected' : ''}" ${reviewMode ? '' : `data-action="answer-choice" data-idx="true"`}>True</div>
            <div class="tf-btn ${q.userAnswer === false ? 'selected' : ''}" ${reviewMode ? '' : `data-action="answer-choice" data-idx="false"`}>False</div>
          </div>
        `);
        if (reviewMode) {
          row.children[q.correct ? 0 : 1].style.borderColor = 'var(--good)';
          row.children[q.correct ? 0 : 1].style.boxShadow = '0 0 0 1px var(--good)';
        }
        c.appendChild(row);
        break;
      }
      case 'consistency': {
        const row = el(`
          <div class="tf-row">
            <div class="tf-btn ${q.userAnswer === true ? 'selected' : ''}" ${reviewMode ? '' : `data-action="answer-choice" data-idx="true"`}>Consistent</div>
            <div class="tf-btn ${q.userAnswer === false ? 'selected' : ''}" ${reviewMode ? '' : `data-action="answer-choice" data-idx="false"`}>Inconsistent</div>
          </div>
        `);
        if (reviewMode) {
          row.children[q.correct ? 0 : 1].style.borderColor = 'var(--good)';
          row.children[q.correct ? 0 : 1].style.boxShadow = '0 0 0 1px var(--good)';
        }
        c.appendChild(row);
        break;
      }
      case 'symbolic': {
        const wrap2 = el('<div></div>');
        wrap2.appendChild(el(`<input type="text" class="symbolic-input" ${disabled} aria-label="Symbolic expression answer" placeholder="e.g. p AND (q OR NOT r)   —  aliases: ~ ! for ¬, & for ∧, | or OR for ∨, -> for →, <-> for ↔" value="${esc(q.userAnswer || '')}" ${reviewMode ? 'disabled' : 'data-action-input="symbolic"'}>`));
        wrap2.appendChild(el(`<div class="symbolic-hint">Type using ¬ ∧ ∨ → ↔ ⊕ or ASCII: NOT/~/!, AND/&amp;, OR/|, -&gt;, &lt;-&gt;, XOR/^</div>`));
        const preview = el(`<div class="symbolic-preview" id="symbolic-preview">Preview: —</div>`);
        wrap2.appendChild(preview);
        c.appendChild(wrap2);
        if (reviewMode) {
          c.appendChild(el(`<div class="symbolic-hint" style="margin-top:10px;">Target expression (any equivalent form accepted): <b class="expr">${esc(q.targetExpr)}</b></div>`));
        }
        break;
      }
      case 'truthtable': {
        c.appendChild(renderTruthTableWidget(q, reviewMode));
        break;
      }
      case 'proof': {
        c.appendChild(renderProofWidget(q, reviewMode));
        break;
      }
    }
    if (reviewMode) {
      const isCorrect = q._isCorrect;
      const box = el(`<div class="explain-box ${isCorrect ? 'correct' : 'incorrect'}"><strong>${isCorrect ? 'Correct' : 'Incorrect'}.</strong>\n${nl2br(q.explanation)}</div>`);
      c.appendChild(box);
    }
    return c;
  }

  function renderTruthTableWidget(q, reviewMode) {
    const wrap = el('<div></div>');
    // NOTE: <table>/<thead>/<tbody>/<tr> are dropped by the HTML parser when set
    // via a plain <div>.innerHTML (table-structure fragment-parsing rules), so this
    // widget is built with real DOM APIs rather than the innerHTML-based el() helper.
    const table = document.createElement('table');
    table.className = 'tt-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    q.vars.forEach(v => { const th = document.createElement('th'); th.textContent = v; headRow.appendChild(th); });
    const exprTh = document.createElement('th'); exprTh.textContent = q.exprStr; headRow.appendChild(exprTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    q.rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      q.vars.forEach(v => { const td = document.createElement('td'); td.textContent = row.assign[v] ? 'T' : 'F'; tr.appendChild(td); });
      const isHidden = q.hideIdx.includes(i);
      if (!isHidden) {
        const td = document.createElement('td'); td.textContent = row.value ? 'T' : 'F'; tr.appendChild(td);
      } else if (reviewMode) {
        const ua = q.userAnswer ? q.userAnswer[i] : undefined;
        const ok = ua === row.value;
        const td = document.createElement('td');
        td.style.color = ok ? 'var(--good)' : 'var(--accent)'; td.style.fontWeight = '700';
        td.innerHTML = `${ua === undefined ? '—' : (ua ? 'T' : 'F')} <span style="color:var(--ink-soft);font-weight:400;">(ans: ${row.value ? 'T' : 'F'})</span>`;
        tr.appendChild(td);
      } else {
        const cur = q.userAnswer ? q.userAnswer[i] : undefined;
        const td = document.createElement('td');
        const toggle = el(`
          <div class="tt-toggle">
            <button data-action="tt-cell" data-row="${i}" data-val="true" aria-label="Row ${i + 1} value True" class="${cur === true ? 'active' : ''}">T</button>
            <button data-action="tt-cell" data-row="${i}" data-val="false" aria-label="Row ${i + 1} value False" class="${cur === false ? 'active' : ''}">F</button>
          </div>
        `);
        td.appendChild(toggle);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderProofWidget(q, reviewMode) {
    const wrap = el('<div class="proof-chain"></div>');
    wrap.appendChild(el(`<div class="proof-line"><span class="proof-arrow">Start:</span><span class="proof-expr">${esc(q.startExpr)}</span></div>`));
    q.steps.forEach((s, i) => {
      const ua = q.userAnswer ? q.userAnswer[i] : null;
      const line = el(`<div class="proof-line"></div>`);
      line.appendChild(el(`<span class="proof-arrow">≡</span>`));
      line.appendChild(el(`<span class="proof-expr">${esc(s.expr)}</span>`));
      line.appendChild(el(`<span class="proof-arrow">by</span>`));
      if (reviewMode) {
        const ok = ua === s.law;
        const chosenName = ua ? (DATA.LAW_BY_ID[ua] ? DATA.LAW_BY_ID[ua].name : ua) : '(no answer)';
        line.appendChild(el(`<span style="font-size:.85rem;color:${ok ? 'var(--good)' : 'var(--accent)'};font-weight:600;">${esc(chosenName)}${ok ? '' : ' — correct: ' + esc(s.lawName)}</span>`));
      } else {
        const sel = el(`<select class="proof-law-select" data-action-select="proof-law" data-step="${i}"><option value="">Select a law…</option></select>`);
        DATA.LAWS.forEach(law => {
          const o = el(`<option value="${law.id}" ${ua === law.id ? 'selected' : ''}>${esc(law.name)}</option>`);
          sel.appendChild(o);
        });
        line.appendChild(sel);
      }
      wrap.appendChild(line);
    });
    wrap.appendChild(el(`<div class="proof-line"><span class="proof-arrow">End:</span><span class="proof-expr">${esc(q.endExpr)}</span></div>`));
    return wrap;
  }

  // ============================================================
  // RESULTS / HISTORY-DETAIL
  // ============================================================
  function renderResults(entry, fromHistory) {
    if (!entry) { setTimeout(() => goto('dashboard'), 0); return el('<div class="empty-state"><h3>No results to show</h3></div>'); }
    const wrap = el('<div></div>');
    wrap.appendChild(el(`
      <div class="page-head">
        <h1>${entry.mode === 'mock' ? 'Mock Exam Results' : 'Practice Results'}</h1>
        <p>${fmtDate(entry.date)} · ${entry.total} questions · ${fmtTime(entry.timeUsedSec)} used${entry.durationSec ? ' of ' + fmtTime(entry.durationSec) : ' (untimed)'}</p>
      </div>
    `));

    const hero = el(`
      <div class="card">
        <div class="score-hero">
          <div class="score-ring">${entry.percent}%</div>
          <div>
            <div style="font-weight:700;">${entry.score} / ${entry.total} correct</div>
            <div style="color:var(--ink-soft);font-size:.85rem;">${entry.total - entry.score} incorrect or unanswered</div>
          </div>
          <div class="btn-row" style="margin-left:auto;">
            <button class="btn secondary" data-action="retry-incorrect">Retry incorrect (new questions)</button>
            ${!fromHistory ? `<button class="btn" data-action="start-mock">New mock exam</button>` : ''}
          </div>
        </div>
      </div>
    `);
    wrap.appendChild(hero);

    // difficulty + type breakdown
    const grid = el('<div class="grid-2" style="margin-top:14px;"></div>');
    const diffCard = el('<div class="card"><h3 style="font-size:1rem;">Performance by difficulty</h3></div>');
    ['easy', 'medium', 'hard'].forEach(d => {
      const b = entry.byDifficulty[d];
      if (!b || b.t === 0) return;
      diffCard.appendChild(barRow(d[0].toUpperCase() + d.slice(1), b.c, b.t));
    });
    grid.appendChild(diffCard);

    const typeCard = el('<div class="card"><h3 style="font-size:1rem;">Accuracy by question type</h3></div>');
    const typeLabels = { mcq: 'Multiple choice', tf: 'True / False', symbolic: 'Symbolic input', truthtable: 'Truth-table completion', selectexpr: 'Select expression', proof: 'Step-by-step proof', consistency: 'Consistency analysis' };
    Object.keys(entry.byType).forEach(t => {
      const b = entry.byType[t];
      typeCard.appendChild(barRow(typeLabels[t] || t, b.c, b.t));
    });
    grid.appendChild(typeCard);
    wrap.appendChild(grid);

    // topic performance
    const topicCard = el('<div class="card" style="margin-top:14px;"><h3 style="font-size:1rem;">Topic performance</h3></div>');
    Object.keys(entry.byTopic).sort((a, b) => (entry.byTopic[a].c / entry.byTopic[a].t) - (entry.byTopic[b].c / entry.byTopic[b].t)).forEach(t => {
      const b = entry.byTopic[t];
      topicCard.appendChild(barRow(t, b.c, b.t));
    });
    wrap.appendChild(topicCard);

    // weakest concepts + recommendations
    const tags = Object.entries(entry.mistakeTags || {}).sort((a, b) => b[1] - a[1]);
    if (tags.length) {
      const weakCard = el('<div class="card" style="margin-top:14px;"><h3 style="font-size:1rem;">Weakest concepts this attempt</h3><div style="margin-top:8px;"></div></div>');
      const tagsWrap = weakCard.querySelector('div');
      tags.forEach(([tag, count]) => {
        tagsWrap.appendChild(el(`<span class="tag-pill">${esc(MISTAKE_LABELS[tag] || tag)} <b>×${count}</b></span>`));
      });
      const rec = el(`<p style="margin-top:12px;color:var(--ink-soft);font-size:.87rem;">Recommended before your next attempt: focus on <strong>${esc(MISTAKE_LABELS[tags[0][0]] || tags[0][0])}</strong>${tags[1] ? ' and ' + esc(MISTAKE_LABELS[tags[1][0]] || tags[1][0]) : ''}. Try Weakness Mode in Practice.</p>`);
      weakCard.appendChild(rec);
      wrap.appendChild(weakCard);
    }

    // question review list
    const reviewCard = el('<div style="margin-top:18px;"><h3>Question review</h3></div>');
    entry.questions.forEach((q, i) => {
      const isCorrect = Exam.gradeQuestion(q);
      const item = el(`<div class="review-item ${isCorrect ? 'right' : 'wrong'}"></div>`);
      item.appendChild(el(`
        <div class="qmeta" style="margin-bottom:8px;">
          <span class="badge ${q.difficulty}">${q.difficulty}</span>
          <span class="badge" style="color:var(--ink-soft);">${esc(q.topic)}</span>
          <span style="margin-left:auto;font-weight:700;color:${isCorrect ? 'var(--good)' : 'var(--accent)'};font-size:.82rem;">${isCorrect ? 'CORRECT' : 'INCORRECT'}</span>
        </div>
      `));
      item.appendChild(el(`<div class="qprompt" style="font-size:.92rem;margin-bottom:10px;"><strong>Q${i + 1}.</strong> ${nl2br(q.prompt)}</div>`));
      item.appendChild(renderQuestionBody(q, true));
      reviewCard.appendChild(item);
    });
    wrap.appendChild(reviewCard);

    return wrap;
  }

  function barRow(label, correct, total) {
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const cls = pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    return el(`
      <div class="bar-row">
        <div class="bar-label">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
        <div class="bar-pct">${correct}/${total}</div>
      </div>
    `);
  }

  // ============================================================
  // PRACTICE SETUP
  // ============================================================
  function renderPracticeSetup() {
    const wrap = el('<div></div>');
    wrap.appendChild(el(`<div class="page-head"><h1>Practice</h1><p>Build a custom practice set. All questions are freshly generated and validated the same way as the mock exam.</p></div>`));

    const modeCard = el(`
      <div class="card">
        <h3 style="font-size:1rem;">Mode</h3>
        <div class="choice-grid" style="margin-top:10px;">
          <div class="choice-card ${state.practiceDraft.mode === 'topic' ? 'selected' : ''}" data-action="set-practice-mode" data-mode="topic"><h4>By topic</h4><p>Pick one topic to drill</p></div>
          <div class="choice-card ${state.practiceDraft.mode === 'difficulty' ? 'selected' : ''}" data-action="set-practice-mode" data-mode="difficulty"><h4>By difficulty</h4><p>Easy, medium or hard only</p></div>
          <div class="choice-card ${state.practiceDraft.mode === 'weakness' ? 'selected' : ''}" data-action="set-practice-mode" data-mode="weakness"><h4>Weakness Mode</h4><p>Built from your past mistakes</p></div>
          <div class="choice-card ${state.practiceDraft.mode === 'mixed' ? 'selected' : ''}" data-action="set-practice-mode" data-mode="mixed"><h4>Mixed review</h4><p>Everything, like the mock exam</p></div>
        </div>
      </div>
    `);
    wrap.appendChild(modeCard);

    if (state.practiceDraft.mode === 'topic') {
      const c = el(`<div class="card" style="margin-top:12px;"><h3 style="font-size:1rem;">Topic</h3><div class="choice-grid" style="margin-top:10px;"></div></div>`);
      const grid = c.querySelector('.choice-grid');
      TOPICS.forEach(t => {
        grid.appendChild(el(`<div class="choice-card ${state.practiceDraft.topic === t ? 'selected' : ''}" data-action="set-practice-topic" data-topic="${esc(t)}"><h4>${esc(t)}</h4></div>`));
      });
      wrap.appendChild(c);
    }
    if (state.practiceDraft.mode === 'difficulty') {
      const c = el(`<div class="card" style="margin-top:12px;"><h3 style="font-size:1rem;">Difficulty</h3><div class="choice-grid" style="margin-top:10px;"></div></div>`);
      const grid = c.querySelector('.choice-grid');
      ['easy', 'medium', 'hard'].forEach(d => {
        grid.appendChild(el(`<div class="choice-card ${state.practiceDraft.difficulty === d ? 'selected' : ''}" data-action="set-practice-difficulty" data-diff="${d}"><h4>${d[0].toUpperCase() + d.slice(1)}</h4></div>`));
      });
      wrap.appendChild(c);
    }
    if (state.practiceDraft.mode === 'weakness') {
      const mistakes = Store.getMistakes();
      const tags = Object.entries(mistakes).sort((a, b) => b[1] - a[1]);
      const c = el(`<div class="card" style="margin-top:12px;"><h3 style="font-size:1rem;">Your recorded mistakes</h3></div>`);
      if (!tags.length) {
        c.appendChild(el(`<p style="color:var(--ink-soft);font-size:.87rem;margin-top:8px;">No mistakes recorded yet — complete a mock exam or practice set first, and Weakness Mode will target what tripped you up.</p>`));
      } else {
        const list = el('<div style="margin-top:8px;"></div>');
        tags.forEach(([tag, count]) => list.appendChild(el(`<span class="tag-pill">${esc(MISTAKE_LABELS[tag] || tag)} <b>×${count}</b></span>`)));
        c.appendChild(list);
      }
      wrap.appendChild(c);
    }

    const optsCard = el(`
      <div class="card" style="margin-top:12px;">
        <h3 style="font-size:1rem;">Options</h3>
        <div class="grid-2" style="margin-top:10px;align-items:end;">
          <div>
            <label style="font-size:.82rem;color:var(--ink-soft);display:block;margin-bottom:6px;">Number of questions</label>
            <select class="proof-law-select" id="practice-count" style="width:100%;">
              ${[5, 10, 15, 20].map(n => `<option value="${n}" ${state.practiceDraft.count === n ? 'selected' : ''}>${n} questions</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:.82rem;color:var(--ink-soft);display:block;margin-bottom:6px;">Timing</label>
            <div class="theme-toggle" style="font-size:.85rem;">
              <button data-action="set-practice-timed" data-timed="0" class="${!state.practiceDraft.timed ? 'active' : ''}">Untimed (study)</button>
              <button data-action="set-practice-timed" data-timed="1" class="${state.practiceDraft.timed ? 'active' : ''}">Timed</button>
            </div>
          </div>
        </div>
        <button class="btn accent" style="margin-top:16px;" data-action="start-practice">Start practice</button>
      </div>
    `);
    wrap.appendChild(optsCard);
    return wrap;
  }

  // ============================================================
  // WEAKNESSES
  // ============================================================
  function renderWeaknesses() {
    const wrap = el('<div></div>');
    wrap.appendChild(el(`<div class="page-head"><h1>Weaknesses</h1><p>Aggregated across every mock exam and practice session you've completed on this device.</p></div>`));
    const mistakes = Store.getMistakes();
    const tags = Object.entries(mistakes).sort((a, b) => b[1] - a[1]);
    if (!tags.length) {
      wrap.appendChild(el(`<div class="empty-state"><h3>No data yet</h3><p>Complete a mock exam or practice set — mistakes are tracked automatically by concept, and this page will fill in.</p></div>`));
      return wrap;
    }
    const maxCount = tags[0][1];
    const card = el('<div class="card"></div>');
    tags.forEach(([tag, count]) => {
      const pct = Math.round((count / maxCount) * 100);
      card.appendChild(el(`
        <div class="bar-row">
          <div class="bar-label" style="width:280px;">${esc(MISTAKE_LABELS[tag] || tag)}</div>
          <div class="bar-track"><div class="bar-fill bad" style="width:${pct}%"></div></div>
          <div class="bar-pct">×${count}</div>
        </div>
      `));
    });
    wrap.appendChild(card);
    wrap.appendChild(el(`<div class="btn-row" style="margin-top:16px;"><button class="btn accent" data-action="goto-weakness-practice">Practice weak areas now</button></div>`));
    return wrap;
  }

  // ============================================================
  // HISTORY
  // ============================================================
  function renderHistory() {
    const wrap = el('<div></div>');
    wrap.appendChild(el(`<div class="page-head"><h1>History</h1><p>Every mock exam and practice attempt saved on this device.</p></div>`));
    const history = Store.getHistory();
    if (!history.length) {
      wrap.appendChild(el(`<div class="empty-state"><h3>No attempts yet</h3><p>Your completed exams and practice sessions will appear here.</p></div>`));
      return wrap;
    }
    history.forEach(entry => {
      const card = el(`
        <div class="card" style="display:flex;align-items:center;gap:16px;cursor:pointer;" data-action="view-history" data-id="${entry.id}">
          <div class="stat-num" style="font-size:1.5rem;min-width:64px;">${entry.percent}%</div>
          <div style="flex:1;">
            <div style="font-weight:600;">${entry.mode === 'mock' ? 'Mock Exam' : 'Practice'} · ${entry.score}/${entry.total}</div>
            <div style="color:var(--ink-soft);font-size:.82rem;">${fmtDate(entry.date)} · ${fmtTime(entry.timeUsedSec)} used</div>
          </div>
          <span style="color:var(--ink-soft);">→</span>
        </div>
      `);
      wrap.appendChild(card);
    });
    return wrap;
  }

  // ============================================================
  // TIMER
  // ============================================================
  function manageTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (state.view !== 'exam' || !state.session || state.session.submitted) return;
    if (Exam.remainingSec(state.session) === null) return; // untimed
    state.timerId = setInterval(() => {
      const s = state.session;
      if (!s) return;
      const rem = Exam.remainingSec(s);
      const disp = document.getElementById('timer-display');
      if (disp) {
        disp.textContent = fmtTime(rem);
        disp.classList.toggle('low', rem < 120);
      }
      autosave();
      if (rem <= 0) { clearInterval(state.timerId); submitExam(true); }
    }, 1000);
  }

  function autosave() {
    if (state.session && !state.session.submitted) Store.saveInProgress(state.session);
  }

  // ============================================================
  // ACTIONS
  // ============================================================
  function startMock() {
    state.session = Exam.buildExam(20, 'mock');
    Store.clearInProgress();
    Store.saveInProgress(state.session);
    goto('exam');
  }

  function resumeExam() {
    const s = Store.getInProgress();
    if (!s) return;
    state.session = s;
    goto('exam');
  }

  function startPracticeFromDraft() {
    const d = state.practiceDraft;
    let questions;
    if (d.mode === 'topic' && d.topic) {
      questions = QGEN.generateByTopicPool(q => q.topic === d.topic, d.count);
    } else if (d.mode === 'difficulty' && d.difficulty) {
      questions = Array.from({ length: d.count }, () => QGEN.generateOne(d.difficulty));
    } else if (d.mode === 'weakness') {
      const mistakes = Store.getMistakes();
      const topTags = Object.entries(mistakes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
      if (!topTags.length) { questions = QGEN.generateExam(d.count); }
      else questions = QGEN.generateByTopicPool(q => topTags.includes(q.mistakeTag), d.count);
    } else {
      questions = QGEN.generateExam(d.count);
    }
    state.session = Exam.buildPractice(questions, d.timed, d.timed ? Math.max(5, d.count) * 60 : null);
    Store.clearInProgress();
    goto('exam');
  }

  function retryIncorrect() {
    const entry = state.lastEntry;
    if (!entry) return;
    const tags = Array.from(new Set(entry.questions.filter(q => !Exam.gradeQuestion(q)).map(q => q.mistakeTag).filter(Boolean)));
    let questions;
    if (tags.length) questions = QGEN.generateByTopicPool(q => tags.includes(q.mistakeTag), Math.min(15, Math.max(5, tags.length * 3)));
    else questions = QGEN.generateExam(10);
    state.session = Exam.buildPractice(questions, false, null);
    Store.clearInProgress();
    goto('exam');
  }

  function submitExam(auto) {
    const s = state.session;
    if (!s || s.submitted) return;
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    s.submitted = true;
    const scoreObj = Exam.scoreSession(s);
    Exam.persistMistakes(scoreObj.mistakeTags);
    const entry = Exam.toHistoryEntry(s, scoreObj);
    Store.addHistoryEntry(entry);
    Store.clearInProgress();
    state.lastEntry = entry;
    state.session = null;
    closeModal();
    goto('results');
  }

  // ============================================================
  // MODAL
  // ============================================================
  function openSubmitModal() {
    const s = state.session;
    const answered = s.questions.filter(q => q.userAnswer !== null && q.userAnswer !== undefined).length;
    const unanswered = s.questions.length - answered;
    const flagged = s.questions.filter(q => q.flagged).length;
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    root.appendChild(el(`
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>Submit ${s.mode === 'mock' ? 'exam' : 'practice set'}?</h3>
          <p>${answered} of ${s.questions.length} answered.${unanswered ? ` <strong style="color:var(--accent);">${unanswered} unanswered</strong> — these will be marked incorrect.` : ' All questions answered.'}${flagged ? ` ${flagged} flagged for review.` : ''}</p>
          <p>This cannot be undone. Your results and explanations will be shown immediately after.</p>
          <div class="btn-row" style="margin-top:16px;">
            <button class="btn secondary" data-action="close-modal">Keep working</button>
            <button class="btn accent" data-action="confirm-submit">Submit now</button>
          </div>
        </div>
      </div>
    `));
  }
  function closeModal() { const root = document.getElementById('modal-root'); if (root) root.innerHTML = ''; }

  // ============================================================
  // EVENT DELEGATION
  // ============================================================
  function wireEvents() {
    document.addEventListener('click', (e) => {
      // Modal backdrop click closes the modal; clicks on modal content must NOT
      // be swallowed by stopPropagation (that would also block the modal's own
      // action buttons from reaching this delegated handler), so we detect the
      // backdrop precisely instead of stopping propagation in the HTML.
      if (e.target.classList && e.target.classList.contains('modal-overlay')) { closeModal(); return; }

      const navBtn = e.target.closest('.navlink[data-view]');
      if (navBtn) {
        if (navBtn.dataset.view === 'exam') {
          if (state.session && !state.session.submitted) goto('exam');
          else startMock();
        } else {
          goto(navBtn.dataset.view);
        }
        return;
      }
      const themeBtn = e.target.closest('.theme-toggle button[data-theme]');
      if (themeBtn) { setTheme(themeBtn.dataset.theme); return; }
      const cycleBtn = e.target.closest('[data-action="cycle-theme"]');
      if (cycleBtn) { cycleTheme(); return; }

      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.dataset.action;
      switch (action) {
        case 'start-mock': startMock(); break;
        case 'resume-exam': resumeExam(); break;
        case 'goto-practice': goto('practice-setup'); break;
        case 'goto-weakness-practice': state.practiceDraft.mode = 'weakness'; goto('practice-setup'); break;
        case 'set-practice-mode': state.practiceDraft.mode = t.dataset.mode; render(); break;
        case 'set-practice-topic': state.practiceDraft.topic = t.dataset.topic; render(); break;
        case 'set-practice-difficulty': state.practiceDraft.difficulty = t.dataset.diff; render(); break;
        case 'set-practice-timed': state.practiceDraft.timed = t.dataset.timed === '1'; render(); break;
        case 'start-practice': {
          const countSel = document.getElementById('practice-count');
          if (countSel) state.practiceDraft.count = parseInt(countSel.value, 10);
          startPracticeFromDraft();
          break;
        }
        case 'retry-incorrect': retryIncorrect(); break;
        case 'view-history': {
          const entry = Store.getHistory().find(h => h.id === t.dataset.id);
          if (entry) goto('history-detail', { reviewEntry: entry });
          break;
        }
        case 'toggle-flag': {
          const s = state.session; const q = s.questions[s.currentIndex];
          q.flagged = !q.flagged; autosave(); render();
          break;
        }
        case 'jump-q': { state.session.currentIndex = parseInt(t.dataset.idx, 10); render(); break; }
        case 'prev-q': { state.session.currentIndex = Math.max(0, state.session.currentIndex - 1); render(); break; }
        case 'next-q': { state.session.currentIndex = Math.min(state.session.questions.length - 1, state.session.currentIndex + 1); render(); break; }
        case 'answer-choice': {
          const s = state.session; const q = s.questions[s.currentIndex];
          let val = t.dataset.idx;
          if (val === 'true') val = true; else if (val === 'false') val = false; else val = parseInt(val, 10);
          q.userAnswer = val; autosave(); render();
          break;
        }
        case 'tt-cell': {
          const s = state.session; const q = s.questions[s.currentIndex];
          if (!q.userAnswer) q.userAnswer = {};
          q.userAnswer[parseInt(t.dataset.row, 10)] = t.dataset.val === 'true';
          autosave(); render();
          break;
        }
        case 'open-submit-modal': openSubmitModal(); break;
        case 'close-modal': closeModal(); break;
        case 'confirm-submit': submitExam(false); break;
        case 'confirm-leave': {
          const nav = state._pendingNav;
          closeModal();
          if (nav) {
            state.view = nav.view;
            Object.assign(state, nav.opts || {});
            state._pendingNav = null;
            render();
            window.scrollTo(0, 0);
          }
          break;
        }
      }
    });

    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.actionInput === 'symbolic') {
        const s = state.session; const q = s.questions[s.currentIndex];
        q.userAnswer = t.value;
        const preview = document.getElementById('symbolic-preview');
        if (preview) {
          const parsed = Logic.tryParse(t.value);
          preview.textContent = parsed.ok ? 'Preview: ' + Logic.toStr(parsed.node) : (t.value ? 'Preview: (unparsed — check syntax)' : 'Preview: —');
        }
        autosave();
      }
    });

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.actionSelect === 'proof-law') {
        const s = state.session; const q = s.questions[s.currentIndex];
        if (!q.userAnswer) q.userAnswer = [];
        q.userAnswer[parseInt(t.dataset.step, 10)] = t.value || null;
        autosave();
      }
    });

    window.addEventListener('beforeunload', () => { autosave(); });
  }

  function init() {
    initTheme();
    wireEvents();
    render();
  }

  return { init, goto };
})();

document.addEventListener('DOMContentLoaded', App.init);
