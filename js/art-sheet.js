import { drawCharacter, DEFAULT_LOOK, FACES } from './art/character.js';
import { SKINS, HAIR_COLORS, HAIR_STYLES, CLOTH_COLORS, TOPS, BOTTOMS } from './art/palette.js';

const root = document.getElementById('root');
const params = new URLSearchParams(location.search);
const zoom = params.get('zoom') === '1';

const MALE = { ...DEFAULT_LOOK, type: 'male', hairStyle: 'short', hairColor: 'darkbrown', skin: 'skin2', topColor: 'black', bottomColor: 'charcoal' };
const FEMALE = { ...DEFAULT_LOOK, type: 'female', hairStyle: 'pony', hairColor: 'brown', skin: 'skin1', topColor: 'teal', bottomColor: 'black', bottom: 'pants' };

const STAGES = {
  初期: { chest: 0, back: 0, shoulder: 0, arm: 0, leg: 0, abs: 0 },
  中期: { chest: 1, back: 1, shoulder: 10, arm: 1, leg: 1, abs: 1 },
  肩幅最大: { chest: 2, back: 2, shoulder: 20, arm: 2, leg: 2, abs: 2 },
};

function cell(look, kind, label, cls) {
  const d = document.createElement('div');
  d.className = 'cell ' + cls;
  const { canvas } = drawCharacter(look, kind);
  d.appendChild(canvas);
  const s = document.createElement('span');
  s.textContent = label;
  d.appendChild(s);
  return d;
}

function section(title, desc, build) {
  const s = document.createElement('section');
  s.innerHTML = `<h2>${title}</h2><p>${desc}</p>`;
  const row = document.createElement('div');
  row.className = 'row';
  build(row);
  s.appendChild(row);
  root.appendChild(s);
  return s;
}

const dcls = zoom ? 'd2' : 'd1';
const gcls = zoom ? 'g2' : 'g1';

section('男女 × 成長段階（詳細 192px・実寸）', '初期 / 中期（肩Lv6）/ 肩幅最大（肩Lv13以上、詳細は約2.2倍）', (row) => {
  for (const [base, name] of [[MALE, '男性'], [FEMALE, '女性']])
    for (const [k, st] of Object.entries(STAGES)) row.appendChild(cell({ ...base, stages: st }, 'detail', `${name} ${k}`, dcls));
});

section('男女 × 成長段階（ジム 96px を 48 CSS px で表示・実寸）', 'ジムでの最大肩幅は約1.6倍', (row) => {
  for (const [base, name] of [[MALE, '男性'], [FEMALE, '女性']])
    for (const [k, st] of Object.entries(STAGES)) row.appendChild(cell({ ...base, stages: st }, 'gym', `${name} ${k}`, gcls));
});

section('肩の成長（詳細・2レベルおき）', '肩は肩のEXPで20段階に広がる（約900EXPで最大）。頭・顔・脚は拡大しない', (row) => {
  for (const base of [MALE, FEMALE])
    for (const i of [0, 3, 6, 10, 13, 16, 20]) row.appendChild(cell({ ...base, stages: { ...STAGES['初期'], shoulder: i } }, 'detail', `肩幅${i}/20`, dcls));
});

section(`表情${FACES.length}種`, '着せ替えの「表情」から選べる', (row) => {
  for (const base of [MALE, FEMALE])
    for (const f of FACES) row.appendChild(cell({ ...base, face: f.id }, 'detail', f.name, dcls));
});

section(`髪型${HAIR_STYLES.length}種 × 男女`, 'すべて男女共通の選択肢', (row) => {
  for (const base of [MALE, FEMALE])
    for (const h of HAIR_STYLES) row.appendChild(cell({ ...base, hairStyle: h.id }, 'detail', h.name, dcls));
});

section(`髪型${HAIR_STYLES.length}種（ジム実寸）`, '', (row) => {
  for (const base of [MALE, FEMALE])
    for (const h of HAIR_STYLES) row.appendChild(cell({ ...base, hairStyle: h.id }, 'gym', h.name, gcls));
});

section('髪色6色', '', (row) => {
  for (const c of HAIR_COLORS) row.appendChild(cell({ ...FEMALE, hairStyle: 'bob', hairColor: c.id }, 'detail', c.name, dcls));
});

section('肌色6種 × 基本表情', '肌ごとに陰影パレットを持つ（一括フィルターではない）', (row) => {
  for (const base of [MALE, FEMALE])
    for (const s of SKINS) row.appendChild(cell({ ...base, skin: s.id }, 'detail', s.name, dcls));
});

section('肌色6種（ジム実寸）', '', (row) => {
  for (const base of [MALE, FEMALE])
    for (const s of SKINS) row.appendChild(cell({ ...base, skin: s.id }, 'gym', s.name, gcls));
});

section('トップス2形状 × 12色', '', (row) => {
  for (const t of TOPS)
    for (const c of CLOTH_COLORS) row.appendChild(cell({ ...MALE, top: t.id, topColor: c.id, bottomColor: 'charcoal' }, 'detail', `${t.name} ${c.name}`, dcls));
});

section('ボトムス2形状 × 12色', '', (row) => {
  for (const t of BOTTOMS)
    for (const c of CLOTH_COLORS) row.appendChild(cell({ ...FEMALE, bottom: t.id, bottomColor: c.id, topColor: 'white' }, 'detail', `${t.name} ${c.name}`, dcls));
});

section('最大体型 × 全ウェア形状', '肩幅最大・全部位最大で服の境界が破綻しないか', (row) => {
  for (const base of [MALE, FEMALE])
    for (const t of TOPS)
      for (const bt of BOTTOMS) row.appendChild(cell({ ...base, top: t.id, bottom: bt.id, stages: STAGES['肩幅最大'] }, 'detail', `${t.name}+${bt.name}`, dcls));
});
