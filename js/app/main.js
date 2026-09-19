// 筋肉モリモリジム Phase 1 見本。認証・クラウド保存は未実装（Phase 2）。
// 見本の状態だけを localStorage 'kmg2.demo.*' に置く（旧版の 'kmg.*' には触れない）。

import { characterCanvas, stageOf, DEFAULT_LOOK, FACES } from '../art/character.js';
import { SKINS, HAIR_COLORS, HAIR_STYLES, CLOTH_COLORS, TOPS, BOTTOMS } from '../art/palette.js';
import {
  PARTS, PART_FILTERS, EXERCISES, METHOD_COLS, DEMO_PREVIOUS, TITLES, GROWTH_PRESETS,
  levelOf, demoMembers, agoLabel,
} from './data.js';
import { mountLogo } from './logo.js';

/* ---------- 状態 ---------- */
const KEY = 'kmg2.demo.state';
const DRAFT_KEY = 'kmg2.demo.draft';
const fresh = () => ({
  lookVersion: 2,
  onboarded: false,
  profile: { name: '', look: { ...DEFAULT_LOOK, stages: undefined, frame: undefined }, title: 't_first' },
  privacy: { join: false, name: false, content: false },
  demo: { growth: 'mid', members: 23, failSave: false, reduceMotion: false },
  recordTab: 'training',
});
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.profile) {
      // 見本v2: 上半身の初期ウェアをタンクトップに変更（依頼者指示）。見本データのみ一度だけ移行
      if ((s.lookVersion || 1) < 2) {
        s.profile.look.top = 'tank';
        s.lookVersion = 2;
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
      }
      const f = fresh();
      return { ...f, ...s, privacy: { ...f.privacy, ...s.privacy }, demo: { ...f.demo, ...s.demo } };
    }
  } catch (e) {}
  return fresh();
}
let state = load();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    toast('この端末に保存できませんでした', true);
    return false;
  }
}

const reduceMotion = () => state.demo.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
const growth = () => GROWTH_PRESETS[state.demo.growth] || GROWTH_PRESETS.mid;
function stagesFromExp(exp) {
  const st = {};
  for (const p of PARTS) st[p.id] = stageOf(p.id, levelOf(exp[p.id] || 0).lv);
  return st;
}
const myLook = (extra = {}) => ({ ...state.profile.look, stages: stagesFromExp(growth().exp), ...extra });
const titleName = (id) => (TITLES.find((t) => t.id === id) || TITLES[0]).name;

/* ---------- DOM ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');

let toastT = 0;
function toast(msg, bad = false, action) {
  const t = $('#toast');
  t.replaceChildren(msg);
  if (action) {
    const b = h('button', { class: 'btn', style: 'min-height:32px;margin-left:10px;padding:0 10px', onclick: () => { action.fn(); t.classList.remove('show'); } }, action.label);
    t.append(b);
    t.style.pointerEvents = 'auto';
  } else t.style.pointerEvents = 'none';
  t.classList.toggle('bad', bad);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2800);
}

/* ---------- キャラ描画とアニメーション ---------- */
const animated = new Set();
// fit: 表示の最大CSS幅。端末の画素比に対して整数倍になる大きさに合わせる（端数倍率のにじみを避ける）
function fitSize(res, maxCss) {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.floor((maxCss * dpr) / res));
  return (res * k) / dpr;
}
function charEl(look, kind = 'detail', { animate = true, label, fit } = {}) {
  const c = h('canvas', { class: 'px', role: 'img', 'aria-label': label || 'キャラクター' });
  if (fit) {
    const s = fitSize(kind === 'gym' ? 96 : 192, fit) + 'px';
    c.style.width = s;
    c.style.height = s;
  }
  const draw = (frame) => {
    const src = characterCanvas({ ...look, frame }, kind);
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
  };
  draw(0);
  if (animate) animated.add({ c, draw, phase: Math.floor(Math.random() * 4) });
  return c;
}
// 顔まわりを切り出したサムネイル（詳細素材の 96x96 部分をそのまま使う）
function headThumb(look) {
  const src = characterCanvas({ ...look, frame: 0 }, 'detail');
  const c = h('canvas', { class: 'px', width: 96, height: 96, 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 48, 14, 96, 96, 0, 0, 96, 96);
  return c;
}
let tick = 0;
setInterval(() => {
  tick++;
  for (const a of animated) {
    if (!a.c.isConnected) { animated.delete(a); continue; }
    if (reduceMotion()) { if (a.last !== 0) { a.draw(0); a.last = 0; } continue; }
    const f = (tick + a.phase) % 4 < 2 ? 0 : 1;
    if (f !== a.last) { a.draw(f); a.last = f; }
  }
}, 380);

/* ---------- シート ---------- */
let sheetStack = [];
function openSheet({ title, body, foot, full = false, expandable = true, onClose, labelledBy }) {
  const prevFocus = document.activeElement;
  const root = $('#sheet-root');
  const scrim = h('div', { class: 'scrim' });
  const id = 'sh' + Math.random().toString(36).slice(2, 7);
  const expandBtn = expandable
    ? h('button', { class: 'icon-btn', 'aria-label': '全画面に広げる', onclick: () => setFull(!sheet.classList.contains('full')) },
      h('svg', {}, ))
    : null;
  if (expandBtn) expandBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2.2"><path d="M6 14l6-6 6 6"/></svg>';
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': '閉じる', onclick: () => close() });
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const sheet = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h('div', { class: 'grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', { id }, title), expandBtn, closeBtn),
    body,
    foot || null,
  );
  function setFull(v) {
    sheet.classList.toggle('full', v);
    if (expandBtn) {
      expandBtn.setAttribute('aria-label', v ? '半分に戻す' : '全画面に広げる');
      expandBtn.firstChild.style.transform = v ? 'rotate(180deg)' : '';
    }
  }
  // 入力を始めたら全高へ（キーボードで保存ボタンが隠れないように）
  sheet.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea, select')) setFull(true); });
  // 下向きスワイプで閉じる・上向きで広げる（ボタンでも同じ操作が可能）
  let y0 = null;
  sheet.firstChild.nextSibling.addEventListener('touchstart', (e) => (y0 = e.touches[0].clientY), { passive: true });
  sheet.firstChild.nextSibling.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    if (dy < -40) setFull(true);
    else if (dy > 60) sheet.classList.contains('full') && expandable ? setFull(false) : close();
    y0 = null;
  });
  scrim.addEventListener('click', () => close());
  function close(result) {
    if (onClose && onClose(result) === false) return;
    scrim.remove();
    sheet.remove();
    sheetStack = sheetStack.filter((s) => s.close !== close);
    if (prevFocus && prevFocus.isConnected) prevFocus.focus();
  }
  root.append(scrim, sheet);
  sheetStack.push({ close, sheet });
  const first = sheet.querySelector('.sheet-body button, .sheet-body input, .sheet-body [tabindex]') || closeBtn;
  setTimeout(() => first.focus({ preventScroll: true }), 30);
  return { close, sheet, setFull };
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close();
  // 簡易フォーカストラップ
  if (e.key === 'Tab' && sheetStack.length) {
    const s = sheetStack[sheetStack.length - 1].sheet;
    const f = [...s.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
// キーボード表示中の見える高さをシートへ
if (window.visualViewport) {
  const upd = () => document.documentElement.style.setProperty('--vvh', visualViewport.height + 'px');
  visualViewport.addEventListener('resize', upd);
  upd();
}

function confirmDialog(title, message, buttons) {
  return new Promise((resolve) => {
    const body = h('div', { class: 'sheet-body' }, h('p', { style: 'margin:0' }, message));
    const foot = h('div', { class: 'sheet-foot', style: 'flex-wrap:wrap' });
    const sh = openSheet({ title, body, foot, expandable: false, onClose: (r) => resolve(r ?? null) });
    sh.sheet.style.height = 'auto';
    buttons.forEach((b) => foot.append(h('button', { class: 'btn ' + (b.primary ? 'primary' : ''), style: 'flex:1', onclick: () => sh.close(b.value) }, b.label)));
  });
}

/* ---------- ルーティング ---------- */
const routes = {
  '/onboarding': renderOnboarding,
  '/gym': renderGym,
  '/record': renderRecord,
  '/history': renderHistory,
  '/growth': renderGrowth,
  '/settings': renderSettings,
  '/settings/character': renderCharacterSettings,
};
let cleanup = [];
function route() {
  let path = location.hash.replace(/^#/, '') || '/gym';
  if (!state.onboarded && path !== '/onboarding') path = '/onboarding';
  if (!routes[path]) path = '/gym';
  cleanup.forEach((f) => f());
  cleanup = [];
  sheetStack.slice().forEach((s) => s.close());
  const onb = path === '/onboarding';
  $('#top').hidden = onb;
  $('#nav').hidden = onb;
  const tab = path.split('/')[1];
  document.querySelectorAll('.nav a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const sub = path.startsWith('/settings');
  $('#btn-back').hidden = !sub;
  $('#btn-settings').hidden = sub;
  const tt = $('#top-title');
  const subTitle = path === '/settings' ? '設定' : path === '/settings/character' ? 'キャラクター設定' : null;
  tt.classList.remove('has-logo');
  tt.querySelector('canvas')?.remove();
  tt.replaceChildren(h('span', { class: 'logo-text' }, subTitle || '筋肉モリモリジム'));
  if (!subTitle) mountLogo(tt, { heightCss: 32 });
  view.replaceChildren();
  routes[path]();
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
$('#btn-settings').addEventListener('click', () => (location.hash = '#/settings'));
$('#btn-back').addEventListener('click', () => (location.hash = location.hash === '#/settings/character' ? '#/settings' : '#/gym'));

/* ============================================================
 * 初期設定
 * ============================================================ */
function renderOnboarding() {
  let step = 0;
  const draft = { name: state.profile.name, look: { ...state.profile.look }, privacy: { ...state.privacy } };
  const wrap = h('div', { class: 'onb' });
  view.append(wrap);
  const STEPS = 4;
  function draw() {
    wrap.replaceChildren();
    window.scrollTo(0, 0);
    if (step === 0) wrap.append(h('div', { class: 'onb-hero' },
      charEl({ ...DEFAULT_LOOK, ...typeDefaults('male'), type: 'male' }, 'gym', { label: '男性キャラクター' }),
      charEl({ ...DEFAULT_LOOK, ...typeDefaults('female'), type: 'female' }, 'gym', { label: '女性キャラクター' }),
      (() => {
        const t = h('h1', {}, h('span', { class: 'logo-text' }, '筋肉モリモリジム'));
        setTimeout(() => mountLogo(t, { heightCss: 44 }), 0);
        return t;
      })()));
    const body = h('div', { class: 'pad stack' });
    body.append(h('div', { class: 'onb-steps', 'aria-label': `全${STEPS}ステップ中 ${step + 1}` }, ...Array.from({ length: STEPS }, (_, i) => h('i', { class: i <= step ? 'on' : '' }))));
    const next = h('button', { class: 'btn primary lg', style: 'flex:2' }, step === STEPS - 1 ? 'はじめる' : '次へ');
    const back = step > 0 ? h('button', { class: 'btn lg', style: 'flex:1', onclick: () => { step--; draw(); } }, '戻る') : null;
    if (step === 0) {
      const err = h('div', { class: 'err', 'aria-live': 'polite' });
      const inp = h('input', { class: 'in', id: 'onb-name', maxlength: 16, autocomplete: 'nickname', value: draft.name, placeholder: '例: ケイタ' });
      body.append(
        h('p', { class: 'muted', style: 'margin:0' }, '記録すると、ドット絵の自分が少しずつ育つ筋トレメモです。'),
        h('label', { class: 'field', for: 'onb-name' }, h('span', {}, '表示名（1〜16文字・実名でなくてOK）'), inp),
        err,
      );
      next.onclick = () => {
        const v = inp.value.trim();
        if (!v || [...v].length > 16) { err.textContent = '表示名を1〜16文字で入力してください'; inp.focus(); return; }
        draft.name = v; step++; draw();
      };
    } else if (step === 1) {
      body.append(h('h2', { class: 'sec' }, 'キャラクタータイプ', h('small', {}, 'アバターの選択です')));
      const pick = h('div', { class: 'type-pick', role: 'group', 'aria-label': 'キャラクタータイプ' });
      for (const [t, name] of [['male', '男性'], ['female', '女性']]) {
        const look = draft.look.type === t ? draft.look : { ...draft.look, ...typeDefaults(t), type: t };
        pick.append(h('button', { 'aria-pressed': String(draft.look.type === t), onclick: () => { if (draft.look.type !== t) Object.assign(draft.look, typeDefaults(t), { type: t }); draw(); } }, charEl(look, 'detail', { label: name, fit: 150 }), name));
      }
      body.append(pick, h('p', { class: 'muted small', style: 'margin:0' }, 'あとから「設定 > キャラクター設定」で変更できます。記録やEXPは変わりません。'));
      next.onclick = () => { step++; draw(); };
    } else if (step === 2) {
      body.append(h('h2', { class: 'sec' }, '見た目', h('small', {}, 'あとから着せ替えで変更できます')));
      const d = dressPanel(draft.look, () => {}, { titles: false });
      body.append(d);
      next.onclick = () => { step++; draw(); };
    } else {
      body.append(
        h('h2', { class: 'sec' }, '共有ジムへの公開'),
        h('p', { class: 'muted small', style: 'margin:0' }, '初期は非公開です。参加しなくても記録はすべて使えます。体重・カロリーは公開されません。'),
        privacyToggles(draft.privacy),
      );
      next.onclick = () => {
        state.profile.name = draft.name;
        state.profile.look = draft.look;
        state.privacy = draft.privacy;
        state.onboarded = true;
        persist();
        location.hash = '#/gym';
      };
    }
    wrap.append(body, h('div', { class: 'onb-foot' }, back, next));
  }
  draw();
}
// 初期設定でタイプを選んだ時の初期外見（以後のタイプ変更では外見を保持する）
function typeDefaults(t) {
  return t === 'female'
    ? { hairStyle: 'pony', hairColor: 'brown', skin: 'skin1', top: 'tank', topColor: 'teal', bottom: 'pants', bottomColor: 'black' }
    : { hairStyle: 'short', hairColor: 'darkbrown', skin: 'skin2', top: 'tank', topColor: 'black', bottom: 'shorts', bottomColor: 'charcoal' };
}
function privacyToggles(p, onChange = () => {}) {
  const box = h('div', { class: 'card', style: 'padding:4px 14px' });
  const rows = [
    ['join', 'ジムに参加する', 'キャラ・称号・記録時刻を直近24時間表示'],
    ['name', '名前を出す', 'オフの時は「トレーニー」と表示'],
    ['content', 'トレーニング内容を出す', '種目とセットの要約。オフの時は「内容は非公開」'],
  ];
  const inputs = {};
  rows.forEach(([k, label, note]) => {
    const id = 'pv-' + k;
    const inp = h('input', { type: 'checkbox', id, role: 'switch' });
    inp.checked = !!p[k];
    inp.addEventListener('change', () => { p[k] = inp.checked; sync(); onChange(); });
    inputs[k] = inp;
    box.append(h('label', { class: 'toggle', for: id }, h('span', {}, label, h('br'), h('small', { class: 'muted' }, note)), inp));
  });
  function sync() {
    inputs.name.disabled = !p.join;
    inputs.content.disabled = !p.join;
  }
  sync();
  return box;
}

/* ============================================================
 * ジム
 * ============================================================ */
// 足元の位置（ステージに対する%）。格子に見えないバラバラな配置を tools/gym-layout.mjs で作成。
// どの2人も横14.5%以上か縦13.8%以上離れるので、320px幅でもタップ領域(44×64px)が重ならない。
const SLOTS = [[37.5, 33.1], [18.8, 34.1], [70.5, 35.1], [54.7, 46], [85.5, 46.4], [69.7, 49.9], [39.1, 50], [24.4, 53.6], [9.7, 55.1], [47.5, 64.4],
  [63.6, 64.8], [84.3, 66.1], [12.2, 70.5], [32.9, 71.2], [49.2, 79.1], [15.8, 86.7], [74.6, 89.2], [91.1, 92.8], [56.3, 93.6], [41.8, 94.5]];
// 人数が少ない時も散らばるよう、埋める順番を固定の並びでばらす（更新のたびに入れ替えない）
const SLOT_ORDER = [9, 2, 15, 6, 17, 0, 11, 13, 4, 19, 7, 1, 14, 10, 5, 18, 3, 12, 16, 8];
const posOf = (i) => SLOTS[SLOT_ORDER[i]];
const POSTERS = [['昨日の自分を', '超えよう'], ['続けた分だけ、', '強くなる'], ['休むことも、', 'トレーニング']];

function renderGym() {
  const members = demoMembers(state.demo.members);
  if (state.privacy.join) {
    members.unshift({
      id: 'me', me: true, name: state.profile.name, nameVisible: state.privacy.name, contentVisible: state.privacy.content,
      title: titleName(state.profile.title), recordedMinAgo: 0, comment: null, menu: [['肩', 'サイドレイズ', '8kg × 15回 × 3']], nice: 0,
      look: myLook(),
    });
  }
  let page = 0;
  const pages = Math.max(1, Math.ceil(members.length / 20));
  let selected = null;

  const head = h('div', { class: 'gym-head' },
    h('b', {}, '今日のジム'),
    h('span', { class: 'count' }, '直近24時間・公開中 ', h('strong', {}, String(members.length)), ' 人'));
  const stage = h('div', { class: 'gym-stage' });
  const info = h('div', { class: 'gym-info' });
  const cta = h('div', { class: 'gym-cta' }, h('button', { class: 'btn primary lg block', onclick: () => openTrainingSheet() }, 'トレーニングを記録'));
  view.append(head, stage, info, cta);

  let bubbleTimer = 0;
  let bag = [];
  let shown = [];
  function pageMembers() { return members.slice(page * 20, page * 20 + 20); }

  function drawStage() {
    stage.replaceChildren();
    // ポスター（読めるテキストとして配置）
    [31.3, 44.2, 57.1].forEach((x, i) => stage.append(h('div', { class: 'poster', style: `left:${x}%` }, POSTERS[i].join(''))));
    const list = pageMembers();
    if (!list.length) {
      stage.append(h('div', { class: 'empty gym-empty' }, h('b', {}, 'まだ誰もいません'), '記録を保存して公開すると、ここに表示されます。'));
    }
    // 奥（上）の人から置き、手前の人が前に重なるようにする
    list.map((m, i) => [m, posOf(i)]).sort((a, b) => a[1][1] - b[1][1]).forEach(([m, [x, y]]) => {
      const label = `${m.nameVisible ? m.name : 'トレーニー'}、${m.title}、${agoLabel(m.recordedMinAgo)}`;
      const b = h('button', { class: 'slot' + (m.me ? ' me' : ''), style: `left:${x}%;top:${y}%`, 'aria-pressed': String(selected === m.id), 'aria-label': label, onclick: () => { selected = m.id; drawStage(); openMember(m); } },
        charEl(m.look, 'gym', { label }));
      stage.append(b);
    });
    drawBubbles();
    info.replaceChildren(
      h('span', {}, reduceMotion() ? '吹き出しは手動で切替' : '吹き出しは20秒ごとに交代'),
      reduceMotion() && candidates().length > 3 ? h('button', { class: 'btn', style: 'min-height:36px', onclick: () => { rotate(); } }, '次の吹き出し') : null,
      pages > 1 ? h('div', { class: 'pager' },
        h('button', { class: 'btn', 'aria-label': '前のページ', disabled: page === 0, onclick: () => { page--; bag = []; rotate(); drawStage(); } }, '‹'),
        h('span', {}, `${page + 1} / ${pages}`),
        h('button', { class: 'btn', 'aria-label': '次のページ', disabled: page === pages - 1, onclick: () => { page++; bag = []; rotate(); drawStage(); } }, '›')) : null,
    );
  }
  const candidates = () => pageMembers().filter((m) => m.comment);
  // 同時に3人まで（依頼者指示）。吹き出し同士が重ならない位置の人だけを組み合わせる。
  // シャッフルバッグで順番に回し、直前に出た人は続けない
  const MAX_BUBBLES = 3;
  const idxOf = (id) => pageMembers().findIndex((m) => m.id === id);
  const apart = (a, b) => {
    const [ax, ay] = posOf(idxOf(a)), [bx, by] = posOf(idxOf(b));
    return Math.abs(ax - bx) >= 36 || Math.abs(ay - by) >= 10;
  };
  function rotate() {
    const ids = candidates().map((m) => m.id);
    const next = [];
    // まだ出ていない人を優先し、足りなければ残りから
    for (const pool of [() => bag, () => ids.filter((id) => !shown.includes(id)), () => ids]) {
      if (!bag.length) bag = ids.slice().sort(() => Math.random() - 0.5);
      for (const id of pool().slice()) {
        if (next.length >= MAX_BUBBLES) break;
        if (next.includes(id) || (shown.includes(id) && ids.length > MAX_BUBBLES)) continue;
        if (next.every((o) => apart(o, id))) {
          next.push(id);
          bag = bag.filter((x) => x !== id);
        }
      }
      if (next.length >= Math.min(MAX_BUBBLES, ids.length)) break;
    }
    shown = next;
    drawBubbles();
  }
  function drawBubbles() {
    stage.querySelectorAll('.bubble, .bubble-tail').forEach((e) => e.remove());
    const list = pageMembers();
    shown.forEach((id) => {
      const i = list.findIndex((m) => m.id === id);
      if (i < 0) return;
      const [x, y] = posOf(i);
      const top = `calc(${y}% - 52px)`;
      stage.append(h('div', { class: 'bubble-tail', style: `left:${x}%;top:${top}` }));
      stage.append(h('div', { class: 'bubble', style: `left:clamp(70px, ${x}%, calc(100% - 70px));top:calc(${top} - 2px)` }, list[i].comment));
    });
  }
  function schedule() {
    clearInterval(bubbleTimer);
    if (reduceMotion()) return;
    bubbleTimer = setInterval(() => {
      if (document.hidden || sheetStack.length) return; // 操作中・非表示中は止める
      rotate();
    }, 20000);
  }
  rotate();
  drawStage();
  schedule();
  cleanup.push(() => clearInterval(bubbleTimer));

  function openMember(m) {
    let tab = 'comment';
    const body = h('div', { class: 'sheet-body' });
    const sh = openSheet({ title: m.nameVisible ? m.name : 'トレーニー', body, expandable: false, onClose: () => { selected = null; drawStage(); } });
    sh.sheet.style.height = 'auto';
    sh.sheet.style.maxHeight = '80dvh';
    let niced = false;
    function draw() {
      body.replaceChildren(
        h('div', { class: 'member' },
          h('div', { class: 'portrait' }, charEl(m.look, 'gym', { label: 'キャラクター' })),
          h('div', {},
            h('h3', {}, m.nameVisible ? m.name : 'トレーニー'),
            h('div', { class: 'title-badge', style: 'margin:4px 0' }, m.title),
            h('div', { class: 'muted small' }, agoLabel(m.recordedMinAgo)))),
        h('div', { class: 'seg', role: 'tablist', style: 'margin:12px 0' },
          h('button', { role: 'tab', 'aria-selected': String(tab === 'comment'), onclick: () => { tab = 'comment'; draw(); } }, 'ひとこと'),
          h('button', { role: 'tab', 'aria-selected': String(tab === 'training'), onclick: () => { tab = 'training'; draw(); } }, 'トレーニング')),
        tab === 'comment'
          ? h('div', { class: 'card' }, m.comment ? m.comment : h('span', { class: 'muted' }, 'ひとことはありません'))
          : m.contentVisible
            ? h('ul', { class: 'menu-list card', style: 'padding:4px 14px' }, ...m.menu.map(([p, n, s]) => h('li', {}, h('b', {}, p), h('span', {}, n, h('br'), h('span', { class: 'muted small' }, s)))))
            : h('div', { class: 'card muted' }, '内容は非公開'),
        m.me
          ? h('p', { class: 'muted small' }, '自分の記録にはナイスセットできません')
          : h('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px' },
            h('button', { class: 'btn ' + (niced ? 'primary' : ''), style: 'flex:1', 'aria-pressed': String(niced), onclick: () => { niced = !niced; draw(); } }, niced ? 'ナイスセット済み（取り消す）' : 'ナイスセット'),
            h('span', { class: 'muted', 'aria-label': 'ナイスセット数' }, String(m.nice + (niced ? 1 : 0)))),
        m.me ? null : h('div', { style: 'display:flex;gap:8px;margin-top:8px' },
          h('button', { class: 'btn ghost', style: 'flex:1', onclick: () => toast('見本のため非表示は保存されません（Phase 3）') }, '非表示'),
          h('button', { class: 'btn ghost', style: 'flex:1', onclick: () => toast('見本のため通報は送信されません（Phase 3）') }, '通報')),
      );
    }
    draw();
  }
  if (!state.privacy.join) info.after(h('p', { class: 'muted small', style: 'padding:0 16px;margin:0' }, 'あなたは非公開です（ジムには表示されません）。設定の公開設定で変更できます。'));
}

/* ============================================================
 * トレーニング入力
 * ============================================================ */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);
function loadDraft() {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d && d.entries) return d; } catch (e) {}
  return { date: today(), filter: 'shoulder', entries: [], comment: '' };
}
let draftT = 0;
function saveDraftSoon(d, statusEl) {
  clearTimeout(draftT);
  if (statusEl) statusEl.textContent = '入力中…';
  draftT = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      if (statusEl) statusEl.textContent = '下書き保存済み（この端末）';
    } catch (e) {
      if (statusEl) statusEl.textContent = '下書きを保存できません。画面を閉じないでください';
    }
  }, 500);
}
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// タイマー（終了予定時刻で計算するので画面切替やスリープでずれない）
const timer = { preset: 60, endAt: 0, remain: 60, running: false };
try { Object.assign(timer, { preset: Number(localStorage.getItem('kmg2.demo.timer')) || 60 }); timer.remain = timer.preset; } catch (e) {}
function timerRemain() { return timer.running ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remain; }

function trainingForm({ inSheet }) {
  const d = loadDraft();
  const body = h('div', { class: inSheet ? 'sheet-body' : 'pad' });
  const status = h('span', { class: 'sync', 'aria-live': 'polite' }, d.entries.length ? '下書き保存済み（この端末）' : '');
  const saveBtn = h('button', { class: 'btn primary lg', style: 'flex:1' }, '記録を保存');
  const foot = h('div', { class: 'sheet-foot' }, h('div', { style: 'flex:1;min-width:0' }, status), saveBtn);
  const errors = {};
  let query = '';
  let searchOpen = !d.entries.length;

  function changed() { saveDraftSoon(d, status); }
  function draw() {
    const focusId = document.activeElement && document.activeElement.id;
    body.replaceChildren();
    const dateIn = h('input', { class: 'in', type: 'date', id: 'tr-date', value: d.date, max: today(), onchange: (e) => { d.date = e.target.value; changed(); } });
    body.append(h('label', { class: 'field', for: 'tr-date', style: 'margin-bottom:10px' }, h('span', {}, '日付'), dateIn));
    body.append(h('div', { class: 'chips', role: 'group', 'aria-label': '部位で絞り込み', style: 'margin-bottom:10px' },
      ...PART_FILTERS.map((p) => h('button', { 'aria-pressed': String(d.filter === p.id), onclick: () => { d.filter = p.id; searchOpen = true; changed(); draw(); } }, p.name))));

    d.entries.forEach((en) => body.append(entryCard(en)));

    // 種目の検索と追加
    const box = h('div', { class: 'card', style: 'margin-top:12px' });
    if (searchOpen) {
      const q = h('input', { class: 'in', id: 'ex-q', type: 'search', placeholder: '種目を検索（ひらがな・カタカナ可）', value: query, autocomplete: 'off',
        oninput: (e) => { query = e.target.value; drawResults(); } });
      const res = h('ul', { class: 'ex-results', role: 'listbox', 'aria-label': '種目' });
      function drawResults() {
        const nq = norm(query);
        const list = EXERCISES.filter((x) => (!nq ? x.part === d.filter : true) && (!nq || norm(x.name).includes(nq) || x.alias.some((a) => norm(a).includes(nq))));
        res.replaceChildren(...list.map((x) => h('li', {}, h('button', { onclick: () => addEntry(x) }, x.name, h('small', {}, PART_FILTERS.find((p) => p.id === x.part).name)))));
        if (!list.length) res.append(h('li', { class: 'muted small', style: 'padding:10px 12px' }, '見つかりません。本人用の種目追加は Phase 2 で実装します。'));
      }
      drawResults();
      box.append(h('label', { class: 'field', for: 'ex-q' }, h('span', {}, '種目を追加'), q), res);
    } else {
      box.append(h('button', { class: 'btn block', onclick: () => { searchOpen = true; draw(); $('#ex-q')?.focus(); } }, '＋ 種目を追加'));
    }
    body.append(box);

    body.append(timerCard());

    const cid = 'tr-comment';
    body.append(h('div', { class: 'card', style: 'margin-top:12px' },
      h('label', { class: 'field', for: cid }, h('span', {}, '今日のひとこと（任意・40文字まで）'),
        h('textarea', { class: 'in', id: cid, rows: 2, maxlength: 40, oninput: (e) => { d.comment = e.target.value; changed(); cnt.textContent = `${[...d.comment].length}/40`; } }, d.comment)),
      h('div', { class: 'small', style: 'display:flex;justify-content:space-between;margin-top:4px' },
        h('span', { class: state.privacy.join ? 'muted' : 'err' }, state.privacy.join ? '共有ジムの全員に表示されます' : 'ジム非公開のため、ひとことは表示されません'),
        (cnt = h('span', { class: 'muted' }, `${[...d.comment].length}/40`)))));
    if (errors.form) body.append(h('p', { class: 'err', role: 'alert' }, errors.form));
    if (focusId) document.getElementById(focusId)?.focus();
  }
  let cnt;

  function addEntry(x) {
    d.entries.push({ id: uid(), exId: x.id, sets: [{ id: uid(), done: false }] });
    query = '';
    searchOpen = false;
    changed();
    draw();
  }

  function entryCard(en) {
    const ex = EXERCISES.find((x) => x.id === en.exId);
    const cols = METHOD_COLS[ex.method];
    const prev = DEMO_PREVIOUS[en.exId];
    const card = h('div', { class: 'ex-card' });
    card.append(h('div', { class: 'ex-top' },
      h('h3', {}, ex.name),
      h('span', { class: 'pill' }, PART_FILTERS.find((p) => p.id === ex.part).name),
      h('button', { class: 'del', 'aria-label': `${ex.name}を削除`, onclick: () => { const i = d.entries.indexOf(en); d.entries.splice(i, 1); changed(); draw(); toast('種目を削除しました', false, { label: '取り消す', fn: () => { d.entries.splice(i, 0, en); changed(); draw(); } }); } }, '×')));
    if (prev) {
      const sum = prev.sets.map((s) => `${s.kg}kg×${s.reps}`).join(' / ');
      card.append(h('div', { class: 'prev' }, h('span', {}, `前回（${prev.date}・見本）${sum}`),
        h('button', { class: 'btn', style: 'min-height:36px;flex:none', onclick: () => copyPrev(en, prev) }, '前回をコピー')));
    }
    const table = h('table', { class: 'sets' });
    table.append(h('thead', {}, h('tr', {}, h('th', {}, 'セット'), ...cols.map((c) => h('th', {}, c.label + (c.optional ? '（任意）' : ''))), h('th', {}, '完了'), h('th', {}, h('span', { class: 'sr' }, '削除')))));
    const tb = h('tbody');
    en.sets.forEach((s, i) => {
      const tr = h('tr', { class: s.done ? 'done' : '' });
      tr.append(h('td', { class: 'no' }, String(i + 1)));
      cols.forEach((c) => {
        const id = `in-${s.id}-${c.k}`;
        tr.append(h('td', {}, h('div', { class: 'cell' },
          h('input', { class: 'in', id, inputmode: c.step === '1' ? 'numeric' : 'decimal', 'aria-label': `${i + 1}セット目の${c.label}（${c.unit}）`, value: s[c.k] ?? '',
            oninput: (e) => { s[c.k] = e.target.value; changed(); } }),
          h('span', { class: 'unit' }, c.unit))));
      });
      const chk = h('button', { class: 'check', 'aria-pressed': String(!!s.done), 'aria-label': `${i + 1}セット目を完了`, onclick: () => { s.done = !s.done; changed(); draw(); } });
      chk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      tr.append(h('td', {}, chk));
      tr.append(h('td', {}, h('button', { class: 'del', 'aria-label': `${i + 1}セット目を削除`, onclick: () => {
        en.sets.splice(i, 1); changed(); draw();
        toast('セットを削除しました', false, { label: '取り消す', fn: () => { en.sets.splice(i, 0, s); changed(); draw(); } });
      } }, '×')));
      tb.append(tr);
      if (errors[s.id]) tb.append(h('tr', {}, h('td', { colspan: cols.length + 3, class: 'err', style: 'text-align:left' }, errors[s.id])));
    });
    table.append(tb);
    card.append(table);
    card.append(h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => {
      const last = en.sets[en.sets.length - 1] || {};
      const n = { id: uid(), done: false };
      cols.forEach((c) => (n[c.k] = last[c.k]));
      en.sets.push(n); changed(); draw();
    } }, '＋ セット追加'));
    return card;
  }

  async function copyPrev(en, prev) {
    const hasInput = en.sets.some((s) => s.done || Object.keys(s).some((k) => !['id', 'done'].includes(k) && s[k] !== '' && s[k] != null));
    let mode = 'replace';
    if (hasInput) {
      mode = await confirmDialog('前回をコピー', '入力済みのセットがあります。どうしますか？', [
        { label: 'キャンセル', value: null }, { label: '追加', value: 'add' }, { label: '置き換え', value: 'replace', primary: true }]);
      if (!mode) return;
    }
    const copies = prev.sets.map((s) => ({ id: uid(), kg: String(s.kg), reps: String(s.reps), done: false }));
    en.sets = mode === 'add' ? en.sets.concat(copies) : copies;
    changed();
    draw();
    toast(`${prev.date}の記録をコピーしました（完了はオフ）`);
  }

  function timerCard() {
    const t = h('span', { class: 't', 'aria-live': 'off' });
    const card = h('div', { class: 'card timer', style: 'margin-top:12px' });
    const stateLbl = h('span', { class: 'small muted', 'aria-live': 'polite' });
    function fmt(n) { return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
    function paint() {
      const r = timerRemain();
      t.textContent = fmt(r);
      const done = timer.running && r === 0;
      card.classList.toggle('done', done);
      if (done) { timer.running = false; timer.remain = 0; stateLbl.textContent = '休憩終了'; drawBtns(); }
    }
    const btns = h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;width:100%' });
    function drawBtns() {
      btns.replaceChildren(
        ...[30, 60, 90, 120, 180].map((sec) => h('button', { class: 'btn', style: 'min-height:40px;padding:0 10px', 'aria-pressed': String(timer.preset === sec),
          onclick: () => { timer.preset = sec; timer.running = false; timer.remain = sec; try { localStorage.setItem('kmg2.demo.timer', sec); } catch (e) {} stateLbl.textContent = ''; paint(); drawBtns(); } }, `${sec}秒`)),
        h('button', { class: 'btn primary', style: 'min-height:40px', onclick: () => {
          if (timer.running) { timer.remain = timerRemain(); timer.running = false; stateLbl.textContent = '一時停止中'; }
          else { if (timer.remain <= 0) timer.remain = timer.preset; timer.endAt = Date.now() + timer.remain * 1000; timer.running = true; stateLbl.textContent = ''; }
          paint(); drawBtns();
        } }, timer.running ? '一時停止' : timer.remain < timer.preset && timer.remain > 0 ? '再開' : '開始'),
        h('button', { class: 'btn', style: 'min-height:40px', onclick: () => { if (timer.running) timer.endAt += 30000; else timer.remain += 30; paint(); } }, '+30秒'),
        h('button', { class: 'btn ghost', style: 'min-height:40px', onclick: () => { timer.running = false; timer.remain = timer.preset; stateLbl.textContent = ''; paint(); drawBtns(); } }, 'リセット'),
      );
    }
    drawBtns();
    card.append(h('b', {}, '休憩'), t, stateLbl, btns, h('span', { class: 'small muted' }, '音・通知は見本では未対応です（画面表示のみ）'));
    paint();
    const iv = setInterval(() => { if (!card.isConnected) return clearInterval(iv); paint(); }, 250);
    return card;
  }

  saveBtn.onclick = () => {
    // 検証（完了セットが1つ以上、値の範囲）
    for (const k of Object.keys(errors)) delete errors[k];
    let valid = 0;
    const gained = {};
    d.entries.forEach((en) => {
      const ex = EXERCISES.find((x) => x.id === en.exId);
      en.sets.forEach((s) => {
        if (!s.done) return;
        const num = (k) => (s[k] === '' || s[k] == null ? null : Number(s[k]));
        let err = null;
        if (ex.method === 'wr' && !(num('kg') >= 0 && Number.isInteger(num('reps')) && num('reps') >= 1)) err = 'kgは0以上、回数は1以上の整数を入力してください';
        if (ex.method === 'bw' && !(Number.isInteger(num('reps')) && num('reps') >= 1)) err = '回数は1以上の整数を入力してください';
        if (ex.method === 'assist' && !(num('assistKg') >= 0 && Number.isInteger(num('reps')) && num('reps') >= 1)) err = '補助kgは0以上、回数は1以上の整数を入力してください';
        if (ex.method === 'time' && !(num('sec') >= 1)) err = '秒は1以上を入力してください';
        if (ex.method === 'cardio' && !(num('min') > 0)) err = '分は0より大きい値を入力してください';
        if (err) errors[s.id] = err;
        else {
          valid++;
          if (ex.part !== 'cardio') gained[ex.part] = Math.min(30, (gained[ex.part] || 0) + 5);
        }
      });
    });
    if (Object.keys(errors).length) { errors.form = '入力を確認してください（他の入力はそのままです）'; draw(); return; }
    if (!valid) { errors.form = '完了チェックの付いたセットが1つ以上必要です'; draw(); return; }
    const txt = Object.entries(gained).map(([p, v]) => `${PARTS.find((x) => x.id === p).name} +${v}EXP`).join('・');
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    toast(`見本のため保存はされません（${txt || '継続'} +10ボーナス 相当）`);
    Object.assign(d, { date: today(), entries: [], comment: '' });
    searchOpen = true;
    draw();
    status.textContent = '';
  };

  draw();
  return { body, foot };
}

function openTrainingSheet() {
  const { body, foot } = trainingForm({ inSheet: true });
  openSheet({ title: 'トレーニングを記録', body, foot });
}

/* ============================================================
 * 記録タブ
 * ============================================================ */
function renderRecord() {
  const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': '記録の種類' });
  const host = h('div');
  view.append(h('div', { class: 'pad', style: 'padding-bottom:0' }, seg), host);
  function draw() {
    seg.replaceChildren(
      h('button', { role: 'tab', 'aria-selected': String(state.recordTab === 'training'), onclick: () => { state.recordTab = 'training'; persist(); draw(); } }, 'トレーニング'),
      h('button', { role: 'tab', 'aria-selected': String(state.recordTab === 'body'), onclick: () => { state.recordTab = 'body'; persist(); draw(); } }, 'からだ'));
    host.replaceChildren();
    if (state.recordTab === 'training') {
      const { body, foot } = trainingForm({ inSheet: false });
      foot.style.position = 'sticky';
      foot.style.bottom = 'calc(var(--nav-h) + env(safe-area-inset-bottom))';
      host.append(body, foot);
    } else host.append(bodyForm());
  }
  draw();
}

function bodyForm() {
  const wrap = h('div', { class: 'pad stack' });
  const v = { date: today(), weight: '', kcal: '', p: '', f: '', c: '' };
  const err = h('p', { class: 'err', role: 'alert' });
  let pfcOpen = false;
  const w = h('input', { class: 'in', id: 'bw', inputmode: 'decimal', placeholder: '未記録', 'aria-label': '体重（kg）', oninput: (e) => (v.weight = e.target.value) });
  const stepW = (d) => {
    // 空欄の時は前回値を勝手に使わない（前回値は明示ボタンでのみ入れる）
    if (v.weight === '') { err.textContent = '先に体重を入力するか「前回を入れる」を押してください'; w.focus(); return; }
    const base = Number(v.weight);
    if (!isFinite(base)) return;
    err.textContent = '';
    v.weight = (Math.round(base * 10 + d) / 10).toFixed(1); // 0.1kg単位の整数で計算
    w.value = v.weight;
  };
  const pfc = h('div', { class: 'card', hidden: true });
  ['p', 'f', 'c'].forEach((k) => {
    const id = 'pfc-' + k;
    pfc.append(h('label', { class: 'field', for: id, style: 'margin-bottom:8px' }, h('span', {}, { p: 'たんぱく質 P（g）', f: '脂質 F（g）', c: '炭水化物 C（g）' }[k]),
      h('input', { class: 'in', id, inputmode: 'decimal', placeholder: '未記録', oninput: (e) => (v[k] = e.target.value) })));
  });
  const pfcBtn = h('button', { class: 'btn block', 'aria-expanded': 'false', onclick: () => { pfcOpen = !pfcOpen; pfc.hidden = !pfcOpen; pfcBtn.setAttribute('aria-expanded', String(pfcOpen)); pfcBtn.textContent = pfcOpen ? 'PFC を閉じる' : 'PFC を入力（任意）'; } }, 'PFC を入力（任意）');
  wrap.append(
    h('label', { class: 'field', for: 'bd-date' }, h('span', {}, '日付'), h('input', { class: 'in', type: 'date', id: 'bd-date', value: v.date, max: today(), onchange: (e) => (v.date = e.target.value) })),
    h('div', { class: 'card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, h('b', {}, '体重'),
        h('button', { class: 'btn', style: 'min-height:36px', onclick: () => { v.weight = '70.8'; w.value = '70.8'; } }, '前回 70.8kg を入れる（見本）')),
      h('div', { class: 'big-num' }, h('button', { class: 'btn step', 'aria-label': '0.1kg減らす', onclick: () => stepW(-1) }, '−0.1'), w, h('span', { class: 'unit' }, 'kg'), h('button', { class: 'btn step', 'aria-label': '0.1kg増やす', onclick: () => stepW(1) }, '+0.1'))),
    h('div', { class: 'card' },
      h('label', { class: 'field', for: 'kcal' }, h('span', {}, '摂取カロリー（kcal）'),
        h('input', { class: 'in', id: 'kcal', inputmode: 'numeric', placeholder: '未記録', style: 'font-size:22px;font-weight:800;text-align:center', oninput: (e) => (v.kcal = e.target.value) }))),
    pfcBtn, pfc, err,
    h('p', { class: 'muted small', style: 'margin:0' }, 'すべて任意です。空欄は「未記録」、0は「0を入力」として区別します。からだ記録は他の人に公開されません。'),
    h('button', { class: 'btn primary lg block', onclick: () => {
      err.textContent = '';
      const chk = (s, int, pos) => (s === '' ? null : /^\d+(\.\d)?$/.test(s) && (!int || /^\d+$/.test(s)) && isFinite(Number(s)) && (!pos || Number(s) > 0) && s.length <= 7 ? Number(s) : NaN);
      const vals = { weight: chk(v.weight, false, true), kcal: chk(v.kcal, true), p: chk(v.p), f: chk(v.f), c: chk(v.c) };
      if (Object.values(vals).some((x) => Number.isNaN(x))) { err.textContent = '体重は正の数（小数1桁まで）、kcalは0以上の整数、PFCは0以上（小数1桁まで）で入力してください'; return; }
      if (Object.values(vals).every((x) => x === null)) { err.textContent = '入力がありません（全て空欄の記録は保存しません）'; return; }
      toast('見本のため保存はされません（Phase 2 でクラウド保存）');
    } }, '保存'),
  );
  return wrap;
}

/* ============================================================
 * 履歴（Phase 2 で実装）
 * ============================================================ */
function renderHistory() {
  view.append(h('div', { class: 'empty' }, h('b', {}, '履歴・グラフは Phase 2 で実装します'),
    '実データのない架空のグラフは表示しません。記録の保存（クラウド）とあわせて作ります。'));
}

/* ============================================================
 * 成長
 * ============================================================ */
function renderGrowth() {
  const gr = growth();
  const look = myLook();
  const total = Object.values(gr.exp).reduce((a, b) => a + b, 0) + gr.days * 10;
  const tl = levelOf(total);
  const shoulderLv = levelOf(gr.exp.shoulder).lv;
  view.append(
    h('div', { class: 'hero-char' }, h('div', { class: 'plate', 'aria-hidden': 'true' }), charEl(look, 'detail', { label: 'あなたのキャラクター' })),
    h('div', { class: 'name-row' }, h('h2', {}, state.profile.name || 'あなた'), h('span', { class: 'title-badge' }, titleName(state.profile.title))),
    h('div', { class: 'pad stack' },
      h('p', { class: 'small muted', style: 'margin:0;text-align:center' }, `見本の成長段階: ${gr.name}（設定の「見本の操作」で切替）`),
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, `Lv.${tl.lv}`), h('span', {}, `総EXP ${total.toLocaleString()}`)),
        h('div', {}, h('b', {}, `${gr.days}日`), h('span', {}, '累計記録日')),
        h('div', {}, h('b', {}, `${Math.min(3, gr.days)}回`), h('span', {}, '今週の記録'))),
      h('button', { class: 'btn primary lg block', onclick: openDressSheet }, '着せ替え'),
      h('h2', { class: 'sec' }, '部位の成長', h('small', {}, '鍛えた分だけ、少しずつ変わる')),
      h('div', { class: 'parts' }, ...PARTS.map((p) => {
        const l = levelOf(gr.exp[p.id]);
        const hot = p.id === 'shoulder' && shoulderLv >= 5;
        return h('div', { class: 'part' + (hot ? ' hot' : '') },
          h('div', { class: 'h' }, h('b', {}, p.name), h('span', {}, `Lv.${l.lv}`)),
          h('div', { class: 'bar', role: 'progressbar', 'aria-label': `${p.name}の次のレベルまで`, 'aria-valuemin': 0, 'aria-valuemax': l.need, 'aria-valuenow': l.cur }, h('i', { style: `width:${Math.round((l.cur / l.need) * 100)}%` })),
          h('div', { class: 'n' }, `${l.cur} / ${l.need} EXP`),
          hot ? h('div', { class: 'tag' }, shoulderLv >= 10 ? '肩だけ異世界' : '肩幅成長中') : null);
      })),
      h('h2', { class: 'sec' }, '解放'),
      h('ul', { class: 'unlock-list card', style: 'padding:4px 14px' },
        ...[['称号「コツコツ見習い」', 3], ['リストバンド', 7], ['称号「習慣の達人」', 30]].map(([n, days]) => h('li', {}, h('span', {}, n), gr.days >= days ? h('span', { class: 'pill reward' }, '解放済み') : h('span', { class: 'pill' }, `記録日 ${days}日で解放（あと${days - gr.days}日）`)))),
    ),
  );
}

/* ---------- 着せ替えパネル（着せ替えシートと初期設定で共用） ---------- */
function dressPanel(look, onChange, { titles = true, titleState } = {}) {
  let tab = 'hair';
  const wrap = h('div');
  const preview = h('div', { class: 'dress-preview' });
  const tabs = h('div', { class: 'seg', role: 'tablist', style: 'margin:10px 0' });
  const panel = h('div', { role: 'tabpanel' });
  wrap.append(preview, tabs, panel);
  const gr = growth();
  const unlockedBand = gr.days >= 7;
  function drawPreview() {
    preview.replaceChildren(charEl({ ...look, stages: stagesFromExp(gr.exp) }, 'detail', { label: '着せ替えのプレビュー' }));
  }
  function set(k, v) { look[k] = v; onChange(); drawPreview(); drawPanel(); }
  const sw = (list, key, colorOf) => h('div', { class: 'swatches' }, ...list.map((c) => h('button', { class: 'sw', 'aria-pressed': String(look[key] === c.id), onclick: () => set(key, c.id) }, h('i', { style: `background:${colorOf(c)}` }), c.name)));
  function drawPanel() {
    const T = [['hair', '髪'], ['face', '表情'], ['skin', '肌'], ['wear', 'ウェア']].concat(titles ? [['title', '称号']] : []);
    tabs.replaceChildren(...T.map(([k, n]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; drawPanel(); } }, n)));
    panel.replaceChildren();
    if (tab === 'hair') {
      panel.append(h('div', { class: 'dress-sub' }, '髪型'),
        h('div', { class: 'opt-grid' }, ...HAIR_STYLES.map((s) => h('button', { class: 'opt', 'aria-pressed': String(look.hairStyle === s.id), onclick: () => set('hairStyle', s.id) }, headThumb({ ...look, hairStyle: s.id }), s.name))),
        h('div', { class: 'dress-sub' }, '髪色'), sw(HAIR_COLORS, 'hairColor', (c) => c.ramp[3]));
    } else if (tab === 'face') {
      panel.append(h('div', { class: 'dress-sub' }, '表情（ジムや成長画面でこの顔になります）'),
        h('div', { class: 'opt-grid' }, ...FACES.map((f) => h('button', { class: 'opt', 'aria-pressed': String((look.face || 'smile') === f.id), onclick: () => set('face', f.id) }, headThumb({ ...look, face: f.id }), f.name))));
    } else if (tab === 'skin') {
      panel.append(h('div', { class: 'dress-sub' }, '肌色（すべて最初から選べます）'), sw(SKINS, 'skin', (c) => c.ramp[3]));
    } else if (tab === 'wear') {
      panel.append(h('div', { class: 'dress-sub' }, 'トップス'),
        h('div', { class: 'opt-grid' }, ...TOPS.map((t) => h('button', { class: 'opt', 'aria-pressed': String(look.top === t.id), onclick: () => set('top', t.id) }, t.name))),
        h('div', { class: 'dress-sub' }, 'トップスの色'), sw(CLOTH_COLORS, 'topColor', (c) => c.hex),
        h('div', { class: 'dress-sub' }, 'ボトムス'),
        h('div', { class: 'opt-grid' }, ...BOTTOMS.map((t) => h('button', { class: 'opt', 'aria-pressed': String(look.bottom === t.id), onclick: () => set('bottom', t.id) }, t.name))),
        h('div', { class: 'dress-sub' }, 'ボトムスの色'), sw(CLOTH_COLORS, 'bottomColor', (c) => c.hex),
        h('div', { class: 'dress-sub' }, '小物'),
        h('div', { class: 'opt-grid' },
          h('button', { class: 'opt', 'aria-pressed': String(!look.wristband), onclick: () => set('wristband', false) }, 'なし'),
          h('button', { class: 'opt', 'aria-pressed': String(!!look.wristband), disabled: !unlockedBand, onclick: () => set('wristband', true) }, 'リストバンド', unlockedBand ? null : h('br'), unlockedBand ? null : h('small', { class: 'muted' }, '記録日7日で解放'))));
    } else if (tab === 'title' && titleState) {
      panel.append(h('ul', { class: 'unlock-list', style: 'padding:0' }, ...TITLES.map((t) => {
        const ok = t.unlocked || (t.id === 't_shoulder7' && levelOf(gr.exp.shoulder).lv >= 7) || (t.id === 't_shoulder10' && levelOf(gr.exp.shoulder).lv >= 10) || (t.id === 't_30days' && gr.days >= 30);
        return h('li', {}, h('span', {}, t.name, h('br'), h('small', { class: 'muted' }, ok ? '解放済み' : `解放条件: ${t.cond}`)),
          h('button', { class: 'btn ' + (titleState.id === t.id ? 'primary' : ''), disabled: !ok, 'aria-pressed': String(titleState.id === t.id), onclick: () => { titleState.id = t.id; onChange(); drawPanel(); } }, titleState.id === t.id ? '選択中' : '選ぶ'));
      })));
    }
  }
  drawPreview();
  drawPanel();
  return wrap;
}

function openDressSheet() {
  const look = { ...state.profile.look };
  const titleState = { id: state.profile.title };
  const unsaved = h('span', { class: 'unsaved', 'aria-live': 'polite' });
  const body = h('div', { class: 'sheet-body', style: 'padding-top:0' });
  let dirty = false;
  const panel = dressPanel(look, () => { dirty = true; unsaved.textContent = '未保存の変更があります'; }, { titleState });
  // プレビューはスクロールしても見えるように固定
  panel.firstChild.style.cssText = 'position:sticky;top:0;z-index:2;margin:0 -16px';
  body.append(panel);
  const cancel = h('button', { class: 'btn', onclick: () => sh.close('cancel') }, 'キャンセル');
  const apply = h('button', { class: 'btn primary', style: 'flex:1', onclick: () => {
    if (state.demo.failSave) {
      unsaved.textContent = '保存できませんでした。選択はそのままです。もう一度「適用」を押してください';
      unsaved.style.color = 'var(--error)';
      return;
    }
    state.profile.look = { ...look };
    state.profile.title = titleState.id;
    if (!persist()) return;
    dirty = false;
    sh.close('applied');
    toast('着せ替えを保存しました（見本：この端末のみ）');
    route();
  } }, '適用');
  const foot = h('div', { class: 'sheet-foot', style: 'flex-wrap:wrap' }, h('div', { style: 'width:100%' }, unsaved), cancel, apply);
  const sh = openSheet({ title: '着せ替え', body, foot, full: true, expandable: false });
}

/* ============================================================
 * 設定
 * ============================================================ */
function renderSettings() {
  const p = state.privacy;
  view.append(h('div', { class: 'pad stack' },
    h('div', { class: 'list' },
      h('a', { href: '#/settings/character' }, h('span', {}, 'キャラクター設定'), h('span', { class: 'v' }, `タイプ: ${state.profile.look.type === 'female' ? '女性' : '男性'} ›`)),
      h('div', {}, h('span', {}, 'アカウント'), h('span', { class: 'v' }, 'Phase 2（メール認証）'))),
    h('h2', { class: 'sec' }, '共有ジムの公開', h('small', {}, '初期は非公開')),
    privacyToggles(p, persist),
    h('h2', { class: 'sec' }, '表示'),
    h('div', { class: 'card', style: 'padding:4px 14px' }, (() => {
      const inp = h('input', { type: 'checkbox', id: 'rm', role: 'switch' });
      inp.checked = state.demo.reduceMotion;
      inp.onchange = () => { state.demo.reduceMotion = inp.checked; persist(); };
      return h('label', { class: 'toggle', for: 'rm' }, h('span', {}, '動きを減らす', h('br'), h('small', { class: 'muted' }, '端末の設定でも自動で有効')), inp);
    })()),
    h('h2', { class: 'sec' }, '契約'),
    h('div', { class: 'card small' }, '年会費 1,000円。税表示・更新方式・返金などの販売条件は未承認のため、課金は実装していません（Phase 4）。'),
    h('h2', { class: 'sec' }, '見本の操作', h('small', {}, '確認用。製品版にはありません')),
    h('div', { class: 'card stack' },
      h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:4px' }, '成長段階'),
        h('div', { class: 'seg' }, ...Object.entries(GROWTH_PRESETS).map(([k, g]) => h('button', { 'aria-pressed': String(state.demo.growth === k), onclick: () => { state.demo.growth = k; persist(); route(); } }, g.name)))),
      h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:4px' }, 'ジムの見本参加者'),
        h('div', { class: 'seg' }, ...[0, 12, 20, 23].map((n) => h('button', { 'aria-pressed': String(state.demo.members === n), onclick: () => { state.demo.members = n; persist(); route(); } }, `${n}人`)))),
      (() => {
        const inp = h('input', { type: 'checkbox', id: 'fs', role: 'switch' });
        inp.checked = state.demo.failSave;
        inp.onchange = () => { state.demo.failSave = inp.checked; persist(); };
        return h('label', { class: 'toggle', for: 'fs' }, h('span', {}, '着せ替えの保存失敗を試す'), inp);
      })(),
      h('a', { class: 'btn block', href: 'art-sheet.html' }, 'キャラ見本シートを開く'),
      h('button', { class: 'btn block', onclick: () => { state.onboarded = false; persist(); location.hash = '#/onboarding'; } }, '初期設定をやり直す'),
      h('button', { class: 'btn ghost block', onclick: async () => {
        const ok = await confirmDialog('見本データを消去', 'この端末の見本用データ（kmg2.demo.*）だけを消します。旧版のデータには触れません。', [{ label: 'やめる', value: null }, { label: '消去する', value: true, primary: true }]);
        if (!ok) return;
        try { localStorage.removeItem(KEY); localStorage.removeItem(DRAFT_KEY); localStorage.removeItem('kmg2.demo.timer'); } catch (e) {}
        state = fresh(); location.hash = '#/onboarding'; route();
      } }, '見本データを消去')),
  ));
}

function renderCharacterSettings() {
  const cur = state.profile.look.type;
  let next = cur;
  const box = h('div', { class: 'pad stack' });
  view.append(box);
  function draw() {
    const look = myLook();
    box.replaceChildren(
      h('h2', { class: 'sec' }, 'キャラクタータイプ'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'タイプ' },
        ...[['male', '男性'], ['female', '女性']].map(([t, n]) => h('button', { 'aria-pressed': String(next === t), onclick: () => { next = t; draw(); } }, n))),
      h('div', { class: 'card type-compare' },
        h('div', {}, charEl(look, 'detail', { label: '現在', fit: 140 }), h('div', { class: 'small muted' }, '現在')),
        h('div', { 'aria-hidden': 'true', style: 'font-size:20px;color:var(--sub)' }, '→'),
        h('div', {}, charEl({ ...look, type: next }, 'detail', { label: '変更後', fit: 140 }), h('div', { class: 'small muted' }, '変更後'))),
      h('p', { class: 'muted small', style: 'margin:0' }, '記録・EXP・称号・解放・髪型・色はそのまま引き継ぎます。何度でも無料で変更できます。'),
      h('button', { class: 'btn primary lg block', disabled: next === cur, onclick: async () => {
        const ok = await confirmDialog('タイプを変更', `${next === 'female' ? '女性' : '男性'}タイプに変更します。記録や外見の設定は消えません。`, [{ label: 'やめる', value: null }, { label: '変更する', value: true, primary: true }]);
        if (!ok) return;
        state.profile.look.type = next;
        persist();
        toast('タイプを変更しました');
        location.hash = '#/growth';
      } }, '変更する'),
    );
  }
  draw();
}

route();
