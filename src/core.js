const Core = (() => {
  const ACCTS = [
    { id: 'ibk', name: '기업은행', use: '급여' },
    { id: 'kakao', name: '카카오뱅크', use: '용역' },
    { id: 'kb', name: '국민은행', use: '사업자' },
    { id: 'kbank', name: '케이뱅크', use: '통장협의회 급여' },
  ];
  const FIXED = ['자동차할부', '카드대금', '대출 상환', '학자금 상환'];
  const IN_CATS = ['급여', '용역대금', '사업수입', '통장협의회 수당', '이자', '기타수입'];
  const OUT_CATS = ['생활비', '세금', '사업경비', '기타지출'];
  const COLORS = {
    acct: { ibk: '#1f5fbf', kakao: '#e0b000', kb: '#8a5a2b', kbank: '#7b3fbf' },
    tint: { ibk: 'DCE8F8', kakao: 'FFF1BF', kb: 'EEDFCF', kbank: 'E8DCF6' },
    type: { in: '#1565c0', out: '#d32f2f', tr: '#757575' },
    status: { 미납: '#d32f2f', 예정: '#ef8a00', 완료: '#2e7d32', 대기: '#9e9e9e', 해당없음: '#9e9e9e' },
    statusFill: { 미납: 'F8D0D0', 예정: 'FFE3BF', 완료: 'D5EDD7', 해당없음: 'EEEEEE' },
    cat: { 자동차할부: '#3949ab', 카드대금: '#e53935', '대출 상환': '#8e24aa', '학자금 상환': '#00897b', 생활비: '#fb8c00', 세금: '#6d4c41', 사업경비: '#1e88e5', 기타지출: '#757575',
      급여: '#1565c0', 용역대금: '#f9a825', 사업수입: '#795548', '통장협의회 수당': '#7b1fa2', 이자: '#00838f', 기타수입: '#9e9e9e' },
    pal: ['#c62828', '#2e7d32', '#ad1457', '#0277bd', '#ef6c00', '#4e342e', '#6a1b9a', '#00695c', '#9e9d24', '#37474f'],
  };
  const PAL_ACCT = ['#1f5fbf', '#e0b000', '#8a5a2b', '#7b3fbf'];
  const PAL_CARD = ['#37474f', '#c2185b', '#00796b', '#5d4037', '#455a64', '#ad1457'];
  function acctColor(s, id) {
    if (COLORS.acct[id]) return COLORS.acct[id];
    const ci = (s.cards || []).findIndex(c => c.id === id); if (ci >= 0) return PAL_CARD[ci % PAL_CARD.length];
    const ai = s.accounts.findIndex(a => a.id === id); return ai >= 0 ? PAL_ACCT[ai % 4] : '#757575';
  }
  function catColor(name) { if (COLORS.cat[name]) return COLORS.cat[name]; let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS.pal[h % COLORS.pal.length]; }

  function defaultSettings(today) {
    return {
      startDate: today.slice(0, 8) + '01',
      accounts: ACCTS.map(a => ({ ...a, start: 0 })),
      fixed: FIXED.map((n, i) => ({ id: 'f' + (i + 1), name: n, amount: 0, day: '', acct: 'ibk', end: '', variable: n === '카드대금', card: '' })),
      cards: [],
      inCats: IN_CATS.slice(),
      outCats: OUT_CATS.slice(),
    };
  }

  const monthOf = d => d.slice(0, 7);
  const toInt = v => { const n = Math.trunc(Number(String(v).replace(/[^0-9-]/g, ''))); return Number.isFinite(n) ? n : 0; };
  const sortTx = txs => txs.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0));
  const outCats = s => [...s.fixed.filter(f => !f.card).map(f => f.name), ...s.outCats.filter(c => !s.fixed.some(f => f.name === c))];
  const cardOf = (s, id) => (s.cards || []).find(c => c.id === id);
  const isCredit = (s, id) => { const c = cardOf(s, id); return !!(c && c.kind === 'credit'); };
  const acctName = (s, id) => { const a = s.accounts.find(x => x.id === id); if (a) return a.name; const c = cardOf(s, id); return c ? c.name : id; };
  // 통장 + 신용카드(부채 계정: 시작잔액 = −미결제액)
  const allAccts = s => [...s.accounts, ...(s.cards || []).filter(c => c.kind === 'credit').map(c => ({ id: c.id, name: c.name, use: '신용카드', start: -(c.start || 0), credit: true }))];
  function normalize(s, today) {
    const d = defaultSettings(today);
    const n = { ...d, ...s };
    n.cards = Array.isArray(n.cards) ? n.cards : [];
    n.fixed = (n.fixed || []).map(f => ({ card: '', variable: false, end: '', day: '', amount: 0, acct: n.accounts[0].id, ...f }));
    return n;
  }
  function methodLabel(s, t) {
    if (t.type !== 'out') return '';
    if (t.method === 'check') return '체크카드 ' + acctName(s, t.card);
    if (t.method === 'credit') return '신용카드 ' + acctName(s, t.acct);
    return '통장출금';
  }

  // 이체는 보내는 통장 출금, 받는 통장 입금으로 펼친다
  function legs(s, txs) {
    const out = [];
    for (const t of sortTx(txs)) {
      if (t.type === 'tr') {
        const cp = isCredit(s, t.to);
        out.push({ date: t.date, acct: t.acct, kind: '이체출금', cat: (cp ? '카드대금→' : '이체→') + acctName(s, t.to), inAmt: 0, outAmt: t.amount, memo: t.memo || '', method: cp ? '카드대금 납부' : '이체' });
        out.push({ date: t.date, acct: t.to, kind: '이체입금', cat: (cp ? '카드대금←' : '이체←') + acctName(s, t.acct), inAmt: t.amount, outAmt: 0, memo: t.memo || '', method: cp ? '카드대금 납부' : '이체' });
      } else if (t.type === 'in') {
        out.push({ date: t.date, acct: t.acct, kind: '입금', cat: t.cat, inAmt: t.amount, outAmt: 0, memo: t.memo || '', method: '' });
      } else {
        out.push({ date: t.date, acct: t.acct, kind: '출금', cat: t.cat, inAmt: 0, outAmt: t.amount, memo: t.memo || '', method: methodLabel(s, t) });
      }
    }
    return out;
  }

  function balances(s, txs, uptoDate) {
    const b = {};
    for (const a of allAccts(s)) b[a.id] = a.start;
    for (const l of legs(s, txs)) {
      if (uptoDate && l.date > uptoDate) continue;
      if (b[l.acct] === undefined) continue;
      b[l.acct] += l.inAmt - l.outAmt;
    }
    return b;
  }

  function lastDay(month) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function addMonth(month, k) { let [y, m] = month.split('-').map(Number); m += k; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); }

  function monthRange(s, txs, today) {
    let lo = monthOf(s.startDate), hi = monthOf(today);
    for (const t of txs) { const m = monthOf(t.date); if (m < lo) lo = m; if (m > hi) hi = m; }
    const r = []; for (let m = lo; m <= hi; m = addMonth(m, 1)) r.push(m);
    return r;
  }

  function monthSummary(s, txs, month) {
    let income = 0, expense = 0; const byCat = {}; const byAcct = {}; const byMethod = { bank: 0, check: 0, credit: 0 };
    for (const a of allAccts(s)) byAcct[a.id] = { in: 0, out: 0 };
    for (const t of txs) if (t.type === 'out' && monthOf(t.date) === month) byMethod[t.method === 'check' || t.method === 'credit' ? t.method : 'bank'] += t.amount;
    for (const l of legs(s, txs)) {
      if (monthOf(l.date) !== month) continue;
      if (byAcct[l.acct]) { byAcct[l.acct].in += l.inAmt; byAcct[l.acct].out += l.outAmt; }
      if (l.kind === '입금') { income += l.inAmt; byCat['in|' + l.cat] = (byCat['in|' + l.cat] || 0) + l.inAmt; }
      if (l.kind === '출금') { expense += l.outAmt; byCat['out|' + l.cat] = (byCat['out|' + l.cat] || 0) + l.outAmt; }
    }
    const end = balances(s, txs, month + '-' + String(lastDay(month)).padStart(2, '0'));
    for (const a of allAccts(s)) byAcct[a.id].end = end[a.id];
    return { income, expense, net: income - expense, byCat, byAcct, byMethod };
  }

  function dueDate(month, day) {
    const ld = lastDay(month); const d = day === '' || day == null ? ld : Math.min(Number(day), ld);
    return month + '-' + String(d).padStart(2, '0');
  }
  function minusDays(date, n) { const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - n * 864e5; return new Date(t).toISOString().slice(0, 10); }

  // 완료 / 해당없음 / 미납(출금일 경과) / 예정(출금일 3일 전부터) / 대기
  function fixedStatus(s, txs, month, today) {
    return s.fixed.map(f => {
      const paid = txs.filter(t => monthOf(t.date) === month && (f.card ? t.type === 'tr' && t.to === f.card : t.type === 'out' && t.cat === f.name)).reduce((a, t) => a + t.amount, 0);
      const due = dueDate(month, f.day);
      let status;
      if (paid > 0) status = '완료';
      else if (f.end && month > f.end) status = '해당없음';
      else if (today > due) status = '미납';
      else if (today >= minusDays(due, 3)) status = '예정';
      else status = '대기';
      return { f, paid, due, status };
    });
  }

  // ---------- 엑셀 ----------
  const serial = d => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const col = n => { let s = ''; n++; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const NUM = '#,##0', DATE = 'yyyy-mm-dd';
  const N = (v, f) => ({ t: 'n', v, f, z: NUM });
  const S = (v, f, st) => ({ t: 's', v: String(v), f, st });
  const HD = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'E0E0E0' } }, border: { bottom: { style: 'thin', color: { rgb: '000000' } } } };
  const H = v => S(v, undefined, HD);
  const TITLE = v => S(v, undefined, { font: { bold: true, sz: 12 } });
  const fillOf = rgb => ({ fill: { patternType: 'solid', fgColor: { rgb } } });
  const fontOf = (hex, bold) => ({ font: { color: { rgb: hex.replace('#', '').toUpperCase() }, bold: !!bold } });
  const KIND = { 입금: 'in', 이체입금: 'tr', 출금: 'out', 이체출금: 'tr' };

  function workbookSpec(s, txs, today) {
    const L = legs(s, txs);
    const months = monthRange(s, txs, today);
    const A = allAccts(s);
    const last = Math.max(L.length + 1, 2);
    const rng = c => `거래내역!$${c}$2:$${c}$${last}`;

    // ① 거래내역
    const tx = [['날짜', '월', '통장/카드', '구분', '항목', '입금', '출금', '메모', '잔액', '결제수단'].map(H)];
    const run = {}; for (const a of A) run[a.id] = a.start;
    L.forEach((l, i) => {
      const r = i + 2;
      run[l.acct] = (run[l.acct] || 0) + l.inAmt - l.outAmt;
      tx.push([
        { t: 'n', v: serial(l.date), z: DATE }, S(monthOf(l.date)), S(acctName(s, l.acct), undefined, fillOf(COLORS.tint[l.acct] || (isCredit(s, l.acct) ? 'E6E6E6' : 'F5F5F5'))), S(l.kind, undefined, fontOf(COLORS.type[KIND[l.kind]], true)), S(l.cat),
        { ...N(l.inAmt), st: l.inAmt ? fontOf(COLORS.type.in) : undefined }, { ...N(l.outAmt), st: l.outAmt ? fontOf(COLORS.type.out) : undefined }, S(l.memo),
        N(run[l.acct], `VLOOKUP(C${r},월별요약!$A$3:$C$${2 + A.length},3,FALSE)+SUMIFS(F$2:F${r},C$2:C${r},C${r})-SUMIFS(G$2:G${r},C$2:C${r},C${r})`),
        S(l.method || ''),
      ]);
    });

    // ② 월별요약
    const sm = [];
    sm.push([TITLE('통장·카드별 현황 (시작 기준일 ' + s.startDate + ', 출력일 ' + today + ', 신용카드 음수 = 미결제액)')]);
    sm.push(['통장/카드', '용도', '시작잔액', '입금합계', '출금합계', '현재잔액'].map(H));
    const bal = balances(s, txs);
    A.forEach((a, i) => {
      const r = i + 3;
      const inS = L.filter(l => l.acct === a.id).reduce((x, l) => x + l.inAmt, 0);
      const outS = L.filter(l => l.acct === a.id).reduce((x, l) => x + l.outAmt, 0);
      sm.push([S(a.name, undefined, { ...fillOf(COLORS.tint[a.id] || (a.credit ? 'E6E6E6' : 'F5F5F5')), font: { bold: true } }), S(a.use), N(a.start), N(inS, `SUMIFS(${rng('F')},${rng('C')},A${r})`), N(outS, `SUMIFS(${rng('G')},${rng('C')},A${r})`), N(bal[a.id], `C${r}+D${r}-E${r}`)]);
    });
    const tr = A.length + 3, a1 = 3, a2 = A.length + 2;
    const tot = k => A.reduce((x, a) => x + k(a), 0);
    sm.push([H('합계'), H(''),
      N(tot(a => a.start), `SUM(C${a1}:C${a2})`),
      N(L.reduce((x, l) => x + l.inAmt, 0), `SUM(D${a1}:D${a2})`),
      N(L.reduce((x, l) => x + l.outAmt, 0), `SUM(E${a1}:E${a2})`),
      N(tot(a => bal[a.id]), `SUM(F${a1}:F${a2})`)]);
    sm.push([]);
    sm.push([TITLE('월별 수입·지출(이체 제외) 및 통장별 월말잔액')]);
    sm.push(['월', '월말일', '수입', '지출', '순증감', ...A.map(a => a.name + ' 월말'), '월말 합계'].map(H));
    months.forEach(m => {
      const r = sm.length + 1; const ms = monthSummary(s, txs, m);
      const row = [S(m), { t: 'n', v: serial(m + '-' + lastDay(m)), z: DATE },
        N(ms.income, `SUMIFS(${rng('F')},${rng('B')},A${r},${rng('D')},"입금")`),
        N(ms.expense, `SUMIFS(${rng('G')},${rng('B')},A${r},${rng('D')},"출금")`),
        N(ms.net, `C${r}-D${r}`)];
      A.forEach((a, i) => {
        const ar = i + 3;
        row.push(N(ms.byAcct[a.id].end, `$C$${ar}+SUMIFS(${rng('F')},${rng('C')},$A$${ar},${rng('A')},"<="&$B${r})-SUMIFS(${rng('G')},${rng('C')},$A$${ar},${rng('A')},"<="&$B${r})`));
      });
      row.push(N(tot(a => ms.byAcct[a.id].end), `SUM(${col(5)}${r}:${col(4 + A.length)}${r})`));
      sm.push(row);
    });
    sm.push([]);
    sm.push([TITLE('항목별 월 합계')]);
    sm.push(['구분', '항목', ...months, '합계'].map(H));
    const hr = sm.length;
    const cats = [...s.inCats.map(c => ['입금', c]), ...outCats(s).map(c => ['출금', c])];
    for (const t of txs) {
      if (t.type === 'in' && !cats.some(c => c[0] === '입금' && c[1] === t.cat)) cats.push(['입금', t.cat]);
      if (t.type === 'out' && !cats.some(c => c[0] === '출금' && c[1] === t.cat)) cats.push(['출금', t.cat]);
    }
    cats.forEach(([k, c]) => {
      const r = sm.length + 1; const amtCol = k === '입금' ? 'F' : 'G';
      const row = [S(k, undefined, fontOf(COLORS.type[k === '입금' ? 'in' : 'out'], true)), S(c, undefined, fontOf(catColor(c), true))]; let sum = 0;
      months.forEach((m, j) => {
        const v = L.filter(l => l.kind === k && l.cat === c && monthOf(l.date) === m).reduce((x, l) => x + (k === '입금' ? l.inAmt : l.outAmt), 0);
        sum += v;
        row.push(N(v, `SUMIFS(${rng(amtCol)},${rng('B')},${col(2 + j)}$${hr},${rng('D')},$A${r},${rng('E')},$B${r})`));
      });
      row.push(N(sum, `SUM(C${r}:${col(1 + months.length)}${r})`));
      sm.push(row);
    });

    // ③ 고정지출 납부현황
    const fx = [];
    fx.push([TITLE('고정지출 설정')]);
    fx.push(['항목', '월 금액', '출금일', '출금 통장', '종료 예정', '비고', '연결 카드'].map(H));
    s.fixed.forEach(f => fx.push([S(f.name), N(f.amount), f.day === '' ? S('') : { t: 'n', v: Number(f.day) }, S(acctName(s, f.acct)), S(f.end || ''), S(f.variable ? '변동금액' : ''), S(f.card ? acctName(s, f.card) : '')]));
    fx.push([]);
    fx.push([S('기준일'), { t: 'n', v: serial(today), z: DATE }, S('← 출력일. 출금일이 이 날짜 이후면 "예정"')]);
    const baseRef = `$B$${fx.length}`;
    fx.push([]);
    fx.push([H('월'), ...s.fixed.flatMap(f => [H(f.name + ' 납부액'), H(f.name + ' 상태')])]);
    months.forEach(m => {
      const r = fx.length + 1; const st = fixedStatus(s, txs, m, today);
      const row = [S(m)];
      s.fixed.forEach((f, i) => {
        const fr = i + 3; const pc = col(1 + i * 2);
        const exStatus = st[i].status === '대기' ? '예정' : st[i].status;
        const ym = `VALUE(LEFT($A${r},4)),VALUE(MID($A${r},6,2))`;
        const due = `DATE(${ym},MIN(IF($C$${fr}="",31,$C$${fr}),DAY(DATE(${ym}+1,0))))`;
        row.push(N(st[i].paid, f.card
          ? `SUMIFS(${rng('G')},${rng('B')},$A${r},${rng('D')},"이체출금",${rng('E')},"카드대금→"&$G$${fr})`
          : `SUMIFS(${rng('G')},${rng('B')},$A${r},${rng('D')},"출금",${rng('E')},$A$${fr})`));
        row.push(S(exStatus, `IF(${pc}${r}>0,"완료",IF(AND($E$${fr}<>"",$A${r}>$E$${fr}),"해당없음",IF(${due}<${baseRef},"미납","예정")))`, { ...fillOf(COLORS.statusFill[exStatus] || 'FFFFFF'), ...fontOf(COLORS.status[exStatus] || '#000000', true), alignment: { horizontal: 'center' } }));
      });
      fx.push(row);
    });

    return [
      { name: '거래내역', rows: tx, cols: [11, 9, 13, 9, 18, 12, 12, 18, 13, 18] },
      { name: '월별요약', rows: sm, cols: [16, 14, 13, 13, 13, ...A.map(() => 14), 13] },
      { name: '고정지출', rows: fx, cols: [12, ...s.fixed.flatMap(() => [14, 10])] },
    ];
  }

  function toWorkbook(XLSX, spec) {
    const wb = XLSX.utils.book_new();
    for (const sh of spec) {
      const ws = {}; let maxC = 0;
      sh.rows.forEach((row, r) => row.forEach((c, ci) => {
        if (!c) return; maxC = Math.max(maxC, ci);
        const cell = { t: c.t, v: c.v }; if (c.f) cell.f = c.f; if (c.z) cell.z = c.z;
        if (c.st || c.z) cell.s = { ...(c.st || {}), ...(c.z ? { numFmt: c.z } : {}) };
        ws[col(ci) + (r + 1)] = cell;
      }));
      ws['!ref'] = 'A1:' + col(Math.max(maxC, 0)) + Math.max(sh.rows.length, 1);
      ws['!cols'] = sh.cols.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, sh.name);
    }
    return wb;
  }

  return { allAccts, normalize, cardOf, isCredit, methodLabel, COLORS, acctColor, catColor, defaultSettings, legs, balances, monthOf, monthRange, monthSummary, fixedStatus, dueDate, workbookSpec, toWorkbook, toInt, sortTx, outCats, acctName, addMonth, lastDay };
})();
if (typeof module !== 'undefined') module.exports = Core;
