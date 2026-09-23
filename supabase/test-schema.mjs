// schema.sql を PGlite（組み込み PostgreSQL）で検証する。auth スキーマは Supabase 相当の最小限を用意
// 実行: npm i --no-save @electric-sql/pglite && node supabase/test-schema.mjs supabase/schema.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(process.argv[2], 'utf8');
const db = new PGlite();
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const results = [];
const ok = (name, cond, detail = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  insert into auth.users values ('${A}'), ('${B}');
`);
await db.exec(schema);
await db.exec(schema); // 2回流しても壊れないこと
ok('schema.sql を2回実行してもエラーなし', true);
await db.exec(`grant usage on schema public to authenticated, anon;
  grant all on all tables in schema public to authenticated;`);

async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
async function fails(uid, sql, params) {
  try { await as(uid, sql, params); return null; } catch (e) { return e.message; }
}
const today = (await db.query(`select (now() at time zone 'Asia/Tokyo')::date as d`)).rows[0].d.toISOString().slice(0, 10);

// 準備: A は名前・内容を非公開、B は公開
await as(A, `insert into public.profiles (display_name, join_gym, show_name, show_content, look) values ('エー', true, false, false, '{"type":"male"}')`);
await as(B, `insert into public.profiles (display_name, join_gym, show_name, show_content) values ('ビー', true, true, true)`);
const wa = '10000000-0000-0000-0000-00000000000a';
const wb = '10000000-0000-0000-0000-00000000000b';
await as(A, `insert into public.workouts (id, record_date, entries, public_comment, first_completed_at, version) values ($1, $2, '[{"exId":"ex_side","sets":[{"kg":"8","reps":"15","done":true}]}]', '肩いい感じ', '2000-01-01', 99)`, [wa, today]);
await as(B, `insert into public.workouts (id, record_date, entries) values ($1, $2, '[{"exId":"ex_bench","sets":[{"kg":"60","reps":"10","done":true}]}]')`, [wb, today]);
await as(A, `insert into public.body_records (record_date, weight, kcal) values ($1, 70.8, 2100)`, [today]);

// 本人のみ
let r = await as(B, `select id from public.workouts`);
ok('他人の記録は読めない（RLS）', r.rows.length === 1 && r.rows[0].id === wb, `rows=${r.rows.length}`);
r = await as(B, `select * from public.body_records`);
ok('他人のからだ記録は読めない', r.rows.length === 0);
r = await as(B, `update public.workouts set public_comment = 'x' where id = $1`, [wa]);
ok('他人の記録は書き換えられない', (r.affectedRows ?? 0) === 0);
ok('未ログインは記録を読めない', !!(await fails(null, `select * from public.workouts`)) || (await as(null, `select * from public.workouts`)).rows.length === 0);
ok('未ログインは共有ジムを呼べない', !!(await fails(null, `select * from public.gym_now()`)));

// サーバーが時刻と version を決める
r = await db.query(`select first_completed_at, version, user_id from public.workouts where id = $1`, [wa]);
ok('初回完了時刻はサーバー時刻（送った値は無視）', r.rows[0].first_completed_at.getFullYear() > 2020);
ok('version は1から', r.rows[0].version === 1);
const fc = r.rows[0].first_completed_at.getTime();
ok('version が古い更新は競合で拒否', /version_conflict/.test(await fails(A, `update public.workouts set public_comment = 'a', version = 5 where id = $1`, [wa]) || ''));
await as(A, `update public.workouts set public_comment = '更新', version = 1 where id = $1`, [wa]);
r = await db.query(`select first_completed_at, version from public.workouts where id = $1`, [wa]);
ok('正しい version なら更新でき version+1', r.rows[0].version === 2);
ok('編集しても24時間の期限（初回完了時刻）は延びない', r.rows[0].first_completed_at.getTime() === fc);
ok('未来の日付は保存できない', /future_date/.test(await fails(A, `insert into public.workouts (id, record_date, entries) values (gen_random_uuid(), current_date + 5, '[]')`) || ''));
// 同じIDの再送は重複しない（upsert）
await as(B, `insert into public.workouts (id, record_date, entries, version) values ($1, $2, '[]', 1) on conflict (id) do update set entries = excluded.entries, version = excluded.version`, [wb, today]);
r = await db.query(`select count(*)::int n from public.workouts where id = $1`, [wb]);
ok('同じ記録の再送で重複しない', r.rows[0].n === 1);
await as(B, `update public.workouts set entries = '[{"exId":"ex_bench","sets":[{"kg":"60","reps":"10","done":true}]}]', version = 2 where id = $1`, [wb]);

// 共有ジム
r = await as(B, `select * from public.gym_now()`);
const cols = r.fields.map((f) => f.name);
const ra = r.rows.find((x) => x.workout_id === wa), rb = r.rows.find((x) => x.workout_id === wb);
ok('共有ジムに2人', r.rows.length === 2, `rows=${r.rows.length}`);
ok('体重・カロリー・内部ID・メールを返さない', !cols.some((c) => /weight|kcal|user_id|email/.test(c)), cols.join(','));
ok('名前OFFは「トレーニー」', ra.display_name === 'トレーニー');
ok('内容OFFは内容を返さない', ra.entries === null);
ok('名前・内容ONは返す', rb.display_name === 'ビー' && Array.isArray(rb.entries));
ok('自分の記録に is_me', rb.is_me === true && ra.is_me === false);
ok('ひとことは返す', ra.comment === '更新');

// ナイスセット
r = await as(B, `select * from public.toggle_nice($1)`, [wa]);
ok('ナイスセットできる', r.rows[0].niced === true && r.rows[0].nice_count === 1);
r = await as(B, `select * from public.toggle_nice($1)`, [wa]);
ok('もう一度押すと取り消し（1人1回）', r.rows[0].niced === false && r.rows[0].nice_count === 0);
ok('自分の記録には押せない', /own_record/.test(await fails(B, `select * from public.toggle_nice($1)`, [wb]) || ''));
ok('ナイスセット表へ直接は書けない', !!(await fails(B, `insert into public.nice_sets (workout_id) values ($1)`, [wa])));

// 期限と日付
await db.exec(`alter table public.workouts disable trigger workouts_before_write;
  update public.workouts set first_completed_at = now() - interval '24 hours' - interval '1 second' where id = '${wa}';`);
r = await as(B, `select * from public.gym_now()`);
ok('24時間を過ぎたら共有から外れる', !r.rows.some((x) => x.workout_id === wa));
r = await db.query(`select count(*)::int n from public.workouts where id = $1`, [wa]);
ok('期限切れでも記録は残る', r.rows[0].n === 1);
ok('期限切れの記録には応援できない', /not_available/.test(await fails(B, `select * from public.toggle_nice($1)`, [wa]) || ''));
await db.exec(`update public.workouts set first_completed_at = now() - interval '23 hours 59 minutes', record_date = (now() at time zone 'Asia/Tokyo')::date - 3 where id = '${wa}';`);
r = await as(B, `select * from public.gym_now()`);
ok('3日前の日付の入力は出席にしない', !r.rows.some((x) => x.workout_id === wa));
await db.exec(`update public.workouts set record_date = (now() at time zone 'Asia/Tokyo')::date - 1 where id = '${wa}';
  alter table public.workouts enable trigger workouts_before_write;`);
r = await as(B, `select * from public.gym_now()`);
ok('前日の日付なら出席', r.rows.some((x) => x.workout_id === wa));

// 公開OFF・非表示・運営停止
await as(A, `update public.profiles set join_gym = false`);
r = await as(B, `select * from public.gym_now()`);
ok('参加OFFで即座に外れる', !r.rows.some((x) => x.workout_id === wa));
await as(A, `update public.profiles set join_gym = true`);
await as(B, `select public.block_by_workout($1)`, [wa]);
r = await as(B, `select * from public.gym_now()`);
ok('非表示にした人は見えない', !r.rows.some((x) => x.workout_id === wa));
r = await as(A, `select * from public.gym_now()`);
ok('非表示は相手側の表示には影響しない', r.rows.some((x) => x.workout_id === wb));
await as(B, `select public.report_workout($1, 'テスト')`, [wa]);
r = await db.query(`select count(*)::int n from public.reports`);
ok('通報が運営キューに入る', r.rows[0].n === 1);
ok('通報一覧は利用者から読めない', (await as(B, `select * from public.reports`).catch(() => ({ rows: [] }))).rows.length === 0);
ok('本人は停止フラグを外せない', await (async () => { await db.query(`update public.profiles set suspended = true where user_id = $1`, [A]); await as(A, `update public.profiles set suspended = false`); return (await db.query(`select suspended from public.profiles where user_id = $1`, [A])).rows[0].suspended === true; })());

// 1日に分けて保存した記録は、まとめて1日分として出る
await db.query(`update public.profiles set suspended = false where user_id = $1`, [A]); // 前の試験で停止したのを戻す
const ins = (uid, date, exId) => as(uid, `insert into public.workouts (id, record_date, entries) values (gen_random_uuid(), $1, $2)`,
  [date, JSON.stringify([{ exId, sets: [{ kg: '20', reps: '10', done: true }] }])]);
await ins(B, (await db.query(`select ((now() at time zone 'Asia/Tokyo')::date - 1)::text d`)).rows[0].d, 'ex_yesterday');
await ins(B, today, 'ex_bench');
await ins(B, today, 'ex_walk');
r = await as(A, `select * from public.gym_now()`);
const bRow = r.rows.find((x) => x.display_name === 'ビー');
ok('同じ日に分けて保存した記録がまとまって出る', !!bRow && bRow.entries.length === 3 && bRow.entries.some((e) => e.exId === 'ex_bench') && bRow.entries.at(-1).exId === 'ex_walk', JSON.stringify(bRow && bRow.entries));
ok('別の日の記録は混ざらない', !!bRow && !bRow.entries.some((e) => e.exId === 'ex_yesterday'));
r = await as(A, `select * from public.gym_now()`);
ok('内容を非公開にしている人の分は返さない', r.rows.find((x) => x.is_me)?.entries === null);

// 使ってほしくない言葉
await db.query(`update public.profiles set suspended = false where user_id = $1`, [A]);
const badIns = (uid, text) => fails(uid, `insert into public.workouts (id, record_date, entries, public_comment) values (gen_random_uuid(), $1, '[]', $2)`, [today, text]);
ok('卑猥な言葉のひとことは保存できない', /ng_word/.test((await badIns(B, 'ちんこ最高')) || ''));
ok('伏せ字・全角・カタカナでも弾く', /ng_word/.test((await badIns(B, 'ﾁ*ﾝ*ｺ')) || '') && /ng_word/.test((await badIns(B, 'ＦＵＣＫ')) || ''));
ok('ふつうのひとことは保存できる', (await badIns(B, '今日は21世紀最高の胸の日。田中くんに勝った')) === null);
ok('卑猥な表示名は保存できない', /ng_word/.test((await fails(A, `update public.profiles set display_name = 'まんこ'`)) || ''));
ok('言葉の一覧は利用者から読めない', (await as(B, `select * from public.ng_words`).catch(() => ({ rows: [] }))).rows.length === 0);

// 運営メニュー
ok('管理者でなければ is_admin は偽', (await as(B, `select public.is_admin() as v`)).rows[0].v === false);
ok('管理者でなければ通報一覧は空', (await as(B, `select * from public.admin_reports()`)).rows.length === 0);
ok('管理者でなければひとことを消せない', /forbidden/.test((await fails(B, `select public.admin_clear_comment($1)`, [wa])) || ''));
ok('管理者表は利用者から読めない', (await as(B, `select * from public.admins`).catch(() => ({ rows: [] }))).rows.length === 0);
ok('管理者は利用者からは増やせない', !!(await fails(B, `insert into public.admins (user_id) values ($1)`, [B])));
await db.query(`insert into public.admins (user_id) values ($1)`, [B]); // 運営がダッシュボードで登録
ok('登録した人は is_admin が真', (await as(B, `select public.is_admin() as v`)).rows[0].v === true);
r = await as(B, `select * from public.admin_reports()`);
ok('管理者は通報一覧を見られる', r.rows.length === 1 && r.rows[0].target_user === A, `rows=${r.rows.length}`);
ok('通報一覧に相手のひとことが載る', !!r.rows[0].comment);
const rid = r.rows[0].report_id;
await as(B, `select public.admin_clear_comment($1)`, [wa]);
ok('管理者はひとことを消せる（記録は残る）', (await db.query(`select public_comment, entries from public.workouts where id = $1`, [wa])).rows[0].public_comment === null
  && (await db.query(`select count(*)::int n from public.workouts where id = $1`, [wa])).rows[0].n === 1);
r = await as(A, `select * from public.gym_now()`);
ok('消したひとことは共有ジムからも消える', !r.rows.some((x) => x.workout_id === wa && x.comment));
await as(B, `select public.admin_set_suspended($1, true)`, [A]);
ok('管理者は共有ジムから外せる', (await db.query(`select suspended from public.profiles where user_id = $1`, [A])).rows[0].suspended === true);
await as(A, `update public.profiles set display_name = 'エー'`);
ok('外された本人は自分で戻せない', (await db.query(`select suspended from public.profiles where user_id = $1`, [A])).rows[0].suspended === true);
await as(B, `select public.admin_set_suspended($1, false)`, [A]);
ok('管理者は戻せる', (await db.query(`select suspended from public.profiles where user_id = $1`, [A])).rows[0].suspended === false);
await as(B, `select public.admin_resolve_report($1, 'resolved')`, [rid]);
ok('対応済みにすると通報一覧から消える', (await as(B, `select * from public.admin_reports()`)).rows.length === 0);
await as(B, `select public.admin_ng_word('あばれんぼう', true)`);
ok('管理者は言葉を足せる', /ng_word/.test((await badIns(A, 'あばれんぼう参上')) || ''));
ok('足した言葉は一覧に出る', (await as(B, `select * from public.admin_ng_words()`)).rows.some((x) => x.word === 'あばれんぼう'));
await as(B, `select public.admin_ng_word('あばれんぼう', false)`);
ok('管理者は言葉を外せる', (await badIns(A, 'あばれんぼう参上')) === null);

console.log(results.join('\n'));
console.log(`\n${results.filter((x) => x.startsWith('PASS')).length}/${results.length} passed`);
