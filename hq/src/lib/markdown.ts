import "server-only";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { getDocument } from "@blocknote/server-util/dom";

/**
 * One shared DOM for the whole process. Next.js bundles this file separately for
 * route handlers and server actions, so we keep the editor on globalThis instead
 * of in module scope; otherwise two documents fight over window/document.
 */
type G = typeof globalThis & { __orbitEditor?: ServerBlockNoteEditor; document?: Document };
const g = globalThis as G;

function get() {
  if (!g.__orbitEditor) {
    const doc = g.document?.defaultView ? g.document : getDocument();
    g.__orbitEditor = ServerBlockNoteEditor.create({}, doc);
  }
  return g.__orbitEditor;
}

/** Markdown → editor blocks (what pages store). */
export async function markdownToBlocks(md: string): Promise<unknown[]> {
  return get().tryParseMarkdownToBlocks(md);
}

/** Editor blocks → Markdown (what AI reads and what search indexes). */
export async function blocksToMarkdown(blocks: unknown[]): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return get().blocksToMarkdownLossy(blocks as any);
}

/** HTML (from Google Docs export or Word conversion) → editor blocks. */
export async function htmlToBlocks(html: string): Promise<unknown[]> {
  return get().tryParseHTMLToBlocks(html);
}

/** Editor blocks → plain HTML (what Orbit sends to Google Docs). */
export async function blocksToHtml(blocks: unknown[]): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return get().blocksToHTMLLossy(blocks as any);
}
