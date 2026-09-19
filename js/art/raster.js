// ピクセル描画の土台。
// 形状は 192x192 の設計座標で定義し、出力解像度 (192 / 96) に合わせて画素中心でサンプリングする。
// パーツ単位で塗り、手前のパーツの縁には「そのパーツの線色」で内側の線を引く。最後に外周へ輪郭を付ける。

const L = (() => {
  const v = [-0.42, -0.62, 0.66];
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
})();

function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const f = (s) => Math.round(((A >> s) & 255) + ((((B >> s) & 255) - ((A >> s) & 255)) * t));
  return '#' + ((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1);
}

/* ---------- 形状 ---------- */
export const Ell = (cx, cy, rx, ry) => ({
  bb: [cx - rx, cy - ry, cx + rx, cy + ry],
  at(x, y) {
    const u = (x - cx) / rx, v = (y - cy) / ry, r = u * u + v * v;
    return r > 1 ? null : [u, v, Math.sqrt(1 - r)];
  },
});

export const Cap = (x1, y1, x2, y2, r1, r2) => ({
  bb: [Math.min(x1 - r1, x2 - r2), Math.min(y1 - r1, y2 - r2), Math.max(x1 + r1, x2 + r2), Math.max(y1 + r1, y2 + r2)],
  at(x, y) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    const qx = x1 + dx * t, qy = y1 + dy * t, r = r1 + (r2 - r1) * t;
    const u = (x - qx) / r, v = (y - qy) / r, d = u * u + v * v;
    return d > 1 ? null : [u, v * 0.6, Math.sqrt(Math.max(0, 1 - d))];
  },
});

// 行ごとの半幅で作る胴体。hw(y) は設計座標の半幅
export const Rows = (cx, y0, y1, hw) => {
  let m = 0;
  for (let y = y0; y <= y1; y += 0.5) m = Math.max(m, hw(y));
  return {
    bb: [cx - m, y0, cx + m, y1],
    at(x, y) {
      if (y < y0 || y > y1) return null;
      const w = hw(y);
      if (w <= 0) return null;
      const u = (x - cx) / w;
      if (Math.abs(u) > 1) return null;
      const v = ((y - y0) / (y1 - y0)) * 2 - 1;
      const uu = u * 0.97, vv = v * 0.35;
      return [uu, vv, Math.sqrt(Math.max(0.04, 1 - uu * uu - vv * vv))];
    },
  };
};

export const Poly = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return {
    bb,
    at(x, y) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside ? [0, 0, 1] : null;
    },
  };
};

// 複数形状の和。法線は最初に当たった形状のもの
export const Union = (...shapes) => {
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  shapes.forEach((s) => {
    bb[0] = Math.min(bb[0], s.bb[0]); bb[1] = Math.min(bb[1], s.bb[1]);
    bb[2] = Math.max(bb[2], s.bb[2]); bb[3] = Math.max(bb[3], s.bb[3]);
  });
  return {
    bb,
    at(x, y) {
      for (const s of shapes) {
        const n = s.at(x, y);
        if (n) return n;
      }
      return null;
    },
  };
};

// (ox, oy) を中心に縦横同率で拡大（小さい素材で頭部だけ大きめにするため。横だけの伸長はしない）
export const Scaled = (shape, ox, oy, k) => {
  if (k === 1) return shape;
  const [a, b, c, d] = shape.bb;
  return {
    bb: [ox + (a - ox) * k, oy + (b - oy) * k, ox + (c - ox) * k, oy + (d - oy) * k],
    at: (x, y) => shape.at(ox + (x - ox) / k, oy + (y - oy) / k),
  };
};

// 法線を球から取る（髪を頭の丸みに沿って塗るため）
export const sphereNormal = (cx, cy, r) => (x, y) => {
  const u = (x - cx) / r, v = (y - cy) / r;
  const d = u * u + v * v;
  if (d >= 1) {
    const k = 1 / Math.sqrt(d);
    return [u * k * 0.98, v * k * 0.98, 0.2];
  }
  return [u, v, Math.sqrt(1 - d)];
};

/* ---------- 描画面 ---------- */
export class Surface {
  // res: 高さの画素数（基準は正方形）, s: 設計座標→画素 の倍率
  // pad: 左右に足す画素数（肩が大きすぎて基準の幅に収まらない時だけ横に広げる。頭や体は伸ばさない）
  constructor(res, pad = 0) {
    this.res = res;
    this.pad = pad;
    this.w = res + pad * 2;
    this.h = res;
    this.s = res / 192;
    const n = this.w * this.h;
    this.col = new Array(n).fill(null);
    this.grp = new Array(n).fill(null);
    this.outer = new Array(n).fill(null);
    this.outerLit = new Array(n).fill(null);
    this.xf = null; // {ox, oy, k}: 頭部を縦横同率で拡大して描く間だけ設定
  }
  fwd(x, y) {
    const t = this.xf;
    return t ? [t.ox + (x - t.ox) * t.k, t.oy + (y - t.oy) * t.k] : [x, y];
  }
  inv(x, y) {
    const t = this.xf;
    return t ? [t.ox + (x - t.ox) / t.k, t.oy + (y - t.oy) / t.k] : [x, y];
  }
  idx(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x;
  }
  // shape を ramp で塗る
  // o.clip(x,y): 設計座標で false を返した所は塗らない
  // o.normal(x,y): 法線の差し替え
  // o.bias: 明るさの補正, o.flat: 固定トーン番号
  // o.noLine: 内側の線を付けない, o.lineWith: この group と接する所だけ線を付ける
  // o.hl: ハイライトを使うか（初期 true）
  paint(shape, ramp, group, o = {}) {
    const s = this.s, W = this.w, pad = this.pad;
    const [ax, ay] = this.fwd(shape.bb[0], shape.bb[1]);
    const [bx, by] = this.fwd(shape.bb[2], shape.bb[3]);
    const x0 = Math.max(0, Math.floor(ax * s) + pad - 1), y0 = Math.max(0, Math.floor(ay * s) - 1);
    const x1 = Math.min(W - 1, Math.ceil(bx * s) + pad + 1), y1 = Math.min(this.h - 1, Math.ceil(by * s) + 1);
    if (x1 < x0 || y1 < y0) return;
    const bw = x1 - x0 + 1;
    const ns = new Array(bw * (y1 - y0 + 1)).fill(null);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const [dx, dy] = this.inv((x - pad + 0.5) / s, (y + 0.5) / s);
        if (o.clip && !o.clip(dx, dy)) continue;
        let n = shape.at(dx, dy);
        if (n && o.normal) n = o.normal(dx, dy);
        ns[(y - y0) * bw + (x - x0)] = n;
      }
    const mine = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && ns[(y - y0) * bw + (x - x0)];
    const hl = o.hl !== false;
    const out = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const n = ns[(y - y0) * bw + (x - x0)];
        if (!n) continue;
        let c = null;
        if (!o.noLine) {
          const dirs = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
          for (let d = 0; d < 4; d++) {
            const [a, b] = dirs[d];
            if (mine(a, b)) continue;
            const i = this.idx(a, b);
            const g = i >= 0 ? this.grp[i] : null;
            if (!g || g === group || (o.lineWith && !o.lineWith.includes(g))) continue;
            // lineFor(g, d): 接する相手と向き（0左 1右 2上 3下）ごとの線色（null なら線なし）
            const lc = o.lineFor ? o.lineFor(g, d) : ramp[0];
            if (lc) {
              c = lc;
              break;
            }
          }
        }
        if (!c) {
          let t;
          if (o.flat != null) t = o.flat;
          else {
            const d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2] + (o.bias || 0);
            t = d > 0.9 && hl ? 4 : d > 0.3 ? 3 : d > -0.12 ? 2 : 1;
          }
          c = ramp[t];
        }
        out.push([y * W + x, c]);
      }
    for (const [i, c] of out) {
      this.col[i] = c;
      this.grp[i] = group;
      this.outer[i] = o.outer || ramp[0];
      this.outerLit[i] = ramp[1];
    }
    return out.length;
  }
  // 画素座標で1点置く（既に塗られた所だけ）
  dot(x, y, c, any = false) {
    const i = this.idx(x, y);
    if (i < 0) return;
    if (!any && !this.col[i]) return;
    this.col[i] = c;
  }
  // 設計座標の点を画素へ
  P(dx, dy) {
    [dx, dy] = this.fwd(dx, dy);
    return [Math.floor(dx * this.s) + this.pad, Math.floor(dy * this.s)];
  }
  // 文字列テンプレートを置く。'.' は透過、mirror で左右反転
  stamp(x0, y0, rows, map, mirror = false, any = false) {
    rows.forEach((row, j) => {
      const r = mirror ? [...row].reverse().join('') : row;
      for (let i = 0; i < r.length; i++) {
        const c = map[r[i]];
        if (c) this.dot(x0 + i, y0 + j, c, any);
      }
    });
  }
  // group に属する画素のうち cond(dx,dy) を満たすものを色 c にする
  tint(group, cond, c) {
    const s = this.s;
    for (let i = 0; i < this.col.length; i++) {
      if (this.grp[i] !== group) continue;
      const x = i % this.w, y = (i / this.w) | 0;
      const [dx, dy] = this.inv((x - this.pad + 0.5) / s, (y + 0.5) / s);
      if (cond(dx, dy, this.col[i])) this.col[i] = typeof c === 'function' ? c(this.col[i]) : c;
    }
  }
  // casters に属する画素の直下 depth 画素ぶん、group の画素を影色にする（前髪の落ち影など）
  // group / casters は group 名、名前の配列、または判定関数
  castShadow(group, casters, depth, shadeFn) {
    const W = this.w, H = this.h;
    const as = (g) => (typeof g === 'function' ? g : Array.isArray(g) ? (x) => g.includes(x) : (x) => x === g);
    const isT = as(group), isC = as(casters);
    const hit = new Set();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!this.grp[i] || !isC(this.grp[i])) continue;
        for (let k = 1; k <= depth; k++) {
          const j = this.idx(x, y + k);
          if (j < 0) break;
          const g = this.grp[j];
          if (!g || isC(g)) continue;
          if (isT(g)) hit.add(j);
        }
      }
    hit.forEach((j) => (this.col[j] = shadeFn(this.col[j], j)));
  }
  // 外周の輪郭。thick=2 で2画素（縮小表示用）
  outline(thick = 1) {
    const W = this.w, H = this.h;
    for (let pass = 0; pass < thick; pass++) {
      const add = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (this.col[i]) continue;
          // 光の当たる左上側は少し明るい線（セレクティブアウトライン）、右下側は濃い線
          const nb = pass === 0 ? [[-1, 0], [0, -1], [1, 0], [0, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
          for (const [dx, dy] of nb) {
            const j = this.idx(x + dx, y + dy);
            if (j >= 0 && this.col[j]) {
              // 形が右か下にある ＝ この点は形の左上側
              const lit = pass === 0 && thick === 1 && (dx === 1 || dy === 1) && this.outerLit[j];
              add.push([i, lit ? mixHex(this.outer[j], this.outerLit[j], 0.45) : this.outer[j]]);
              break;
            }
          }
        }
      for (const [i, c] of add) {
        this.col[i] = c;
        this.outer[i] = c;
        this.grp[i] = '__outline';
      }
    }
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.col.length; i++) {
      const c = this.col[i];
      if (!c) continue;
      const n = parseInt(c.slice(1), 16);
      img.data[i * 4] = n >> 16;
      img.data[i * 4 + 1] = (n >> 8) & 255;
      img.data[i * 4 + 2] = n & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}
