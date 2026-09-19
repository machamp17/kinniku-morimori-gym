// ジムの20人分の立ち位置を、格子に見えないバラバラな配置で作る。
// 条件: どの2人も「横に14.5%以上」か「縦に13.8%以上」離れる
//       （320px幅で タップ領域 44×64px、480px幅で 56×64px が重ならない）
// 使い方: node tools/gym-layout.mjs [seed]
const seed0 = Number(process.argv[2] || 11);
let s = seed0 >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const X0 = 8, X1 = 92, Y0 = 33, Y1 = 95, DX = 14.5, DY = 13.8, N = 20;
const bad = (a, b) => Math.abs(a[0] - b[0]) < DX && Math.abs(a[1] - b[1]) < DY;

for (let attempt = 0; attempt < 5000; attempt++) {
  const pts = [];
  let tries = 0;
  while (pts.length < N && tries < 20000) {
    tries++;
    const p = [X0 + rnd() * (X1 - X0), Y0 + rnd() * (Y1 - Y0)];
    if (pts.every((q) => !bad(p, q))) pts.push(p);
  }
  if (pts.length < N) continue;
  // 行・列がそろって見えないか（同じ高さ±2%に4人以上いたら作り直す）
  const rowy = pts.map((p) => pts.filter((q) => Math.abs(q[1] - p[1]) < 2).length);
  if (Math.max(...rowy) >= 4) continue;
  // 奥(上)から手前(下)の順に並べる（重なり順を自然にする）
  pts.sort((a, b) => a[1] - b[1]);
  console.log(JSON.stringify(pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));
  console.error('attempt', attempt);
  process.exit(0);
}
console.error('failed');
process.exit(1);
