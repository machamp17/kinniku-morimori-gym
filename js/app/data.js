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

// 種目一覧は exercises.js（約170種目・器具ごと）
export { EXERCISES, EQUIPMENT } from './exercises.js';

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

// 称号。肩の称号は肩幅の段階（0〜60）で解放（依頼者指示）
export const TITLES = [
  { id: 't_first', name: 'はじめの一歩', cond: '最初から' },
  { id: 't_3days', name: 'コツコツ見習い', cond: '記録日 3日' },
  { id: 't_shoulder5', name: '肩幅成長中', cond: '肩幅 3段階', shoulder: 3 },
  { id: 't_shoulder7', name: '横幅注意', cond: '肩幅 9段階', shoulder: 9 },
  { id: 't_shoulder10', name: '肩だけ異世界', cond: '肩幅 15段階', shoulder: 15 },
  { id: 't_door', name: 'ドアに少し引っかかる', cond: '肩幅 22段階', shoulder: 22 },
  { id: 't_shoulder_main', name: '肩が本体', cond: '肩幅 30段階', shoulder: 30 },
  { id: 't_side_walk', name: '改札は横歩き', cond: '肩幅 40段階', shoulder: 40 },
  { id: 't_horizon', name: '肩が地平線', cond: '肩幅 50段階', shoulder: 50 },
  { id: 't_legend', name: '伝説の肩幅', cond: '肩幅 60段階（最大）', shoulder: 60 },
  { id: 't_30days', name: '習慣の達人', cond: '記録日 30日' },
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
  early: { name: '初期', exp: { chest: 120, back: 60, shoulder: 60, leg: 40, arm: 80, abs: 20 }, days: 4 },
  mid: { name: '中期', exp: { chest: 900, back: 650, shoulder: 330, leg: 700, arm: 650, abs: 400 }, days: 26 },
  max: { name: '肩幅最大', exp: { chest: 2300, back: 1900, shoulder: 6300, leg: 1700, arm: 1600, abs: 1600 }, days: 64 },
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
    const shoulder = i === 3 ? 42 : i === 9 ? 24 : i === 15 ? 16 : Math.floor(r() * 11);
    const lvl = Math.round(r() * 20) / 10;
    out.push({
      id: 'demo_' + i,
      name: NAMES[i % NAMES.length],
      nameVisible: r() > 0.2,
      contentVisible: r() > 0.25,
      title: shoulder >= 40 ? '改札は横歩き' : shoulder >= 22 ? 'ドアに少し引っかかる' : shoulder >= 15 ? '肩だけ異世界' : shoulder >= 9 ? '横幅注意' : pick(['はじめの一歩', 'コツコツ見習い', '習慣の達人']),
      recordedMinAgo: Math.floor(r() * 23 * 60),
      pose: pick(['stand', 'curl', 'raise', 'press', 'squat', 'row', 'run', 'stretch', 'stand', 'squat', 'curl']),
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
