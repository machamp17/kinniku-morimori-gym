// キャラ画像を PNG に書き出す検査用スクリプト（ブラウザ不要）
// 使い方: node tools/render-sheet.mjs <preset> <scale> <out.png>
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// raster.js の toCanvas が使う最小限の canvas 代替
class FakeCtx {
  constructor(c) { this.c = c; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(img) { this.c.data = img.data; }
}
globalThis.document = {
  createElement: () => {
    const c = { width: 0, height: 0, data: null };
    c.getContext = () => new FakeCtx(c);
    return c;
  },
};

const { drawCharacter, DEFAULT_LOOK, FACES, POSES } = await import('../js/art/character.js');
const P = await import('../js/art/palette.js');

const MALE = { ...DEFAULT_LOOK, type: 'male', hairStyle: 'short', hairColor: 'darkbrown', skin: 'skin2', topColor: 'black', bottomColor: 'charcoal' };
const FEMALE = { ...DEFAULT_LOOK, type: 'female', hairStyle: 'pony', hairColor: 'brown', skin: 'skin1', topColor: 'teal', bottomColor: 'black', bottom: 'pants' };
const ST0 = { chest: 0, back: 0, shoulder: 0, arm: 0, leg: 0, abs: 0 };
const ST1 = { chest: 1, back: 1, shoulder: 10, arm: 1, leg: 1, abs: 1 };
const ST2 = { chest: 2, back: 2, shoulder: 20, arm: 2, leg: 2, abs: 2 };

const presets = {
  faces: () => [MALE, FEMALE].flatMap((b) => FACES.map((f) => [{ ...b, face: f.id }, 'detail'])),
  poses: () => [MALE, FEMALE].flatMap((b) => POSES.map((p) => [{ ...b, pose: p.id, stages: { chest: 1, back: 1, shoulder: 6, arm: 1.5, leg: 1, abs: 1 } }, 'gym'])),
  gymfaces: () => [MALE, FEMALE].flatMap((b) => FACES.map((f) => [{ ...b, face: f.id }, 'gym'])),
  stages: () => [MALE, FEMALE].flatMap((b) => [ST0, ST1, ST2].map((s) => [{ ...b, stages: s }, 'detail'])),
  shoulders: () => [MALE, FEMALE].flatMap((b) => [0, 3, 6, 10, 13, 16, 20].map((i) => [{ ...b, stages: { ...ST0, shoulder: i } }, 'detail'])),
  mega: () => [MALE, FEMALE].flatMap((b) => [20, 25, 30, 40, 50, 60].map((i) => [{ ...b, stages: { ...ST2, shoulder: i } }, 'detail'])),
  megagym: () => [MALE, FEMALE].flatMap((b) => [0, 10, 20, 30, 45, 60].map((i) => [{ ...b, stages: { ...ST0, shoulder: i } }, 'gym'])),
  hair: () => [MALE, FEMALE].flatMap((b) => P.HAIR_STYLES.map((h) => [{ ...b, hairStyle: h.id }, 'detail'])),
  haircolor: () => P.HAIR_COLORS.map((c) => [{ ...FEMALE, hairStyle: 'bob', hairColor: c.id }, 'detail']),
  skins: () => [MALE, FEMALE].flatMap((b) => P.SKINS.map((s) => [{ ...b, skin: s.id }, 'detail'])),
  tops: () => P.TOPS.flatMap((t) => P.CLOTH_COLORS.map((c) => [{ ...MALE, top: t.id, topColor: c.id }, 'detail'])),
  bottoms: () => P.BOTTOMS.flatMap((t) => P.CLOTH_COLORS.map((c) => [{ ...FEMALE, bottom: t.id, bottomColor: c.id, topColor: 'white' }, 'detail'])),
  maxwear: () => [MALE, FEMALE].flatMap((b) => P.TOPS.flatMap((t) => P.BOTTOMS.map((bt) => [{ ...b, top: t.id, bottom: bt.id, stages: ST2 }, 'detail']))),
  gym: () => [MALE, FEMALE].flatMap((b) => [ST0, ST1, ST2].map((s) => [{ ...b, stages: s }, 'gym'])).concat(
    [MALE, FEMALE].flatMap((b) => P.HAIR_STYLES.map((h) => [{ ...b, hairStyle: h.id }, 'gym'])),
    [MALE, FEMALE].flatMap((b) => P.SKINS.map((s) => [{ ...b, skin: s.id }, 'gym'])),
  ),
};

const [, , preset = 'faces', scaleArg = '2', out = 'sheet.png', colsArg] = process.argv;
const scale = Number(scaleArg);
const items = presets[preset]().map(([look, kind]) => drawCharacter(look, kind));
const cols = Number(colsArg) || Math.min(items.length, 6);
// CROP=x0,y0,x1,y1 （詳細192px基準の座標。ジムは半分にする）
const crop = process.env.CROP ? process.env.CROP.split(',').map(Number) : null;
const maxRes = Math.max(...items.map((i) => i.res));
const maxW = Math.max(...items.map((i) => i.canvas.width));
const cw = crop ? Math.round(((crop[2] - crop[0]) * maxRes) / 192) : maxW;
const ch = crop ? Math.round(((crop[3] - crop[1]) * maxRes) / 192) : maxRes;
const cellW = cw * scale + 8, cellH = ch * scale + 8;
const rows = Math.ceil(items.length / cols);
const W = cols * cellW, H = rows * cellH;
const px = new Uint8Array(W * H * 4);
// 背景（アプリの面の色）
for (let i = 0; i < W * H; i++) { px[i * 4] = 0x22; px[i * 4 + 1] = 0x26; px[i * 4 + 2] = 0x2b; px[i * 4 + 3] = 255; }
items.forEach((it, k) => {
  const ox = (k % cols) * cellW + 4, oy = Math.floor(k / cols) * cellH + 4;
  const d = it.canvas.data, R = it.res, CW = it.canvas.width, padPx = (CW - R) / 2;
  const k0x = crop ? Math.round((crop[0] * R) / 192) + padPx : 0, k0y = crop ? Math.round((crop[1] * R) / 192) : 0;
  const ww = crop ? Math.round(((crop[2] - crop[0]) * R) / 192) : CW, hh = crop ? Math.round(((crop[3] - crop[1]) * R) / 192) : R;
  const cx0 = crop ? 0 : Math.floor(((maxW - CW) * scale) / 2);
  for (let y = 0; y < hh * scale; y++)
    for (let x = 0; x < ww * scale; x++) {
      const si = ((k0y + Math.floor(y / scale)) * CW + k0x + Math.floor(x / scale)) * 4;
      if (!d[si + 3]) continue;
      const di = ((oy + y) * W + ox + cx0 + x) * 4;
      px[di] = d[si]; px[di + 1] = d[si + 1]; px[di + 2] = d[si + 2];
    }
});

// PNG エンコード
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out} ${W}x${H} (${items.length} items)`);
