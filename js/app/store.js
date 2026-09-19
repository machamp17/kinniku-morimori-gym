// 記録の保存。まず端末に書き（すぐ使える・電波がなくても消えない）、ログイン中はクラウドへ送る。
// 端末の保存先は利用者ごとに分ける（別の人が同じ端末でログインしても前の記録を見せない）。
//   ログインなし: 'kmg2.data.v1'   ログイン中: 'kmg2.data.u.<ユーザーID>'
// 送信待ちは queue に入れ、通信が戻ったら再送。同じIDの再送は重複しない（サーバーで upsert）。

import { EXERCISES } from './data.js';
import * as cloud from './cloud.js';

const GUEST = 'kmg2.data.v1';
let KEY = GUEST;
const empty = () => ({ app: 'kinniku-morimori-gym', schema: 2, workouts: [], body: {}, queue: [], conflicts: [] });

function read(k) {
  try {
    const d = JSON.parse(localStorage.getItem(k) || 'null');
    return d && Array.isArray(d.workouts) ? { ...empty(), ...d } : null;
  } catch (e) {
    return null;
  }
}
let db = read(KEY) || read(KEY + '.backup') || empty();

function persist() {
  const json = JSON.stringify(db);
  try {
    localStorage.setItem(KEY, json);
    try { localStorage.setItem(KEY + '.backup', json); } catch (e) { localStorage.removeItem(KEY + '.backup'); }
    return true;
  } catch (e) {
    return false;
  }
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
window.addEventListener('storage', (e) => {
  if (e.key === KEY) db = read(KEY) || db;
});

export const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) | 8) | 0).toString(16));
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');
const exOf = (id) => EXERCISES.find((x) => x.id === id);
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

/* ---------- 同期の状態 ---------- */
let syncState = 'local'; // local | synced | pending | syncing | offline | error
let lastError = '';
const watchers = new Set();
export const onSync = (f) => watchers.add(f);
const emit = () => watchers.forEach((f) => f(syncStatus()));
export function syncStatus() {
  return { state: syncState, pending: db.queue.length, conflicts: db.conflicts.length, error: lastError };
}
let userId = null;
export const currentUser = () => userId;

// ログイン状態の切り替え。uid=null でログインなし（ゲスト）
export function setUser(uid) {
  userId = uid;
  KEY = uid ? `kmg2.data.u.${uid}` : GUEST;
  db = read(KEY) || read(KEY + '.backup') || empty();
  syncState = uid ? (db.queue.length ? 'pending' : 'synced') : 'local';
  emit();
}
// ログアウト時: この利用者の端末内データを消す（送信待ちがあれば呼ぶ前に確認すること）
export function clearUserCache(uid) {
  localStorage.removeItem(`kmg2.data.u.${uid}`);
  localStorage.removeItem(`kmg2.data.u.${uid}.backup`);
}

function enqueue(item) {
  db.queue = db.queue.filter((q) => !(q.kind === item.kind && q.key === item.key));
  db.queue.push(item);
}

/* ---------- トレーニング ---------- */
export function listWorkouts({ includeDeleted = false } = {}) {
  return db.workouts
    .filter((w) => includeDeleted || !w.deletedAt)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}
export const getWorkout = (id) => db.workouts.find((w) => w.id === id) || null;

// 完了セットだけを保存（未完了は下書き扱い）。id があれば更新
export function saveWorkout({ id, date, entries, comment }) {
  const clean = entries
    .map((en) => ({ id: en.id || uuid(), exId: en.exId, sets: en.sets.filter((s) => s.done).map((s) => ({ ...s, id: s.id || uuid(), done: true })) }))
    .filter((en) => en.sets.length);
  const now = Date.now();
  let w = id ? getWorkout(id) : null;
  const before = w ? JSON.parse(JSON.stringify(w)) : null;
  if (w) Object.assign(w, { date, entries: clean, comment: comment || '', updatedAt: now });
  else {
    w = { id: uuid(), date, entries: clean, comment: comment || '', timezone: tz(), createdAt: now, updatedAt: now, version: 0 };
    db.workouts.push(w);
  }
  if (userId) enqueue({ kind: 'workout', key: w.id });
  if (!persist()) {
    if (before) Object.assign(w, before);
    else db.workouts = db.workouts.filter((x) => x !== w);
    return null;
  }
  flushSoon();
  return w;
}
export function deleteWorkout(id) {
  const w = getWorkout(id);
  if (!w) return false;
  w.deletedAt = Date.now();
  if (userId) enqueue({ kind: 'workout', key: id });
  const ok = persist();
  flushSoon();
  return ok;
}
export function restoreWorkout(id) {
  const w = getWorkout(id);
  if (!w) return false;
  delete w.deletedAt;
  if (userId) enqueue({ kind: 'workout', key: id });
  const ok = persist();
  flushSoon();
  return ok;
}

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
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) rec[k] = v;
  rec.updatedAt = Date.now();
  db.body[date] = rec;
  if (userId) enqueue({ kind: 'body', key: date });
  if (!persist()) {
    if (prev) db.body[date] = prev;
    else delete db.body[date];
    return null;
  }
  flushSoon();
  return rec;
}
export const listBody = () => Object.entries(db.body).map(([date, r]) => ({ date, ...r })).sort((a, b) => (a.date < b.date ? -1 : 1));

/* ---------- プロフィールの送信待ち ---------- */
let profileGetter = null;
export function setProfileSource(fn) { profileGetter = fn; }
export function profileChanged() {
  if (!userId) return;
  enqueue({ kind: 'profile', key: 'me' });
  persist();
  flushSoon();
}

/* ---------- 送信 ---------- */
let flushing = false;
let flushT = 0;
export function flushSoon(ms = 300) {
  clearTimeout(flushT);
  flushT = setTimeout(flush, ms);
}
export async function flush() {
  if (!userId || !cloud.ready() || flushing) return;
  if (!db.queue.length) { syncState = 'synced'; emit(); return; }
  if (!navigator.onLine) { syncState = 'offline'; emit(); return; }
  flushing = true;
  syncState = 'syncing';
  lastError = '';
  emit();
  try {
    while (db.queue.length) {
      const item = db.queue[0];
      if (item.kind === 'workout') {
        const w = getWorkout(item.key);
        if (w) {
          const send = () => cloud.pushWorkout({
            id: w.id, record_date: w.date, timezone: w.timezone || tz(), entries: w.entries,
            public_comment: w.comment || null, version: w.version || 0,
            deleted_at: w.deletedAt ? new Date(w.deletedAt).toISOString() : null,
          });
          try {
            let row;
            try {
              row = await send();
            } catch (e) {
              // この端末で作った記録の初回送信が、実は届いていた（返事だけ失われた）場合は競合ではない
              if (!(e.conflict && !w.version)) throw e;
              const remote = await cloud.fetchWorkout(w.id);
              w.version = remote ? remote.version : 0;
              row = await send();
            }
            w.version = row.version;
            w.firstCompletedAt = Date.parse(row.first_completed_at);
          } catch (e) {
            if (!e.conflict) throw e;
            // 別の端末で先に更新されていた: クラウド側を控え、どちらを残すか利用者に選んでもらう
            const remote = await cloud.fetchWorkout(w.id);
            db.conflicts = db.conflicts.filter((c) => c.id !== w.id).concat([{ id: w.id, local: JSON.parse(JSON.stringify(w)), remote: remote && fromRow(remote) }]);
          }
        }
      } else if (item.kind === 'body') {
        const r = db.body[item.key];
        if (r) await cloud.pushBody({ record_date: item.key, weight: r.weight ?? null, kcal: r.kcal ?? null, p: r.p ?? null, f: r.f ?? null, c: r.c ?? null });
      } else if (item.kind === 'profile' && profileGetter) {
        await cloud.upsertProfile(profileGetter());
      }
      db.queue.shift();
      persist();
    }
    syncState = 'synced';
  } catch (e) {
    lastError = e.message || String(e);
    syncState = navigator.onLine ? 'error' : 'offline';
    flushSoon(15000);
  } finally {
    flushing = false;
    persist();
    emit();
  }
}
window.addEventListener('online', () => flushSoon(100));

const fromRow = (r) => ({
  id: r.id, date: r.record_date, entries: r.entries || [], comment: r.public_comment || '', timezone: r.timezone,
  createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at), firstCompletedAt: Date.parse(r.first_completed_at),
  version: r.version, ...(r.deleted_at ? { deletedAt: Date.parse(r.deleted_at) } : {}),
});

// クラウドの記録を取り込む。送信待ちのもの（この端末の方が新しい）は端末側を残す
export async function pull() {
  if (!userId || !cloud.ready()) return;
  const { workouts, body } = await cloud.fetchAll();
  const pendingW = new Set(db.queue.filter((q) => q.kind === 'workout').map((q) => q.key));
  const pendingB = new Set(db.queue.filter((q) => q.kind === 'body').map((q) => q.key));
  const map = new Map(db.workouts.map((w) => [w.id, w]));
  for (const r of workouts) if (!pendingW.has(r.id)) map.set(r.id, fromRow(r));
  db.workouts = [...map.values()];
  for (const r of body) {
    if (pendingB.has(r.record_date)) continue;
    const n = (x) => (x == null ? null : Number(x));
    db.body[r.record_date] = { weight: n(r.weight), kcal: n(r.kcal), p: n(r.p), f: n(r.f), c: n(r.c), updatedAt: Date.parse(r.updated_at) };
  }
  persist();
  emit();
}

// 競合の解決: 'remote' クラウドを使う / 'local' この端末の内容で上書き
export function resolveConflict(id, which) {
  const c = db.conflicts.find((x) => x.id === id);
  if (!c) return;
  const w = getWorkout(id);
  if (which === 'remote' && c.remote) Object.assign(w, c.remote);
  if (which === 'local' && c.remote) {
    w.version = c.remote.version; // 最新の版に対する上書きとして送り直す
    enqueue({ kind: 'workout', key: id });
  }
  db.conflicts = db.conflicts.filter((x) => x.id !== id);
  persist();
  flushSoon();
}
export const conflicts = () => db.conflicts;

/* ---------- ログインなしで使っていた記録をアカウントへ移す ---------- */
export function guestSummary() {
  const g = read(GUEST);
  if (!g || g.migratedTo) return null;
  const n = g.workouts.filter((w) => !w.deletedAt).length;
  const b = Object.keys(g.body || {}).length;
  return n || b ? { workouts: n, bodyDays: b } : null;
}
// 原本は消さずに「移行済み」の印を付ける。IDはUUIDへそろえてから移す（やり直しても重複しない）
export function migrateGuest() {
  const g = read(GUEST);
  if (!g || !userId) return 0;
  let changed = false;
  g.workouts.forEach((w) => { if (!isUuid(w.id)) { w.id = uuid(); changed = true; } });
  if (changed) localStorage.setItem(GUEST, JSON.stringify(g));
  const have = new Set(db.workouts.map((w) => w.id));
  let n = 0;
  for (const w of g.workouts) {
    if (w.deletedAt || have.has(w.id)) continue;
    db.workouts.push({ ...w, version: 0, timezone: w.timezone || tz() });
    enqueue({ kind: 'workout', key: w.id });
    n++;
  }
  for (const [date, r] of Object.entries(g.body || {})) {
    const cur = db.body[date] || {};
    for (const [k, v] of Object.entries(r)) if (cur[k] == null) cur[k] = v;
    db.body[date] = cur;
    enqueue({ kind: 'body', key: date });
  }
  persist();
  g.migratedTo = userId;
  g.migratedAt = new Date().toISOString();
  localStorage.setItem(GUEST, JSON.stringify(g));
  flushSoon();
  return n;
}

/* ---------- EXP（仕様書 5.4） ---------- */
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
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = listWorkouts().filter((w) => w.date >= ymd(monday) && w.date <= ymd(now)).length;
  return { exp, total, days, week };
}
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
  const { queue, conflicts: c, ...data } = db;
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), timezone: tz(), profile }, null, 1);
}
export function importData(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'kinniku-morimori-gym' || !Array.isArray(d.workouts)) throw new Error('筋肉モリモリジムの書き出しファイルではありません');
  let added = 0;
  const ids = new Set(db.workouts.map((w) => w.id));
  for (const w0 of d.workouts) {
    if (!w0 || !w0.id || ids.has(w0.id) || w0.deletedAt) continue;
    const w = { ...w0, id: isUuid(w0.id) ? w0.id : uuid(), version: 0 };
    db.workouts.push(w);
    if (userId) enqueue({ kind: 'workout', key: w.id });
    added++;
  }
  for (const [date, r] of Object.entries(d.body || {})) {
    const cur = db.body[date] || {};
    for (const [k, v] of Object.entries(r)) if (cur[k] == null) cur[k] = v;
    db.body[date] = cur;
    if (userId) enqueue({ kind: 'body', key: date });
  }
  if (!persist()) throw new Error('保存できませんでした（容量不足の可能性）');
  flushSoon();
  return { added, profile: d.profile || null };
}
export function stats() {
  return { workouts: listWorkouts().length, bodyDays: Object.keys(db.body).length, bytes: (localStorage.getItem(KEY) || '').length * 2 };
}
export function wipeAll() {
  db = empty();
  localStorage.removeItem(KEY);
  localStorage.removeItem(KEY + '.backup');
}
