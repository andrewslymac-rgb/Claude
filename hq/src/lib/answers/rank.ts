/**
 * Plain keyword ranking for "Get an answer". No database, no AI: it only decides which pieces
 * of the company's material are worth showing the model (or the person, when AI is off).
 */

export type Piece = {
  /** Which source this piece belongs to (several pieces can share one). */
  sourceKey: string;
  kind: "page" | "meeting" | "task" | "link";
  title: string;
  href: string;
  /** Opens in a new tab (outside links). */
  external?: boolean;
  /** A line under the title in the source list, e.g. "SOP" or a meeting date. */
  note?: string;
  text: string;
};

const STOP = new Set("a an and are as at be by can do does for from has have how i if in is it its me my of on or our so that the their them then there this to us was we what when where which who why will with you your should would could about into any all need needs get".split(" "));

/** Lowercased words with the endings knocked off, so "cancels", "cancelled" and "cancellation" meet. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/(ations?|ments?|ings?|ed|es|s|ly)$/, "").replace(/(.)\1$/, "$1"))
    .filter((w) => w.length > 1);
}

/** Cuts long text into pieces at paragraph breaks, so one long SOP doesn't crowd out everything else. */
export function chunk(text: string, size = 2400): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const out: string[] = [];
  let cur = "";
  for (const para of clean.split(/\n{2,}/)) {
    if (cur && cur.length + para.length + 2 > size) {
      out.push(cur);
      cur = "";
    }
    if (para.length > size) {
      if (cur) out.push(cur);
      cur = "";
      for (let i = 0; i < para.length; i += size) out.push(para.slice(i, i + size));
    } else cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Scores every piece against the question (rarer words count more, title matches count triple)
 * and returns them best first. Pieces that share no word with the question score 0.
 */
export function rank(question: string, pieces: Piece[]): { piece: Piece; score: number }[] {
  const q = [...new Set(terms(question))];
  if (!q.length) return pieces.map((piece) => ({ piece, score: 0 }));
  const docs = pieces.map((p) => ({ body: terms(p.text), title: new Set(terms(p.title)) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.body, ...d.title])) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, docs.length);
  return pieces
    .map((piece, i) => {
      const d = docs[i];
      const counts = new Map<string, number>();
      for (const t of d.body) counts.set(t, (counts.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const idf = Math.log(1 + n / (1 + (df.get(t) ?? 0)));
        const tf = counts.get(t) ?? 0;
        // Saturating: the tenth mention of a word adds little.
        score += idf * ((tf * 2.2) / (tf + 1.2 + d.body.length / 400) + (d.title.has(t) ? 3 : 0));
      }
      return { piece, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Takes the best pieces until the size budget is spent. With room for everything, everything goes. */
export function pick(question: string, pieces: Piece[], budgetChars: number): Piece[] {
  const total = pieces.reduce((s, p) => s + p.text.length + p.title.length, 0);
  if (total <= budgetChars) return pieces;
  const out: Piece[] = [];
  let used = 0;
  for (const { piece, score } of rank(question, pieces)) {
    if (score <= 0) break;
    const size = piece.text.length + piece.title.length;
    if (used + size > budgetChars) continue;
    out.push(piece);
    used += size;
  }
  return out;
}
