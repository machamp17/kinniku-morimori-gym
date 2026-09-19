// 色の定義。肌・髪は手作業で調整した5段階ランプ、衣服は基本色から生成する。
// ランプの並び: [line(境界線), shade2(深い影), shade(影), base(基本), light(ハイライト)]

export const SKINS = [
  { id: 'skin1', name: 'ライト', ramp: ['#9a5646', '#d69683', '#ecb6a1', '#fcdccb', '#fff1e8'] },
  { id: 'skin2', name: 'ナチュラル', ramp: ['#8f4a33', '#cc8663', '#e5a882', '#f6c9a5', '#ffe4cd'] },
  { id: 'skin3', name: 'ハニー', ramp: ['#80432a', '#b8744c', '#d39463', '#e8b282', '#f7d1a8'] },
  { id: 'skin4', name: 'タン', ramp: ['#6c351f', '#9b5a37', '#b7754b', '#cf9366', '#e5b089'] },
  { id: 'skin5', name: 'ブラウン', ramp: ['#4b2215', '#784028', '#925535', '#ab6d48', '#c68a63'] },
  { id: 'skin6', name: 'ディープ', ramp: ['#2a130b', '#4c2618', '#613322', '#7a4630', '#976049'] },
];

export const HAIR_COLORS = [
  { id: 'black', name: '黒', ramp: ['#0c0b10', '#1c1a23', '#2a2733', '#3d3947', '#655f73'] },
  { id: 'darkbrown', name: 'こげ茶', ramp: ['#1c100a', '#382016', '#52301e', '#6c442a', '#99694a'] },
  { id: 'brown', name: '茶', ramp: ['#3a1e0f', '#6a3a1c', '#8a5126', '#a96b36', '#d39658'] },
  { id: 'blonde', name: 'ブロンド', ramp: ['#6a4818', '#a8792b', '#c99a3d', '#e3ba5a', '#f7de92'] },
  { id: 'ash', name: 'アッシュ', ramp: ['#2b2e33', '#565b64', '#767c86', '#98a0aa', '#c7ced6'] },
  { id: 'wine', name: 'ワイン', ramp: ['#2a0c13', '#521a24', '#722833', '#8f3a41', '#bd6363'] },
];

export const CLOTH_COLORS = [
  { id: 'black', name: 'ブラック', hex: '#2b2e34' },
  { id: 'charcoal', name: 'チャコール', hex: '#4a5059' },
  { id: 'gray', name: 'グレー', hex: '#8e959d' },
  { id: 'white', name: 'ホワイト', hex: '#e8ecef' },
  { id: 'teal', name: 'ティール', hex: '#27b3a4' },
  { id: 'navy', name: 'ネイビー', hex: '#2d406c' },
  { id: 'blue', name: 'ブルー', hex: '#3b7bd4' },
  { id: 'red', name: 'レッド', hex: '#c8443f' },
  { id: 'green', name: 'グリーン', hex: '#4e8a4b' },
  { id: 'yellow', name: 'イエロー', hex: '#dfb33b' },
  { id: 'pink', name: 'ピンク', hex: '#de7c9b' },
  { id: 'purple', name: 'パープル', hex: '#7a5ab6' },
];

// すべて男女共通。並びは短い順
export const HAIR_STYLES = [
  { id: 'buzz', name: '坊主' },
  { id: 'crew', name: '短髪' },
  { id: 'short', name: 'ショート' },
  { id: 'twoblock', name: 'ツーブロック' },
  { id: 'spiky', name: 'ツンツン' },
  { id: 'mohawk', name: 'ソフトモヒカン' },
  { id: 'allback', name: 'オールバック' },
  { id: 'shichisan', name: '七三分け' },
  { id: 'mash', name: 'マッシュ' },
  { id: 'center', name: 'センターパート' },
  { id: 'wolf', name: 'ウルフ' },
  { id: 'perm', name: 'パーマ' },
  { id: 'afro', name: 'アフロ' },
  { id: 'longm', name: 'ロン毛' },
  { id: 'sbob', name: 'ショートボブ' },
  { id: 'bob', name: 'ボブ' },
  { id: 'pony', name: 'ポニーテール' },
  { id: 'side', name: 'サイドテール' },
  { id: 'bun', name: 'お団子' },
  { id: 'twin', name: 'ツインテール' },
  { id: 'braids', name: 'おさげ' },
  { id: 'halfup', name: 'ハーフアップ' },
  { id: 'long', name: 'ロング' },
];

export const TOPS = [
  { id: 'tank', name: 'タンクトップ' },
  { id: 'tee', name: 'Tシャツ' },
];

export const BOTTOMS = [
  { id: 'shorts', name: 'ショートパンツ' },
  { id: 'pants', name: 'トレーニングパンツ' },
];

/* ---------- 色計算 ---------- */
const hex2rgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const rgb2hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2hex(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgb2hex(f(0) * 255, f(8) * 255, f(4) * 255);
}

// 衣服ランプ: 影は青紫寄り・彩度を少し上げ、明部は暖色寄りにする（単純な明度変更だと濁るため）
const rampCache = new Map();
export function clothRamp(hex) {
  if (rampCache.has(hex)) return rampCache.get(hex);
  const [h, s, l] = rgb2hsl(hex2rgb(hex));
  const toward = (target, amt) => {
    let d = target - h;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return h + d * amt;
  };
  const dark = l < 0.25;
  const white = l > 0.85;
  const ramp = [
    hsl2hex(toward(0.68, 0.25), Math.min(1, s * 1.1 + 0.05), dark ? 0.06 : Math.max(0.07, l * 0.32)),
    hsl2hex(toward(0.66, 0.15), Math.min(1, s * 1.05 + 0.03), dark ? l * 0.72 : white ? l - 0.24 : l * 0.62),
    hsl2hex(toward(0.66, 0.08), Math.min(1, s * 1.02), dark ? l * 0.86 : white ? l - 0.12 : l * 0.8),
    hex,
    hsl2hex(toward(0.12, 0.08), s * 0.95, dark ? l + 0.12 : white ? Math.min(0.99, l + 0.07) : Math.min(0.92, l + (1 - l) * 0.32)),
  ];
  rampCache.set(hex, ramp);
  return ramp;
}

export const FIXED = {
  shoe: ['#3c434d', '#8d97a2', '#c3cbd3', '#eef1f4', '#ffffff'],
  sole: ['#2a2f36', '#4b525c', '#5e6670', '#737c87', '#8e97a1'],
  sock: ['#6d747c', '#b5bcc3', '#d7dce1', '#f1f3f5', '#ffffff'],
  teal: ['#0a4f4a', '#11857c', '#1fa598', '#39d9c6', '#a8fff2'],
  eye: { lid: '#1d1416', iris: '#3a2620', iris2: '#6d4533', hi: '#ffffff' },
};

export const pickById = (list, id) => list.find((x) => x.id === id) || list[0];
