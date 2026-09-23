// 使ってほしくない言葉（下品・卑猥・攻撃的）の判定。ひとことと表示名で使う。
// ここは「その場で教えるため」の控え。本当の可否はサーバー（public.ng_words）が決める。
// 運営メニューから言葉を足すとサーバーだけが増えるので、ここに無くても弾かれることがある。

// 伏せ字・全角・カタカナ・大文字を同じ形にそろえる（ち*ん*こ → ちんこ）
export function normalizeText(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .replace(/[ァ-ヴ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// 「あまりにひどいもの」だけを並べる。ふつうの言い回しを巻き込まないよう、
// 別の意味でも使う言い方（例: せいき=世紀, くんに=君に, ちかん=置換）は漢字の形だけにしてある。
export const NG_WORDS = [
  // 性的
  'まんこ', 'おめこ', 'ちんこ', 'ちんぽ', 'ちんちん', 'ぽこちん', 'きんたま',
  'せっくす', 'ぱいずり', 'ふぇら', 'なかだし', '中出し', 'ぶっかけ', 'ざーめん',
  '射精', '精液', '性器', '陰部', 'おなにー', 'おなに', 'ますたーべーしょん',
  'せふれ', 'やりまん', 'せいこうい', '性行為', '勃起', 'ぼっき',
  'ろりこん', 'しょたこん', '痴漢', 'れいぷ', '強姦', '猥褻', 'わいせつ', '淫乱',
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'dick', 'asshole', 'whore', 'slut',
  'sex', 'porn', 'blowjob', 'nigger', 'faggot',
  // 攻撃的（別の意味に取られにくい形だけ）
  '死ね', '殺す', '殺害', 'きちがい', '気違い', '基地外',
].map(normalizeText);

// 見つかった言葉を返す（無ければ null）
export function findNgWord(text) {
  const t = normalizeText(text);
  if (!t) return null;
  return NG_WORDS.find((w) => w && t.includes(w)) || null;
}

export const NG_MESSAGE = 'その言葉は使えません。ほかの言い方にしてください';
