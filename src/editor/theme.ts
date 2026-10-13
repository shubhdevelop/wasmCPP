import { EditorView } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import type { ThemeId } from "./preferences";
export const sharedHighlighting = syntaxHighlighting(classHighlighter);
export const editorTheme = (theme: ThemeId) => EditorView.theme({
  "&": {height:"100%",color:"var(--editor-fg)",backgroundColor:"var(--editor-bg)"},
  ".cm-scroller": {overflow:"auto"},
  ".cm-content": {caretColor:"var(--editor-caret)"},
  ".cm-cursor, .cm-dropCursor": {borderLeftColor:"var(--editor-caret)"},
  ".cm-gutters": {backgroundColor:"var(--editor-bg)",color:"var(--editor-muted)",border:"none"},
  ".cm-activeLine, .cm-activeLineGutter": {backgroundColor:"var(--editor-active)"},
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {backgroundColor:"var(--editor-selection)"},
  ".cm-panels": {backgroundColor:"var(--editor-chrome)",color:"var(--editor-fg)"},
}, {dark:theme !== "catppuccin-latte"});
