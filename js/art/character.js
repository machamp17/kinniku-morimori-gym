// キャラクター描画（約3頭身・正面）。
// detail: 192x192（成長・着せ替え用） / gym: 96x96（ジム用、縮小表示で消えないよう輪郭・顔は2画素単位）
// レイヤー順: 後ろ髪 → 脚・靴 → 下衣 → 胴 → 上衣 → 腕 → 袖 → 首 → 頭 → 顔 → 前髪 → 小物

import { Surface, Ell, Cap, Rows, Union, sphereNormal } from './raster.js';
import { SKINS, HAIR_COLORS, CLOTH_COLORS, FIXED, clothRamp, mix, pickById } from './palette.js';
import { hairParts } from './hair.js';

// 肩は肩のEXPで直接広がる（依頼者指示: 段階を増やし、早く大きく。極端に大きいのはギャグとしてOK）。
// 段階 0〜60。段階 n に必要な肩EXP = 15n + 1.5n²（1段目は約17EXP、20段目は900EXP＝約2.2倍、
// その先は1段ごとに0.14倍ずつ膨らみ、60段目（6300EXP）で約7.8倍）
export const SHOULDER_STEPS = 60;
const SHOULDER_NORMAL = 20;
export const shoulderExpFor = (n) => Math.round(15 * n + 1.5 * n * n);
export function shoulderStageFromExp(exp) {
  let n = 0;
  while (n < SHOULDER_STEPS && exp >= shoulderExpFor(n + 1)) n++;
  return n;
}
// ジムでも肩の大きさが分かるよう、詳細とジムで同じ倍率
export function shoulderMult(kind, stage) {
  const st = Math.max(0, Math.min(SHOULDER_STEPS, stage));
  const t = Math.min(1, st / SHOULDER_NORMAL);
  return 1 + 1.2 * Math.pow(t, 1.35) + Math.max(0, st - SHOULDER_NORMAL) * 0.14;
}

// 部位レベル → 見た目段階（肩以外）。0〜2 の連続値でレベルごとに少しずつ変わる
export function stageOf(part, lv) {
  return Math.min(2, Math.round((Math.max(0, lv - 1) / 2.5) * 10) / 10);
}

/* ---------- ポーズ（ジム画面だけで使う。成長・着せ替え・詳細は立ち姿のまま） ----------
 * arm(s): ひじ・手首の位置 / leg(s): ひざ・足首・足の位置 / drop: 上半身を下げる量 / prop: 持ち物
 * 座標は設計座標（中心 x=96）。s は -1=左 / +1=右 */
export const POSES = [
  { id: 'stand', name: '立つ' },
  { id: 'curl', name: 'ダンベルカール' },
  { id: 'raise', name: 'サイドレイズ' },
  { id: 'press', name: 'ショルダープレス' },
  { id: 'squat', name: 'スクワット' },
  { id: 'row', name: 'ダンベルを持つ' },
  { id: 'run', name: '走る' },
  { id: 'stretch', name: 'ストレッチ' },
];
const POSE_DEF = {
  stand: {},
  curl: { arm: (s) => [2.4, 20, 7, 4], prop: 'dumbbell' },
  raise: { arm: (s) => [13, 2, 25, -1], prop: 'dumbbell' },
  press: { arm: (s) => [9, -7, 7, -20], prop: 'dumbbell' },
  squat: { arm: (s) => [10, 6, 15, -5], prop: 'barbellBack', drop: 13, leg: 'squat' },
  row: { arm: (s) => (s < 0 ? [3, 16, 6, 4] : [3.2, 14, 4, 26]), prop: 'dumbbellOne', lean: true },
  run: { arm: (s) => (s < 0 ? [-2, 13, 3, 1] : [4, 16, 9, 25]), leg: 'run' },
  stretch: { arm: (s) => [5, -8, 1, -24] },
};

export const DEFAULT_LOOK = {
  type: 'male',
  hairStyle: 'short',
  hairColor: 'darkbrown',
  skin: 'skin2',
  top: 'tank',
  topColor: 'black',
  bottom: 'shorts',
  bottomColor: 'charcoal',
  wristband: false,
  stages: { chest: 0, back: 0, shoulder: 0, arm: 0, leg: 0, abs: 0 },
  face: 'smile', // smile | joy | focus
  pose: 'stand',
  frame: 0,
};

/* ---------- 体型 ---------- */
function geometry(look, kind) {
  const st = Object.assign({ chest: 0, back: 0, shoulder: 0, arm: 0, leg: 0, abs: 0 }, look.stages || {});
  const fem = look.type === 'female';
  const g = { st, fem };
  g.topHW = 17 + st.chest * 1.4 + st.back * 1.8 - (fem ? 2 : 0);
  g.chestHW = g.topHW + st.chest * 0.6;
  g.waistHW = 14.5 + st.back * 0.6 - (fem ? 2 : 0);
  g.hipHW = 16 + (fem ? 0.6 : 0) + st.leg * 0.3;
  // 肩: 通常時の肩幅 W0 に倍率を掛け、三角筋の半径 d を逆算（胴や頭は伸ばさない）
  const d0 = fem ? 6 : 6.5;
  const topBase = 17 - (fem ? 2 : 0);
  const W0 = 2 * (topBase + 1.55 * d0);
  const mult = shoulderMult(kind, st.shoulder);
  g.mult = mult;
  g.dRx = Math.max(d0, ((W0 * mult) / 2 - g.topHW) / 1.55);
  g.dRy = Math.min(38, 6.4 + (g.dRx - d0) * 0.62); // 縦は上限あり（横にだけ極端に広がる）
  g.d0 = d0;
  g.jointX = g.topHW + g.dRx * 0.55;
  g.shoulderWidth = 2 * (g.jointX + g.dRx);
  g.armR = 6 + st.arm * 1.35 - (fem ? 0.7 : 0);
  g.thighR = 8 + st.leg * 1.3 - (fem ? 0.3 : 0);
  g.shinR = 6.3 + st.leg * 0.85 - (fem ? 0.3 : 0);
  g.hipX = 9 + st.leg * 0.45;
  return g;
}

/* ---------- 顔 ---------- */
// 表情一覧（すべて前向きな表情。怒り・疲れ・無表情は置かない）
export const FACES = [
  { id: 'smile', name: 'にっこり' },
  { id: 'joy', name: '満面' },
  { id: 'relax', name: 'ほっこり' },
  { id: 'grin', name: 'ニカッ' },
  { id: 'wink', name: 'ウインク' },
  { id: 'sparkle', name: 'キラキラ' },
  { id: 'proud', name: 'ドヤ' },
  { id: 'shy', name: '照れ' },
  { id: 'surprise', name: 'びっくり' },
  { id: 'focus', name: '集中' },
  { id: 'fight', name: 'ファイト' },
];

// 目のテンプレート（左目。右目は中心線で左右反転）
// K=まぶた線 I=瞳 i=瞳の下側 W=光 w=白目
const EYE_D = {
  open: ['.KKKK.', 'KKKKKK', 'IWWIII', 'IWWIII', 'IIIIII', 'IIiiiI', '.iiii.'],
  half: ['......', '......', 'KKKKKK', 'IWWIII', 'IIIIII', 'IIiiiI', '.iiii.'],
  up: ['......', '......', '......', '..KK..', '.K..K.', 'K....K', '......'],
  down: ['......', '......', '......', 'K....K', '.KKKK.', '......', '......'],
  smug: ['......', '......', '......', 'KKKKKK', '.IIII.', '......', '......'],
  shy: ['......', '......', 'KKKKKK', 'IIIIII', 'IIWWiI', '.iiii.', '......'],
  sparkle: ['.KKKK.', 'KKKKKK', 'IWWIWI', 'IWWIII', 'IIIIII', 'IWiiWI', '.iiii.'],
  wide: ['.KKKK.', 'KwwwwK', 'KwIIwK', 'KwIIwK', 'KwwwwK', '.KKKK.', '......'],
};
// 女性はまつ毛を1列足す（開いた目だけ）
const femEye = (rows, lash) => (lash ? ['KK.....', ...rows.map((r) => '.' + r)] : ['.......', ...rows.map((r) => '.' + r)]);

const EYE_G = {
  open: ['.KK', '.II', '.II', '.ii'],
  half: ['...', '.KK', '.II', '.ii'],
  up: ['....', '.KK.', 'K..K', '....'],
  down: ['....', '....', 'K..K', '.KK.'],
  smug: ['...', '...', 'KKK', '.II'],
  shy: ['...', '.KK', '.II', '.Wi'],
  sparkle: ['.KK', '.WI', '.II', '.iW'],
  wide: ['.KK.', 'K..K', 'K..K', '.KK.'],
};

// 表情ごとの組み立て: 左目/右目・眉の上下・眉の形・口・ほほ・おまけ
const EXPR = {
  smile: { eye: 'open', mouth: 'smile' },
  joy: { eye: 'up', brow: -1, mouth: 'joy', blush: 0.5 },
  relax: { eye: 'down', mouth: 'smile', blush: 0.45 },
  grin: { eye: 'open', mouth: 'grin' },
  wink: { eye: 'open', eyeR: 'up', mouth: 'grin' },
  sparkle: { eye: 'sparkle', brow: -1, mouth: 'open', extra: 'sparkle' },
  proud: { eye: 'smug', mouth: 'smug', extra: 'shine' },
  shy: { eye: 'shy', browShape: 'worry', mouth: 'wave', blush: 0.62, extra: 'shy' },
  surprise: { eye: 'wide', brow: -2, mouth: 'o' },
  focus: { eye: 'half', browShape: 'flat', mouth: 'smile', extra: 'sweat' },
  fight: { eye: 'open', brow: -1, mouth: 'shout', extra: 'fire' },
};

const MOUTH_D = {
  smile: [93, 71, ['M....M', '.MMMM.']],
  joy: [93, 70, ['MMMMMM', 'MRRRRM', '.MPPM.', '..MM..']],
  grin: [93, 70, ['MMMMMM', 'MTTTTM', '.MMMM.']],
  open: [94, 70, ['MMMM', 'MPPM', '.MM.']],
  smug: [93, 71, ['.....M', 'MMMMM.']],
  wave: [93, 71, ['M.M.M.', '.M.M.M']],
  o: [94, 69, ['.MM.', 'MRRM', 'MRRM', '.MM.']],
  shout: [93, 69, ['MMMMMM', 'MRRRRM', 'MRPPRM', '.MMMM.']],
};
const MOUTH_G = {
  smile: [46, 34, ['M..M', '.MM.']],
  joy: [46, 34, ['MMMM', '.RR.']],
  grin: [46, 34, ['MMMM', '.TT.']],
  open: [46, 34, ['MMMM', '.PP.']],
  smug: [46, 34, ['...M', 'MMM.']],
  wave: [46, 35, ['M.M.', '.M.M']],
  o: [47, 34, ['MM', 'RR']],
  shout: [46, 34, ['MMMM', 'MRRM']],
};

function drawFace(S, look, kind, skin, hair, bobPx) {
  const detail = kind === 'detail';
  const fem = look.type === 'female';
  const E = EXPR[look.face] || EXPR.smile;
  const R = S.res;
  const map = {
    K: FIXED.eye.lid,
    I: FIXED.eye.iris,
    i: FIXED.eye.iris2,
    W: FIXED.eye.hi,
    w: '#ffffff',
    B: hair[1],
    M: mix(skin[0], '#3a0f0f', 0.35),
    R: '#8a2b2b',
    P: '#e87b7b',
    T: '#ffffff',
    H: mix(skin[3], '#f06a6a', E.blush || 0.36),
    L: mix(skin[2], '#d8505a', 0.5),
  };
  const P0 = S.pad; // 横に広げた分のずれ
  const put = (x, y, rows, mirror) => S.stamp((mirror ? R - x - rows[0].length : x) + P0, y + bobPx, rows, map, mirror);

  // 目
  const eyeRows = (name) => {
    if (!detail) {
      const r = EYE_G[name];
      return fem && name === 'open' ? ['..KK', '.KII', '..II', '..ii'] : r.map((s) => (fem ? '.' : '') + s);
    }
    const r = EYE_D[name];
    return fem ? femEye(r, ['open', 'half', 'sparkle', 'shy'].includes(name)) : r;
  };
  const ex = detail ? (fem ? 82 : 83) : fem ? 40 : 41;
  const ey = detail ? (fem ? 56 : 57) : 26;
  put(ex, ey, eyeRows(E.eye), false);
  put(ex, ey, eyeRows(E.eyeR || E.eye), true);

  // 眉（目から離し、内側を下げない＝怒り顔にしない）
  let brow = detail ? (fem ? ['..BBBB.', '.B.....'] : ['..BBBBB', '.BB....']) : fem ? ['.BB.'] : ['.BBB'];
  if (E.browShape === 'flat') brow = [brow[0]];
  if (E.browShape === 'worry') brow = detail ? ['....BB.', '.BBB...'] : ['..B.', '.B..'];
  const bx = detail ? 82 : 41;
  const by = (detail ? (fem ? 50 : 51) : 23) + (E.brow || 0);
  put(bx, by, brow, false);
  put(bx, by, brow, true);

  // ほほ
  const blush = detail ? (E.extra === 'shy' ? ['.HLHL', 'HLHL.'] : ['.HHHH', 'HHHH.']) : E.extra === 'shy' ? ['HH', 'HH'] : ['HH'];
  const [hx0, hy0] = detail ? [78, 66] : [37, 32];
  put(hx0, hy0, blush, false);
  put(hx0, hy0, blush, true);

  // 鼻・口
  if (detail) [[96, 66], [96, 67]].forEach(([x, y]) => S.dot(x + P0, y + bobPx, skin[2]));
  const [mx, my, mr] = (detail ? MOUTH_D : MOUTH_G)[E.mouth] || (detail ? MOUTH_D : MOUTH_G).smile;
  S.stamp(mx + P0, my + bobPx, mr, map, false);

  // おまけ（顔の外側に小さく）
  if (!detail) return;
  const any = true;
  if (E.extra === 'sweat') S.stamp(113 + P0, 49 + bobPx, ['.S', 'SS', 'SS'], { S: '#bfefff' }, false, any);
  if (E.extra === 'sparkle') {
    S.stamp(62 + P0, 30 + bobPx, ['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'], { Y: '#ffe07a', W: '#ffffff' }, false, any);
    S.stamp(124 + P0, 38 + bobPx, ['.Y.', 'YWY', '.Y.'], { Y: '#ffe07a', W: '#ffffff' }, false, any);
  }
  if (E.extra === 'shine') S.stamp(122 + P0, 44 + bobPx, ['Y...', '.Y.Y', '..Y.', '.Y.Y'], { Y: '#ffe07a' }, false, any);
  if (E.extra === 'fire') {
    S.stamp(122 + P0, 40 + bobPx, ['..F..', '.FFF.', 'FFOFF', 'FOOOF', '.FOF.'], { F: '#ff7a3d', O: '#ffd36b' }, false, any);
  }
}

/* ---------- 本体 ---------- */
// ランプ内で1段暗くする（落ち影用）
const darker = (ramp) => (c) => {
  const i = ramp.indexOf(c);
  return i > 1 ? ramp[i - 1] : c;
};

export function drawCharacter(look, kind = 'detail') {
  look = Object.assign({}, DEFAULT_LOOK, look);
  const res = kind === 'gym' ? 96 : 192;
  const detail = kind === 'detail';
  const g = geometry(look, kind);
  const pose = (kind === 'gym' && POSE_DEF[look.pose]) || POSE_DEF.stand;
  const dropY = pose.drop || 0;
  // ひじ・手首の位置（ポーズごと）
  const armPts = [-1, 1].map((s) => {
    const jx = 96 + s * g.jointX;
    const [dex, dey, dwx, dwy] = pose.arm ? pose.arm(s) : [3.2, 20, 6.2, 36];
    return { s, jx, ex: jx + s * dex, eY: 91 + dey + dropY, wx: jx + s * dwx, wY: 91 + dwy + dropY };
  });
  const armFar = Math.max(...armPts.map((a) => Math.abs(a.wx - 96) + g.armR + 8));
  const propFar = pose.prop === 'barbellUp' || pose.prop === 'barbellBack' ? g.jointX + 26 : pose.prop ? armFar + 6 : 0;
  const half = Math.max(g.jointX + g.dRx, g.jointX + 5.6 + g.armR + 6, armFar, propFar) + 3; // 中心から一番外まで（設計座標）
  const pad = half > 95 ? Math.ceil(((half - 95) * res) / 192 / 2) * 2 : 0;
  const S = new Surface(res, pad);
  const st = g.st;
  const fem = g.fem;
  const bobPx = look.frame ? 1 : 0;
  const b = bobPx / S.s; // 上半身の上下（設計座標）
  const bU = b + dropY; // 上半身（胴・腕・首・頭）の位置。スクワットなどでは下がる
  const facePx = bobPx + Math.round(dropY * S.s); // 顔・髪の画素単位のずれ

  const skin = pickById(SKINS, look.skin).ramp;
  const hair = pickById(HAIR_COLORS, look.hairColor).ramp;
  const topC = clothRamp(pickById(CLOTH_COLORS, look.topColor).hex);
  const botC = clothRamp(pickById(CLOTH_COLORS, look.bottomColor).hex);
  const cx = 96;
  const hx = 96, hy = 52 + bU;
  const HP = hairParts(look.hairStyle, hx, hy);
  const hairN = sphereNormal(hx - 2, hy - 6, 34);
  // 毛束どうしの境目は柔らかい線（ジム用は線なしで塊として見せる）、顔や体との境目は濃い線
  // 毛束どうしは右側の縁にだけ線を入れる（両側に入れると細かすぎて荒れる）
  const hairLine = (grp, d) => (grp.startsWith('hair') ? (detail && d === 1 ? mix(hair[1], hair[2], 0.35) : null) : hair[0]);
  const buzzRamp = [hair[0], mix(hair[1], skin[1], 0.2), mix(hair[2], skin[2], 0.28), mix(hair[3], skin[3], 0.36), mix(hair[3], skin[4], 0.46)];
  // ジム用は頭部だけ 1.2 倍（顔を読める大きさにする。首元基準で縦横同率）
  const headXf = kind === 'gym' ? { ox: 96, oy: 78 + bU, k: 1.2 } : null;

  const paintHair = (list, prefix, baseBias) =>
    list.forEach((it, i) => {
      const grp = prefix + i;
      const ramp = it.kind === 'buzz' ? buzzRamp : hair;
      const bias = baseBias + (it.kind === 'lock' ? (i % 2 ? 0.05 : -0.04) : 0);
      S.paint(it.shape, ramp, grp, { clip: it.clip, normal: it.kind === 'curl' ? undefined : hairN, bias, lineFor: hairLine });
      if (it.kind === 'buzz' && detail) {
        // 刈り上げの点描
        S.tint(grp, (x, y, c) => c === buzzRamp[3] && (Math.floor(x) + Math.floor(y)) % 3 === 0, buzzRamp[2]);
      }
      if (it.kind === 'lock' && detail && it.spine) {
        // 毛束のつや（光の来る左上側に短い線）
        const [p0, p1, p2] = it.spine;
        for (let t = 0.15; t <= 0.5; t += 0.02) {
          const u = 1 - t;
          const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0] - 1.2;
          const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
          const [px, py] = S.P(x, y);
          const k = S.idx(px, py);
          if (k >= 0 && S.grp[k] === grp && S.col[k] === hair[3]) S.col[k] = hair[4];
        }
      }
    });

  /* 後ろ髪 */
  S.xf = headXf;
  paintHair(HP.back, 'hairB', -0.12);
  S.xf = null;

  /* 脚・靴 */
  const legY = 130;
  // ポーズごとの [ひざX, ひざY, 足首X, 足首Y, 足X, 足Y]（X は腰からの差、+s が外向き）
  const legJoint = (s) => {
    if (pose.leg === 'squat') return [s * 6, 154, s * 5, 169, s * 7, 175.5];
    if (pose.leg === 'run') return s < 0 ? [s * 5, 148, s * 10, 159, s * 13, 164] : [s * 3, 153, s * 6, 170, s * 8, 176];
    return [s * 0.8, 152, s * 1.2, 168, s * 2.8, 175.5];
  };
  for (const s of [-1, 1]) {
    const lx = cx + s * g.hipX;
    const grp = 'leg' + s;
    const [kdx, kY, adx, aY, fdx, fY] = legJoint(s);
    const hipY = legY + dropY;
    const rr = g.thighR * 1.15;
    const axis = (y) => (y < kY ? lx + ((kdx * (y - hipY)) / Math.max(1, kY - hipY)) : lx + kdx + ((adx - kdx) * (y - kY)) / Math.max(1, aY - kY));
    const cyl = (x, y) => {
      const u = Math.max(-1, Math.min(1, (x - axis(y)) / rr));
      return [u, 0, Math.sqrt(1 - u * u)];
    };
    S.paint(Cap(lx, hipY, lx + kdx, kY, g.thighR, g.thighR * 0.85), skin, grp, { normal: cyl });
    S.paint(Cap(lx + kdx, kY, lx + adx, aY, g.shinR, g.shinR * 0.78), skin, grp, { normal: cyl });
    if (st.leg >= 1) S.paint(Ell(lx + (kdx + adx) / 2 + s * 0.6, (kY + aY) / 2 + 1, g.shinR + 0.3, 5.5 + st.leg * 0.8), skin, grp, { normal: cyl });
    S.paint(Cap(lx + adx, aY + 0.5, lx + adx, aY + 3, g.shinR * 0.78 + 0.6, g.shinR * 0.78 + 0.6), FIXED.sock, 'sock' + s, { hl: false });
    const sx = lx + fdx;
    S.paint(Ell(sx, fY, 9.4 + st.leg * 0.4, 6), FIXED.shoe, 'shoe' + s, { clip: (x, y) => y < fY + 4 });
    S.paint(Rows(sx, fY + 3.5, fY + 6, () => 9.6 + st.leg * 0.4), FIXED.sole, 'shoe' + s, { hl: false, flat: 3 });
    if (detail) {
      // ひざの影・靴ひも・靴のライン
      const [kx, ky] = S.P(lx + kdx - 2, kY - 1);
      S.stamp(kx, ky, ['.kk.', 'k..k'], { k: skin[2] });
      const [qx, qy] = S.P(sx - 3, fY - 4);
      S.stamp(qx, qy, ['LLLLL', '.L.L.'], { L: FIXED.shoe[1] });
      const [tx, ty] = S.P(sx - 3 + s * 1.5, fY + 1);
      S.stamp(tx, ty, ['TTTT'], { T: FIXED.teal[2] });
    }
  }

  /* 下衣 */
  const pants = look.bottom === 'pants';
  const hemY = pants ? 167 : 146;
  S.paint(
    Rows(cx, 117 + dropY, 134 + dropY, (y) => {
      const t = (y - 117 - dropY) / 17;
      return g.waistHW + 0.8 + (g.hipHW + 1.6 - g.waistHW - 0.8) * Math.min(1, t * 1.6);
    }),
    botC,
    'bottom',
  );
  for (const s of [-1, 1]) {
    const lx = cx + s * g.hipX;
    const [kdx, kY, adx, aY] = legJoint(s);
    const t = (v) => 132 + dropY + (kY - (132 + dropY)) * v; // 腰からひざまでの途中の高さ
    if (pants) {
      const hem = Math.min(hemY + dropY, aY - 1);
      S.paint(Cap(lx, 132 + dropY, lx + kdx, kY, g.thighR + 1.8, g.thighR * 0.85 + 1.6), botC, 'bottom', { lineWith: ['leg' + s, 'leg' + -s] });
      S.paint(Cap(lx + kdx, kY, lx + adx * (hem - kY) / Math.max(1, aY - kY), hem, g.shinR + 1.9, g.shinR * 0.78 + 1.7), botC, 'bottom', { lineWith: ['leg' + s, 'leg' + -s] });
      S.paint(Rows(lx + adx * (hem - kY) / Math.max(1, aY - kY), hem - 1.5, hem + 1.5, () => g.shinR * 0.78 + 2.1), botC, 'cuff' + s, { flat: 1 });
    } else {
      const hem = Math.min(146 + dropY, kY - 2);
      S.paint(Cap(lx, 132 + dropY, lx + kdx * 0.6, t(0.6), g.thighR + 2, g.thighR + 1.6), botC, 'bottom', { clip: (x, y) => y < hem, lineWith: ['leg' + s, 'leg' + -s] });
    }
    if (detail) {
      // 脇の白ライン
      for (let y = 124 + dropY; y <= (pants ? 164 : 144) + dropY; y++) {
        const tx = pants ? cx + s * (g.hipX + (y < 152 ? g.thighR + 1.2 : g.shinR + 1.2)) + s * (y - 124) * 0.03 : cx + s * (g.hipHW + 1.2) + s * (y - 124) * 0.14;
        const [px, py] = S.P(tx, y);
        S.dot(px, py, mix(botC[4], '#ffffff', 0.55));
      }
      // すその影
      if (!pants) S.tint('bottom', (x, y, c) => y > hemY - 2.5 && c !== botC[0], botC[2]);
      // しわ
      const fold = pants ? [[lx - s * 2, 154, 4], [lx + s * 1, 160, 3]] : [[lx - s * 3, 138, 3]];
      fold.forEach(([fx, fy, n]) => {
        for (let i = 0; i < n; i++) {
          const [px, py] = S.P(fx + s * i * 0.8, fy + i * 0.6);
          const k = S.idx(px, py);
          if (k >= 0 && S.grp[k] === 'bottom') S.col[k] = botC[2];
        }
      });
    }
  }
  if (detail) {
    for (let y = 132; y <= (pants ? 150 : 143); y++) {
      const [px, py] = S.P(cx - 0.5, y);
      S.dot(px, py, botC[1]);
    }
  }

  /* 胴 */
  const hwAt = (y) => {
    const yy = y - bU;
    if (yy < 88) return g.topHW * (0.8 + Math.sqrt(Math.max(0, (yy - 82) / 6)) * 0.2);
    if (yy < 102) return g.chestHW + st.back * 0.9 * Math.sin(((yy - 88) / 14) * Math.PI);
    if (yy < 116) {
      const t = (yy - 102) / 14;
      const sm = t * t * (3 - 2 * t);
      return g.chestHW + (g.waistHW - g.chestHW) * sm;
    }
    const t = (yy - 116) / 12;
    return g.waistHW + (g.hipHW - g.waistHW) * t + (yy > 124 ? 0.8 : 0);
  };
  const torso = Rows(cx, 82 + bU, 128 + bU, hwAt);
  const tank = look.top === 'tank';
  if (tank) S.paint(torso, skin, 'torso');
  const tankClip = (x, y) => {
    const yy = y - bU;
    const ax = Math.abs(x - cx);
    if (((x - cx) / 9.5) ** 2 + ((yy - 82) / 11) ** 2 < 1) return false;
    if (yy < 95 && ax > 12.5 + st.chest * 0.6) return false;
    if (yy < 101 && ax > g.chestHW - 3 - (yy - 95) * -0.1 && yy < 95 + (ax - 12) * 0.5) return false;
    return true;
  };
  const teeClip = (x, y) => ((x - cx) / 7.5) ** 2 + ((y - bU - 82) / 3.8) ** 2 >= 1;
  S.paint(torso, topC, 'top', { clip: tank ? tankClip : teeClip, lineWith: ['bottom', 'torso'] });
  // 上衣の影が下衣に落ちる
  S.castShadow('bottom', 'top', detail ? 2 : 1, darker(botC));

  if (detail) {
    // すその折り返し・脇腹のしわ
    S.tint('top', (x, y, c) => y - bU > 125.5 && c !== topC[0], topC[2]);
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const [px, py] = S.P(cx + s * (g.waistHW - 1.5 - i * 1.1), 112 + bU + i * 0.9);
        const k = S.idx(px, py);
        if (k >= 0 && S.grp[k] === 'top') S.col[k] = topC[2];
      }
    if (st.chest >= 1 && !fem) {
      const w = 8 + st.chest * 2;
      for (let x = -w; x <= w; x++) {
        const y = 101 + st.chest + Math.abs(x) * 0.12 - (Math.abs(x) > w - 3 ? (Math.abs(x) - w + 3) * 0.6 : 0);
        if (Math.abs(x) < 1.5) continue;
        const [px, py] = S.P(cx + x, y + bU);
        S.dot(px, py, topC[2]);
      }
      for (let y = 92; y <= 101 + st.chest; y++) {
        const [px, py] = S.P(cx - 0.5, y + bU);
        S.dot(px, py, topC[2]);
      }
    }
    if (st.abs >= 1) {
      const rowsY = st.abs >= 2 ? [107, 112, 117] : [110, 116];
      rowsY.forEach((yy) => {
        for (const s of [-1, 1])
          for (let x = 2; x <= 6; x++) {
            const [px, py] = S.P(cx + s * x - 0.5, yy + bU);
            S.dot(px, py, topC[2]);
          }
      });
      if (st.abs >= 2)
        for (let y = 104; y <= 120; y++) {
          const [px, py] = S.P(cx - 0.5, y + bU);
          S.dot(px, py, topC[2]);
        }
    }
    // 胸のダンベル印
    const ly = st.chest >= 1 && !fem ? 96 : 95;
    const lc = mix(topC[3], parseInt(topC[3].slice(1), 16) > 0x999999 ? '#1f2328' : '#ffffff', 0.55);
    const [lx0, ly0] = S.P(cx - 5, ly + bU);
    S.stamp(lx0, ly0, ['LL....LL', 'LLLLLLLL', 'LL....LL'], { L: lc });
  }

  /* 首（肩より先に描く: 巨大な肩の上に首が浮かないように） */
  S.paint(Cap(cx, 72 + bU, cx, 84 + bU, 6.2 + st.back * 0.5 - (fem ? 0.6 : 0), 6.8 + st.back * 0.7 - (fem ? 0.6 : 0)), skin, 'neck', { bias: -0.2, hl: false });

  /* 腕（少し外へ開き、軽く握った手） */
  const jY = Math.max(84, 91 - (g.dRx - 8) * 0.18) + bU;
  const arms = [];
  for (const { s, jx, ex, eY, wx, wY } of armPts) {
    const grp = 'arm' + s;
    // 腕全体を1本の円柱として陰影を付ける（部品ごとに陰影がずれて段々に見えるのを防ぐ）
    const axis = (y) => (y < eY ? jx + ((ex - jx) * (y - jY)) / (eY - jY) : ex + ((wx - ex) * (y - eY)) / (wY - eY));
    const rr = g.armR * 1.15;
    const cyl = (x, y) => {
      const u = Math.max(-1, Math.min(1, (x - axis(y)) / rr));
      return [u, 0, Math.sqrt(1 - u * u)];
    };
    S.paint(Cap(jx, jY + 4, ex, eY, g.armR, g.armR * 0.86), skin, grp, { normal: cyl });
    // 力こぶ（上腕の中ほど）
    if (st.arm >= 1 || !fem) {
      const t = 0.55;
      S.paint(Ell(jx + (ex - jx) * t, jY + 4 + (eY - jY - 4) * t, g.armR * 1.02 + st.arm * 0.4, 6.5 + st.arm * 1.4), skin, grp, { normal: cyl });
    }
    S.paint(Cap(ex, eY, wx, wY, g.armR * 0.92, g.armR * 0.68), skin, grp, { normal: cyl });
    if (look.wristband) S.paint(Rows(wx, wY - 3.4, wY - 0.2, () => g.armR * 0.68 + 1.3), FIXED.teal, 'band' + s);
    const hand = 'hand' + s;
    S.paint(Ell(wx + s * 0.8, wY + 4.3, 5.4 + st.arm * 0.2, 5.8), skin, hand);
    if (detail) {
      // こぶしの指の線と親指
      const [fx, fy] = S.P(wx + s * 0.8 - 2.5, wY + 5.5);
      S.stamp(fx, fy, ['f.f.f', '.....', 'f.f.f'].map((r) => r), { f: skin[1] });
      S.paint(Ell(wx - s * 2.6, wY + 2.8, 2.3, 2.8), skin, hand + 't', { lineWith: [hand] });
    }
    arms.push({ s, jx, grp, cyl, wx, wY });
  }
  /* 三角筋と袖 */
  for (const { s, jx, grp, cyl } of arms) {
    const delt = Ell(jx, jY, g.dRx, g.dRy);
    if (tank) {
      // 腕と同じ肌なので腕との境目には線を引かない（球体関節のように見えるのを防ぐ）。服との境目だけ線
      S.paint(delt, skin, 'delt' + s, { bias: 0.05, lineWith: ['top', 'torso', 'neck'], normal: g.mult < 1.3 ? cyl : undefined });
      // 肩の下側に筋の切れ目を1本だけ（段階が上がるほど目立つ）
      if (detail && g.mult >= 1.12)
        S.tint('delt' + s, (x, y, c) => c !== skin[0] && Math.abs(Math.hypot((x - jx) / g.dRx, (y - jY) / g.dRy) - 0.95) < 0.07 && y > jY + g.dRy * 0.3, skin[2]);
    } else {
      // 袖は肩の段階に合わせて同じ形から作る（肩だけ飛び出さない）
      const len = jY + g.dRy + 4.5;
      const sleeve = Union(Ell(jx, jY, g.dRx + 1.4, g.dRy + 1.2), Cap(jx - s * 1, jY - 1, jx + s * 1.6, len, g.armR + 2, g.armR + 1.7));
      S.paint(sleeve, topC, 'sleeve' + s, { clip: (x, y) => y < len + 0.5, lineWith: ['top', 'arm' + s, 'torso'] });
      if (detail) S.tint('sleeve' + s, (x, y, c) => y > len - 1.8 && c !== topC[0], topC[2]);
      S.castShadow(grp, 'sleeve' + s, detail ? 2 : 1, darker(skin));
    }
  }

  /* 小道具（バーベル・ダンベル） */
  const BAR = ['#22262c', '#5b646f', '#79838f', '#98a3af', '#c2cbd4'];
  const PLATE = ['#0c0e11', '#1b1f24', '#24292f', '#31373f', '#454d57'];
  const dumbbell = (x, y) => {
    S.paint(Rows(x, y - 1.6, y + 1.6, () => 7.5), BAR, 'db' + x, { hl: false });
    for (const d of [-1, 1]) S.paint(Ell(x + d * 7, y, 2.6, 6.2), PLATE, 'dbp' + x + d);
  };
  const barbell = (y, halfLen) => {
    S.paint(Rows(cx, y - 1.4, y + 1.4, () => halfLen), BAR, 'bar', { hl: false });
    for (const d of [-1, 1]) {
      S.paint(Ell(cx + d * (halfLen - 3), y, 3, 9.5), PLATE, 'plate' + d);
      S.paint(Ell(cx + d * (halfLen - 8), y, 2.4, 7), PLATE, 'plate2' + d);
    }
  };
  // 背中側に担ぐバーベルは頭より先に描く（頭の後ろに回る）
  if (pose.prop === 'barbellBack') barbell(jY - 3, g.jointX + 22);

  /* 頭 */
  S.xf = headXf;
  for (const s of [-1, 1]) S.paint(Ell(hx + s * 23.6, hy + 9, 3.4, 5), skin, 'ear' + s);
  const headN = sphereNormal(hx - 1, hy + 2, 30);
  S.paint(Union(Ell(hx, hy, fem ? 24.6 : 25, 23.5), Ell(hx, hy + 10, fem ? 20 : 21, 16)), skin, 'head', { normal: headN, bias: 0.34, hl: false });
  // あごの影を首へ
  S.castShadow('neck', 'head', detail ? 3 : 1, () => skin[1]);

  /* 顔 */
  drawFace(S, look, kind, skin, hair, facePx);

  /* 前髪 */
  paintHair(HP.front, 'hairF', 0.05);
  // 前髪の落ち影（顔に奥行きを出す。目にはかからない深さ）
  const isFront = (x) => x.startsWith('hairF');
  S.castShadow('head', isFront, detail ? 2 : 1, (c) => (c === skin[3] || c === skin[4] ? skin[2] : c));
  // 天使の輪（土台の部分のみ）
  HP.front.forEach((it, i) => {
    if (it.kind !== 'cap') return;
    S.tint(
      'hairF' + i,
      (x, y, c) => {
        if (c !== hair[3] && c !== hair[2]) return false;
        const d = Math.hypot(x - (hx - 3), (y - (hy - 8)) * 1.15);
        if (d < 19.5 || d > (detail ? 22 : 22.5)) return false;
        const a = Math.atan2(y - (hy - 8), x - (hx - 3));
        if (a > -0.7 || a < -2.6) return false;
        return !detail || Math.floor(x) % 5 !== 0;
      },
      hair[4],
    );
  });
  HP.ties.forEach(([tx, ty], i) => S.paint(Ell(tx, ty, 3.8, 3.8), FIXED.teal, 'tie' + i));
  S.xf = null;

  if (pose.prop === 'dumbbell') arms.forEach((a) => dumbbell(a.wx + a.s * 1.2, a.wY + 4));
  if (pose.prop === 'dumbbellOne') dumbbell(arms[1].wx + 1.2, arms[1].wY + 4);
  if (pose.prop === 'barbellUp') barbell(arms[0].wY + 1, g.jointX + 22);

  S.outline(kind === 'gym' ? 2 : 1);
  return { canvas: S.toCanvas(), shoulderWidth: g.shoulderWidth, res };
}

const cache = new Map();
export function characterCanvas(look, kind = 'detail') {
  const key = kind + JSON.stringify(look);
  if (!cache.has(key)) {
    if (cache.size > 400) cache.clear();
    cache.set(key, drawCharacter(look, kind).canvas);
  }
  return cache.get(key);
}

// canvas 要素へ描く。整数倍・最近傍
export function paintInto(el, look, kind = 'detail') {
  const src = characterCanvas(look, kind);
  el.width = src.width;
  el.height = src.height;
  const ctx = el.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.drawImage(src, 0, 0);
}
