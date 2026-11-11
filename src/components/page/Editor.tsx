"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import { useEffect, useRef } from "react";
import { useResolvedTheme } from "@/components/ThemeToggle";

export type EditorChange = { content: unknown[]; contentText: string };

/** The Notion-style block editor. "/" opens the block menu; ⋮⋮ drags blocks. */
export default function Editor({ initial, editable, onChange, focusRef }: { initial: unknown[]; editable: boolean; onChange?: (c: EditorChange) => void; focusRef?: React.MutableRefObject<(() => void) | null> }) {
  const editor = useCreateBlockNote({
    initialContent: initial.length ? (initial as PartialBlock[]) : undefined,
  });
  const cb = useRef(onChange);
  cb.current = onChange;
  const theme = useResolvedTheme();

  useEffect(() => {
    if (focusRef) focusRef.current = () => editor.focus();
  }, [editor, focusRef]);

  return (
    <div className="hq-editor md:-mx-[54px]">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        onChange={() => {
          const doc = editor.document;
          cb.current?.({ content: doc, contentText: editor.blocksToMarkdownLossy(doc) });
        }}
      />
    </div>
  );
}
