// Turns the memo names written in an announcement ("- Harga pakej AraSihat / Add-On") into links to the matching
// Reference Hub memo. A line matches when it names the memo's title, allowing for small differences in wording.
const words = (value: string) => value.toLowerCase().replace(/^\s*(?:[-*•\d.)]+\s+)/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function matchMemo<T extends { title: string }>(line: string, memos: T[]): T | null {
  const wanted = words(line);
  if (wanted.length < 8) return null;
  const wantedWords = new Set(wanted.split(' '));
  let best: { memo: T; score: number } | null = null;
  for (const memo of memos) {
    const title = words(memo.title);
    if (!title) continue;
    const titleWords = new Set(title.split(' '));
    const shared = [...wantedWords].filter((word) => titleWords.has(word)).length;
    // Same words, or one name inside the other, or nearly the same set of words.
    const score = title === wanted ? 2 : (title.includes(wanted) || wanted.includes(title)) ? 1.5 : shared / Math.max(wantedWords.size, titleWords.size);
    if (score >= 0.75 && (!best || score > best.score)) best = { memo, score };
  }
  return best?.memo || null;
}

export type BodyLine = { text: string; url: string };
export function bodyLines(body: string, memos: { title: string; url: string }[]): BodyLine[] {
  return body.split('\n').map((text) => ({ text, url: matchMemo(text, memos)?.url || '' }));
}
