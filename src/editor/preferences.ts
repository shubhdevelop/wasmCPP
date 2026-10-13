export const THEME_OPTIONS = [
  {id:"local",label:"Local Lab"}, {id:"catppuccin-latte",label:"Catppuccin Latte"},
  {id:"catppuccin-frappe",label:"Catppuccin Frappé"}, {id:"catppuccin-macchiato",label:"Catppuccin Macchiato"},
  {id:"catppuccin-mocha",label:"Catppuccin Mocha"},
] as const;
export type ThemeId = typeof THEME_OPTIONS[number]["id"];
export type EditorPreferences = {theme: ThemeId; vim: boolean};
export const EDITOR_PREFERENCES_KEY = "local-wasm-labs:editor-preferences-v1";
export const isTheme = (value: unknown): value is ThemeId => THEME_OPTIONS.some(t=>t.id===value);
export function loadEditorPreferences(storage: Pick<Storage,"getItem">): EditorPreferences {
  let legacyTheme: unknown, legacyVim = false;
  try { legacyTheme = JSON.parse(storage.getItem("local-cpp-lab:preferences-v1") ?? "null")?.theme; } catch { /* Invalid old draft. */ }
  try { legacyVim = storage.getItem("local-cpp-lab:vim-enabled") === "true"; } catch { /* Denied storage. */ }
  const defaults: EditorPreferences = {theme:isTheme(legacyTheme) ? legacyTheme : "local",vim:legacyVim};
  try {
    const value = JSON.parse(storage.getItem(EDITOR_PREFERENCES_KEY) ?? "null");
    return {theme:isTheme(value?.theme) ? value.theme : defaults.theme, vim:typeof value?.vim === "boolean" ? value.vim : defaults.vim};
  } catch { return defaults; }
}
let current: EditorPreferences | undefined;
export function getEditorPreferences(): EditorPreferences {
  if (!current) { try { current = loadEditorPreferences(localStorage); } catch { current = {theme:"local",vim:false}; } }
  return {...current};
}
export function applyAppTheme(theme: ThemeId) {
  if (theme === "local") delete document.body.dataset.theme;
  else document.body.dataset.theme = theme;
  const readingPage = /^\/(welcome|home|learn)(\/|$)/.test(location.pathname);
  document.documentElement.style.colorScheme = theme === "catppuccin-latte" || (theme === "local" && readingPage) ? "light" : "dark";
}
export function setEditorPreferences(patch: Partial<EditorPreferences>) {
  const before = getEditorPreferences();
  current = {...before,...patch};
  if (!isTheme(current.theme)) current.theme = before.theme;
  let saved = true;
  try { localStorage.setItem(EDITOR_PREFERENCES_KEY,JSON.stringify(current)); } catch { saved = false; }
  applyAppTheme(current.theme);
  if (before.theme !== current.theme || before.vim !== current.vim) window.dispatchEvent(new Event("editor-preferences-change"));
  return saved;
}
export function subscribeEditorPreferences(callback: (preferences: EditorPreferences) => void) {
  const update = () => { const prefs = getEditorPreferences(); applyAppTheme(prefs.theme); callback(prefs); };
  const storage = (event: StorageEvent) => { if (event.key === EDITOR_PREFERENCES_KEY || event.key === null) { current = undefined; update(); } };
  window.addEventListener("editor-preferences-change",update);
  window.addEventListener("storage",storage);
  return () => { window.removeEventListener("editor-preferences-change",update); window.removeEventListener("storage",storage); };
}
