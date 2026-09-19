// ロゴ「筋肉モリモリジム」をドット絵として描く。
// ドット書体 DotGothic16（Google Fonts / SIL OFL）を16pxで描き、にじみを2値化してから
// 上下グラデーション・濃い縁取り・影を付ける（ダンベルは依頼者指示で初期オフ）。整数倍で拡大表示する。

const FONT = '"DotGothic16"';
const DUMBBELL = [
  '.KK.........KK.',
  'KGGK.......KGGK',
  'KGGKKKKKKKKKGGK',
  'KGGKSSSSSSSKGGK',
  'KGGKKKKKKKKKGGK',
  'KGGK.......KGGK',
  '.KK.........KK.',
];
const COL = { K: '#0b1f1d', G: '#9aa6b1', S: '#dfe6ec' };

let fontReady = null;
function loadFont() {
  if (!fontReady) {
    fontReady = Promise.race([
      document.fonts ? document.fonts.load(`16px ${FONT}`, '筋肉モリモリジム') : Promise.resolve(),
      new Promise((r) => setTimeout(r, 2500)),
    ]).then(() => document.fonts && document.fonts.check(`16px ${FONT}`, '筋'));
  }
  return fontReady;
}

function bitmap(text) {
  const size = 16;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${size}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width) + 4;
  // フォントによって文字が下にはみ出すため、十分な高さで描いてから文字のある範囲だけ切り出す
  c.width = w;
  c.height = size * 2;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 1, Math.floor(size / 2));
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let mask = [];
  for (let y = 0; y < c.height; y++) {
    const row = [0];
    for (let x = 0; x < c.width; x++) row.push(d[(y * c.width + x) * 4 + 3] > 110 ? 1 : 0);
    mask.push(row);
  }
  // 太字化: 横に1画素ふくらませて、ゲームのタイトルらしい太さにする
  mask = mask.map((r) => r.map((v, x) => (v || r[x - 1] ? 1 : 0)));
  // 上下左右の空白を切り落とす
  const rows = mask.map((r) => r.some(Boolean));
  const y0 = rows.indexOf(true), y1 = rows.lastIndexOf(true);
  let x0 = Infinity, x1 = -1;
  mask.forEach((r) => r.forEach((v, x) => v && ((x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)))));
  if (y0 < 0) return [[0]];
  return mask.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}

// 文字の縦位置で色を変える（上: 白っぽい → 下: ティール）
const GRAD = ['#ffffff', '#e8fffb', '#c4fbf3', '#9af2e6', '#72e8d9', '#52dfcd', '#39d9c6', '#2fc7b5', '#27b3a3', '#219e90'];

export async function logoCanvas(text = '筋肉モリモリジム', { withIcons = false } = {}) {
  const ok = await loadFont();
  if (!ok) return null;
  const m = bitmap(text);
  const th = m.length, tw = m[0].length;
  // 行ごとの上端と下端（グラデーションの範囲）
  let top = th, bot = 0;
  m.forEach((r, y) => r.some(Boolean) && ((top = Math.min(top, y)), (bot = Math.max(bot, y))));
  const icoW = withIcons ? DUMBBELL[0].length + 3 : 0;
  const pad = 2;
  const W = tw + icoW * 2 + pad * 2 + 1, H = th + pad * 2 + 1;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  const ox = pad + icoW, oy = pad;
  const at = (x, y) => y >= 0 && y < th && x >= 0 && x < tw && m[y][x];
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  // 影 → 縁取り → 本体の順
  for (let y = -1; y <= th; y++)
    for (let x = -1; x <= tw; x++) {
      if (at(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) { edge = true; break; }
      if (edge) px(ox + x + 1, oy + y + 1, '#000000');
    }
  for (let y = -1; y <= th; y++)
    for (let x = -1; x <= tw; x++) {
      if (at(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) { edge = true; break; }
      if (edge) px(ox + x, oy + y, COL.K);
    }
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      if (!m[y][x]) continue;
      const t = bot > top ? (y - top) / (bot - top) : 0;
      px(ox + x, oy + y, GRAD[Math.min(GRAD.length - 1, Math.floor(t * GRAD.length))]);
    }
  if (withIcons) {
    const iy = oy + Math.round((top + bot) / 2) - 3;
    const put = (x0) => DUMBBELL.forEach((r, j) => [...r].forEach((ch, i) => COL[ch] && px(x0 + i, iy + j, COL[ch])));
    put(pad);
    put(ox + tw + 3);
  }
  return out;
}

// 要素にロゴを入れる。heightCss: 目安の表示の高さ。端末の画素比に対して整数倍で拡大
export async function mountLogo(el, { heightCss = 28, withIcons = false, text } = {}) {
  const c = await logoCanvas(text, { withIcons });
  if (!c || !el.isConnected) return false;
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.round((heightCss * dpr) / c.height));
  c.style.width = (c.width * k) / dpr + 'px';
  c.style.height = (c.height * k) / dpr + 'px';
  c.style.imageRendering = 'pixelated';
  c.style.display = 'block';
  c.setAttribute('aria-hidden', 'true');
  el.classList.add('has-logo');
  el.querySelector('canvas')?.remove();
  el.append(c);
  return true;
}
