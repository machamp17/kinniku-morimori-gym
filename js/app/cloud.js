// クラウド（Supabase）との通信。config.js が空なら何もしない（この端末だけのモード）。
// 私用データは本人の行だけ（RLS）。共有ジムは gym_now() が公開してよい列だけを返す。

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const enabled = !!(SUPABASE_URL && SUPABASE_KEY);
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
let client = null;
let session = null;
const listeners = new Set();

// 起動時に1回。確認メール・パスワード再設定のリンク（?code=）もここで処理される
export async function init() {
  if (!enabled) return null;
  try {
    const { createClient } = await import(LIB);
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    client.auth.onAuthStateChange((event, s) => {
      session = s;
      listeners.forEach((f) => f(event, s));
    });
    const { data } = await client.auth.getSession();
    session = data.session;
    // 確認リンクの ?code= を消して、画面の URL をきれいにする
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
  } catch (e) {
    console.warn('cloud init failed', e);
    client = null;
  }
  return session;
}
export const ready = () => !!client;
export const user = () => session?.user || null;
export const onAuth = (f) => listeners.add(f);

const redirect = () => location.origin + location.pathname;
const jp = (e) => {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'メールアドレスかパスワードが違います';
  if (/Email not confirmed/i.test(m)) return 'メールアドレスの確認がまだです。届いたメールのリンクを開いてください';
  if (/already registered|already been registered/i.test(m)) return 'このメールアドレスは登録済みです。ログインしてください';
  if (/Password should be at least/i.test(m)) return 'パスワードが短すぎます';
  if (/rate limit|too many/i.test(m)) return '短時間に操作が多すぎます。少し待ってからもう一度お試しください';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '通信できませんでした。電波の良い所でもう一度お試しください';
  return m;
};
const need = () => {
  if (!client) throw new Error('サーバーに接続できません（通信を確認してください）');
};

/* ---------- ログイン ---------- */
export async function signUp(email, password) {
  need();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
  if (error) throw new Error(jp(error));
  // 確認メールが必要な設定では session が null
  return { needsConfirm: !data.session };
}
export async function signIn(email, password) {
  need();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(jp(error));
}
export async function resendConfirm(email) {
  need();
  const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect() } });
  if (error) throw new Error(jp(error));
}
export async function resetPassword(email) {
  need();
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  if (error) throw new Error(jp(error));
}
export async function updatePassword(password) {
  need();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error(jp(error));
}
export async function signOut(scope = 'local') {
  if (!client) return;
  await client.auth.signOut({ scope });
}

/* ---------- プロフィール ---------- */
export async function fetchProfile() {
  need();
  const { data, error } = await client.from('profiles').select('*').eq('user_id', user().id).maybeSingle();
  if (error) throw new Error(jp(error));
  return data;
}
export async function upsertProfile(p) {
  need();
  const { error } = await client.from('profiles').upsert({ user_id: user().id, ...p }, { onConflict: 'user_id' });
  if (error) throw new Error(jp(error));
}

/* ---------- 記録 ---------- */
export async function fetchAll() {
  need();
  const [w, b] = await Promise.all([
    client.from('workouts').select('*').order('record_date', { ascending: false }),
    client.from('body_records').select('*'),
  ]);
  if (w.error) throw new Error(jp(w.error));
  if (b.error) throw new Error(jp(b.error));
  return { workouts: w.data, body: b.data };
}
// 同じIDの再送は上書き（重複しない）。version が合わない時は 'version_conflict'
export async function pushWorkout(row) {
  need();
  const { data, error } = await client.from('workouts').upsert(row, { onConflict: 'id' }).select().single();
  if (error) {
    const err = new Error(jp(error));
    if (/version_conflict/.test(error.message)) err.conflict = true;
    if (/future_date/.test(error.message)) err.message = '未来の日付には記録できません';
    throw err;
  }
  return data;
}
export async function fetchWorkout(id) {
  need();
  const { data, error } = await client.from('workouts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(jp(error));
  return data;
}
export async function pushBody(row) {
  need();
  const { error } = await client.from('body_records').upsert({ user_id: user().id, ...row }, { onConflict: 'user_id,record_date' });
  if (error) throw new Error(jp(error));
}

/* ---------- 共有ジム ---------- */
export async function gymNow() {
  need();
  const { data, error } = await client.rpc('gym_now');
  if (error) throw new Error(jp(error));
  return data || [];
}
export async function toggleNice(workoutId) {
  need();
  const { data, error } = await client.rpc('toggle_nice', { p_workout: workoutId });
  if (error) throw new Error(/rate_limited/.test(error.message) ? '少し時間をおいてください' : /not_available/.test(error.message) ? 'この記録は表示期限が過ぎました' : jp(error));
  return data[0];
}
export async function block(workoutId) {
  need();
  const { error } = await client.rpc('block_by_workout', { p_workout: workoutId });
  if (error) throw new Error(jp(error));
}
export async function report(workoutId, reason) {
  need();
  const { error } = await client.rpc('report_workout', { p_workout: workoutId, p_reason: reason || '' });
  if (error) throw new Error(/rate_limited/.test(error.message) ? '通報が多すぎます。時間をおいてください' : jp(error));
}
