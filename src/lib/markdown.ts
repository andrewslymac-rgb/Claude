import "server-only";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { getDocument } from "@blocknote/server-util/dom";

let editor: ServerBlockNoteEditor | null = null;
const get = () => (editor ??= ServerBlockNoteEditor.create({}, getDocument()));

/** Markdown → editor blocks (what pages store). */
export async function markdownToBlocks(md: string): Promise<unknown[]> {
  return get().tryParseMarkdownToBlocks(md);
}

/** Editor blocks → Markdown (what AI reads and what search indexes). */
export async function blocksToMarkdown(blocks: unknown[]): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return get().blocksToMarkdownLossy(blocks as any);
}
