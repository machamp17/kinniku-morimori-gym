-- 筋肉モリモリジム データベース（Supabase / PostgreSQL）
-- Supabase の SQL Editor に全文を貼り付けて Run。何度実行しても壊れないように書いてある。
-- 方針: 私用データは本人だけが読み書き（RLS）。共有ジムは公開してよい列だけを返す関数経由。
--       24時間の期限・当日/前日判定・応援の一意性はサーバーの時刻と制約で決める。

/* ------------------------------------------------------------
 * プロフィール（表示名・キャラの見た目・公開設定）
 * ------------------------------------------------------------ */
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16),
  look jsonb not null default '{}'::jsonb,
  title_id text not null default 't_first' check (char_length(title_id) <= 40),
  join_gym boolean not null default false,
  show_name boolean not null default false,
  show_content boolean not null default false,
  timezone text not null default 'Asia/Tokyo',
  onboarded_at timestamptz,
  suspended boolean not null default false, -- 運営が通報対応で共有から外す時に使う
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* ------------------------------------------------------------
 * トレーニング記録（1セッション = 1行。種目とセットは entries に入れる）
 * entries: [{ id, exId, sets: [{ id, kg, reps, addKg, assistKg, sec, min, km, done }] }]
 * ------------------------------------------------------------ */
create table if not exists public.workouts (
  id uuid primary key,
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  record_date date not null,
  timezone text not null default 'Asia/Tokyo',
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and pg_column_size(entries) < 64000),
  public_comment text check (char_length(public_comment) <= 40),
  first_completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz
);
create index if not exists workouts_user_date on public.workouts (user_id, record_date desc);
create index if not exists workouts_recent on public.workouts (first_completed_at desc) where deleted_at is null;

/* ------------------------------------------------------------
 * からだ記録（1日1件。項目ごとに任意。他人には一切返さない）
 * ------------------------------------------------------------ */
create table if not exists public.body_records (
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  record_date date not null,
  weight numeric(5, 1) check (weight > 0 and weight < 500),
  kcal integer check (kcal >= 0 and kcal < 100000),
  p numeric(6, 1) check (p >= 0 and p < 10000),
  f numeric(6, 1) check (f >= 0 and f < 10000),
  c numeric(6, 1) check (c >= 0 and c < 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_date)
);

/* ------------------------------------------------------------
 * ナイスセット・非表示・通報
 * ------------------------------------------------------------ */
create table if not exists public.nice_sets (
  from_user uuid not null default auth.uid () references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, workout_id)
);
create table if not exists public.blocks (
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  blocked_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user)
);
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null default auth.uid () references auth.users (id) on delete cascade,
  target_user uuid not null references auth.users (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------
 * 使ってほしくない言葉（運営が足し引きできる）
 * 伏せ字・全角・カタカナ・大文字をそろえてから、含まれていたら書き込みを断る。
 * 一覧そのものは誰にも読ませない（避けかたを調べられないように）。
 * ------------------------------------------------------------ */
create table if not exists public.ng_words (
  word text primary key check (char_length(word) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.ng_words enable row level security; -- ポリシーなし＝直接は読めない

-- 文字をそろえる: 全角→半角・大文字→小文字・記号と空白を取る・カタカナ→ひらがな
create or replace function public.norm_text (t text) returns text
language sql immutable set search_path = '' as $$
  select translate(
    regexp_replace(lower(normalize(coalesce(t, ''), nfkc)), '[[:space:][:punct:]]', '', 'g'),
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ')
$$;

create or replace function public.has_ng_word (t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ng_words w where position(w.word in public.norm_text(t)) > 0)
$$;

insert into public.ng_words (word) values
  ('まんこ'), ('おめこ'), ('ちんこ'), ('ちんぽ'), ('ちんちん'), ('ぽこちん'),
  ('きんたま'), ('せっくす'), ('ぱいずり'), ('ふぇら'), ('なかだし'), ('中出し'),
  ('ぶっかけ'), ('ざーめん'), ('射精'), ('精液'), ('性器'), ('陰部'),
  ('おなにー'), ('おなに'), ('ますたーべーしょん'), ('せふれ'), ('やりまん'), ('せいこうい'),
  ('性行為'), ('勃起'), ('ぼっき'), ('ろりこん'), ('しょたこん'), ('痴漢'),
  ('れいぷ'), ('強姦'), ('猥褻'), ('わいせつ'), ('淫乱'), ('fuck'),
  ('shit'), ('bitch'), ('cunt'), ('pussy'), ('dick'), ('asshole'),
  ('whore'), ('slut'), ('sex'), ('porn'), ('blowjob'), ('nigger'),
  ('faggot'), ('死ね'), ('殺す'), ('殺害'), ('きちがい'), ('気違い'),
  ('基地外')
on conflict do nothing;

/* ------------------------------------------------------------
 * 運営（管理者）
 * 誰が管理者かは下の SQL で自分を入れる。アプリからは増やせない。
 *   insert into public.admins (user_id) select id from auth.users where email = 'あなたのメール';
 * ------------------------------------------------------------ */
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security; -- ポリシーなし＝直接は読めない

create or replace function public.is_admin () returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid ())
$$;

/* ------------------------------------------------------------
 * 書き込み時のルール（トリガー）
 * ------------------------------------------------------------ */
-- 記録: 作成時刻・初回完了時刻はサーバーが決める。編集で24時間の期限を延ばさない。
-- version が一致しない更新は拒否（別の端末で先に更新された＝競合）。未来の日付は不可。
create or replace function public.workouts_before_write () returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.record_date > (now() at time zone coalesce(new.timezone, 'Asia/Tokyo'))::date then
    raise exception 'future_date' using errcode = 'P0001';
  end if;
  -- ひとことに使ってほしくない言葉があれば断る（運営が消した後の null は素通り）
  if new.public_comment is not null and public.has_ng_word (new.public_comment) then
    raise exception 'ng_word' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.first_completed_at := now();
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
  else
    if new.version is distinct from old.version then
      raise exception 'version_conflict' using errcode = 'P0001';
    end if;
    new.user_id := old.user_id;
    new.first_completed_at := old.first_completed_at;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;
drop trigger if exists workouts_before_write on public.workouts;
create trigger workouts_before_write before insert or update on public.workouts
for each row execute function public.workouts_before_write ();

create or replace function public.touch_updated_at () returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists body_touch on public.body_records;
create trigger body_touch before insert or update on public.body_records
for each row execute function public.touch_updated_at ();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
for each row execute function public.touch_updated_at ();

-- 運営用の列は本人が変更できない（アプリ経由＝ログイン中の時だけ制限。運営はダッシュボードの SQL で変更できる）
create or replace function public.profiles_guard () returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.display_name is not null and public.has_ng_word (new.display_name) then
    raise exception 'ng_word' using errcode = 'P0001';
  end if;
  if auth.uid () is null or public.is_admin () then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.suspended := old.suspended;
    new.user_id := old.user_id;
  else
    new.suspended := false;
    new.user_id := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
for each row execute function public.profiles_guard ();

/* ------------------------------------------------------------
 * 行単位の権限（RLS）: 本人の行だけ
 * ------------------------------------------------------------ */
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.body_records enable row level security;
alter table public.nice_sets enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));

drop policy if exists "own body" on public.body_records;
create policy "own body" on public.body_records for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));

-- 応援・通報は関数経由だけで書く。本人の応援は読める
drop policy if exists "own nice read" on public.nice_sets;
create policy "own nice read" on public.nice_sets for select to authenticated using (from_user = (select auth.uid ()));

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for all to authenticated
using (user_id = (select auth.uid ())) with check (user_id = (select auth.uid ()));
-- reports はポリシーなし（直接の読み書き不可。関数経由のみ。内容は運営がダッシュボードで確認）

/* ------------------------------------------------------------
 * 共有ジム: 公開してよい列だけを返す
 * 条件: ログイン中 / 相手が参加ON・停止されていない / 初回完了から24時間以内（サーバー時刻）
 *       記録日が保存時の相手の日付で当日か前日 / 削除されていない / 自分が非表示にしていない
 * 体重・カロリー・メール・内部IDは返さない。名前・内容はそれぞれ公開ONの時だけ。
 * ------------------------------------------------------------ */
create or replace function public.gym_now ()
returns table (
  workout_id uuid, is_me boolean, display_name text, title_id text, look jsonb,
  recorded_at timestamptz, comment text, entries jsonb, nice_count integer, niced boolean
)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (w.user_id) w.*
    from public.workouts w
    join public.profiles p on p.user_id = w.user_id
    where auth.uid () is not null
      and p.join_gym and not p.suspended
      and w.deleted_at is null
      and w.first_completed_at > now() - interval '24 hours'
      and w.record_date >= (w.first_completed_at at time zone w.timezone)::date - 1
      and not exists (select 1 from public.blocks b where b.user_id = auth.uid () and b.blocked_user = w.user_id)
    order by w.user_id, w.first_completed_at desc
  )
  select
    l.id,
    l.user_id = auth.uid (),
    case when p.show_name then p.display_name else 'トレーニー' end,
    p.title_id,
    p.look,
    l.first_completed_at,
    l.public_comment,
    -- その日の記録をすべて合わせて返す（休憩をはさんで何回に分けて保存しても、1日分としてまとめて見せる）
    case when p.show_content then (
      select coalesce(jsonb_agg(el.e order by w2.first_completed_at, el.ord), '[]'::jsonb)
      from public.workouts w2
      cross join lateral jsonb_array_elements(w2.entries) with ordinality as el (e, ord)
      where w2.user_id = l.user_id and w2.record_date = l.record_date and w2.deleted_at is null
    ) else null end,
    (select count(*)::integer from public.nice_sets n where n.workout_id = l.id),
    exists (select 1 from public.nice_sets n where n.workout_id = l.id and n.from_user = auth.uid ())
  from latest l
  join public.profiles p on p.user_id = l.user_id
  order by l.first_completed_at desc
  limit 200
$$;

-- ナイスセット: 1つの記録に1人1回。自分には不可。期限内の公開記録だけ。押すたびに付ける/外す
create or replace function public.toggle_nice (p_workout uuid)
returns table (niced boolean, nice_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  if auth.uid () is null then raise exception 'login_required'; end if;
  select w.user_id into owner
  from public.workouts w join public.profiles p on p.user_id = w.user_id
  where w.id = p_workout and w.deleted_at is null and p.join_gym and not p.suspended
    and w.first_completed_at > now() - interval '24 hours';
  if owner is null then raise exception 'not_available'; end if;
  if owner = auth.uid () then raise exception 'own_record'; end if;
  if exists (select 1 from public.nice_sets where from_user = auth.uid () and workout_id = p_workout) then
    delete from public.nice_sets where from_user = auth.uid () and workout_id = p_workout;
  else
    -- 連打対策: 1分に30回まで
    if (select count(*) from public.nice_sets where from_user = auth.uid () and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'rate_limited';
    end if;
    insert into public.nice_sets (from_user, workout_id) values (auth.uid (), p_workout);
  end if;
  return query select
    exists (select 1 from public.nice_sets where from_user = auth.uid () and workout_id = p_workout),
    (select count(*)::integer from public.nice_sets where workout_id = p_workout);
end $$;

-- 非表示: 相手の内部IDを知らなくても、ジムに出ている記録から相手を非表示にできる
create or replace function public.block_by_workout (p_workout uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if auth.uid () is null then raise exception 'login_required'; end if;
  select user_id into owner from public.workouts where id = p_workout;
  if owner is null or owner = auth.uid () then raise exception 'not_available'; end if;
  insert into public.blocks (user_id, blocked_user) values (auth.uid (), owner) on conflict do nothing;
end $$;

-- 通報: 運営確認キューへ。1時間に10件まで
create or replace function public.report_workout (p_workout uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if auth.uid () is null then raise exception 'login_required'; end if;
  if (select count(*) from public.reports where reporter = auth.uid () and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;
  select user_id into owner from public.workouts where id = p_workout;
  if owner is null or owner = auth.uid () then raise exception 'not_available'; end if;
  insert into public.reports (reporter, target_user, workout_id, reason) values (auth.uid (), owner, p_workout, left(p_reason, 200));
end $$;

/* ------------------------------------------------------------
 * 運営メニュー（管理者だけ）
 * アプリの「設定 → 運営メニュー」から呼ぶ。管理者でなければ空か forbidden。
 * ------------------------------------------------------------ */
-- 未対応の通報一覧（誰の・どのひとことが・なぜ通報されたか）
drop function if exists public.admin_reports ();
create or replace function public.admin_reports ()
returns table (
  report_id bigint, created_at timestamptz, reason text,
  target_user uuid, display_name text, comment text, workout_id uuid,
  suspended boolean, reports_total bigint
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, r.reason, r.target_user, p.display_name, w.public_comment, r.workout_id,
    p.suspended, (select count(*) from public.reports r2 where r2.target_user = r.target_user)
  from public.reports r
  join public.profiles p on p.user_id = r.target_user
  left join public.workouts w on w.id = r.workout_id
  where public.is_admin () and r.status = 'open'
  order by r.created_at desc
  limit 200
$$;

-- 最近のひとこと（通報が無くても見回れるように。7日分）
-- 共有ジムに出している人の分だけ。自分にしか見えない設定の人のひとことは運営も一覧しない
drop function if exists public.admin_comments ();
create or replace function public.admin_comments ()
returns table (
  workout_id uuid, target_user uuid, display_name text, comment text,
  posted_at timestamptz, suspended boolean
)
language sql stable security definer set search_path = '' as $$
  select w.id, w.user_id, p.display_name, w.public_comment, w.first_completed_at, p.suspended
  from public.workouts w
  join public.profiles p on p.user_id = w.user_id
  where public.is_admin () and w.deleted_at is null and w.public_comment is not null
    and p.join_gym
    and w.first_completed_at > now() - interval '7 days'
  order by w.first_completed_at desc
  limit 200
$$;

-- ひとことだけ消す（トレーニングの記録そのものは本人のものなので残す）
create or replace function public.admin_clear_comment (p_workout uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin () then raise exception 'forbidden'; end if;
  update public.workouts set public_comment = null where id = p_workout;
end $$;

-- 共有ジムから外す / 戻す
create or replace function public.admin_set_suspended (p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin () then raise exception 'forbidden'; end if;
  update public.profiles set suspended = coalesce(p_on, true) where user_id = p_user;
end $$;

-- 通報を対応済みにする（resolved = 対処した / rejected = 問題なし）
create or replace function public.admin_resolve_report (p_report bigint, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin () then raise exception 'forbidden'; end if;
  if p_status not in ('resolved', 'rejected') then raise exception 'bad_status'; end if;
  update public.reports set status = p_status where id = p_report;
end $$;

-- 使ってほしくない言葉の一覧・追加・削除
create or replace function public.admin_ng_words ()
returns table (word text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.word, w.created_at from public.ng_words w
  where public.is_admin () order by w.created_at desc, w.word
$$;
create or replace function public.admin_ng_word (p_word text, p_add boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare n text;
begin
  if not public.is_admin () then raise exception 'forbidden'; end if;
  n := public.norm_text (p_word);
  if n is null or char_length(n) = 0 then raise exception 'empty_word'; end if;
  if coalesce(p_add, true) then
    insert into public.ng_words (word) values (n) on conflict do nothing;
  else
    delete from public.ng_words where word = n;
  end if;
end $$;

-- 関数を呼べるのはログイン中の利用者だけ
revoke all on function public.gym_now () from public, anon;
revoke all on function public.toggle_nice (uuid) from public, anon;
revoke all on function public.block_by_workout (uuid) from public, anon;
revoke all on function public.report_workout (uuid, text) from public, anon;
grant execute on function public.gym_now () to authenticated;
grant execute on function public.toggle_nice (uuid) to authenticated;
grant execute on function public.block_by_workout (uuid) to authenticated;
grant execute on function public.report_workout (uuid, text) to authenticated;

-- 運営メニュー（中で管理者かどうかを見ている）
revoke all on function public.is_admin () from public, anon;
revoke all on function public.admin_reports () from public, anon;
revoke all on function public.admin_comments () from public, anon;
revoke all on function public.admin_clear_comment (uuid) from public, anon;
revoke all on function public.admin_set_suspended (uuid, boolean) from public, anon;
revoke all on function public.admin_resolve_report (bigint, text) from public, anon;
revoke all on function public.admin_ng_words () from public, anon;
revoke all on function public.admin_ng_word (text, boolean) from public, anon;
-- has_ng_word はトリガーの中から利用者の権限で呼ばれるので、実行だけは許可する
revoke all on function public.has_ng_word (text) from public, anon;
grant execute on function public.has_ng_word (text) to authenticated;
grant execute on function public.is_admin () to authenticated;
grant execute on function public.admin_reports () to authenticated;
grant execute on function public.admin_comments () to authenticated;
grant execute on function public.admin_clear_comment (uuid) to authenticated;
grant execute on function public.admin_set_suspended (uuid, boolean) to authenticated;
grant execute on function public.admin_resolve_report (bigint, text) to authenticated;
grant execute on function public.admin_ng_words () to authenticated;
grant execute on function public.admin_ng_word (text, boolean) to authenticated;
