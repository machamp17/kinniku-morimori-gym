// store.js の同期ロジックを、偽のサーバー（cloud.js の代わり）で確かめる: node tools/test-store.mjs
// サーバー側の約束（version 一致・初回完了時刻は変えない）は supabase/test-schema.mjs で別に確認済み

// ブラウザの代わり
const ls = new Map();
globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
globalThis.window = { addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, storage: null }, writable: true, configurable: true });

// 偽サーバー
const server = { workouts: new Map(), body: new Map(), dropReplyOnce: false, fail: false };
const fake = {
  enabled: true,
  ready: () => true,
  async pushWorkout(row) {
    if (server.fail) throw new Error('通信できませんでした');
    const cur = server.workouts.get(row.id);
    let saved;
    if (!cur) saved = { ...row, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), first_completed_at: new Date().toISOString() };
    else {
      if (row.version !== cur.version) { const e = new Error('version_conflict'); e.conflict = true; throw e; }
      saved = { ...cur, ...row, version: cur.version + 1, first_completed_at: cur.first_completed_at, updated_at: new Date().toISOString() };
    }
    server.workouts.set(row.id, saved);
    if (server.dropReplyOnce) { server.dropReplyOnce = false; throw new Error('通信できませんでした'); }
    return saved;
  },
  async fetchWorkout(id) { return server.workouts.get(id) || null; },
  async pushBody(row) { server.body.set(row.record_date, row); },
  async upsertProfile() {},
  async fetchAll() { return { workouts: [...server.workouts.values()], body: [...server.body.values()].map((b) => ({ ...b, updated_at: new Date().toISOString() })) }; },
};

// store.js が読み込む cloud.js を偽物に差し替える
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
const loaderSrc = `export async function resolve(spec, ctx, next) { if (spec.endsWith('/cloud.js') || spec === './cloud.js') return { url: 'fake:cloud', shortCircuit: true }; return next(spec, ctx); }
export async function load(url, ctx, next) { if (url === 'fake:cloud') return { format: 'module', source: 'export default null; const f = globalThis.__fakeCloud; export const enabled = true; export const ready = () => f.ready(); export const pushWorkout = (r) => f.pushWorkout(r); export const fetchWorkout = (i) => f.fetchWorkout(i); export const pushBody = (r) => f.pushBody(r); export const upsertProfile = (p) => f.upsertProfile(p); export const fetchAll = () => f.fetchAll();', shortCircuit: true }; return next(url, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(loaderSrc), pathToFileURL('./'));
globalThis.__fakeCloud = fake;
const store = await import('../js/app/store.js');

const results = [];
const ok = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`);
const set = (kg) => [{ exId: 'ex_bench', sets: [{ kg: String(kg), reps: '10', done: true }] }];

// ログインなしの記録（旧ベータ形式のIDを含む）
ls.set('kmg2.data.v1', JSON.stringify({ app: 'kinniku-morimori-gym', schema: 1, workouts: [{ id: 'lx12abc', date: '2026-09-18', entries: set(50), comment: '', createdAt: 1, updatedAt: 1, version: 1 }], body: { '2026-09-18': { weight: 71 } } }));

store.setUser('user-a');
ok('ログイン後は利用者ごとの保存先', store.listWorkouts().length === 0);
const g = store.guestSummary();
ok('ログインなしの記録を見つける', g && g.workouts === 1 && g.bodyDays === 1);
const moved = store.migrateGuest();
await store.flush();
ok('移行して送信', moved === 1 && server.workouts.size === 1 && server.body.size === 1);
ok('旧IDはUUIDにそろえる', [...server.workouts.keys()].every((k) => /^[0-9a-f-]{36}$/.test(k)));
ok('原本は消さず移行済みの印', JSON.parse(ls.get('kmg2.data.v1')).migratedTo === 'user-a' && JSON.parse(ls.get('kmg2.data.v1')).workouts.length === 1);
ok('移行はやり直しても重複しない', store.migrateGuest() === 0 && store.guestSummary() === null);

// 通常の保存
const w = store.saveWorkout({ date: '2026-09-19', entries: set(60), comment: '胸' });
await store.flush();
ok('保存するとクラウドへ送られ version=1', server.workouts.get(w.id)?.version === 1 && store.getWorkout(w.id).version === 1);
ok('送信後は送信待ち0', store.syncStatus().pending === 0 && store.syncStatus().state === 'synced');

// オフライン
navigator.onLine = false;
const w2 = store.saveWorkout({ date: '2026-09-19', entries: set(62.5), comment: '' });
await store.flush();
ok('オフラインでは送信待ちに残る', store.syncStatus().pending === 1 && store.syncStatus().state === 'offline' && !server.workouts.has(w2.id));
navigator.onLine = true;
await store.flush();
ok('通信が戻ると一度だけ送られる', server.workouts.has(w2.id) && server.workouts.size === 3 && store.syncStatus().pending === 0);

// 返事だけ失われた初回送信（実はサーバーに届いている）
server.dropReplyOnce = true;
const w3 = store.saveWorkout({ date: '2026-09-19', entries: set(40), comment: '' });
await store.flush();
ok('返事が失われたら送信待ちのまま', store.syncStatus().pending === 1);
await store.flush();
ok('再送で重複せず、競合扱いにもならない', server.workouts.size === 4 && store.conflicts().length === 0 && store.syncStatus().pending === 0);

// 編集
store.saveWorkout({ id: w.id, date: '2026-09-19', entries: set(65), comment: '胸' });
await store.flush();
ok('編集は version+1 で上書き', server.workouts.get(w.id).version === 2 && server.workouts.get(w.id).entries[0].sets[0].kg === '65');

// 別の端末で先に更新されていた
const cur = server.workouts.get(w.id);
server.workouts.set(w.id, { ...cur, entries: set(99), version: 3 });
store.saveWorkout({ id: w.id, date: '2026-09-19', entries: set(70), comment: '胸' });
await store.flush();
ok('競合を検出して無言で上書きしない', store.conflicts().length === 1 && server.workouts.get(w.id).entries[0].sets[0].kg === '99');
store.resolveConflict(w.id, 'local');
await store.flush();
ok('「この端末を使う」で上書きできる', server.workouts.get(w.id).entries[0].sets[0].kg === '70' && store.conflicts().length === 0);

// 削除と取り込み
store.deleteWorkout(w2.id);
await store.flush();
ok('削除はクラウドにも反映（消さずに削除済みの印）', !!server.workouts.get(w2.id).deleted_at);
server.workouts.set('11111111-1111-4111-8111-111111111111', { id: '11111111-1111-4111-8111-111111111111', record_date: '2026-09-17', entries: set(55), public_comment: null, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), first_completed_at: new Date().toISOString() });
await store.pull();
ok('別の端末で作った記録を取り込む', !!store.getWorkout('11111111-1111-4111-8111-111111111111'));
ok('削除済みは一覧に出ない', !store.listWorkouts().some((x) => x.id === w2.id));

// 送信待ちの間の取り込みは端末側を残す
navigator.onLine = false;
store.saveWorkout({ id: w3.id, date: '2026-09-19', entries: set(45), comment: '' });
await store.pull();
ok('送信待ちの記録は取り込みで上書きされない', store.getWorkout(w3.id).entries[0].sets[0].kg === '45');
navigator.onLine = true;
await store.flush();

// 利用者の切り替え
store.setUser('user-b');
ok('別の利用者には前の人の記録が見えない', store.listWorkouts().length === 0);
store.setUser('user-a');
ok('元の利用者に戻ると記録がある', store.listWorkouts().length >= 3);
store.clearUserCache('user-a');
store.setUser('user-a');
ok('ログアウト時に端末の控えを消せる', store.listWorkouts().length === 0);

// からだ記録: 項目ごとの追記
store.setUser('user-c');
store.upsertBody('2026-09-19', { weight: 70.8 });
store.upsertBody('2026-09-19', { kcal: 2100 });
await store.flush();
ok('朝の体重に夜カロリーを追記しても体重が残る', store.getBody('2026-09-19').weight === 70.8 && server.body.get('2026-09-19').weight === 70.8 && server.body.get('2026-09-19').kcal === 2100);

console.log(results.join('\n'));
console.log(`\n${results.filter((x) => x.startsWith('PASS')).length}/${results.length} passed`);
