// 見本用の定義と架空データ。架空データは画面上で必ず「見本」と明示する。

export const PARTS = [
  { id: 'chest', name: '胸' },
  { id: 'back', name: '背中' },
  { id: 'shoulder', name: '肩' },
  { id: 'leg', name: '脚' },
  { id: 'arm', name: '腕' },
  { id: 'abs', name: '腹' },
];
export const PART_FILTERS = [...PARTS, { id: 'cardio', name: '有酸素' }];

// method: wr=重量×回数 bw=自重 assist=アシスト time=時間 cardio=有酸素
export const EXERCISES = [
  { id: 'ex_bench', name: 'ベンチプレス', part: 'chest', method: 'wr', alias: ['べんち', 'bench'] },
  { id: 'ex_incline', name: 'インクラインプレス', part: 'chest', method: 'wr', alias: ['いんくらいん'] },
  { id: 'ex_fly', name: 'ダンベルフライ', part: 'chest', method: 'wr', alias: ['ふらい'] },
  { id: 'ex_pushup', name: '腕立て伏せ', part: 'chest', method: 'bw', alias: ['うでたて', 'プッシュアップ'] },
  { id: 'ex_lat', name: 'ラットプルダウン', part: 'back', method: 'wr', alias: ['らっと'] },
  { id: 'ex_row', name: 'ベントオーバーロウ', part: 'back', method: 'wr', alias: ['ろう'] },
  { id: 'ex_chin', name: '懸垂', part: 'back', method: 'bw', alias: ['けんすい', 'チンニング'] },
  { id: 'ex_achin', name: 'アシスト懸垂', part: 'back', method: 'assist', alias: ['あしすと'] },
  { id: 'ex_spress', name: 'ショルダープレス', part: 'shoulder', method: 'wr', alias: ['しょるだー'] },
  { id: 'ex_side', name: 'サイドレイズ', part: 'shoulder', method: 'wr', alias: ['さいど'] },
  { id: 'ex_rear', name: 'リアレイズ', part: 'shoulder', method: 'wr', alias: ['りあ'] },
  { id: 'ex_front', name: 'フロントレイズ', part: 'shoulder', method: 'wr', alias: ['ふろんと'] },
  { id: 'ex_squat', name: 'スクワット', part: 'leg', method: 'wr', alias: ['すくわっと'] },
  { id: 'ex_smith', name: 'スミスマシンスクワット', part: 'leg', method: 'wr', alias: ['すみす'] },
  { id: 'ex_legpress', name: 'レッグプレス', part: 'leg', method: 'wr', alias: ['れっぐ'] },
  { id: 'ex_lunge', name: 'ランジ', part: 'leg', method: 'bw', alias: ['らんじ'] },
  { id: 'ex_curl', name: 'アームカール', part: 'arm', method: 'wr', alias: ['かーる'] },
  { id: 'ex_pushdown', name: 'プレスダウン', part: 'arm', method: 'wr', alias: ['ぷれすだうん'] },
  { id: 'ex_hammer', name: 'ハンマーカール', part: 'arm', method: 'wr', alias: ['はんまー'] },
  { id: 'ex_dips', name: 'ディップス', part: 'arm', method: 'bw', alias: ['でぃっぷす'] },
  { id: 'ex_crunch', name: 'クランチ', part: 'abs', method: 'bw', alias: ['くらんち', '腹筋'] },
  { id: 'ex_plank', name: 'プランク', part: 'abs', method: 'time', alias: ['ぷらんく'] },
  { id: 'ex_legraise', name: 'レッグレイズ', part: 'abs', method: 'bw', alias: ['れっぐれいず'] },
  { id: 'ex_abroller', name: 'アブローラー', part: 'abs', method: 'bw', alias: ['あぶろーらー', '腹筋ローラー'] },
  { id: 'ex_walk', name: 'ウォーキング', part: 'cardio', method: 'cardio', alias: ['あるく'] },
  { id: 'ex_run', name: 'ランニング', part: 'cardio', method: 'cardio', alias: ['はしる'] },
  { id: 'ex_bike', name: 'エアロバイク', part: 'cardio', method: 'cardio', alias: ['ばいく'] },
];

export const METHOD_COLS = {
  wr: [{ k: 'kg', label: '重量', unit: 'kg', step: '0.5' }, { k: 'reps', label: '回数', unit: '回', step: '1' }],
  bw: [{ k: 'reps', label: '回数', unit: '回', step: '1' }, { k: 'addKg', label: '追加重量', unit: 'kg', step: '0.5', optional: true }],
  assist: [{ k: 'assistKg', label: '補助', unit: 'kg', step: '0.5' }, { k: 'reps', label: '回数', unit: '回', step: '1' }],
  time: [{ k: 'sec', label: '時間', unit: '秒', step: '1' }],
  cardio: [{ k: 'min', label: '時間', unit: '分', step: '1' }, { k: 'km', label: '距離', unit: 'km', step: '0.1', optional: true }],
};

// 見本の「前回」記録（架空）
export const DEMO_PREVIOUS = {
  ex_bench: { date: '9/17', sets: [{ kg: 60, reps: 10 }, { kg: 60, reps: 10 }, { kg: 60, reps: 9 }] },
  ex_side: { date: '9/16', sets: [{ kg: 8, reps: 15 }, { kg: 8, reps: 12 }, { kg: 7, reps: 12 }] },
  ex_lat: { date: '9/15', sets: [{ kg: 45, reps: 12 }, { kg: 45, reps: 12 }, { kg: 45, reps: 10 }] },
};

export const TITLES = [
  { id: 't_first', name: 'はじめの一歩', cond: '最初から', unlocked: true },
  { id: 't_3days', name: 'コツコツ見習い', cond: '記録日 3日', unlocked: true },
  { id: 't_shoulder5', name: '肩幅成長中', cond: '肩 Lv5', unlocked: true },
  { id: 't_shoulder7', name: '横幅注意', cond: '肩 Lv7', unlocked: false },
  { id: 't_shoulder10', name: '肩だけ異世界', cond: '肩 Lv10', unlocked: false },
  { id: 't_30days', name: '習慣の達人', cond: '記録日 30日', unlocked: false },
];

// レベル: 累積必要EXP = 50 × (L-1) × L
export const expForLevel = (L) => 50 * (L - 1) * L;
export function levelOf(exp) {
  let L = 1;
  while (expForLevel(L + 1) <= exp) L++;
  return { lv: L, cur: exp - expForLevel(L), need: expForLevel(L + 1) - expForLevel(L) };
}

// 見本の成長プリセット（部位EXP）
export const GROWTH_PRESETS = {
  early: { name: '初期', exp: { chest: 120, back: 60, shoulder: 150, leg: 40, arm: 80, abs: 20 }, days: 4 },
  mid: { name: '中期', exp: { chest: 900, back: 650, shoulder: 1600, leg: 700, arm: 650, abs: 400 }, days: 26 },
  max: { name: '肩幅最大', exp: { chest: 2300, back: 1900, shoulder: 7900, leg: 1700, arm: 1600, abs: 1600 }, days: 64 },
};

/* ---------- 見本のジム参加者（架空） ---------- */
const NAMES = ['見本 A', '見本 B', '見本 C', '見本 D', '見本 E', '見本 F', '見本 G', '見本 H', '見本 I', '見本 J', '見本 K', '見本 L',
  '見本 M', '見本 N', '見本 O', '見本 P', '見本 Q', '見本 R', '見本 S', '見本 T', '見本 U', '見本 V', '見本 W'];
const COMMENTS = ['今日は脚の日。階段がこわい', '肩いい感じ', 'ベンチ自己ベスト更新！', '10分だけでもやった', '背中に効いた気がする',
  '久しぶりに来ました', '休憩長めでいきます', null, null, 'プランク1分できた', null, 'スミス空いててうれしい', null, '朝トレ完了', null, null,
  'フォーム見直し中', null, '腕がパンパン', null, '有酸素30分', null, null];
const MENUS = [
  [['背中', 'ラットプルダウン', '45kg × 12回 × 3'], ['脚', 'レッグプレス', '90kg × 10回 × 3']],
  [['肩', 'サイドレイズ', '8kg × 15回 × 3']],
  [['胸', 'ベンチプレス', '62.5kg × 8回 × 3']],
  [['腹', 'プランク', '60秒 × 3']],
  [['有酸素', 'ランニング', '30分 / 4.2km']],
];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function demoMembers(count) {
  const r = rng(7);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const hs = ['buzz', 'crew', 'short', 'twoblock', 'mohawk', 'allback', 'mash', 'center', 'perm', 'longm', 'bob', 'pony', 'bun', 'twin', 'long'];
  const hc = ['black', 'darkbrown', 'brown', 'blonde', 'ash', 'wine'];
  const sk = ['skin1', 'skin2', 'skin3', 'skin4', 'skin5', 'skin6'];
  const cc = ['black', 'charcoal', 'gray', 'white', 'teal', 'navy', 'blue', 'red', 'green', 'yellow', 'pink', 'purple'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const type = r() < 0.5 ? 'male' : 'female';
    const shoulder = i === 3 ? 12 : i === 9 ? 8 : Math.floor(r() * 7);
    const lvl = Math.round(r() * 20) / 10;
    out.push({
      id: 'demo_' + i,
      name: NAMES[i % NAMES.length],
      nameVisible: r() > 0.2,
      contentVisible: r() > 0.25,
      title: shoulder >= 9 ? '肩だけ異世界' : shoulder >= 6 ? '横幅注意' : pick(['はじめの一歩', 'コツコツ見習い', '習慣の達人']),
      recordedMinAgo: Math.floor(r() * 23 * 60),
      comment: COMMENTS[i % COMMENTS.length],
      menu: MENUS[i % MENUS.length],
      nice: Math.floor(r() * 15),
      look: {
        type,
        face: pick(['smile', 'smile', 'smile', 'joy', 'relax', 'grin', 'wink', 'sparkle', 'proud', 'shy', 'surprise', 'focus', 'fight']),
        hairStyle: pick(hs),
        hairColor: pick(hc),
        skin: pick(sk),
        top: 'tank',
        topColor: pick(cc),
        bottom: r() < 0.55 ? 'shorts' : 'pants',
        bottomColor: pick(['black', 'charcoal', 'navy', 'gray', 'black']),
        stages: { chest: lvl, back: lvl, shoulder, arm: lvl, leg: Math.round(r() * 20) / 10, abs: Math.round(r() * 20) / 10 },
      },
    });
  }
  return out;
}

export function agoLabel(min) {
  if (min < 1) return 'たった今記録';
  if (min < 60) return `${min}分前に記録`;
  return `${Math.floor(min / 60)}時間前に記録`;
}
