/* 중1 사회 공부방 — 라우팅, 요약, 퀴즈, 오답 노트 */
(function () {
  const app = document.getElementById('app');
  const units = window.UNITS;
  const byId = Object.fromEntries(units.map(u => [u.id, u]));
  units.forEach(u => { u.essay = ((window.ESSAYS || {})[u.id] || []).map(e => Object.assign({ type: "essay" }, e)); });
  // 문제 항목: { uid, set: 'quiz' | 'essay', qi }
  const getQ = it => (byId[it.uid] && byId[it.uid][it.set] ? byId[it.uid][it.set][it.qi] : null);
  const keyOf = it => it.uid + (it.set === 'essay' ? ':e:' : ':') + it.qi;
  function parseKey(k) {
    const p = k.split(':');
    return p.length === 3 ? { uid: p[0], set: 'essay', qi: +p[2] } : { uid: p[0], set: 'quiz', qi: +p[1] };
  }
  const wrongItems = () => getWrong().map(parseKey).filter(getQ);

  // ---------- 저장소 (브라우저에만 저장, 실패해도 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('soc1:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('soc1:' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };
  const getScores = () => store.get('scores', {});
  const getWrong = () => store.get('wrong', []);
  function addWrong(it) {
    const list = getWrong();
    if (!list.includes(keyOf(it))) { list.push(keyOf(it)); store.set('wrong', list); }
  }
  function removeWrong(it) {
    store.set('wrong', getWrong().filter(k => k !== keyOf(it)));
  }

  // ---------- 학습 기록 (연속 학습일, 오늘의 목표) ----------
  const GOAL = 20;
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => fmt(new Date());
  function logActivity(n) {
    const a = store.get('activity', {});
    a[today()] = (a[today()] || 0) + (n || 1);
    store.set('activity', a);
  }
  function streak() {
    const a = store.get('activity', {});
    const d = new Date();
    if (!a[fmt(d)]) d.setDate(d.getDate() - 1);
    let s = 0;
    while (a[fmt(d)]) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  // ---------- 용어 카드 (간격 반복: 라이트너 상자) ----------
  const DAY = 86400000;
  const INTERVALS = [0, 0, 1, 3, 7, 14]; // 상자 번호별 다음 복습까지 날짜
  const allCards = () => units.flatMap(u => u.terms.map(t => ({ id: u.id + '|' + t.t, uid: u.id, t: t.t, d: t.d })));
  const getCardState = () => store.get('cards', {});
  const NEW_PER_DAY = 20; // 전체 복습에서 하루에 새로 보여 줄 카드 수
  function dueCards(uid) {
    const st = getCardState(), now = Date.now();
    const scope = allCards().filter(c => !uid || c.uid === uid);
    const review = scope.filter(c => st[c.id] && st[c.id].due <= now);
    let fresh = scope.filter(c => !st[c.id]);
    if (!uid) {
      // 시험 범위 단원의 새 카드를 먼저 보여 줘요
      fresh = fresh.filter(c => EXAM_RANGE.includes(c.uid)).concat(fresh.filter(c => !EXAM_RANGE.includes(c.uid)));
      const seenToday = Object.values(st).filter(s => s.first === today()).length;
      fresh = fresh.slice(0, Math.max(0, NEW_PER_DAY - seenToday));
    }
    return review.concat(fresh);
  }
  function rateCard(id, knew) {
    const st = getCardState();
    const cur = st[id] || { box: 0 };
    const box = knew ? Math.min(5, Math.max(2, (cur.box || 0) + 1)) : 1;
    st[id] = { box, due: Date.now() + INTERVALS[box] * DAY, first: cur.first || today() };
    store.set('cards', st);
    logActivity(1);
  }

  // ---------- 숙련도 ----------
  const EXAM_RANGE = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  function mastery(u) {
    const sc = getScores();
    const q = sc[u.id] ? sc[u.id].best / sc[u.id].total : 0;
    const e = sc[u.id + ':essay'] ? sc[u.id + ':essay'].best / sc[u.id + ':essay'].total : 0;
    const st = getCardState();
    const c = u.terms.length ? u.terms.filter(t => ((st[u.id + '|' + t.t] || {}).box || 0) >= 3).length / u.terms.length : 0;
    return Math.round((q * 0.35 + e * 0.4 + c * 0.25) * 100);
  }
  const masteryLabel = m => (m === 0 ? '시작 전' : m < 40 ? '익히는 중' : m < 80 ? '거의 다 왔어요' : '숙련');
  function ring(pct, size) {
    size = size || 46;
    const r = (size - 6) / 2, c = 2 * Math.PI * r, h = size / 2;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="숙련도 ${pct}%">
      <circle cx="${h}" cy="${h}" r="${r}" class="ring-bg"/>
      <circle cx="${h}" cy="${h}" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 ${h} ${h})"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${pct}</text></svg>`;
  }

  // 퀴즈 화면의 키보드 단축키
  let keyHandler = null;
  let examTimer = null;
  document.addEventListener('keydown', e => {
    if (!keyHandler || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    keyHandler(e);
  });

  // ---------- 도우미 ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\[심화\]\s*/, '<span class="tag" title="교과서 본문에는 없지만 학교 시험에 나온 내용">심화</span> ')
    .replace(/\[심화\]/g, '<span class="tag">심화</span>');
  const blankify = s => esc(s).replace(/_{2,}/g, '<span class="blank">&nbsp;</span>');
  const norm = s => String(s).replace(/[\s()（）.·,]/g, '').toLowerCase();
  const tone = u => (u.area === '지리' ? 'geo' : 'civ');
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function answerText(q) {
    if (q.type === 'ox') return q.a ? 'O' : 'X';
    if (q.type === 'mc') return q.choices[q.a];
    if (q.type === 'essay') return modelAnswer(q);
    return q.a[0];
  }

  // ---------- 서술형 ----------
  const partPts = p => (p.options ? p.n * p.pts : p.pts);
  const essayTotal = q => q.parts.reduce((s, p) => s + partPts(p), 0);
  const under = s => esc(s).replace(/__(.+?)__/g, '<u>$1</u>').replace(/\n/g, '<br>');
  const hasGroups = (t, k) => k.map(g => g.some(w => t.includes(norm(w))));
  function modelAnswer(q) {
    return q.parts.map(p => (p.label ? p.label + ': ' : '') +
      (p.options ? p.options.slice(0, p.n).map(o => o.a).join(' ') : p.a)).join(' / ');
  }
  function criteriaLines(q) {
    const lines = [];
    const sc = q.parts.map(p => p.options
      ? `${p.label ? p.label + ' ' : ''}1가지당 ${p.pts}점`
      : `${p.label || '정답'} ${p.pts}점`);
    lines.push(sc.join(', ') + ', 이 외 부분점수 없음');
    if (q.similar !== false) lines.push('유사 답안 인정');
    lines.push("문장형식으로 작성할 것('~다')");
    lines.push('문장형식으로 서술하지 않은 경우, 총득점에서 1점 감점');
    return lines;
  }
  // 문장이 '~다'로 끝나는지 검사 (줄마다)
  const isSentence = s => s.split(/\n+/).map(l => l.trim()).filter(Boolean).every(l => /다[.!]?$/.test(l));
  function gradeEssayQ(q, answers) {
    let earned = 0;
    const results = q.parts.map((p, i) => {
      const t = norm(answers[i] || '');
      if (p.options) {
        const matched = p.options.map(o => hasGroups(t, o.k).every(Boolean));
        const cnt = Math.min(p.n, matched.filter(Boolean).length);
        earned += cnt * p.pts;
        return { p, cnt, matched, got: cnt * p.pts };
      }
      const hits = hasGroups(t, p.k);
      const ok = hits.filter(Boolean).length >= (p.need || p.k.length);
      if (ok) earned += p.pts;
      return { p, ok, hits, got: ok ? p.pts : 0 };
    });
    const sentenceOk = answers.every(a => !a.trim() || isSentence(a));
    const raw = earned;
    if (!sentenceOk) earned = Math.max(0, earned - 1);
    const max = essayTotal(q);
    return { results, earned, raw, max, sentenceOk, ok: earned === max };
  }
  const TYPE_LABEL = { ox: 'O / X', mc: '객관식', blank: '빈칸 채우기', essay: '서술형' };

  function updateNav(active) {
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === active));
    const n = getWrong().length;
    const b = document.getElementById('wrongBadge');
    b.hidden = n === 0;
    b.textContent = n;
    const dc = dueCards().length;
    const cb = document.getElementById('cardBadge');
    cb.hidden = dc === 0;
    cb.textContent = dc > 99 ? '99+' : dc;
  }

  // ---------- 라우터 ----------
  function route() {
    const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
    window.scrollTo(0, 0);
    keyHandler = null;
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    if (parts[0] === 'cards') {
      renderCards(byId[parts[1]] ? parts[1] : null);
      updateNav('cards');
    } else if (parts[0] === 'exam') {
      renderExamSetup();
      updateNav('exam');
    } else if (parts[0] === 'search') {
      renderSearch(decodeURIComponent(parts.slice(1).join('/') || ''));
      updateNav('');
    } else if (parts[0] === 'unit' && byId[parts[1]]) {
      if (parts[2] === 'quiz') startUnitQuiz(parts[1], 'quiz');
      else if (parts[2] === 'essay') startUnitQuiz(parts[1], 'essay');
      else renderUnit(parts[1]);
      updateNav('home');
    } else if (parts[0] === 'wrong') {
      if (parts[1] === 'quiz') startWrongQuiz(); else renderWrong();
      updateNav('wrong');
    } else {
      renderHome();
      updateNav('home');
    }
  }

  // ---------- 홈 ----------
  function scorePill(s, emptyText) {
    return s ? `<span class="pill ${s.best === s.total ? 'done' : ''}">${s.best}/${s.total}</span>` : `<span class="pill">${emptyText}</span>`;
  }
  function unitCard(u) {
    const sc = getScores();
    const m = mastery(u);
    return `<a class="card ${tone(u)}" href="#/unit/${u.id}">
      <div class="card-top"><span class="num">${u.no}단원 · ${u.area}</span>${EXAM_RANGE.includes(u.id) ? '<span class="pill exam">시험 범위</span>' : ''}</div>
      <div class="card-body">
        <div><h3>${esc(u.title)}</h3><p>${esc(u.intro)}</p></div>
        ${ring(m)}
      </div>
      <div class="meta"><span>퀴즈 ${scorePill(sc[u.id], '-')}</span><span>서술형 ${scorePill(sc[u.id + ':essay'], '-')}</span><span class="lvl">${masteryLabel(m)}</span></div>
    </a>`;
  }
  function tile(href, icon, title, sub) {
    return `<a class="tile" href="${href}"><span class="ico" aria-hidden="true">${icon}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></a>`;
  }
  function bindSearch(form) {
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = form.querySelector('input').value.trim();
      if (v) location.hash = '#/search/' + encodeURIComponent(v);
    });
  }
  function renderHome() {
    const st = streak();
    const act = store.get('activity', {})[today()] || 0;
    const due = dueCards().length;
    const wrong = getWrong().length;
    const last = byId[store.get('lastUnit', '')];
    const examUnits = units.filter(u => EXAM_RANGE.includes(u.id));
    const examM = Math.round(examUnits.reduce((s, u) => s + mastery(u), 0) / examUnits.length);
    const weakest = examUnits.slice().sort((a, b) => mastery(a) - mastery(b))[0];
    const exams = store.get('exams', []);
    const lastExam = exams[exams.length - 1];
    const h = new Date().getHours();
    const greet = h < 12 ? '좋은 아침이에요' : h < 18 ? '오늘도 힘내요' : '오늘 하루도 수고했어요';
    const geo = units.filter(u => u.area === '지리');
    const civ = units.filter(u => u.area !== '지리');
    app.innerHTML = `
      <section class="dash">
        <div class="dash-main">
          <p class="eyebrow">${greet} 👋</p>
          <h1>${st ? `🔥 ${st}일 연속 학습 중!` : '오늘 첫 학습을 시작해 볼까요?'}</h1>
          <div class="goal">
            <div class="goal-bar"><i style="width:${Math.min(100, act / GOAL * 100)}%"></i></div>
            <span>오늘의 목표 <b>${Math.min(act, GOAL)} / ${GOAL}</b> ${act >= GOAL ? '달성! 🎉' : '문제·카드'}</span>
          </div>
          <form class="search" id="homeSearch" role="search">
            <input type="search" placeholder="개념·용어 검색 (예: 사회법, 관용, 재사회화)" aria-label="개념과 용어 검색">
            <button class="btn" type="submit">검색</button>
          </form>
        </div>
        <a class="exam-card" href="#/exam">
          <span class="eyebrow">2학기 시험 대비</span>
          <b>실전 모의고사</b>
          <span>7~12단원 · 서·논술형 · 45분</span>
          <span class="exam-meter"><i style="width:${examM}%"></i></span>
          <span class="exam-m">시험 범위 숙련도 ${examM}%${lastExam ? ` · 최근 ${lastExam.score}점` : ''}</span>
        </a>
      </section>
      <div class="today">
        ${last ? tile(`#/unit/${last.id}`, '📖', '이어서 학습', `${last.no}. ${last.title}`) : tile('#/unit/c1', '📖', '학습 시작하기', '7. 인간과 사회 생활')}
        ${tile('#/cards', '🃏', '용어 카드 복습', due ? `오늘 복습할 카드 ${due}장` : '오늘 복습 완료!')}
        ${tile(wrong ? '#/wrong/quiz' : '#/wrong', '📝', '오답 다시 풀기', wrong ? `${wrong}문제 남음` : '오답이 없어요')}
        ${weakest ? tile(`#/unit/${weakest.id}`, '🎯', '약한 단원 보강', `${weakest.no}. ${weakest.title} · ${mastery(weakest)}%`) : ''}
      </div>
      <div class="area-title"><h2>일반사회 영역</h2><span>2학기 시험 범위 · 7~12단원</span></div>
      <div class="grid">${civ.map(unitCard).join('')}</div>
      <div class="area-title"><h2>지리 영역</h2><span>세계 여러 지역 · 1~6단원</span></div>
      <div class="grid">${geo.map(unitCard).join('')}</div>
      <p class="legend">숙련도 = 퀴즈 최고 점수 35% + 서술형 최고 점수 40% + 용어 카드 암기 25%</p>`;
    bindSearch(app.querySelector('#homeSearch'));
  }

  // ---------- 단원 요약 ----------
  function tabs(u, active) {
    return `<div class="tabs">
      <a class="${active === 'sum' ? 'active' : ''}" href="#/unit/${u.id}">핵심 요약</a>
      <a class="${active === 'quiz' ? 'active' : ''}" href="#/unit/${u.id}/quiz">퀴즈 (${u.quiz.length})</a>
      <a class="${active === 'essay' ? 'active' : ''}" href="#/unit/${u.id}/essay">서술형 대비 (${u.essay.length})</a>
      <a class="${active === 'cards' ? 'active' : ''}" href="#/cards/${u.id}">용어 카드 (${u.terms.length})</a>
    </div>`;
  }
  function renderUnit(id) {
    const u = byId[id];
    store.set('lastUnit', id);
    const i = units.indexOf(u);
    const prev = units[i - 1], next = units[i + 1];
    const m = mastery(u);
    app.innerHTML = `
      <div class="${tone(u)}">
        <div class="crumb"><a href="#/">홈</a> › ${u.area} 영역</div>
        <div class="unit-head with-ring">
          <div>
            <h1>${u.no}. ${esc(u.title)}</h1>
            <p>${esc(u.intro)}</p>
          </div>
          <div class="unit-m">${ring(m, 64)}<span>${masteryLabel(m)}</span></div>
        </div>
        ${tabs(u, 'sum')}
        ${u.sections.map((s, k) => `
          <section class="section">
            <h2><span class="idx">${k + 1}</span>${esc(s.h)}</h2>
            <ul>${s.points.map(p => `<li>${rich(p)}</li>`).join('')}</ul>
          </section>`).join('')}
        <div class="row terms-row">
          <div><h2 class="terms-title">핵심 용어</h2>
          <p class="terms-help">뜻을 먼저 떠올려 본 뒤 카드를 눌러 확인하세요.</p></div>
          <a class="btn" href="#/cards/${u.id}">🃏 카드로 외우기</a>
        </div>
        <div class="terms">
          ${u.terms.map(t => `<button class="term" type="button"><b>${esc(t.t)}</b><span>${esc(t.d)}</span></button>`).join('')}
        </div>
        <div class="cta">
          <a class="btn primary" href="#/unit/${u.id}/quiz">퀴즈 풀러 가기 →</a>
          ${u.essay.length ? `<a class="btn" href="#/unit/${u.id}/essay">서술형 대비 →</a>` : ''}
        </div>
        <div class="pager">
          ${prev ? `<a href="#/unit/${prev.id}">← ${prev.no}. ${esc(prev.title)}</a>` : '<span></span>'}
          ${next ? `<a href="#/unit/${next.id}">${next.no}. ${esc(next.title)} →</a>` : '<span></span>'}
        </div>
      </div>`;
    app.querySelectorAll('.term').forEach(b => b.addEventListener('click', () => b.classList.toggle('open')));
  }

  // ---------- 퀴즈 ----------
  function startUnitQuiz(id, set) {
    const u = byId[id];
    store.set('lastUnit', id);
    const isEssay = set === 'essay';
    runQuiz({
      title: `${u.no}. ${u.title}${isEssay ? ' · 서술형' : ''}`,
      toneClass: tone(u),
      items: u[set].map((_, qi) => ({ uid: id, set, qi })),
      backHref: `#/unit/${id}`,
      backLabel: '요약 보기',
      scoreKey: isEssay ? id + ':essay' : id,
      keepOrder: isEssay,
      header: tabs(u, set)
    });
  }
  function startWrongQuiz() {
    const items = wrongItems();
    if (!items.length) { location.hash = '#/wrong'; return; }
    runQuiz({ title: '오답 노트 다시 풀기', toneClass: 'geo', items, backHref: '#/wrong', backLabel: '오답 노트' });
  }

  function runQuiz(opts) {
    const qs = (opts.keepOrder ? opts.items.slice() : shuffle(opts.items)).map(it => {
      const q = getQ(it);
      return { ...it, q, order: q.type === 'mc' ? shuffle(q.choices.map((_, i) => i)) : null };
    });
    let idx = 0, correct = 0, pts = 0, maxPts = 0;
    const allEssay = qs.every(p => p.q.type === 'essay');
    const missed = [];

    function show() {
      const p = qs[idx], q = p.q, u = byId[p.uid];
      let area = '';
      if (q.type === 'ox') {
        area = `<div class="ox"><button type="button" data-v="o">O</button><button type="button" data-v="x">X</button></div>`;
      } else if (q.type === 'mc') {
        area = `<div class="choices">${p.order.map((ci, n) => `<button type="button" data-v="${ci}"><span class="n">${'①②③④⑤'[n]}</span><span>${esc(q.choices[ci])}</span></button>`).join('')}</div>`;
      } else if (q.type === 'essay') {
        area = `
          ${q.passage ? `<div class="passage">${under(q.passage)}</div>` : ''}
          ${q.box ? `<div class="bogi"><b>&lt;보기&gt;</b><div>${esc(q.box)}</div></div>` : ''}
          <table class="criteria"><tr><th>채점<br>기준</th><td>${criteriaLines(q).map(l => '- ' + esc(l)).join('<br>')}</td></tr></table>
          <form class="essay">
            ${q.parts.map((p, i) => `
              <label class="part">
                ${p.label || p.options ? `<span class="part-label">${esc(p.label || '답안')}${p.options ? ` · ${p.n}가지` : ''} <em>${partPts(p)}점</em></span>` : ''}
                <textarea rows="${p.options ? 4 : p.pts >= 6 ? 4 : 2}" placeholder="${p.options ? `${p.n}가지를 한 줄에 하나씩, '~다'로 끝나는 문장으로 쓰세요.` : "'~다'로 끝나는 문장으로 쓰세요."}" data-i="${i}"></textarea>
              </label>`).join('')}
            <div class="essay-row"><span class="count"></span><button class="btn primary" type="submit">답안 제출</button></div>
          </form>`;
      } else {
        area = `<form class="fill"><input type="text" autocomplete="off" placeholder="정답을 입력하세요" aria-label="정답"><button class="btn primary" type="submit">확인</button></form>`;
      }
      app.innerHTML = `
        <div class="${opts.toneClass}">
          <div class="crumb"><a href="${opts.backHref}">← ${esc(opts.backLabel)}</a></div>
          ${opts.header || ''}
          <div class="quiz-top"><span>${esc(opts.title)}</span><span>${idx + 1} / ${qs.length}</span></div>
          <div class="bar"><i style="width:${(idx / qs.length) * 100}%"></i></div>
          <div class="qcard">
            <div class="qtype">${TYPE_LABEL[q.type]}${opts.scoreKey ? '' : ` · ${u.no}단원`}${q.type === 'ox' ? '<span class="kbd-hint">키보드 O / X</span>' : q.type === 'mc' ? '<span class="kbd-hint">키보드 1~4</span>' : ''}${q.tag ? ' <span class="tag" title="교과서 본문에는 없지만 학교 시험에 나온 내용">심화 · 교과서 밖</span>' : ''}</div>
            <p class="qtext">${q.type === 'essay' ? `${idx + 1}. ` : ''}${blankify(q.q)}${q.type === 'essay' ? ` <span class="pts">[${essayTotal(q)}점]</span>` : ''}</p>
            ${area}
            <div id="fb"></div>
          </div>
        </div>`;

      if (q.type === 'essay') {
        const form = app.querySelector('.essay');
        const tas = [...form.querySelectorAll('textarea')];
        const count = form.querySelector('.count');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const empty = tas.find(t => !t.value.trim());
          if (empty) { count.textContent = '비어 있는 답안 칸이 있어요.'; empty.focus(); return; }
          const r = gradeEssayQ(q, tas.map(t => t.value));
          tas.forEach((t, i) => {
            t.readOnly = true;
            const res = r.results[i];
            const full = res.p.options ? res.cnt === res.p.n : res.ok;
            t.classList.add(full ? 'is-correct' : 'is-wrong');
          });
          form.querySelector('button').disabled = true;
          count.textContent = '';
          gradeEssay(r);
        });
      } else if (q.type === 'blank') {
        const form = app.querySelector('.fill');
        const input = form.querySelector('input');
        input.focus();
        form.addEventListener('submit', e => {
          e.preventDefault();
          if (!input.value.trim()) { input.focus(); return; }
          const ok = q.a.some(a => norm(a) === norm(input.value));
          input.disabled = true; form.querySelector('button').disabled = true;
          input.classList.add(ok ? 'is-correct' : 'is-wrong');
          grade(ok);
        });
      } else {
        const btns = [...app.querySelectorAll('[data-v]')];
        keyHandler = e => {
          if (btns[0].disabled) return;
          const k = e.key.toLowerCase();
          let target = null;
          if (q.type === 'ox') target = (k === 'o' || k === '1') ? btns[0] : (k === 'x' || k === '2') ? btns[1] : null;
          else if (/^[1-5]$/.test(k)) target = btns[+k - 1];
          if (target) { e.preventDefault(); target.click(); }
        };
        app.querySelectorAll('[data-v]').forEach(btn => btn.addEventListener('click', () => {
          const v = btn.dataset.v;
          const ok = q.type === 'ox' ? (v === 'o') === q.a : +v === q.a;
          app.querySelectorAll('[data-v]').forEach(b => {
            b.disabled = true;
            const isAns = q.type === 'ox' ? (b.dataset.v === 'o') === q.a : +b.dataset.v === q.a;
            if (isAns) b.classList.add('is-correct');
          });
          if (!ok) btn.classList.add('is-wrong');
          grade(ok);
        }));
      }
    }

    function record(ok) {
      const p = qs[idx];
      if (ok) { correct++; removeWrong(p); } else { missed.push(p); addWrong(p); }
      logActivity(1);
      updateNav(opts.scoreKey ? 'home' : 'wrong');
    }
    function nextButton() {
      const last = idx === qs.length - 1;
      return `<div class="next-row"><button class="btn primary" type="button" id="next">${last ? '결과 보기' : '다음 문제 →'}</button></div>`;
    }
    function bindNext() {
      const nb = app.querySelector('#next');
      nb.focus({ preventScroll: true });
      nb.addEventListener('click', () => { idx++; if (idx < qs.length) { show(); window.scrollTo(0, 0); } else finish(); });
    }

    function grade(ok) {
      const q = qs[idx].q;
      record(ok);
      app.querySelector('#fb').innerHTML = `
        <div class="feedback ${ok ? 'ok' : 'no'}">
          <h4>${ok ? '정답이에요! 🎉' : `아쉬워요. 정답은 「${esc(answerText(q))}」`}</h4>
          <p>${rich(q.ex)}</p>
        </div>${nextButton()}`;
      bindNext();
    }

    function gradeEssay(r) {
      const q = qs[idx].q;
      record(r.ok);
      pts += r.earned; maxPts += r.max;
      const rows = r.results.map(res => {
        const p = res.p, name = p.label || '답안';
        if (p.options) {
          const names = p.options.filter((o, i) => res.matched[i] && o.a.includes(':')).map(o => o.a.split(':')[0]).slice(0, p.n);
          return `<li class="${res.cnt === p.n ? 'hit' : 'miss'}">${esc(name)}: ${res.cnt}/${p.n}가지 인정 → ${res.got}/${partPts(p)}점${names.length ? ` (${esc(names.join(', '))})` : ''}</li>`;
        }
        return `<li class="${res.ok ? 'hit' : 'miss'}">${res.ok ? '✓' : '✗'} ${esc(name)} → ${res.got}/${p.pts}점</li>`;
      }).join('');
      app.querySelector('#fb').innerHTML = `
        <div class="feedback ${r.ok ? 'ok' : 'no'}">
          <h4>${r.earned} / ${r.max}점 ${r.ok ? '🎉 만점이에요!' : ''}</h4>
          <ul class="kw col">${rows}</ul>
          ${r.sentenceOk ? '' : `<p class="penalty">⚠ '~다'로 끝나지 않은 문장이 있어 총득점에서 1점 감점했어요. (${r.raw}점 → ${r.earned}점)</p>`}
        </div>
        <div class="model">
          <h4>모범 답안</h4>
          ${q.parts.map(p => `<p>${p.label ? `<b>${esc(p.label)}</b> ` : ''}${p.options
            ? `<span class="muted">(다음 중 ${p.n}가지)</span><br>${p.options.map(o => '· ' + esc(o.a)).join('<br>')}`
            : esc(p.a)}</p>`).join('')}
        </div>
        <p class="note">※ 핵심어로 자동 채점한 결과예요. 표현이 달라도 뜻이 맞으면 유사 답안으로 인정될 수 있으니 선생님께 확인받으세요.</p>
        ${nextButton()}`;
      bindNext();
    }

    function finish() {
      const total = allEssay ? maxPts : qs.length;
      const got = allEssay ? pts : correct;
      if (opts.scoreKey) {
        const scores = getScores();
        const prev = scores[opts.scoreKey];
        scores[opts.scoreKey] = { best: Math.max(prev && prev.total === total ? prev.best : 0, got), total, last: got };
        store.set('scores', scores);
      }
      const rate = got / total;
      const msg = rate === 1 ? '완벽해요! 이 단원은 자신 있게 넘어가도 좋아요.'
        : rate >= 0.7 ? '잘했어요! 틀린 문제만 한 번 더 확인해 볼까요?'
        : '요약을 다시 읽고 도전해 봐요. 충분히 할 수 있어요!';
      app.innerHTML = `
        <div class="${opts.toneClass}">
          <div class="qcard result">
            <div class="qtype">${esc(opts.title)}</div>
            <div class="score">${got}<small> / ${total}${allEssay ? '점' : ''}</small></div>
            <p>${msg}</p>
            <div class="cta">
              ${missed.length ? '<button class="btn primary" type="button" id="retryMissed">틀린 문제만 다시</button>' : ''}
              <button class="btn" type="button" id="retryAll">처음부터 다시</button>
              <a class="btn" href="${opts.backHref}">${esc(opts.backLabel)}</a>
              <a class="btn" href="#/">단원 목록</a>
            </div>
          </div>
        </div>`;
      const rm = app.querySelector('#retryMissed');
      if (rm) rm.addEventListener('click', () => runQuiz({ ...opts, items: missed.map(m => ({ uid: m.uid, set: m.set, qi: m.qi })), scoreKey: null, title: opts.title + ' · 틀린 문제' }));
      app.querySelector('#retryAll').addEventListener('click', () => runQuiz(opts));
      window.scrollTo(0, 0);
    }

    show();
  }

  // ---------- 오답 노트 ----------
  function renderWrong() {
    const items = wrongItems();
    if (!items.length) {
      app.innerHTML = `
        <div class="unit-head"><h1>오답 노트</h1></div>
        <div class="empty" style="margin-top:20px">
          <p>아직 틀린 문제가 없어요.<br>단원 퀴즈를 풀면 틀린 문제가 여기에 모여요.</p>
          <a class="btn" href="#/">단원 목록으로</a>
        </div>`;
      return;
    }
    items.sort((a, b) => units.indexOf(byId[a.uid]) - units.indexOf(byId[b.uid]) || (a.set === b.set ? 0 : a.set === 'quiz' ? -1 : 1) || a.qi - b.qi);
    app.innerHTML = `
      <div class="unit-head"><h1>오답 노트</h1><p>틀린 문제 ${items.length}개 · 다시 풀어서 맞히면 목록에서 빠져요.</p></div>
      <div class="row" style="margin-top:16px">
        <a class="btn primary geo" href="#/wrong/quiz">오답 모두 다시 풀기</a>
        <button class="link-btn" type="button" id="clearWrong">오답 노트 비우기</button>
      </div>
      ${items.map(it => {
        const u = byId[it.uid], q = getQ(it);
        const detail = q.type === 'essay'
          ? `<b>모범 답안 [${essayTotal(q)}점]</b><br>${q.parts.map(p => (p.label ? `<b>${esc(p.label)}</b> ` : '') + (p.options
              ? `(다음 중 ${p.n}가지) ${p.options.map(o => esc(o.a)).join(' / ')}`
              : esc(p.a))).join('<br>')}`
          : `<b>정답: ${esc(answerText(q))}</b><br>${rich(q.ex)}`;
        return `<div class="wrong-item ${tone(u)}">
          <div class="u">${u.no}단원 · ${esc(u.title)}${q.type === 'essay' ? ' · 서술형' : ''}</div>
          <div class="q">${blankify(q.q)}</div>
          ${q.type === 'essay' && q.passage ? `<div class="passage small">${under(q.passage)}</div>` : ''}
          ${q.type === 'essay' && q.box ? `<div class="opts">&lt;보기&gt; ${esc(q.box)}</div>` : ''}
          ${q.type === 'mc' ? `<div class="opts">${q.choices.map((c, n) => `${'①②③④⑤'[n]} ${esc(c)}`).join('&nbsp;&nbsp; ')}</div>` : ''}
          <details><summary>${q.type === 'essay' ? '모범 답안 보기' : '정답과 해설 보기'}</summary><p>${detail}</p></details>
        </div>`;
      }).join('')}`;
    app.querySelector('#clearWrong').addEventListener('click', () => {
      if (confirm('오답 노트를 모두 비울까요?')) { store.set('wrong', []); renderWrong(); updateNav('wrong'); }
    });
  }

  // ---------- 용어 카드 ----------
  function renderCards(uid) {
    const u = uid ? byId[uid] : null;
    const scopeTitle = u ? `${u.no}. ${u.title}` : '전체 단원';
    const toneClass = u ? tone(u) : 'civ';
    const st = getCardState();
    const pool = allCards().filter(c => !uid || c.uid === uid);
    const due = dueCards(uid);
    const learned = pool.filter(c => ((st[c.id] || {}).box || 0) >= 3).length;
    const header = u ? tabs(u, 'cards') : '';

    function intro() {
      app.innerHTML = `
        <div class="${toneClass}">
          <div class="crumb"><a href="${u ? '#/unit/' + u.id : '#/'}">← ${u ? '요약 보기' : '홈'}</a></div>
          ${header}
          <div class="unit-head"><h1>🃏 용어 카드 · ${esc(scopeTitle)}</h1>
            <p>뜻을 떠올린 뒤 카드를 뒤집어 확인하세요. '알아요'를 누른 카드는 1일 → 3일 → 7일 → 14일 뒤에 다시 나와요(간격 반복).</p></div>
          <div class="stats">
            <div class="stat"><b>${due.length}</b><span>오늘 복습할 카드</span></div>
            <div class="stat"><b>${learned}/${pool.length}</b><span>외운 카드(3단계 이상)</span></div>
          </div>
          ${!u ? `<div class="chips">${units.map(x => {
            const d = dueCards(x.id).length;
            return `<a class="chip ${tone(x)}" href="#/cards/${x.id}">${x.no}. ${esc(x.title)}${d ? ` <b>${d}</b>` : ''}</a>`;
          }).join('')}</div>` : ''}
          <div class="cta">
            ${due.length ? `<button class="btn primary" type="button" id="startDue">복습 시작 (${Math.min(due.length, 30)}장)</button>` : '<span class="done-msg">오늘 복습할 카드를 모두 끝냈어요! 🎉</span>'}
            <button class="btn" type="button" id="startAll">전체 카드 연습하기</button>
          </div>
        </div>`;
      const sd = app.querySelector('#startDue');
      if (sd) sd.addEventListener('click', () => session(shuffle(due).slice(0, 30)));
      app.querySelector('#startAll').addEventListener('click', () => session(shuffle(pool).slice(0, 40)));
    }

    function session(queue) {
      const total = queue.length;
      const seenAgain = {};
      let doneCount = 0, knewCount = 0;
      function show() {
        if (!queue.length) return finish();
        const c = queue[0], cu = byId[c.uid];
        const box = (getCardState()[c.id] || {}).box || 0;
        app.innerHTML = `
          <div class="${toneClass}">
            <div class="crumb"><a href="#/cards${uid ? '/' + uid : ''}">← 카드 목록</a></div>
            <div class="quiz-top"><span>${esc(scopeTitle)} · 용어 카드</span><span>${doneCount} / ${total}</span></div>
            <div class="bar"><i style="width:${(doneCount / total) * 100}%"></i></div>
            <button class="flash ${tone(cu)}" type="button" id="flash" aria-live="polite">
              <span class="flash-meta">${cu.no}단원 · ${'●'.repeat(box)}${'○'.repeat(5 - box)}</span>
              <span class="flash-front">${esc(c.t)}</span>
              <span class="flash-back">${esc(c.d)}</span>
              <span class="flash-hint">눌러서 뒤집기 · 스페이스바</span>
            </button>
            <div class="flash-actions">
              <button class="btn again" type="button" id="again" disabled>😵 다시 볼래요 <kbd>1</kbd></button>
              <button class="btn primary" type="button" id="knew" disabled>😎 알아요 <kbd>2</kbd></button>
            </div>
          </div>`;
        const flash = app.querySelector('#flash');
        const againB = app.querySelector('#again'), knewB = app.querySelector('#knew');
        const flip = () => { flash.classList.add('flipped'); againB.disabled = false; knewB.disabled = false; };
        flash.addEventListener('click', () => { if (flash.classList.contains('flipped')) flash.classList.remove('flipped'); else flip(); });
        const answer = knew => {
          rateCard(c.id, knew);
          queue.shift();
          if (knew) { doneCount++; knewCount++; }
          else if ((seenAgain[c.id] = (seenAgain[c.id] || 0) + 1) <= 2) queue.push(c);
          else doneCount++;
          updateNav('cards');
          show();
        };
        againB.addEventListener('click', () => answer(false));
        knewB.addEventListener('click', () => answer(true));
        keyHandler = e => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
          else if (e.key === '1' && !againB.disabled) answer(false);
          else if (e.key === '2' && !knewB.disabled) answer(true);
        };
      }
      function finish() {
        keyHandler = null;
        app.innerHTML = `
          <div class="${toneClass}"><div class="qcard result">
            <div class="qtype">${esc(scopeTitle)} · 용어 카드</div>
            <div class="score">${knewCount}<small> / ${total}</small></div>
            <p>한 번에 알았던 카드 수예요. 헷갈린 카드는 내일 다시 나와요.</p>
            <div class="cta"><a class="btn primary" href="#/cards${uid ? '/' + uid : ''}">카드 목록</a><a class="btn" href="#/">홈</a></div>
          </div></div>`;
      }
      show();
    }
    intro();
  }

  // ---------- 실전 모의고사 ----------
  function renderExamSetup() {
    const hist = store.get('exams', []);
    app.innerHTML = `
      <div class="civ">
        <div class="unit-head"><h1>📄 실전 모의고사</h1>
          <p>학교 정기시험처럼 서·논술형 문제를 한 번에 풀고, 끝나면 한꺼번에 채점해요. 문장형식('~다')이 아니면 1점 감점돼요.</p></div>
        <form class="exam-setup" id="examForm">
          <fieldset><legend>시험 범위</legend>
            <div class="chips">${units.map(u => `<label class="chip check ${tone(u)}"><input type="checkbox" name="u" value="${u.id}" ${EXAM_RANGE.includes(u.id) ? 'checked' : ''}> ${u.no}. ${esc(u.title)}</label>`).join('')}</div>
          </fieldset>
          <fieldset><legend>문항 수</legend>
            <div class="chips">${[5, 10, 13].map(n => `<label class="chip check"><input type="radio" name="n" value="${n}" ${n === 13 ? 'checked' : ''}> ${n}문항</label>`).join('')}</div>
          </fieldset>
          <fieldset><legend>시간 제한</legend>
            <div class="chips">${[[45, '45분 (실전)'], [25, '25분'], [0, '제한 없음']].map(([v, l]) => `<label class="chip check"><input type="radio" name="t" value="${v}" ${v === 45 ? 'checked' : ''}> ${l}</label>`).join('')}</div>
          </fieldset>
          <div class="cta"><button class="btn primary" type="submit">시험 시작하기</button></div>
        </form>
        ${hist.length ? `<h2 class="terms-title">최근 기록</h2><div class="hist">${hist.slice(-6).reverse().map(h => `<div class="hist-row"><span>${esc(h.date)}</span><span>${h.n}문항</span><b>${h.score}점</b><span class="muted">(${h.got}/${h.total})</span></div>`).join('')}</div>` : ''}
      </div>`;
    app.querySelector('#examForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const uids = [...f.querySelectorAll('input[name=u]:checked')].map(i => i.value);
      if (!uids.length) { alert('시험 범위를 하나 이상 골라 주세요.'); return; }
      startExam(uids, +f.querySelector('input[name=n]:checked').value, +f.querySelector('input[name=t]:checked').value);
    });
  }

  function startExam(uids, count, minutes) {
    // 단원별로 골고루 뽑기
    const lists = uids.map(id => shuffle(byId[id].essay.map((_, qi) => ({ uid: id, set: 'essay', qi }))));
    const picked = [];
    for (let r = 0; picked.length < count && lists.some(l => l.length); r++) {
      lists.forEach(l => { if (l.length && picked.length < count) picked.push(l.shift()); });
    }
    picked.sort((a, b) => units.indexOf(byId[a.uid]) - units.indexOf(byId[b.uid]));
    const qs = picked.map(it => ({ ...it, q: getQ(it) }));
    const totalPts = qs.reduce((s, p) => s + essayTotal(p.q), 0);
    const endAt = minutes ? Date.now() + minutes * 60000 : 0;

    app.innerHTML = `
      <div class="civ exam-paper">
        <div class="paper-head">
          <b>2학기 대비 사회 모의고사</b>
          <span>서·논술형 ${qs.length}문항 (${totalPts}점) · ${minutes ? minutes + '분' : '시간 제한 없음'}</span>
        </div>
        <div class="exam-bar"><span id="examLeft">${minutes ? '' : '⏱ 제한 없음'}</span><span id="examProg">0 / ${qs.length} 작성</span><button class="btn primary" type="button" id="submitTop">제출하기</button></div>
        <form id="paper">
          ${qs.map((p, n) => {
            const q = p.q, u = byId[p.uid];
            return `<section class="qcard exam-q" id="eq${n}">
              <div class="qtype">${u.no}단원 · ${esc(u.title)}${q.tag ? ' <span class="tag">심화 · 교과서 밖</span>' : ''}</div>
              <p class="qtext">${n + 1}. ${blankify(q.q)} <span class="pts">[${essayTotal(q)}점]</span></p>
              ${q.passage ? `<div class="passage">${under(q.passage)}</div>` : ''}
              ${q.box ? `<div class="bogi"><b>&lt;보기&gt;</b><div>${esc(q.box)}</div></div>` : ''}
              <table class="criteria"><tr><th>채점<br>기준</th><td>${criteriaLines(q).map(l => '- ' + esc(l)).join('<br>')}</td></tr></table>
              ${q.parts.map((pt, i) => `<label class="part">
                ${pt.label || pt.options ? `<span class="part-label">${esc(pt.label || '답안')}${pt.options ? ` · ${pt.n}가지` : ''} <em>${partPts(pt)}점</em></span>` : ''}
                <textarea rows="${pt.options ? 4 : 2}" data-q="${n}" data-i="${i}" placeholder="'~다'로 끝나는 문장으로 쓰세요."></textarea>
              </label>`).join('')}
            </section>`;
          }).join('')}
          <div class="cta center"><button class="btn primary" type="submit">답안 제출하기</button></div>
        </form>
      </div>`;

    const paper = app.querySelector('#paper');
    const prog = app.querySelector('#examProg');
    const updateProg = () => {
      const doneQ = qs.filter((_, n) => [...paper.querySelectorAll(`textarea[data-q="${n}"]`)].every(t => t.value.trim())).length;
      prog.textContent = `${doneQ} / ${qs.length} 작성`;
    };
    paper.addEventListener('input', updateProg);
    let submitted = false;
    const submit = (force) => {
      if (submitted) return;
      const empty = [...paper.querySelectorAll('textarea')].filter(t => !t.value.trim()).length;
      if (!force && empty && !confirm(`비어 있는 답안 칸이 ${empty}개 있어요. 그래도 제출할까요?`)) return;
      submitted = true;
      if (examTimer) { clearInterval(examTimer); examTimer = null; }
      gradeExam(qs, paper, totalPts);
    };
    paper.addEventListener('submit', e => { e.preventDefault(); submit(false); });
    app.querySelector('#submitTop').addEventListener('click', () => submit(false));
    if (endAt) {
      const left = app.querySelector('#examLeft');
      const tick = () => {
        const ms = endAt - Date.now();
        if (ms <= 0) { left.textContent = '⏱ 시간 종료'; submit(true); return; }
        const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
        left.textContent = `⏱ ${m}:${String(s).padStart(2, '0')} 남음`;
        left.classList.toggle('hurry', ms < 5 * 60000);
      };
      tick();
      examTimer = setInterval(tick, 1000);
    }
  }

  function gradeExam(qs, paper, totalPts) {
    let got = 0;
    const rows = qs.map((p, n) => {
      const answers = [...paper.querySelectorAll(`textarea[data-q="${n}"]`)].map(t => t.value);
      const r = gradeEssayQ(p.q, answers);
      got += r.earned;
      if (r.ok) removeWrong(p); else addWrong(p);
      return { p, r, answers };
    });
    logActivity(qs.length);
    const score = Math.round(got / totalPts * 100);
    const hist = store.get('exams', []);
    hist.push({ date: today(), n: qs.length, got, total: totalPts, score });
    store.set('exams', hist.slice(-30));
    updateNav('exam');
    window.scrollTo(0, 0);
    app.innerHTML = `
      <div class="civ">
        <div class="qcard result">
          <div class="qtype">실전 모의고사 결과</div>
          <div class="score">${score}<small>점</small></div>
          <p>${got} / ${totalPts}점 (100점 환산 ${score}점) · ${qs.length}문항 중 만점 ${rows.filter(x => x.r.ok).length}문항</p>
          <div class="cta"><a class="btn primary" href="#/exam">다시 응시하기</a><a class="btn" href="#/wrong">오답 노트</a><a class="btn" href="#/">홈</a></div>
        </div>
        <h2 class="terms-title">문항별 채점</h2>
        ${rows.map(({ p, r, answers }, n) => {
          const q = p.q, u = byId[p.uid];
          return `<details class="exam-res ${r.ok ? 'ok' : 'no'}">
            <summary><span class="badge-score">${r.earned}/${r.max}</span> ${n + 1}. ${esc(q.q)} <small class="muted">${u.no}단원</small></summary>
            <div class="exam-res-body">
              ${!r.sentenceOk ? `<p class="penalty">⚠ '~다'로 끝나지 않은 문장이 있어 1점 감점했어요.</p>` : ''}
              ${q.parts.map((pt, i) => {
                const res = r.results[i];
                const full = pt.options ? res.cnt === pt.n : res.ok;
                return `<div class="cmp">
                  <div class="cmp-label">${esc(pt.label || '답안')} · ${res.got}/${partPts(pt)}점 ${full ? '✓' : '✗'}</div>
                  <div class="cmp-mine"><span>내 답안</span>${esc(answers[i] || '(빈칸)').replace(/\n/g, '<br>')}</div>
                  <div class="cmp-model"><span>모범 답안</span>${pt.options ? `(다음 중 ${pt.n}가지)<br>` + pt.options.map(o => '· ' + esc(o.a)).join('<br>') : esc(pt.a)}</div>
                </div>`;
              }).join('')}
            </div>
          </details>`;
        }).join('')}
        <p class="note">※ 핵심어 자동 채점이에요. 뜻이 같은 다른 표현은 유사 답안으로 인정될 수 있으니 선생님께 확인받으세요.</p>
      </div>`;
  }

  // ---------- 검색 ----------
  function renderSearch(q) {
    const nq = norm(q);
    const strip = s => String(s).replace(/\*\*/g, '').replace(/\[심화\]\s*/g, '');
    const hl = s => {
      const text = strip(s);
      if (!q) return esc(text);
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    };
    const groups = nq ? units.map(u => {
      const hits = [];
      u.terms.forEach(t => { if (norm(t.t + t.d).includes(nq)) hits.push({ kind: '용어', html: `<b>${hl(t.t)}</b> — ${hl(t.d)}`, href: `#/unit/${u.id}` }); });
      u.sections.forEach(s => s.points.forEach(p => { if (norm(strip(p)).includes(nq)) hits.push({ kind: s.h, html: hl(p), href: `#/unit/${u.id}` }); }));
      u.essay.forEach(e => { if (norm(e.q + (e.passage || '')).includes(nq)) hits.push({ kind: '서술형', html: hl(e.q), href: `#/unit/${u.id}/essay` }); });
      return { u, hits };
    }).filter(g => g.hits.length) : [];
    const count = groups.reduce((s, g) => s + g.hits.length, 0);
    app.innerHTML = `
      <div class="unit-head"><h1>🔎 검색</h1></div>
      <form class="search" id="searchPage" role="search">
        <input type="search" value="${esc(q)}" placeholder="개념·용어 검색" aria-label="개념과 용어 검색">
        <button class="btn" type="submit">검색</button>
      </form>
      <p class="muted">${q ? `'${esc(q)}' 검색 결과 ${count}개` : '찾고 싶은 개념이나 용어를 입력하세요.'}</p>
      ${groups.map(g => `<section class="section ${tone(g.u)}">
        <h2><a href="#/unit/${g.u.id}">${g.u.no}. ${esc(g.u.title)}</a></h2>
        <ul class="search-hits">${g.hits.slice(0, 12).map(h => `<li><a href="${h.href}"><small>${esc(h.kind)}</small>${h.html}</a></li>`).join('')}</ul>
      </section>`).join('')}
      ${q && !count ? '<div class="empty"><p>검색 결과가 없어요. 다른 낱말로 찾아보세요.</p></div>' : ''}`;
    const f = app.querySelector('#searchPage');
    bindSearch(f);
    if (!q) f.querySelector('input').focus();
  }

  window.addEventListener('hashchange', route);
  route();
})();
