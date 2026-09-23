// 筋肉モリモリジム ベータ（この端末に保存）。認証・クラウド保存は Phase 2。
// 設定・見た目は 'kmg2.demo.*'、記録は store.js（'kmg2.data.v1'）。旧版の 'kmg.*' には触れない。

import { characterCanvas, stageOf, shoulderStageFromExp, shoulderExpFor, SHOULDER_STEPS, DEFAULT_LOOK, FACES } from '../art/character.js';
import { SKINS, HAIR_COLORS, HAIR_STYLES, CLOTH_COLORS, TOPS, BOTTOMS } from '../art/palette.js';
import {
  PARTS, PART_FILTERS, EXERCISES, EQUIPMENT, METHOD_COLS, DEMO_PREVIOUS, TITLES, GROWTH_PRESETS,
  levelOf, demoMembers, agoLabel,
} from './data.js';
import { mountLogo } from './logo.js';
import * as store from './store.js';
import * as cloud from './cloud.js';

/* ---------- 状態 ---------- */
const KEY = 'kmg2.demo.state';
const DRAFT_KEY = 'kmg2.demo.draft';
const fresh = () => ({
  lookVersion: 2,
  onboarded: false,
  profile: { name: '', look: { ...DEFAULT_LOOK, stages: undefined, frame: undefined }, title: 't_first' },
  privacy: { join: false, name: false, content: false },
  demo: { growth: 'real', members: 12, failSave: false, reduceMotion: false },
  dataVersion: 3,
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
      // ベータ化: 成長は実データ表示を初期にする（一度だけ）
      if ((s.dataVersion || 1) < 3) {
        s.demo = { ...(s.demo || {}), growth: 'real', failSave: false };
        s.dataVersion = 3;
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
// 成長の元データ。通常は保存した記録から計算。設定で見本の段階も表示できる
function growth() {
  const p = GROWTH_PRESETS[state.demo.growth];
  if (p) {
    const total = Object.values(p.exp).reduce((a, b) => a + b, 0) + p.days * 10;
    return { ...p, total, week: Math.min(3, p.days), preview: true };
  }
  const x = store.expSummary();
  return { name: '実データ', exp: x.exp, days: x.days, total: x.total, week: x.week, preview: false };
}
function stagesFromExp(exp) {
  const st = {};
  for (const p of PARTS) st[p.id] = p.id === 'shoulder' ? shoulderStageFromExp(exp.shoulder || 0) : stageOf(p.id, levelOf(exp[p.id] || 0).lv);
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
// 子要素を入れ替える。null / false は表示しない（replaceChildren は null を文字の「null」にしてしまうため）
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
}
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');

let toastT = 0;
function toast(msg, bad = false, action) {
  const t = $('#toast');
  fill(t, msg);
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
// css: 表示の高さ（CSS px）。肩が大きい時は横に広い絵になるので、幅は絵の縦横比に合わせる
function charEl(look, kind = 'detail', { animate = true, label, fit, css } = {}) {
  const c = h('canvas', { class: 'px', role: 'img', 'aria-label': label || 'キャラクター' });
  const baseH = fit ? fitSize(kind === 'gym' ? 96 : 192, fit) : css || (kind === 'gym' ? 48 : 192);
  const draw = (frame) => {
    const src = characterCanvas({ ...look, frame }, kind);
    c.width = src.width;
    c.height = src.height;
    c.style.width = (baseH * src.width) / src.height + 'px';
    c.style.height = 'auto';
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
  ctx.drawImage(src, 48 + (src.width - src.height) / 2, 14, 96, 96, 0, 0, 96, 96);
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
    if (!sheetStack.length) document.body.classList.remove('sheet-open');
    if (prevFocus && prevFocus.isConnected) prevFocus.focus();
  }
  root.append(scrim, sheet);
  sheetStack.push({ close, sheet });
  document.body.classList.add('sheet-open');
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
document.addEventListener('focusin', (e) => {
  if (e.target.matches('input:not([type=checkbox]):not([type=file]), textarea')) document.body.classList.add('typing');
});
document.addEventListener('focusout', () => setTimeout(() => {
  if (!document.activeElement || !document.activeElement.matches('input, textarea')) document.body.classList.remove('typing');
}, 50));
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
  '/auth': renderAuth,
  '/auth/reset': renderPasswordReset,
};
let cleanup = [];
function route() {
  let path = location.hash.replace(/^#/, '') || '/gym';
  const needLogin = cloud.enabled && !cloud.user() && !state.localOnly;
  if (needLogin && !path.startsWith('/auth')) path = '/auth';
  else if (!needLogin && path === '/auth') path = '/gym';
  else if (!path.startsWith('/auth') && !state.onboarded && path !== '/onboarding') path = '/onboarding';
  if (!routes[path]) path = '/gym';
  cleanup.forEach((f) => f());
  cleanup = [];
  sheetStack.slice().forEach((s) => s.close());
  const onb = path === '/onboarding' || path.startsWith('/auth');
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
  fill(tt, h('span', { class: 'logo-text' }, subTitle || '筋肉モリモリジム'));
  if (!subTitle) mountLogo(tt, { heightCss: 32 });
  fill(view);
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
    fill(wrap);
    window.scrollTo(0, 0);
    if (step === 0) wrap.append(h('div', { class: 'onb-hero' },
      charEl({ ...DEFAULT_LOOK, ...typeDefaults('male'), type: 'male' }, 'gym', { label: '男性キャラクター', css: 96 }),
      charEl({ ...DEFAULT_LOOK, ...typeDefaults('female'), type: 'female' }, 'gym', { label: '女性キャラクター', css: 96 }),
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
        state.onboardedAt = state.onboardedAt || new Date().toISOString();
        persist();
        store.profileChanged();
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
// 壁の文言（依頼者指定）。どれも9文字で、縦書き3文字×3列にきれいに収まる
const POSTERS = ['こつこつひたむきに', 'あの頃を取り戻そう', 'あなたは出来る必ず'];

// 他人から届いた見た目は信用せず、知っている項目・範囲だけ使う
function safeLook(l) {
  const o = l && typeof l === 'object' ? l : {};
  const pick = (v, list, def) => (list.some((x) => x.id === v) ? v : def);
  const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
  const st = o.stages || {};
  return {
    type: o.type === 'female' ? 'female' : 'male',
    hairStyle: pick(o.hairStyle, HAIR_STYLES, 'short'),
    hairColor: pick(o.hairColor, HAIR_COLORS, 'darkbrown'),
    skin: pick(o.skin, SKINS, 'skin2'),
    top: pick(o.top, TOPS, 'tank'),
    topColor: pick(o.topColor, CLOTH_COLORS, 'black'),
    bottom: pick(o.bottom, BOTTOMS, 'shorts'),
    bottomColor: pick(o.bottomColor, CLOTH_COLORS, 'charcoal'),
    face: pick(o.face, FACES, 'smile'),
    wristband: !!o.wristband,
    stages: { chest: num(st.chest, 2), back: num(st.back, 2), shoulder: Math.round(num(st.shoulder, 60)), arm: num(st.arm, 2), leg: num(st.leg, 2), abs: num(st.abs, 2) },
  };
}
// ジムでのポーズ。その人が直近に鍛えた部位から決める（内容が非公開の人は立ち姿）
const POSE_BY_PART = { 胸: 'press', 背中: 'row', 肩: 'raise', 脚: 'squat', 腕: 'curl', 腹: 'stretch', 有酸素: 'run' };
function poseOf(m) {
  if (m.pose) return m.pose;
  const part = m.menu && m.menu.length ? m.menu[0][0] : null;
  return POSE_BY_PART[part] || 'stand';
}

function bodyTags(look) {
  const st = (look && look.stages) || {};
  const sh = Math.round(st.shoulder || 0);
  const tags = [`肩幅 ${sh}/${SHOULDER_STEPS}`];
  const t = TITLES.filter((x) => x.shoulder != null && sh >= x.shoulder).pop();
  if (t && sh >= 9) tags.push(t.name);
  const big = ['chest', 'back', 'arm', 'leg'].filter((k) => (st[k] || 0) >= 1.6).length;
  if (big >= 2) tags.push('ムキムキ');
  return h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-top:6px' }, ...tags.map((t, i) => h('span', { class: 'pill' + (i ? ' reward' : '') }, t)));
}
const menuOf = (entries) => (Array.isArray(entries) ? entries : []).map((en) => {
  const ex = store.exById(en.exId, en);
  return ex ? [PART_FILTERS.find((q) => q.id === ex.part).name, ex.name, setsSummary(ex, Array.isArray(en.sets) ? en.sets : [])] : null;
}).filter(Boolean);

function renderGym() {
  const cloudMode = cloud.enabled && !!cloud.user();
  let members = [];
  let loading = cloudMode;
  let loadError = '';
  let mine = null;
  if (!cloudMode) {
    // ログインなし: 見本（架空）の人と、この端末の自分
    members = demoMembers(state.demo.members);
    mine = store.listWorkouts().filter((w) => Date.now() - w.createdAt < 24 * 3600e3 && w.date >= store.ymd(new Date(Date.now() - 86400e3)))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (state.privacy.join && mine) {
      members.unshift({
        id: 'me', me: true, name: state.profile.name, nameVisible: state.privacy.name, contentVisible: state.privacy.content,
        title: titleName(state.profile.title), recordedMinAgo: Math.floor((Date.now() - mine.createdAt) / 60000), comment: mine.comment || null,
        menu: menuOf(mine.entries), nice: 0, look: myLook(),
      });
    }
  }
  let page = 0;
  const pages = () => Math.max(1, Math.ceil(members.length / 20));
  let selected = null;

  const countEl = h('strong', {}, String(members.length));
  const head = h('div', { class: 'gym-head' },
    h('b', {}, '今日のジム'),
    h('span', { class: 'count' }, '直近24時間・公開中 ', countEl, ' 人'));
  const stage = h('div', { class: 'gym-stage' });
  const info = h('div', { class: 'gym-info' });
  const note = h('p', { class: 'muted small', style: 'padding:0 16px;margin:0' });
  const cta = h('div', { class: 'gym-cta', style: 'display:flex;gap:8px' },
    h('button', { class: 'btn lg', style: 'flex:1', onclick: () => openCommentSheet() }, 'ひとこと'),
    h('button', { class: 'btn primary lg', style: 'flex:2.4', onclick: () => goRecord() }, 'トレーニングを記録'));
  view.append(head, stage, info, note, cta);

  let bubbleTimer = 0;
  let bag = [];
  let shown = [];
  function pageMembers() { return members.slice(page * 20, page * 20 + 20); }

  function drawNote() {
    const meShown = members.some((m) => m.me);
    note.textContent = !state.privacy.join
      ? 'あなたは非公開です（ジムには表示されません）。設定の公開設定で変更できます。'
      : !meShown ? '記録を保存すると、24時間あなたがジムに表示されます。' : '';
    if (!cloudMode) note.textContent += ' ほかの人は見本（架空）です。ログインすると本物の共有ジムになります。';
  }
  function drawStage() {
    countEl.textContent = loading ? '…' : String(members.length);
    if (page >= pages()) page = pages() - 1;
    fill(stage);
    // ポスター（読めるテキストとして配置）
    [31.3, 44.2, 57.1].forEach((x, i) => {
      // 3文字ずつ改行して、縦書き3文字×3列の正方形に収める
      const lines = POSTERS[i].match(/.{1,3}/gu) || [POSTERS[i]];
      const sp = h('span', {});
      lines.forEach((t, k) => { if (k) sp.append(h('br')); sp.append(t); });
      stage.append(h('div', { class: 'poster', style: `left:${x}%` }, sp));
    });
    const list = pageMembers();
    if (loading) stage.append(h('div', { class: 'empty gym-empty' }, h('b', {}, '読み込み中…')));
    else if (loadError) stage.append(h('div', { class: 'empty gym-empty' }, h('b', {}, '読み込めませんでした'), loadError, h('br'), h('button', { class: 'btn', style: 'margin-top:8px', onclick: refresh }, 'もう一度')));
    else if (!list.length) stage.append(h('div', { class: 'empty gym-empty' }, h('b', {}, 'まだ誰もいません'), '記録を保存して公開すると、ここに表示されます。'));
    // 奥（上）の人から置き、手前の人が前に重なるようにする
    list.map((m, i) => [m, posOf(i)]).sort((a, b) => a[1][1] - b[1][1]).forEach(([m, [x, y]]) => {
      const label = `${m.nameVisible ? m.name : 'トレーニー'}、${m.title}、${agoLabel(m.recordedMinAgo)}`;
      const b = h('button', { class: 'slot' + (m.me ? ' me' : ''), style: `left:${x}%;top:${y}%`, 'aria-pressed': String(selected === m.id), 'aria-label': label, onclick: () => { selected = m.id; drawStage(); openMember(m); } },
        charEl({ ...m.look, pose: poseOf(m) }, 'gym', { label }));
      stage.append(b);
    });
    drawBubbles();
    fill(info, 
      h('span', {}, reduceMotion() ? '吹き出しは手動で切替' : '吹き出しは20秒ごとに交代'),
      reduceMotion() && candidates().length > 3 ? h('button', { class: 'btn', style: 'min-height:36px', onclick: () => { rotate(); } }, '次の吹き出し') : null,
      pages() > 1 ? h('div', { class: 'pager' },
        h('button', { class: 'btn', 'aria-label': '前のページ', disabled: page === 0, onclick: () => { page--; bag = []; rotate(); drawStage(); } }, '‹'),
        h('span', {}, `${page + 1} / ${pages()}`),
        h('button', { class: 'btn', 'aria-label': '次のページ', disabled: page === pages() - 1, onclick: () => { page++; bag = []; rotate(); drawStage(); } }, '›')) : null,
    );
    drawNote();
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
    const meC = candidates().find((m) => m.me);
    if (showMyBubble && meC) {
      next.push(meC.id);
      bag = bag.filter((x) => x !== meC.id);
      if (!loading) showMyBubble = false;
    }
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
      // 利用者の入力は textContent で入れる（HTMLとして実行しない）
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

  // 本物の共有ジム: 表示中だけ45秒ごとに更新（常時接続はしない）
  const localMine = () => store.listWorkouts().filter((w) => Date.now() - w.createdAt < 24 * 3600e3 && w.date >= store.ymd(new Date(Date.now() - 86400e3)))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  async function refresh() {
    if (!cloudMode) return;
    try {
      const rows = await cloud.gymNow();
      const lm = localMine();
      members = rows.map((r) => ({
        id: r.workout_id, me: r.is_me, name: r.display_name, nameVisible: true, contentVisible: r.entries != null,
        title: titleName(r.title_id), recordedMinAgo: Math.max(0, Math.floor((Date.now() - Date.parse(r.recorded_at)) / 60000)),
        comment: r.is_me && lm ? lm.comment || null : r.comment ? String(r.comment).slice(0, 40) : null, menu: r.entries ? menuOf(r.entries) : [], nice: r.nice_count, niced: r.niced,
        look: r.is_me ? myLook() : safeLook(r.look),
      }));
      // サーバーにまだ届いていない自分の記録も、この端末では表示する
      if (!members.some((m) => m.me) && state.privacy.join && lm) {
        members.push({ id: 'me', me: true, name: state.profile.name, nameVisible: true, contentVisible: true, title: titleName(state.profile.title),
          recordedMinAgo: Math.max(0, Math.floor((Date.now() - lm.createdAt) / 60000)), comment: lm.comment || null, menu: menuOf(lm.entries), nice: 0, look: myLook() });
      }
      // 自分を先頭に（ページ1に必ず入れる）
      members.sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
      loadError = '';
    } catch (e) {
      loadError = e.message;
    }
    loading = false;
    if (showMyBubble || !members.some((m) => shown.includes(m.id))) rotate();
    if (!sheetStack.length) drawStage();
  }
  rotate();
  drawStage();
  schedule();
  if (cloudMode) {
    refresh();
    const iv = setInterval(() => { if (!document.hidden && !sheetStack.length) refresh(); }, 45000);
    cleanup.push(() => clearInterval(iv));
  }
  cleanup.push(() => clearInterval(bubbleTimer));

  function openMember(m) {
    let tab = 'comment';
    let busy = false;
    const body = h('div', { class: 'sheet-body' });
    const sh = openSheet({ title: m.nameVisible ? m.name : 'トレーニー', body, expandable: false, onClose: () => { selected = null; drawStage(); } });
    sh.sheet.style.height = 'auto';
    sh.sheet.style.maxHeight = '80dvh';
    async function nice() {
      if (!cloudMode) { m.niced = !m.niced; m.nice += m.niced ? 1 : -1; draw(); return; }
      if (busy) return;
      busy = true;
      try {
        const r = await cloud.toggleNice(m.id);
        m.niced = r.niced;
        m.nice = r.nice_count;
      } catch (e) { toast(e.message, true); }
      busy = false;
      draw();
    }
    async function hide() {
      if (!cloudMode) { toast('見本の人は非表示にできません'); return; }
      const ok = await confirmDialog('非表示にする', 'この人をあなたのジムに表示しないようにします（相手には通知されません）。', [{ label: 'やめる', value: null }, { label: '非表示にする', value: true, primary: true }]);
      if (!ok) return;
      try { await cloud.block(m.id); sh.close(); toast('非表示にしました'); refresh(); } catch (e) { toast(e.message, true); }
    }
    async function doReport() {
      if (!cloudMode) { toast('見本の人は通報できません'); return; }
      const reason = await confirmDialog('通報する', '不快・不適切な内容として運営に知らせます。理由を選んでください。', [
        { label: 'やめる', value: null }, { label: 'ひとことが不適切', value: 'comment' }, { label: '名前が不適切', value: 'name' }, { label: 'その他', value: 'other', primary: true }]);
      if (!reason) return;
      try { await cloud.report(m.id, reason); toast('通報しました。運営が確認します'); } catch (e) { toast(e.message, true); }
    }
    function draw() {
      fill(body, 
        h('div', { class: 'member' },
          h('div', { class: 'portrait' }, charEl(m.look, 'detail', { label: 'キャラクター', fit: 130 })),
          h('div', {},
            h('h3', {}, m.nameVisible ? m.name : 'トレーニー'),
            h('div', { class: 'title-badge', style: 'margin:4px 0' }, m.title),
            h('div', { class: 'muted small' }, agoLabel(m.recordedMinAgo)),
            bodyTags(m.look))),
        h('div', { class: 'seg', role: 'tablist', style: 'margin:12px 0' },
          h('button', { role: 'tab', 'aria-selected': String(tab === 'comment'), onclick: () => { tab = 'comment'; draw(); } }, 'ひとこと'),
          h('button', { role: 'tab', 'aria-selected': String(tab === 'training'), onclick: () => { tab = 'training'; draw(); } }, 'トレーニング')),
        tab === 'comment'
          ? h('div', { class: 'card' }, m.comment ? m.comment : h('span', { class: 'muted' }, 'ひとことはありません'))
          : m.contentVisible && m.menu.length
            ? h('ul', { class: 'menu-list card', style: 'padding:4px 14px' }, ...m.menu.map(([p, n, s]) => h('li', {}, h('b', {}, p), h('span', {}, n, h('br'), h('span', { class: 'muted small' }, s)))))
            : h('div', { class: 'card muted' }, '内容は非公開'),
        m.me
          ? h('p', { class: 'muted small' }, '自分の記録にはナイスセットできません')
          : h('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px' },
            h('button', { class: 'btn ' + (m.niced ? 'primary' : ''), style: 'flex:1', 'aria-pressed': String(!!m.niced), disabled: busy, onclick: nice }, m.niced ? 'ナイスセット済み（取り消す）' : 'ナイスセット'),
            h('span', { class: 'muted', 'aria-label': 'ナイスセット数' }, String(m.nice || 0))),
        m.me ? null : h('div', { style: 'display:flex;gap:8px;margin-top:8px' },
          h('button', { class: 'btn ghost', style: 'flex:1', onclick: hide }, '非表示'),
          h('button', { class: 'btn ghost', style: 'flex:1', onclick: doReport }, '通報')),
      );
    }
    draw();
  }
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

// セットの要約（例: 60kg×10 / 60kg×9）
function setsSummary(ex, sets) {
  const f = (x) => ({
    wr: `${x.kg}kg×${x.reps}`,
    bw: `${x.reps}回${x.addKg ? `(+${x.addKg}kg)` : ''}`,
    assist: `補助${x.assistKg}kg×${x.reps}`,
    time: `${x.sec}秒`,
    cardio: `${x.min}分${x.km ? ` ${x.km}km` : ''}`,
  })[ex.method];
  return sets.map(f).join(' / ');
}

// editId: 保存済み記録の編集
function trainingForm({ inSheet, editId, onSaved }) {
  const editing = editId ? store.getWorkout(editId) : null;
  const d = editing
    ? { date: editing.date, filter: 'chest', comment: editing.comment || '', entries: JSON.parse(JSON.stringify(editing.entries)).map((en) => ({ ...en, sets: en.sets.map((x) => ({ ...x, done: true })) })) }
    : loadDraft();
  const body = h('div', { class: inSheet ? 'sheet-body' : 'pad' });
  const status = h('span', { class: 'sync', 'aria-live': 'polite' }, d.entries.length ? '下書き保存済み（この端末）' : '');
  const saveBtn = h('button', { class: 'btn primary lg', style: 'flex:1' }, editing ? '変更を保存' : '記録を保存');
  const foot = h('div', { class: 'sheet-foot' }, h('div', { style: 'flex:1;min-width:0' }, status), saveBtn);
  const errors = {};
  let query = '';
  let searchOpen = !d.entries.length;

  function changed() { if (!editing) saveDraftSoon(d, status); else status.textContent = '未保存の変更があります'; }
  function draw() {
    const focusId = document.activeElement && document.activeElement.id;
    fill(body);
    const dateIn = h('input', { class: 'in', type: 'date', id: 'tr-date', value: d.date, max: today(), onchange: (e) => { d.date = e.target.value; changed(); } });
    body.append(h('label', { class: 'field', for: 'tr-date', style: 'margin-bottom:10px' }, h('span', {}, '日付'), dateIn));
    body.append(h('div', { class: 'chips', role: 'group', 'aria-label': '部位で絞り込み', style: 'margin-bottom:10px' },
      ...PART_FILTERS.concat([{ id: 'bwonly', name: '自重' }]).map((p) => h('button', { 'aria-pressed': String(d.filter === p.id), onclick: () => { d.filter = p.id; query = ''; searchOpen = true; changed(); draw(); } }, p.name))));

    d.entries.forEach((en) => body.append(entryCard(en)));

    // 種目の検索と追加
    const box = h('div', { class: 'card', style: 'margin-top:12px' });
    if (searchOpen) {
      const q = h('input', { class: 'in', id: 'ex-q', type: 'search', placeholder: '種目を検索（ひらがな・カタカナ可）', value: query, autocomplete: 'off',
        oninput: (e) => { query = e.target.value; drawResults(); } });
      const res = h('ul', { class: 'ex-results', role: 'listbox', 'aria-label': '種目' });
      const addBox = h('div');
      function drawResults() {
        const nq = norm(query);
        const pool = EXERCISES.concat(store.customExercises());
        const inFilter = (x) => (d.filter === 'bwonly' ? x.method === 'bw' || x.method === 'time' || x.eq === 'bw' : x.part === d.filter);
        const list = pool.filter((x) => (!nq ? inFilter(x) : true) && (!nq || norm(x.name).includes(nq) || x.alias.some((a) => norm(a).includes(nq))));
        const partName = (x) => PART_FILTERS.find((p) => p.id === x.part).name;
        // 器具ごとに見出しを付ける（自分の種目は先頭）
        // 「自重」やキーワード検索の時は部位ごと、部位で絞った時は器具ごと
        const byPart = d.filter === 'bwonly' || !!nq;
        const groups = [{ id: 'mine', name: '自分の種目', items: list.filter((x) => x.custom) }].concat(byPart
          ? PART_FILTERS.map((p) => ({ ...p, items: list.filter((x) => !x.custom && x.part === p.id) }))
          : EQUIPMENT.map((e) => ({ ...e, items: list.filter((x) => !x.custom && x.eq === e.id) })));
        const rows = [];
        groups.filter((g) => g.items.length).forEach((g) => {
          rows.push(h('li', { class: 'ex-group', 'aria-hidden': 'true' }, `${g.name}（${g.items.length}）`));
          g.items.forEach((x) => rows.push(h('li', {}, h('button', { onclick: () => addEntry(x) }, x.name,
            h('small', {}, byPart ? (EQUIPMENT.find((e) => e.id === x.eq) || {}).name || '' : x.method === 'time' ? '秒' : x.method === 'assist' ? '補助' : x.method === 'bw' ? '回数' : '')))));
        });
        fill(res, rows);
        if (!list.length) res.append(h('li', { class: 'muted small', style: 'padding:10px 12px' }, '見つかりません。下の「自分の種目を追加」から登録できます。'));
        drawAdd();
      }
      // 自分の種目を追加（名前・部位・記録のしかた）
      let adding = false;
      const METHOD_NAMES = [['wr', '重量×回数'], ['bw', '自重（回数）'], ['assist', 'アシスト'], ['time', '時間（秒）']];
      function drawAdd() {
        fill(addBox);
        if (!adding) {
          addBox.append(h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => { adding = true; drawAdd(); addBox.querySelector('input')?.focus(); } },
            query.trim() ? `＋「${query.trim().slice(0, 30)}」を自分の種目として追加` : '＋ 自分の種目を追加'));
          return;
        }
        const def = { name: query.trim().slice(0, 30), part: d.filter === 'bwonly' ? 'chest' : d.filter, method: d.filter === 'cardio' ? 'cardio' : d.filter === 'bwonly' ? 'bw' : 'wr' };
        const nameIn = h('input', { class: 'in', id: 'cx-name', maxlength: 30, value: def.name, placeholder: '例: ケーブルクロスオーバー', oninput: (e) => (def.name = e.target.value) });
        const err = h('p', { class: 'err', role: 'alert', style: 'margin:0' });
        const partChips = h('div', { class: 'chips' });
        const methodChips = h('div', { class: 'chips' });
        const paint = () => {
          fill(partChips, ...PART_FILTERS.map((p) => h('button', { 'aria-pressed': String(def.part === p.id), onclick: () => { def.part = p.id; if (p.id === 'cardio') def.method = 'cardio'; else if (def.method === 'cardio') def.method = 'wr'; paint(); } }, p.name)));
          fill(methodChips, ...(def.part === 'cardio' ? [['cardio', '時間（分）・距離']] : METHOD_NAMES).map(([k, n]) => h('button', { 'aria-pressed': String(def.method === k), onclick: () => { def.method = k; paint(); } }, n)));
        };
        paint();
        addBox.append(h('div', { class: 'card stack', style: 'margin-top:8px;background:#1a1d21' },
          h('b', {}, '自分の種目を追加'),
          h('label', { class: 'field', for: 'cx-name' }, h('span', {}, '種目名（30文字まで）'), nameIn),
          h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:4px' }, '鍛える部位（EXPが入る部位）'), partChips),
          h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:4px' }, '記録のしかた'), methodChips),
          err,
          h('div', { style: 'display:flex;gap:8px' },
            h('button', { class: 'btn', style: 'flex:1', onclick: () => { adding = false; drawAdd(); } }, 'やめる'),
            h('button', { class: 'btn primary', style: 'flex:2', onclick: () => {
              try {
                const ex = store.addCustomExercise(def);
                adding = false;
                toast(ex.custom ? `「${ex.name}」を追加しました` : `「${ex.name}」はすでにあります`);
                addEntry(ex);
              } catch (e) { err.textContent = e.message; }
            } }, '追加して記録する'))));
      }
      drawResults();
      box.append(h('label', { class: 'field', for: 'ex-q' }, h('span', {}, '種目を追加'), q), res, addBox);
    } else {
      box.append(h('button', { class: 'btn block', onclick: () => { searchOpen = true; draw(); $('#ex-q')?.focus(); } }, '＋ 種目を追加'));
    }
    body.append(box);

    body.append(timerCard());

    // ひとことはジムの「ひとこと」ボタンから投稿する（依頼者指示で記録画面のコメント欄は置かない）
    body.append(h('p', { class: 'small muted', style: 'margin:12px 0 0' }, 'ひとことは、ジムの「ひとこと」ボタンから投稿できます。'));
    if (errors.form) body.append(h('p', { class: 'err', role: 'alert' }, errors.form));
    if (focusId) document.getElementById(focusId)?.focus();
  }
  let cnt;

  function addEntry(x) {
    d.entries.push({ id: uid(), exId: x.id, sets: [{ id: uid(), done: false }], ...(x.custom ? { custom: { name: x.name, part: x.part, method: x.method } } : {}) });
    query = '';
    searchOpen = false;
    changed();
    draw();
  }

  function entryCard(en) {
    const ex = store.exById(en.exId, en);
    const cols = METHOD_COLS[ex.method];
    const prev = store.previousFor(en.exId, d.date, editId);
    const card = h('div', { class: 'ex-card' });
    card.append(h('div', { class: 'ex-top' },
      h('h3', {}, ex.name),
      h('span', { class: 'pill' }, PART_FILTERS.find((p) => p.id === ex.part).name),
      h('button', { class: 'del', 'aria-label': `${ex.name}を削除`, onclick: () => { const i = d.entries.indexOf(en); d.entries.splice(i, 1); changed(); draw(); toast('種目を削除しました', false, { label: '取り消す', fn: () => { d.entries.splice(i, 0, en); changed(); draw(); } }); } }, '×')));
    if (prev) {
      const sum = setsSummary(ex, prev.sets);
      card.append(h('div', { class: 'prev' }, h('span', {}, `前回（${prev.date.slice(5).replace('-', '/')}）${sum}`),
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
    // 新しいIDで値だけを写す（完了はオフ）
    const copies = prev.sets.map(copySet);
    en.sets = mode === 'add' ? en.sets.concat(copies) : copies;
    changed();
    draw();
    toast(`${prev.date.slice(5).replace('-', '/')}の記録をコピーしました（完了はオフ）`);
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
      fill(btns, 
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
    card.append(h('b', {}, '休憩'), t, stateLbl, btns, h('span', { class: 'small muted' }, '音・通知はまだ出ません（画面表示のみ）'));
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
      const ex = store.exById(en.exId, en);
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
    if (d.date > today()) { errors.form = '未来の日付には記録できません'; draw(); return; }
    const { gain, bonus } = store.expGainOf(d.entries, d.date, editId);
    const saved = store.saveWorkout({ id: editId, date: d.date, entries: d.entries, comment: d.comment });
    if (!saved) { errors.form = 'この端末に保存できませんでした（容量不足の可能性）。入力はそのまま残っています'; draw(); return; }
    const txt = Object.entries(gain).map(([q, v]) => `${PARTS.find((x) => x.id === q).name} +${v}EXP`).concat(bonus ? [`継続 +${bonus}EXP`] : []).join('・');
    const dropped = d.entries.some((en) => en.sets.some((x) => !x.done));
    if (editing) {
      toast('変更を保存しました');
    } else {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      toast(`保存しました${txt ? '・' + txt : ''}${dropped ? '（未完了のセットは保存していません）' : ''}`);
      Object.assign(d, { date: today(), entries: [], comment: '' });
      searchOpen = true;
      status.textContent = '';
      draw();
    }
    store.profileChanged();
    if (onSaved) onSaved(saved);
  };

  draw();
  return { body, foot };
}

function openTrainingSheet({ editId } = {}) {
  let sh = null;
  const { body, foot } = trainingForm({ inSheet: true, editId, onSaved: () => { if (sh) sh.close(); route(); } });
  sh = openSheet({ title: editId ? '記録を編集' : 'トレーニングを記録', body, foot, full: !!editId });
}
let showMyBubble = false; // ひとこと投稿直後は自分の吹き出しを最初に出す
// 記録ページ（トレーニング）へ。入力中にジムの絵が出ないよう、重ねて開かずにページを切り替える
function goRecord() {
  state.recordTab = 'training';
  persist();
  if (location.hash === '#/record') route();
  else location.hash = '#/record';
}

// ひとことだけ投稿（トレーニングの記録なしでもOK）
function openCommentSheet() {
  const text = h('textarea', { class: 'in', id: 'cm-text', rows: 2, maxlength: 40, placeholder: '例: 今日は軽めにストレッチ' });
  const cnt = h('span', { class: 'muted small' }, '0/40');
  text.addEventListener('input', () => (cnt.textContent = `${[...text.value].length}/40`));
  const err = h('p', { class: 'err', role: 'alert', style: 'margin:0' });
  const joinBox = h('input', { type: 'checkbox', id: 'cm-join', role: 'switch' });
  joinBox.checked = true;
  const body = h('div', { class: 'sheet-body stack' },
    h('label', { class: 'field', for: 'cm-text' }, h('span', {}, 'ひとこと（40文字まで）'), text),
    h('div', { style: 'display:flex;justify-content:space-between' }, h('span', { class: 'small muted' }, '共有ジムの全員に24時間表示されます'), cnt),
    state.privacy.join ? null : h('label', { class: 'toggle', for: 'cm-join' }, h('span', {}, 'ジムに参加して表示する', h('br'), h('small', { class: 'muted' }, 'オフのままだと自分にしか見えません')), joinBox),
    err);
  const foot = h('div', { class: 'sheet-foot' });
  const sh = openSheet({ title: 'ひとこと', body, foot, expandable: false });
  sh.sheet.style.height = 'auto';
  foot.append(h('button', { class: 'btn', style: 'flex:1', onclick: () => sh.close() }, 'やめる'),
    h('button', { class: 'btn primary', style: 'flex:2', onclick: () => {
      try {
        if (!state.privacy.join && joinBox.checked) { state.privacy.join = true; persist(); store.profileChanged(); }
        if (!store.postComment(text.value, today())) { err.textContent = '保存できませんでした'; return; }
      } catch (e) { err.textContent = e.message; return; }
      sh.close();
      showMyBubble = true;
      toast('ひとことを投稿しました');
      // ログイン中はサーバーに届いてから描き直す（届かなくても、自分の画面にはすぐ出す）
      Promise.race([store.flush(), new Promise((r) => setTimeout(r, 4000))]).finally(() => route());
    } }, '投稿する'));
}

const copySet = ({ id, done, ...vals }) => ({ ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v == null ? '' : String(v)])), id: uid(), done: false });
// 保存済みのメニューを今日の下書きへコピー（新しいID・完了オフ・コメントはコピーしない）
async function copyMenuToDraft(w) {
  const cur = loadDraft();
  let mode = 'replace';
  if (cur.entries.length) {
    mode = await confirmDialog('メニューをコピー', '書きかけの記録があります。どうしますか？', [
      { label: 'キャンセル', value: null }, { label: '追加', value: 'add' }, { label: '置き換え', value: 'replace', primary: true }]);
    if (!mode) return;
  }
  const copied = w.entries.map((en) => ({ id: uid(), exId: en.exId, sets: en.sets.map(copySet) }));
  const next = { date: today(), filter: cur.filter, comment: mode === 'add' ? cur.comment : '', entries: mode === 'add' ? cur.entries.concat(copied) : copied };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch (e) {}
  goRecord();
  toast(`${w.date.slice(5).replace('-', '/')}のメニューをコピーしました（完了はオフ）`);
}

/* ============================================================
 * 記録タブ
 * ============================================================ */
function renderRecord() {
  const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': '記録の種類' });
  const host = h('div');
  view.append(h('div', { class: 'pad', style: 'padding-bottom:0' }, seg), host);
  function draw() {
    fill(seg, 
      h('button', { role: 'tab', 'aria-selected': String(state.recordTab === 'training'), onclick: () => { state.recordTab = 'training'; persist(); draw(); } }, 'トレーニング'),
      h('button', { role: 'tab', 'aria-selected': String(state.recordTab === 'body'), onclick: () => { state.recordTab = 'body'; persist(); draw(); } }, 'からだ'));
    fill(host);
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
  const saved = h('p', { class: 'small muted', style: 'margin:0' });
  let pfcOpen = false;
  const w = h('input', { class: 'in', id: 'bw', inputmode: 'decimal', placeholder: '未記録', 'aria-label': '体重（kg）', oninput: (e) => (v.weight = e.target.value) });
  const kcal = h('input', { class: 'in', id: 'kcal', inputmode: 'numeric', placeholder: '未記録', style: 'font-size:22px;font-weight:800;text-align:center', oninput: (e) => (v.kcal = e.target.value) });
  const pin = {};
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
    pin[k] = h('input', { class: 'in', id, inputmode: 'decimal', placeholder: '未記録', oninput: (e) => (v[k] = e.target.value) });
    pfc.append(h('label', { class: 'field', for: id, style: 'margin-bottom:8px' }, h('span', {}, { p: 'たんぱく質 P（g）', f: '脂質 F（g）', c: '炭水化物 C（g）' }[k]), pin[k]));
  });
  const pfcBtn = h('button', { class: 'btn block', 'aria-expanded': 'false', onclick: () => { pfcOpen = !pfcOpen; pfc.hidden = !pfcOpen; pfcBtn.setAttribute('aria-expanded', String(pfcOpen)); pfcBtn.textContent = pfcOpen ? 'PFC を閉じる' : 'PFC を入力（任意）'; } }, 'PFC を入力（任意）');
  const prevBtn = h('button', { class: 'btn', style: 'min-height:36px' });
  // その日の保存済みの値を入れる（朝の体重に夜カロリーを追記しても体重が残る）
  function loadDate() {
    const r = store.getBody(v.date) || {};
    const str = (x) => (x == null ? '' : String(x));
    Object.assign(v, { weight: r.weight != null ? Number(r.weight).toFixed(1) : '', kcal: str(r.kcal), p: str(r.p), f: str(r.f), c: str(r.c) });
    w.value = v.weight; kcal.value = v.kcal; ['p', 'f', 'c'].forEach((k) => (pin[k].value = v[k]));
    if (v.p || v.f || v.c) { pfcOpen = false; pfcBtn.click(); }
    const prev = store.listBody().filter((x) => x.date < v.date && x.weight != null).pop();
    prevBtn.hidden = !prev;
    if (prev) {
      prevBtn.textContent = `前回 ${Number(prev.weight).toFixed(1)}kg を入れる`;
      prevBtn.onclick = () => { v.weight = Number(prev.weight).toFixed(1); w.value = v.weight; };
    }
    saved.textContent = r.updatedAt ? `この日の記録は保存済み（${new Date(r.updatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）。変更して保存し直せます` : '';
  }
  wrap.append(
    h('label', { class: 'field', for: 'bd-date' }, h('span', {}, '日付'), h('input', { class: 'in', type: 'date', id: 'bd-date', value: v.date, max: today(), onchange: (e) => { v.date = e.target.value; loadDate(); } })),
    saved,
    h('div', { class: 'card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, h('b', {}, '体重'), prevBtn),
      h('div', { class: 'big-num' }, h('button', { class: 'btn step', 'aria-label': '0.1kg減らす', onclick: () => stepW(-1) }, '−0.1'), w, h('span', { class: 'unit' }, 'kg'), h('button', { class: 'btn step', 'aria-label': '0.1kg増やす', onclick: () => stepW(1) }, '+0.1'))),
    h('div', { class: 'card' }, h('label', { class: 'field', for: 'kcal' }, h('span', {}, '摂取カロリー（kcal）'), kcal)),
    pfcBtn, pfc, err,
    h('p', { class: 'muted small', style: 'margin:0' }, 'すべて任意です。空欄は「未記録」、0は「0を入力」として区別します。からだ記録は他の人に公開されません。'),
    h('button', { class: 'btn primary lg block', onclick: () => {
      err.textContent = '';
      const chk = (x, int, pos) => (x === '' ? null : /^\d+(\.\d)?$/.test(x) && (!int || /^\d+$/.test(x)) && isFinite(Number(x)) && (!pos || Number(x) > 0) && x.length <= 7 ? Number(x) : NaN);
      const vals = { weight: chk(v.weight, false, true), kcal: chk(v.kcal, true), p: chk(v.p), f: chk(v.f), c: chk(v.c) };
      if (Object.values(vals).some((x) => Number.isNaN(x))) { err.textContent = '体重は正の数（小数1桁まで）、kcalは0以上の整数、PFCは0以上（小数1桁まで）で入力してください'; return; }
      const had = store.getBody(v.date);
      if (!had && Object.values(vals).every((x) => x === null)) { err.textContent = '入力がありません（全て空欄の記録は保存しません）'; return; }
      // 空欄にした項目は「未記録」に戻す（保存済みの日を編集した時）
      const fields = {};
      for (const [k, x] of Object.entries(vals)) if (x !== null || (had && had[k] != null)) fields[k] = x;
      if (!store.upsertBody(v.date, fields)) { err.textContent = 'この端末に保存できませんでした。入力はそのまま残っています'; return; }
      toast('保存しました（この端末）');
      loadDate();
    } }, '保存'),
  );
  loadDate();
  return wrap;
}

/* ============================================================
 * 履歴・グラフ
 * ============================================================ */
const PERIODS = [['1m', '1ヶ月', 30], ['3m', '3ヶ月', 91], ['6m', '6ヶ月', 182], ['1y', '1年', 365], ['all', '全期間', 0]];
let histTab = 'training';
let histPeriod = '1m';
const md = (d) => d.slice(5).replace('-', '/');

function renderHistory() {
  const box = h('div', { class: 'pad stack' });
  view.append(box);
  function draw() {
    const [, , days] = PERIODS.find((x) => x[0] === histPeriod);
    const from = days ? store.ymd(new Date(Date.now() - (days - 1) * 86400e3)) : '0000-00-00';
    const to = today();
    fill(box, 
      h('div', { class: 'seg', role: 'tablist' }, ...[['training', 'トレーニング'], ['weight', '体重'], ['kcal', 'カロリー'], ['pfc', 'PFC']].map(([k, n]) =>
        h('button', { role: 'tab', 'aria-selected': String(histTab === k), onclick: () => { histTab = k; draw(); } }, n))),
      h('div', { class: 'chips' }, ...PERIODS.map(([k, n]) => h('button', { 'aria-pressed': String(histPeriod === k), onclick: () => { histPeriod = k; draw(); } }, n))),
      h('p', { class: 'small muted', style: 'margin:0' }, days ? `${md(from)} 〜 ${md(to)}` : '全期間'),
    );
    if (histTab === 'training') box.append(...trainingHistory(from, to));
    else box.append(...bodyHistory(histTab, from, to));
  }
  draw();
  cleanup.push(() => {});
}

function trainingHistory(from, to) {
  const list = store.listWorkouts().filter((w) => w.date >= from && w.date <= to);
  if (!list.length) return [h('div', { class: 'empty' }, h('b', {}, 'この期間の記録はありません'), '記録タブかジムの「トレーニングを記録」から保存できます。')];
  const byDate = {};
  list.forEach((w) => (byDate[w.date] = byDate[w.date] || []).push(w));
  return Object.entries(byDate).map(([date, ws]) => h('div', { class: 'card' },
    h('b', {}, `${md(date)}（${'日月火水木金土'[new Date(date + 'T00:00').getDay()]}）`),
    ...ws.map((w) => h('button', { class: 'hist-item', onclick: () => openWorkoutDetail(w) },
      ...w.entries.map((en) => {
        const ex = store.exById(en.exId, en);
        return h('div', { class: 'hist-row' }, h('span', { class: 'pill' }, PART_FILTERS.find((q) => q.id === ex.part).name), h('span', {}, ex.name), h('small', { class: 'muted' }, setsSummary(ex, en.sets)));
      }),
      w.entries.length ? null : h('div', { class: 'small muted' }, 'ひとことのみ'),
      w.comment ? h('div', { class: 'small muted' }, '「' + w.comment + '」') : null))));
}

function openWorkoutDetail(w) {
  const body = h('div', { class: 'sheet-body' },
    ...w.entries.map((en) => {
      const ex = store.exById(en.exId, en);
      return h('div', { class: 'card', style: 'margin-bottom:8px' }, h('b', {}, ex.name), h('div', { class: 'small muted' }, setsSummary(ex, en.sets)));
    }),
    w.comment ? h('p', { class: 'small' }, 'ひとこと: ' + w.comment) : null,
    h('p', { class: 'small muted' }, `保存 ${new Date(w.createdAt).toLocaleString('ja-JP')}${w.updatedAt !== w.createdAt ? ` ／ 更新 ${new Date(w.updatedAt).toLocaleString('ja-JP')}` : ''}`));
  const foot = h('div', { class: 'sheet-foot', style: 'flex-wrap:wrap' });
  const sh = openSheet({ title: `${md(w.date)} の記録`, body, foot, expandable: false });
  sh.sheet.style.height = 'auto';
  sh.sheet.style.maxHeight = '85dvh';
  foot.append(
    h('button', { class: 'btn primary', style: 'flex:1', onclick: () => { sh.close(); copyMenuToDraft(w); } }, 'このメニューで記録'),
    h('button', { class: 'btn', style: 'flex:1', onclick: () => { sh.close(); openTrainingSheet({ editId: w.id }); } }, '編集'),
    h('button', { class: 'btn ghost', style: 'flex:1', onclick: async () => {
      const ok = await confirmDialog('記録を削除', `${md(w.date)} の記録を削除します。EXP も計算し直されます。`, [{ label: 'やめる', value: null }, { label: '削除する', value: true, primary: true }]);
      if (!ok) return;
      store.deleteWorkout(w.id);
      sh.close();
      route();
      toast('削除しました', false, { label: '取り消す', fn: () => { store.restoreWorkout(w.id); route(); } });
    } }, '削除'),
  );
}

// 体重は折れ線（未記録の日で線を切る）、カロリーは棒。値の一覧も出す
function bodyHistory(kind, from, to) {
  const rows = store.listBody().filter((r) => r.date >= from && r.date <= to);
  if (kind === 'pfc') {
    const pr = rows.filter((r) => r.p != null || r.f != null || r.c != null);
    if (!pr.length) return [h('div', { class: 'empty' }, h('b', {}, 'PFC の記録はありません'), 'からだ記録で PFC を入力すると表示されます。')];
    const full = pr.filter((r) => r.p != null && r.f != null && r.c != null);
    const e = full.reduce((a, r) => ({ p: a.p + r.p * 4, f: a.f + r.f * 9, c: a.c + r.c * 4 }), { p: 0, f: 0, c: 0 });
    const sum = e.p + e.f + e.c;
    return [
      sum ? h('div', { class: 'card' }, h('b', {}, 'エネルギー比率（P/F/C すべて入力した日）'),
        h('div', { class: 'pfc-bar' }, ...[['p', '#3b82f6'], ['f', '#f08a3c'], ['c', '#e8b93c']].map(([k, c]) => h('i', { style: `width:${(e[k] / sum) * 100}%;background:${c}` }))),
        h('div', { class: 'small' }, `P ${Math.round((e.p / sum) * 100)}% ／ F ${Math.round((e.f / sum) * 100)}% ／ C ${Math.round((e.c / sum) * 100)}%（${full.length}日）`))
        : h('p', { class: 'small muted' }, 'P・F・C の3つがそろった日がないため、比率は出していません'),
      valueTable(pr.slice().reverse(), (r) => ['p', 'f', 'c'].map((k) => (r[k] == null ? '—' : `${r[k]}g`)).join(' / ')),
    ];
  }
  const key = kind === 'weight' ? 'weight' : 'kcal';
  const pts = rows.filter((r) => r[key] != null);
  if (!pts.length) return [h('div', { class: 'empty' }, h('b', {}, kind === 'weight' ? '体重の記録はありません' : 'カロリーの記録はありません'), '記録タブの「からだ」から入力できます。')];
  const vals = pts.map((r) => Number(r[key]));
  const out = [];
  if (kind === 'weight') {
    const last = pts[pts.length - 1];
    const diff = pts.length >= 2 ? (Math.round((Number(last.weight) - Number(pts[0].weight)) * 10) / 10) : null;
    out.push(h('div', { class: 'stats' },
      h('div', {}, h('b', {}, `${Number(last.weight).toFixed(1)}`), h('span', {}, `最新（${md(last.date)}）kg`)),
      h('div', {}, h('b', {}, diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`), h('span', {}, diff == null ? '比較する記録がありません' : '期間の最初→最後 kg')),
      h('div', {}, h('b', {}, `${pts.length}日`), h('span', {}, '記録した日'))));
  } else {
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    out.push(h('div', { class: 'stats' },
      h('div', {}, h('b', {}, avg.toLocaleString()), h('span', {}, '平均 kcal')),
      h('div', {}, h('b', {}, Math.max(...vals).toLocaleString()), h('span', {}, '最高 kcal')),
      h('div', {}, h('b', {}, Math.min(...vals).toLocaleString()), h('span', {}, `最低 kcal（${pts.length}日）`))));
  }
  out.push(h('div', { class: 'card chart' }, chartSvg(kind, rows, key, from, to)));
  out.push(valueTable(pts.slice().reverse(), (r) => (kind === 'weight' ? `${Number(r.weight).toFixed(1)} kg` : `${Number(r.kcal).toLocaleString()} kcal`)));
  return out;
}

function valueTable(list, fmt) {
  return h('div', { class: 'card', style: 'padding:4px 14px' }, h('ul', { class: 'unlock-list' }, ...list.slice(0, 60).map((r) => h('li', {}, h('span', {}, md(r.date)), h('span', {}, fmt(r))))));
}

function chartSvg(kind, rows, key, from, to) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const W = 340, H = 180, L = 40, R = 8, T = 10, B = 24;
  const pts = rows.filter((r) => r[key] != null);
  const first = from === '0000-00-00' ? pts[0].date : from;
  const t0 = new Date(first + 'T00:00').getTime(), t1 = Math.max(new Date(to + 'T00:00').getTime(), t0 + 86400e3);
  const vals = pts.map((r) => Number(r[key]));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (kind === 'kcal') lo = 0;
  const pad = kind === 'weight' ? Math.max(0.5, (hi - lo) * 0.15) : hi * 0.1;
  lo = kind === 'weight' ? lo - pad : 0; hi += pad;
  if (hi === lo) hi = lo + 1;
  const x = (d) => L + ((new Date(d + 'T00:00').getTime() - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': kind === 'weight' ? '体重の推移' : '摂取カロリー' });
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3;
    svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#333a42', 'stroke-width': 1 }));
    const t = el('text', { x: L - 4, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#b9c2ca' });
    t.textContent = kind === 'weight' ? v.toFixed(1) : Math.round(v).toLocaleString();
    svg.append(t);
  }
  [first, to].forEach((d, i) => {
    const t = el('text', { x: i ? W - R : L, y: H - 6, 'text-anchor': i ? 'end' : 'start', 'font-size': 10, fill: '#b9c2ca' });
    t.textContent = md(d);
    svg.append(t);
  });
  if (kind === 'kcal') {
    const bw = Math.max(2, Math.min(14, ((W - L - R) / Math.max(1, (t1 - t0) / 86400e3)) * 0.7));
    pts.forEach((r) => svg.append(el('rect', { x: x(r.date) - bw / 2, y: y(Number(r.kcal)), width: bw, height: y(0) - y(Number(r.kcal)), fill: '#39d9c6', rx: 1 })));
  } else {
    // 連続した日だけ線でつなぐ（未記録の日で線を切る）
    let seg = [];
    const flush = () => { if (seg.length > 1) svg.append(el('polyline', { points: seg.map(([a, b]) => `${a},${b}`).join(' '), fill: 'none', stroke: '#39d9c6', 'stroke-width': 2 })); seg = []; };
    let prev = null;
    pts.forEach((r) => {
      const gap = prev && (new Date(r.date + 'T00:00') - new Date(prev + 'T00:00')) / 86400e3 > 1;
      if (gap) flush();
      seg.push([x(r.date), y(Number(r.weight))]);
      prev = r.date;
    });
    flush();
    pts.forEach((r) => svg.append(el('circle', { cx: x(r.date), cy: y(Number(r.weight)), r: 3, fill: '#39d9c6' })));
  }
  return svg;
}

/* ============================================================
 * 成長
 * ============================================================ */
function renderGrowth() {
  const gr = growth();
  const look = myLook();
  const total = gr.total;
  const tl = levelOf(total);
  const shoulderLv = levelOf(gr.exp.shoulder).lv;
  view.append(
    h('div', { class: 'hero-char' }, h('div', { class: 'plate', 'aria-hidden': 'true' }), charEl(look, 'detail', { label: 'あなたのキャラクター' })),
    h('div', { class: 'name-row' }, h('h2', {}, state.profile.name || 'あなた'), h('span', { class: 'title-badge' }, titleName(state.profile.title))),
    h('div', { class: 'pad stack' },
      gr.preview ? h('p', { class: 'small', style: 'margin:0;text-align:center;color:var(--reward)' }, `見本の成長段階「${gr.name}」を表示中（設定で「実データ」に戻せます）`) : null,
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, `Lv.${tl.lv}`), h('span', {}, `総EXP ${total.toLocaleString()}`)),
        h('div', {}, h('b', {}, `${gr.days}日`), h('span', {}, '累計記録日')),
        h('div', {}, h('b', {}, `${gr.week}回`), h('span', {}, '今週の記録'))),
      h('button', { class: 'btn primary lg block', onclick: openDressSheet }, '着せ替え'),
      h('h2', { class: 'sec' }, '部位の成長', h('small', {}, '鍛えた分だけ、少しずつ変わる')),
      h('div', { class: 'parts' }, ...PARTS.map((p) => {
        const l = levelOf(gr.exp[p.id]);
        const hot = p.id === 'shoulder' && shoulderStageFromExp(gr.exp.shoulder || 0) >= 3;
        return h('div', { class: 'part' + (hot ? ' hot' : '') },
          h('div', { class: 'h' }, h('b', {}, p.name), h('span', {}, `Lv.${l.lv}`)),
          h('div', { class: 'bar', role: 'progressbar', 'aria-label': `${p.name}の次のレベルまで`, 'aria-valuemin': 0, 'aria-valuemax': l.need, 'aria-valuenow': l.cur }, h('i', { style: `width:${Math.round((l.cur / l.need) * 100)}%` })),
          h('div', { class: 'n' }, `${l.cur} / ${l.need} EXP`),
          hot ? h('div', { class: 'tag' }, (TITLES.filter((x) => x.shoulder != null && shoulderStageFromExp(gr.exp.shoulder || 0) >= x.shoulder).pop() || {}).name || '肩幅成長中') : null,
          p.id === 'shoulder' ? (() => {
            const n = shoulderStageFromExp(gr.exp.shoulder || 0);
            return h('div', { class: 'n', style: 'color:var(--reward)' }, n >= SHOULDER_STEPS ? `肩幅 ${n}/${SHOULDER_STEPS}（最大）` : `肩幅 ${n}/${SHOULDER_STEPS}・次まで ${shoulderExpFor(n + 1) - (gr.exp.shoulder || 0)}EXP`);
          })() : null);
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
    fill(preview, charEl({ ...look, stages: stagesFromExp(gr.exp) }, 'detail', { label: '着せ替えのプレビュー' }));
  }
  function set(k, v) { look[k] = v; onChange(); drawPreview(); drawPanel(); }
  const sw = (list, key, colorOf) => h('div', { class: 'swatches' }, ...list.map((c) => h('button', { class: 'sw', 'aria-pressed': String(look[key] === c.id), onclick: () => set(key, c.id) }, h('i', { style: `background:${colorOf(c)}` }), c.name)));
  function drawPanel() {
    const T = [['hair', '髪'], ['face', '表情'], ['skin', '肌'], ['wear', 'ウェア']].concat(titles ? [['title', '称号']] : []);
    fill(tabs, ...T.map(([k, n]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; drawPanel(); } }, n)));
    fill(panel);
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
        const shSt = shoulderStageFromExp(gr.exp.shoulder || 0);
        const ok = t.id === 't_first' || (t.id === 't_3days' && gr.days >= 3) || (t.id === 't_30days' && gr.days >= 30) || (t.shoulder != null && shSt >= t.shoulder);
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
    store.profileChanged();
    dirty = false;
    sh.close('applied');
    toast('着せ替えを保存しました（この端末）');
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
      ...accountRows()),
    h('h2', { class: 'sec' }, '記録のデータ', h('small', {}, cloud.user() ? 'クラウドに保存（この端末にも控え）' : 'この端末のブラウザだけに保存')),
    dataCard(),
    h('h2', { class: 'sec' }, '共有ジムの公開', h('small', {}, '初期は非公開')),
    privacyToggles(p, () => { persist(); store.profileChanged(); }),
    h('h2', { class: 'sec' }, '表示'),
    h('div', { class: 'card', style: 'padding:4px 14px' }, (() => {
      const inp = h('input', { type: 'checkbox', id: 'rm', role: 'switch' });
      inp.checked = state.demo.reduceMotion;
      inp.onchange = () => { state.demo.reduceMotion = inp.checked; persist(); };
      return h('label', { class: 'toggle', for: 'rm' }, h('span', {}, '動きを減らす', h('br'), h('small', { class: 'muted' }, '端末の設定でも自動で有効')), inp);
    })()),
    h('h2', { class: 'sec' }, '契約'),
    h('div', { class: 'card small' }, '年会費 1,000円。税表示・更新方式・返金などの販売条件は未承認のため、課金は実装していません（Phase 4）。'),
    h('h2', { class: 'sec' }, '見た目の確認', h('small', {}, '記録には影響しません')),
    h('div', { class: 'card stack' },
      h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:4px' }, '成長の表示'),
        h('div', { class: 'seg' }, h('button', { 'aria-pressed': String(state.demo.growth === 'real'), onclick: () => { state.demo.growth = 'real'; persist(); route(); } }, '実データ'),
          ...Object.entries(GROWTH_PRESETS).map(([k, g]) => h('button', { 'aria-pressed': String(state.demo.growth === k), onclick: () => { state.demo.growth = k; persist(); route(); } }, '見本:' + g.name)))),
      h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:4px' }, 'ジムの見本参加者'),
        h('div', { class: 'seg' }, ...[0, 12, 20, 23].map((n) => h('button', { 'aria-pressed': String(state.demo.members === n), onclick: () => { state.demo.members = n; persist(); route(); } }, `${n}人`)))),
      h('a', { class: 'btn block', href: 'art-sheet.html' }, 'キャラ見本シートを開く'),
      h('button', { class: 'btn block', onclick: () => { state.onboarded = false; persist(); location.hash = '#/onboarding'; } }, '初期設定をやり直す'),
    ),
  ));
}

function dataCard() {
  const st = store.stats();
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = store.importData(await f.text());
      toast(`読み込みました（トレーニング ${r.added} 件を追加）`);
      route();
    } catch (err) { toast(err.message || '読み込めませんでした', true); }
  } });
  return h('div', { class: 'card stack' },
    h('p', { class: 'small', style: 'margin:0' }, `トレーニング ${st.workouts} 件 ／ からだ記録 ${st.bodyDays} 日 ／ 約 ${Math.max(1, Math.round(st.bytes / 1024))} KB`),
    h('p', { class: 'small muted', style: 'margin:0' }, cloud.user() ? 'ログインすれば別の端末でも同じ記録が見られます。念のため、ときどき書き出して保管してください。' : '機種変更やブラウザのデータ削除で消えます。ときどき書き出して保管してください。'),
    h('button', { class: 'btn block', onclick: () => {
      const blob = new Blob([store.exportData({ name: state.profile.name, look: state.profile.look, title: state.profile.title })], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `kinniku-morimori-${today()}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } }, 'バックアップを書き出す（JSON）'),
    h('button', { class: 'btn block', onclick: () => file.click() }, 'バックアップから読み込む'), file,
    h('button', { class: 'btn ghost block', onclick: async () => {
      const ok = await confirmDialog('すべて消去', 'この端末の記録・見た目・設定をすべて消します。元に戻せません。先に書き出しをおすすめします。', [{ label: 'やめる', value: null }, { label: 'すべて消去', value: true, primary: true }]);
      if (!ok) return;
      store.wipeAll();
      try { localStorage.removeItem(KEY); localStorage.removeItem(DRAFT_KEY); localStorage.removeItem('kmg2.demo.timer'); } catch (e) {}
      state = fresh(); location.hash = '#/onboarding'; route();
    } }, 'この端末のデータをすべて消去'));
}

function renderCharacterSettings() {
  const cur = state.profile.look.type;
  let next = cur;
  const box = h('div', { class: 'pad stack' });
  view.append(box);
  function draw() {
    const look = myLook();
    fill(box, 
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
        store.profileChanged();
        toast('タイプを変更しました');
        location.hash = '#/growth';
      } }, '変更する'),
    );
  }
  draw();
}

/* ============================================================
 * ログイン（Supabase Auth）
 * ============================================================ */
function renderAuth() {
  let mode = 'signup'; // signup | login | forgot | sent
  let sentTo = '';
  const wrap = h('div', { class: 'onb' });
  view.append(wrap);
  function draw(msg = '', bad = false) {
    fill(wrap);
    const hero = h('div', { class: 'onb-hero' },
      charEl({ ...DEFAULT_LOOK, ...typeDefaults('male'), type: 'male' }, 'gym', { label: '男性キャラクター', css: 96 }),
      charEl({ ...DEFAULT_LOOK, ...typeDefaults('female'), type: 'female' }, 'gym', { label: '女性キャラクター', css: 96 }),
      (() => { const t = h('h1', {}, h('span', { class: 'logo-text' }, '筋肉モリモリジム')); setTimeout(() => mountLogo(t, { heightCss: 44 }), 0); return t; })());
    const body = h('div', { class: 'pad stack' });
    const email = h('input', { class: 'in', id: 'au-mail', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', value: sentTo });
    const pw = h('input', { class: 'in', id: 'au-pw', type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', placeholder: '8文字以上' });
    const note = h('p', { class: bad ? 'err' : 'small muted', role: bad ? 'alert' : 'status', style: 'margin:0' }, msg);
    const btn = h('button', { class: 'btn primary lg block' });
    const run = async (fn) => {
      btn.disabled = true;
      try { await fn(); } catch (e) { draw(e.message, true); } finally { btn.disabled = false; }
    };
    if (mode === 'sent') {
      body.append(h('h2', { class: 'sec' }, '確認メールを送りました'),
        h('p', { style: 'margin:0' }, `${sentTo} に届いたメールのリンクを開くと登録が完了します。届かない時は迷惑メールフォルダも確認してください。`),
        note,
        h('button', { class: 'btn block', onclick: () => run(async () => { await cloud.resendConfirm(sentTo); draw('もう一度送りました'); }) }, '確認メールを再送'),
        h('button', { class: 'btn ghost block', onclick: () => { mode = 'login'; draw(); } }, 'ログイン画面へ'));
      wrap.append(hero, body);
      return;
    }
    body.append(h('div', { class: 'seg', role: 'tablist' },
      h('button', { role: 'tab', 'aria-selected': String(mode === 'signup'), onclick: () => { mode = 'signup'; draw(); } }, 'はじめる'),
      h('button', { role: 'tab', 'aria-selected': String(mode === 'login' || mode === 'forgot'), onclick: () => { mode = 'login'; draw(); } }, 'ログイン')));
    body.append(h('label', { class: 'field', for: 'au-mail' }, h('span', {}, 'メールアドレス'), email));
    if (mode !== 'forgot') body.append(h('label', { class: 'field', for: 'au-pw' }, h('span', {}, 'パスワード（8文字以上）'), pw));
    body.append(note, btn);
    const valid = () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { draw('メールアドレスの形式を確認してください', true); return false; }
      if (mode !== 'forgot' && pw.value.length < 8) { sentTo = email.value.trim(); draw('パスワードは8文字以上にしてください', true); return false; }
      return true;
    };
    if (mode === 'signup') {
      btn.textContent = 'アカウントを作る';
      btn.onclick = () => valid() && run(async () => {
        sentTo = email.value.trim();
        const r = await cloud.signUp(sentTo, pw.value);
        if (r.needsConfirm) { mode = 'sent'; draw(); }
      });
      body.append(h('p', { class: 'small muted', style: 'margin:0' }, '登録後に届く確認メールのリンクを開いてください。ログイン状態はこの端末に保持されます（共有の端末では使い終わったらログアウトしてください）。'));
    } else if (mode === 'login') {
      btn.textContent = 'ログイン';
      btn.onclick = () => valid() && run(async () => { sentTo = email.value.trim(); await cloud.signIn(sentTo, pw.value); });
      body.append(h('button', { class: 'btn ghost block', onclick: () => { sentTo = email.value.trim(); mode = 'forgot'; draw(); } }, 'パスワードを忘れた'));
    } else {
      btn.textContent = '再設定のメールを送る';
      btn.onclick = () => valid() && run(async () => { sentTo = email.value.trim(); await cloud.resetPassword(sentTo); draw('再設定のメールを送りました。リンクを開くと新しいパスワードを設定できます'); });
    }
    body.append(h('button', { class: 'btn ghost block', onclick: () => { state.localOnly = true; persist(); location.hash = state.onboarded ? '#/gym' : '#/onboarding'; route(); } }, 'ログインせずにこの端末だけで使う'));
    wrap.append(hero, body);
    if (msg && mode !== 'forgot') pw.value = '';
  }
  draw(!cloud.ready() ? 'サーバーに接続できません。通信を確認して、ページを読み込み直してください' : '', !cloud.ready());
}

function renderPasswordReset() {
  const box = h('div', { class: 'pad stack' });
  view.append(box);
  const pw = h('input', { class: 'in', id: 'np', type: 'password', autocomplete: 'new-password', placeholder: '8文字以上' });
  const msg = h('p', { class: 'err', role: 'alert' });
  box.append(h('h2', { class: 'sec' }, '新しいパスワード'), h('label', { class: 'field', for: 'np' }, h('span', {}, '新しいパスワード（8文字以上）'), pw), msg,
    h('button', { class: 'btn primary lg block', onclick: async () => {
      if (pw.value.length < 8) { msg.textContent = '8文字以上にしてください'; return; }
      try { await cloud.updatePassword(pw.value); toast('パスワードを変更しました'); location.hash = '#/gym'; } catch (e) { msg.textContent = e.message; }
    } }, '変更する'));
}

// クラウドに送るプロフィール（体型は記録から計算した段階を添える。他の人のジムでの見た目になる）
function profileRow() {
  const x = store.expSummary();
  const { stages, frame, ...look } = state.profile.look;
  return {
    display_name: (state.profile.name || 'トレーニー').slice(0, 16),
    look: { ...look, stages: stagesFromExp(x.exp) },
    title_id: state.profile.title || 't_first',
    join_gym: !!state.privacy.join,
    show_name: !!state.privacy.name,
    show_content: !!state.privacy.content,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
    onboarded_at: state.onboarded ? state.onboardedAt || new Date().toISOString() : null,
  };
}
store.setProfileSource(profileRow);

// ログイン直後: 記録とプロフィールを取り込み、ログインなしの記録があれば移すか確認
let afterLoginRunning = false;
async function afterLogin() {
  const u = cloud.user();
  if (!u || afterLoginRunning) return;
  afterLoginRunning = true;
  try {
    if (state.userId && state.userId !== u.id) {
      // 別の人に切り替わった: 前の人の見た目・設定を持ち込まない
      const keep = { demo: state.demo };
      state = { ...fresh(), ...keep };
    }
    state.userId = u.id;
    state.localOnly = false;
    store.setUser(u.id);
    const [prof] = await Promise.all([cloud.fetchProfile(), store.pull()]);
    if (prof) {
      const { stages, ...look } = prof.look || {};
      state.profile = { name: prof.display_name, look: { ...DEFAULT_LOOK, stages: undefined, frame: undefined, ...look }, title: prof.title_id };
      state.privacy = { join: prof.join_gym, name: prof.show_name, content: prof.show_content };
      state.onboarded = !!prof.onboarded_at;
      state.onboardedAt = prof.onboarded_at;
      store.profileChanged(); // 体つき（成長段階）を最新の計算で送り直す
    } else if (state.onboarded) {
      store.profileChanged(); // ログインなしで作ったキャラをアカウントへ
    }
    persist();
    const g = store.guestSummary();
    if (g) {
      const ok = await confirmDialog('この端末の記録を移しますか？', `ログインなしで保存した記録（トレーニング ${g.workouts} 件・からだ ${g.bodyDays} 日）があります。このアカウントに移しますか？ 元のデータは消しません。`,
        [{ label: 'あとで', value: null }, { label: '移す', value: true, primary: true }]);
      if (ok) toast(`${store.migrateGuest()} 件の記録を移しました`);
    }
    await store.flush();
  } catch (e) {
    toast('クラウドから読み込めませんでした: ' + e.message, true);
  } finally {
    afterLoginRunning = false;
  }
}

async function logout() {
  const st = store.syncStatus();
  if (st.pending) {
    const c = await confirmDialog('送信していない記録があります', `まだクラウドに送れていない変更が ${st.pending} 件あります。`, [
      { label: 'やめる', value: null }, { label: '送ってから', value: 'send', primary: true }, { label: '書き出してから', value: 'export' }, { label: '捨ててログアウト', value: 'discard' }]);
    if (!c) return;
    if (c === 'send') { await store.flush(); if (store.syncStatus().pending) { toast('送信できませんでした。電波の良い所でもう一度', true); return; } }
    if (c === 'export') exportBackup();
  }
  const uid = cloud.user()?.id;
  await cloud.signOut();
  if (uid) store.clearUserCache(uid); // 別の人に前の記録を見せない
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  store.setUser(null);
  const keep = { demo: state.demo };
  state = { ...fresh(), ...keep };
  persist();
  location.hash = '#/auth';
  route();
}

function accountRows() {
  if (!cloud.enabled) return [h('div', {}, h('span', {}, 'アカウント'), h('span', { class: 'v' }, 'ログインなし（この端末だけ）'))];
  const u = cloud.user();
  if (!u) return [h('div', {}, h('span', {}, 'アカウント'), h('span', { class: 'v' }, 'ログインなし')),
    h('button', { onclick: () => { state.localOnly = false; persist(); location.hash = '#/auth'; route(); } }, h('span', {}, 'ログイン・アカウント作成'), h('span', { class: 'v' }, '›'))];
  const st = store.syncStatus();
  return [
    h('div', {}, h('span', {}, 'アカウント'), h('span', { class: 'v' }, u.email)),
    h('div', {}, h('span', {}, '同期'), h('span', { class: 'v' }, syncLabel(st))),
    ...store.conflicts().map((c) => h('div', { style: 'flex-wrap:wrap' },
      h('span', { class: 'small' }, `${c.local.date} の記録が別の端末と食い違っています`),
      h('span', { style: 'display:flex;gap:6px' },
        h('button', { class: 'btn', style: 'min-height:36px', onclick: () => { store.resolveConflict(c.id, 'remote'); route(); } }, 'クラウドを使う'),
        h('button', { class: 'btn', style: 'min-height:36px', onclick: () => { store.resolveConflict(c.id, 'local'); route(); } }, 'この端末を使う')))),
    h('button', { onclick: logout }, h('span', {}, 'ログアウト'), h('span', { class: 'v' }, '›')),
  ];
}
function syncLabel(st) {
  if (st.state === 'local') return 'この端末だけ';
  if (st.conflicts) return `食い違い ${st.conflicts} 件`;
  if (st.state === 'syncing') return '送信中…';
  if (st.state === 'offline') return `オフライン（${st.pending} 件あとで送信）`;
  if (st.state === 'error') return `送信待ち ${st.pending} 件（再試行します）`;
  if (st.pending) return `送信待ち ${st.pending} 件`;
  return 'クラウドに保存済み';
}
function exportBackup() {
  const blob = new Blob([store.exportData({ name: state.profile.name, look: state.profile.look, title: state.profile.title })], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `kinniku-morimori-${today()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// 画面上部の帯に同期の状態を出す（保存がサーバーで確定する前に「保存済み」と言わない）
// 送信が遅れている・オフライン・食い違いがある時だけ、右上に小さく出す（保存済みの時は何も出さない）
store.onSync((st) => {
  const pill = document.getElementById('sync-pill');
  if (!pill) return;
  const show = cloud.enabled && cloud.user() && (st.conflicts || st.pending || st.state === 'offline' || st.state === 'error');
  pill.hidden = !show;
  if (!show) return;
  pill.textContent = st.conflicts ? `食い違い ${st.conflicts}` : st.state === 'offline' ? `オフライン・未送信 ${st.pending}` : st.state === 'syncing' ? '送信中…' : `未送信 ${st.pending}`;
  pill.classList.toggle('warn', !!st.conflicts || st.state === 'error');
});

async function boot() {
  if (cloud.enabled) {
    await cloud.init();
    cloud.onAuth((event) => {
      if (event === 'PASSWORD_RECOVERY') { location.hash = '#/auth/reset'; route(); return; }
      if (event === 'SIGNED_IN') afterLogin().then(() => route());
      if (event === 'SIGNED_OUT') route();
    });
    if (cloud.user()) await afterLogin();
    else store.setUser(null);
  }
  route();
  // 画面に戻った時に送信待ちを再送
  document.addEventListener('visibilitychange', () => { if (!document.hidden) store.flushSoon(200); });
}
boot();
