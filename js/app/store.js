// 記録の保存（ベータ: この端末のブラウザ内だけに保存）。
// 画面からは必ずこの関数群を通す。Phase 2 でクラウド保存へ差し替える時はここを置き換える。
// 本体と控えの2か所に書き、本体が壊れていたら控えから読む。

import { EXERCISES } from './data.js';

const KEY = 'kmg2.data.v1';
const BACKUP = 'kmg2.data.v1.backup';
const empty = () => ({ app: 'kinniku-morimori-gym', schema: 1, workouts: [], body: {} });

function read(k) {
  try {
    const d = JSON.parse(localStorage.getItem(k) || 'null');
    return d && Array.isArray(d.workouts) ? { ...empty(), ...d } : null;
  } catch (e) {
    return null;
  }
}
let db = read(KEY) || read(BACKUP) || empty();

// 保存。失敗したら false（呼び出し側で入力を残したまま知らせる）
function persist() {
  const json = JSON.stringify(db);
  try {
    localStorage.setItem(KEY, json);
    try { localStorage.setItem(BACKUP, json); } catch (e) { localStorage.removeItem(BACKUP); }
    return true;
  } catch (e) {
    return false;
  }
}
// ブラウザに消されにくくする（対応ブラウザのみ）
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

// 別タブで更新された時に取り込む
window.addEventListener('storage', (e) => {
  if (e.key === KEY) db = read(KEY) || db;
});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const exOf = (id) => EXERCISES.find((x) => x.id === id);

/* ---------- トレーニング ---------- */
export function listWorkouts({ includeDeleted = false } = {}) {
  return db.workouts
    .filter((w) => includeDeleted || !w.deletedAt)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}
export const getWorkout = (id) => db.workouts.find((w) => w.id === id) || null;

// 完了セットだけを保存する（未完了は下書き扱い）。id があれば更新
export function saveWorkout({ id, date, entries, comment }) {
  const clean = entries
    .map((en) => ({ id: en.id || uid(), exId: en.exId, sets: en.sets.filter((s) => s.done).map((s) => ({ ...s, id: s.id || uid(), done: true })) }))
    .filter((en) => en.sets.length);
  const now = Date.now();
  let w = id ? getWorkout(id) : null;
  const before = w ? JSON.parse(JSON.stringify(w)) : null;
  if (w) Object.assign(w, { date, entries: clean, comment: comment || '', updatedAt: now, version: (w.version || 1) + 1 });
  else {
    w = { id: uid(), date, entries: clean, comment: comment || '', createdAt: now, updatedAt: now, version: 1 };
    db.workouts.push(w);
  }
  if (!persist()) {
    // 失敗したら元に戻す
    if (before) Object.assign(w, before);
    else db.workouts = db.workouts.filter((x) => x !== w);
    return null;
  }
  return w;
}
export function deleteWorkout(id) {
  const w = getWorkout(id);
  if (!w) return false;
  w.deletedAt = Date.now();
  return persist();
}
export function restoreWorkout(id) {
  const w = getWorkout(id);
  if (!w) return false;
  delete w.deletedAt;
  return persist();
}

// 同じ種目の、指定日より前（同日なら先に作った記録）の最新記録
export function previousFor(exId, date, excludeId) {
  for (const w of listWorkouts()) {
    if (w.id === excludeId || w.date > date) continue;
    const en = w.entries.find((e) => e.exId === exId && e.sets.length);
    if (en) return { date: w.date, workoutId: w.id, sets: en.sets };
  }
  return null;
}

/* ---------- からだ記録（1日1件・入力した項目だけ上書き） ---------- */
export const getBody = (date) => db.body[date] || null;
export function upsertBody(date, fields) {
  const prev = db.body[date] ? { ...db.body[date] } : null;
  const rec = db.body[date] || {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) rec[k] = v; // null は明示的な消去
  rec.updatedAt = Date.now();
  db.body[date] = rec;
  if (!persist()) {
    if (prev) db.body[date] = prev;
    else delete db.body[date];
    return null;
  }
  return rec;
}
export const listBody = () => Object.entries(db.body).map(([date, r]) => ({ date, ...r })).sort((a, b) => (a.date < b.date ? -1 : 1));

/* ---------- EXP（仕様書 5.4） ----------
 * 完了した筋力セット1つで主部位に5EXP、ユーザー・記録日・部位ごとに上限30。
 * 有効な記録がある日に継続ボーナス10EXP を1回。有酸素は部位EXPなし。 */
export function expSummary() {
  const byDate = {};
  for (const w of listWorkouts()) {
    const d = (byDate[w.date] = byDate[w.date] || { parts: {}, valid: false });
    for (const en of w.entries) {
      const ex = exOf(en.exId);
      if (!ex || !en.sets.length) continue;
      d.valid = true;
      if (ex.part === 'cardio') continue;
      d.parts[ex.part] = (d.parts[ex.part] || 0) + en.sets.length * 5;
    }
  }
  const exp = { chest: 0, back: 0, shoulder: 0, leg: 0, arm: 0, abs: 0 };
  let bonus = 0, days = 0;
  for (const d of Object.values(byDate)) {
    if (!d.valid) continue;
    days++;
    bonus += 10;
    for (const [p, v] of Object.entries(d.parts)) exp[p] += Math.min(30, v);
  }
  const total = Object.values(exp).reduce((a, b) => a + b, 0) + bonus;
  // 今週（月曜はじまり）の記録回数
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const mStr = ymd(monday);
  const week = listWorkouts().filter((w) => w.date >= mStr && w.date <= ymd(now)).length;
  return { exp, total, days, week };
}
// ある記録を保存した時に増えるEXP（表示用）
export function expGainOf(entries, date, excludeId) {
  const before = {};
  for (const w of listWorkouts()) {
    if (w.date !== date || w.id === excludeId) continue;
    for (const en of w.entries) {
      const ex = exOf(en.exId);
      if (ex && ex.part !== 'cardio') before[ex.part] = (before[ex.part] || 0) + en.sets.length * 5;
    }
  }
  const after = { ...before };
  let valid = false;
  for (const en of entries) {
    const ex = exOf(en.exId);
    const n = en.sets.filter((s) => s.done).length;
    if (!ex || !n) continue;
    valid = true;
    if (ex.part !== 'cardio') after[ex.part] = (after[ex.part] || 0) + n * 5;
  }
  const gain = {};
  for (const p of Object.keys(after)) {
    const g = Math.min(30, after[p]) - Math.min(30, before[p] || 0);
    if (g > 0) gain[p] = g;
  }
  const hadDay = listWorkouts().some((w) => w.date === date && w.id !== excludeId && w.entries.some((e) => e.sets.length));
  return { gain, bonus: valid && !hadDay ? 10 : 0 };
}

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 書き出し・読み込み ---------- */
export function exportData(profile) {
  return JSON.stringify({ ...db, exportedAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, profile }, null, 1);
}
// 読み込みは追加（同じIDは上書きしない）。からだ記録は空いている項目だけ埋める
export function importData(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'kinniku-morimori-gym' || !Array.isArray(d.workouts)) throw new Error('筋肉モリモリジムの書き出しファイルではありません');
  let added = 0;
  const ids = new Set(db.workouts.map((w) => w.id));
  for (const w of d.workouts) if (w && w.id && !ids.has(w.id)) { db.workouts.push(w); added++; }
  for (const [date, r] of Object.entries(d.body || {})) {
    const cur = db.body[date] || {};
    for (const [k, v] of Object.entries(r)) if (cur[k] == null) cur[k] = v;
    db.body[date] = cur;
  }
  if (!persist()) throw new Error('保存できませんでした（容量不足の可能性）');
  return { added, profile: d.profile || null };
}
export function stats() {
  return { workouts: listWorkouts().length, bodyDays: Object.keys(db.body).length, bytes: (localStorage.getItem(KEY) || '').length * 2 };
}
export function wipeAll() {
  db = empty();
  localStorage.removeItem(KEY);
  localStorage.removeItem(BACKUP);
}
