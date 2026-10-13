import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, Prec } from "@codemirror/state";
import { sql, SQLite, PostgreSQL } from "@codemirror/lang-sql";
import { Vim, vim } from "@replit/codemirror-vim";
import { THEME_OPTIONS, getEditorPreferences, setEditorPreferences, subscribeEditorPreferences } from "../editor/preferences";
import { editorTheme, sharedHighlighting } from "../editor/theme";
import { bindResize, clampSize } from "../editor/resize";
import type { ExerciseContext } from "../learning/types";
import { createExercisePanel } from "../learning/bridge";
import { acceptedFormats, qualifiedTable, tableLabel } from "./formats";
import { SqlRuntime } from "./runtime";
import { MAX_FILE_BYTES, tableName } from "./data";
import type { Engine, QueryResult, TableInfo } from "./data";

const engines: Engine[] = ["sqlite", "duckdb", "pglite"];
const labels = {sqlite: "SQLite", duckdb: "DuckDB", pglite: "PGlite"};
const example = `-- Load the sample dataset or import your own CSV / JSON.\nSELECT category, COUNT(*) AS items, SUM(amount) AS total\nFROM sales\nGROUP BY category\nORDER BY total DESC;`;
type LabState = {runtime: SqlRuntime; draft: string; busy: boolean; status: string; results: QueryResult[]; tables: TableInfo[]; ms?: number; error?: string; token: number};
const states = new Map<Engine, LabState>();
const language = new Compartment();
const escape = (text: unknown): string => String(text).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));
const valueText = (value: unknown): string => value === null ? "NULL" : typeof value === "object" ? JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v) : String(value);

export function renderSqlLab(app: HTMLDivElement, initial: Engine, context?: ExerciseContext) {
  const draftKey = (engine: Engine) => `sql-lab:${engine}${context && engine === context.exercise.lab ? `:exercise:${context.exercise.id}` : ""}:draft`;
  for (const engine of engines) {
    let draft = context && engine === context.exercise.lab ? context.exercise.starter ?? example : example;
    try { draft = localStorage.getItem(draftKey(engine)) ?? draft; } catch { /* Storage unavailable. */ }
    states.set(engine, {runtime: new SqlRuntime(engine), draft, busy: false, status: "Engine not loaded", results: [], tables: [], token: 0});
  }
  let active = initial;
  app.innerHTML = `<div class="shell app-frame sql-frame">
    <aside class="site-sidebar" aria-label="Labs navigation">
      <a class="site-brand" href="/welcome"><span class="site-brand-mark">SQL</span><span>Local WASM Labs</span></a>
      <nav class="site-navigation"><a class="site-nav-item" href="/learn">Learn</a><a class="site-nav-item" href="/">C++ Lab</a>${engines.map(engine => `<button class="site-nav-item" data-engine="${engine}">${labels[engine]} Lab</button>`).join("")}<a class="site-nav-item" href="/welcome">Landing</a></nav>
      <p class="sql-sidebar-note">Runs on your device.<br>Datasets stay in this tab.</p>
    </aside>
    <main class="sql-workspace">
      <header class="sql-toolbar"><div><h1 id="sql-title"></h1><span id="sql-subtitle"></span></div><div class="sql-actions"><button class="ghost-button" id="sql-load">Load engine</button><button class="ghost-button" id="sql-reset">Reset sandbox</button><button class="ghost-button" id="sql-stop" hidden>Stop & clear</button><button class="run-button" id="sql-run">Run SQL <kbd>⌘↵</kbd></button></div></header>
      <div class="sql-body"><aside class="sql-explorer"><div class="sql-explorer-heading"><h2>Datasets & tables</h2><button class="chrome-button" id="sql-import-info" aria-label="Import formats and limits" aria-haspopup="dialog" title="Import formats and limits">ⓘ</button></div><label class="sql-field">Table name<input id="sql-table-name" placeholder="Table or database alias" maxlength="128"></label><button class="ghost-button" id="sql-import">Import dataset</button><input type="file" id="sql-file" accept=".csv,.json" hidden><button class="ghost-button" id="sql-sample">Load sample sales</button><button class="ghost-button" id="sql-exercise-data" hidden>Load exercise data</button><div id="sql-tables"></div></aside><div id="sql-sidebar-resizer" class="column-resizer" role="separator" aria-label="Resize SQL explorer" aria-orientation="vertical" tabindex="0"></div>
      <section class="sql-workbench"><div class="sql-editor-heading"><span>query.sql</span><div class="sql-editor-preferences"><label class="theme-picker"><span class="sr-only">Color theme</span><select id="sql-theme" aria-label="Color theme">${THEME_OPTIONS.map(t=>`<option value="${t.id}">${t.label}</option>`).join("")}</select></label><button id="sql-vim" aria-pressed="false">Vim</button></div></div><div id="sql-editor"></div><div id="sql-result-resizer" class="row-resizer" role="separator" aria-label="Resize SQL editor and results" aria-orientation="horizontal" tabindex="0"></div><section class="sql-results" aria-label="Query results"><div class="sql-results-heading"><h2>Results</h2><button class="ghost-button" id="sql-export" disabled>Export CSV</button></div><div id="sql-results" aria-live="polite"></div></section></section></div>
      <footer class="sql-status"><span id="sql-status" role="status"></span><span>WASM cached locally · databases in memory</span></footer>
    </main><dialog id="sql-import-dialog" class="small-dialog sql-import-dialog"><button id="sql-import-info-close" class="dialog-close" aria-label="Close import information">×</button><p class="eyebrow">Local file import</p><h2>Formats & limits</h2><p id="sql-import-note" class="sql-help"></p></dialog></div>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => app.querySelector<T>(`#${id}`)!;
  const exercisePanel = context ? createExercisePanel(context) : undefined;
  if (exercisePanel) app.querySelector(".sql-explorer")!.append(exercisePanel);
  const themeConfig = new Compartment(), vimConfig = new Compartment();
  let preferences = getEditorPreferences();
  const editor = new EditorView({parent: el("sql-editor"), doc: states.get(active)!.draft, extensions: [vimConfig.of(preferences.vim ? vim({status:true}) : []), basicSetup, sharedHighlighting, themeConfig.of(editorTheme(preferences.theme)), language.of(sql({dialect: active === "sqlite" ? SQLite : PostgreSQL})), Prec.highest(keymap.of([{key: "Mod-Enter", run: () => { void run(); return true; }}, {key:"Ctrl-Enter",run:()=>{void run();return true;}}, {key:"Meta-Enter",run:()=>{void run();return true;}}])), EditorView.updateListener.of(update => {
    if (!update.docChanged) return;
    const state = states.get(active)!;
    state.draft = update.state.doc.toString();
    try { localStorage.setItem(draftKey(active), state.draft); } catch { /* Storage unavailable. */ }
  })]});
  Vim.defineEx("write","w",() => {
    try { localStorage.setItem(draftKey(active),editor.state.doc.toString()); el("sql-status").textContent = "SQL draft saved"; }
    catch { el("sql-status").textContent = "Browser storage unavailable; draft could not be saved"; }
  });
  function syncPreferences() {
    el<HTMLSelectElement>("sql-theme").value = preferences.theme;
    const button = el<HTMLButtonElement>("sql-vim");
    button.setAttribute("aria-pressed",String(preferences.vim));
    button.setAttribute("aria-label",preferences.vim ? "Disable Vim mode" : "Enable Vim mode");
    button.title = preferences.vim ? "Vim enabled · Esc normal · i insert · v visual" : "Enable Vim keybindings";
  }
  const unsubscribe = subscribeEditorPreferences(next => {
    const effects = [];
    if (next.theme !== preferences.theme) effects.push(themeConfig.reconfigure(editorTheme(next.theme)));
    if (next.vim !== preferences.vim) effects.push(vimConfig.reconfigure(next.vim ? vim({status:true}) : []));
    if (effects.length) editor.dispatch({effects});
    preferences = next; syncPreferences(); editor.requestMeasure();
  });
  el<HTMLSelectElement>("sql-theme").onchange = () => { const theme = THEME_OPTIONS.find(t=>t.id===el<HTMLSelectElement>("sql-theme").value)!.id; setEditorPreferences({theme}); };
  el("sql-vim").onclick = () => { setEditorPreferences({vim:!preferences.vim}); editor.focus(); };
  const infoDialog = el<HTMLDialogElement>("sql-import-dialog");
  el("sql-import-info").onclick = () => infoDialog.showModal();
  el("sql-import-info-close").onclick = () => infoDialog.close();
  infoDialog.onclick = event => { if (event.target === infoDialog) { const r = infoDialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) infoDialog.close(); } };
  syncPreferences();
  const body = app.querySelector<HTMLElement>(".sql-body")!, workbench = app.querySelector<HTMLElement>(".sql-workbench")!;
  let sidebarWidth = 240, editorRatio = .45;
  try {
    const layout = JSON.parse(localStorage.getItem("local-wasm-labs:sql-layout-v1") ?? "null");
    if (Number.isFinite(layout?.sidebarWidth)) sidebarWidth = clampSize(layout.sidebarWidth,160,460);
    if (Number.isFinite(layout?.editorRatio)) editorRatio = clampSize(layout.editorRatio,.15,.85);
  } catch { /* Invalid/denied layout storage. */ }
  const saveLayout = () => { try { localStorage.setItem("local-wasm-labs:sql-layout-v1",JSON.stringify({sidebarWidth,editorRatio})); } catch { /* Session-only resizing. */ } };
  const availableHeight = () => Math.max(1,workbench.clientHeight - 37);
  const rowBounds = () => { const height = availableHeight(); return {min:Math.min(120,height*.35),max:Math.max(40,height - Math.min(110,height*.35)),current:editorRatio*height}; };
  const sidebarBounds = () => ({min:160,max:Math.min(460,body.clientWidth - 240),current:sidebarWidth});
  const setSidebar = (value: number) => { sidebarWidth = value; body.style.setProperty("--sql-sidebar-width",`${value}px`); editor.requestMeasure(); };
  const setEditorHeight = (value: number) => { editorRatio = value/availableHeight(); workbench.style.setProperty("--sql-editor-height",`${value}px`); editor.requestMeasure(); };
  bindResize(el("sql-sidebar-resizer"),"x",sidebarBounds,setSidebar,saveLayout);
  bindResize(el("sql-result-resizer"),"y",rowBounds,setEditorHeight,saveLayout);
  const resizeObserver = new ResizeObserver(() => {
    if (window.innerWidth > 580) setSidebar(clampSize(sidebarWidth,sidebarBounds().min,sidebarBounds().max));
    const {min,max,current} = rowBounds(); setEditorHeight(clampSize(current,min,max));
  });
  resizeObserver.observe(body); resizeObserver.observe(workbench);
  function display() {
    const state = states.get(active)!;
    document.title = `${labels[active]} Lab · Local WASM Labs`;
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-engine]")) {
      button.classList.toggle("active", button.dataset.engine === active);
      button.setAttribute("aria-current", button.dataset.engine === active ? "page" : "false");
    }
    el("sql-title").textContent = `${labels[active]} Lab`;
    el("sql-subtitle").textContent = active === "pglite" ? "PostgreSQL in your browser" : active === "duckdb" ? "Analytics in your browser" : "SQLite in your browser";
    el("sql-status").textContent = `${state.status}${state.ms === undefined ? "" : ` · ${Math.round(state.ms)} ms`}`;
    el("sql-status").classList.toggle("sql-error", !!state.error);
    for (const id of ["sql-load", "sql-run", "sql-import", "sql-sample", "sql-reset", "sql-exercise-data"]) el<HTMLButtonElement>(id).disabled = state.busy;
    el<HTMLButtonElement>("sql-load").hidden = state.runtime.ready;
    el<HTMLButtonElement>("sql-stop").hidden = !state.busy;
    el("sql-exercise-data").hidden = !context?.exercise.setup || active !== context.exercise.lab;
    if (exercisePanel) exercisePanel.hidden = active !== context?.exercise.lab;
    el<HTMLInputElement>("sql-file").accept = acceptedFormats[active];
    el("sql-import-note").textContent = `${active === "duckdb" ? "CSV, TSV, JSON/JSONL, Parquet, Arrow IPC/Feather V2, DuckDB databases (.duckdb/.db), or SQL scripts." : active === "sqlite" ? "CSV, TSV, JSON/JSONL, SQLite databases (.db/.sqlite/.sqlite3), or SQL scripts." : "CSV, TSV, JSON/JSONL, SQL scripts, or PGlite snapshots (.tar/.tar.gz/.tgz)."} Up to 20 MB. ${active === "pglite" ? "PGlite snapshot restore replaces the current database after confirmation." : "Native databases can contain multiple tables; the name field is the database alias."} SQL scripts execute commands and may change existing data. Tables are not overwritten by dataset imports.`;
    el("sql-tables").replaceChildren();
    if (!state.tables.length) el("sql-tables").innerHTML = '<p class="sql-help">Load a dataset or create a table with SQL.</p>';
    for (const table of state.tables) {
      const card = document.createElement("details"); card.open = true;
      const summary = document.createElement("summary"); summary.textContent = tableLabel(table);
      card.append(summary);
      for (const column of table.columns) { const item = document.createElement("div"); item.className = "sql-column"; item.textContent = column; card.append(item); }
      const preview = document.createElement("button"); preview.className = "ghost-button"; preview.textContent = "Query table";
      preview.onclick = () => { editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: `SELECT * FROM ${qualifiedTable(table)} LIMIT 100;`}}); editor.focus(); };
      card.append(preview); el("sql-tables").append(card);
    }
    const results = el("sql-results");
    if (state.error) results.innerHTML = `<pre class="sql-error">${escape(state.error)}</pre>`;
    else if (!state.results.length) results.innerHTML = '<p class="sql-empty">Import data, then run SQL to see results here.</p>';
    else results.innerHTML = state.results.map((result, i) => `<article class="sql-result"><p>Result ${i + 1} · ${result.count.toLocaleString()} ${result.columns.length ? "rows" : "rows affected"}${result.truncated ? " · showing first 1,000" : ""}</p>${result.columns.length ? `<div class="sql-table-scroll" tabindex="0" role="region" aria-label="Result ${i+1} table; scroll horizontally for more columns"><table><thead><tr>${result.columns.map(c => `<th>${escape(c)}</th>`).join("")}</tr></thead><tbody>${result.rows.map(row => `<tr>${row.map(value => `<td title="${escape(valueText(value))}">${escape(valueText(value))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="sql-help">Command completed.</p>'}</article>`).join("");
    el<HTMLButtonElement>("sql-export").disabled = state.busy || !!state.error || !state.results.some(r => r.columns.length);
  }
  async function job(operation: (client: Awaited<ReturnType<SqlRuntime["load"]>>) => Promise<void>, success: string) {
    const engine = active, state = states.get(engine)!;
    if (state.busy) return;
    const token = ++state.token;
    state.busy = true; state.error = undefined; state.ms = undefined;
    const started = performance.now();
    try {
      await state.runtime.perform(async client => { await operation(client); state.tables = await client.tables(); }, phase => { state.status = phase; if (active === engine) display(); });
      if (token !== state.token) return;
      state.status = success; state.ms = performance.now() - started;
    } catch (error) {
      if (token !== state.token) return;
      state.error = error instanceof Error ? error.message : String(error);
      state.status = "Operation failed";
      if (!state.runtime.ready) state.tables = [];
    } finally { if (token === state.token) { state.busy = false; if (active === engine) display(); } }
  }
  async function run() {
    const selection = editor.state.selection.main;
    const text = selection.empty ? editor.state.doc.toString() : editor.state.sliceDoc(selection.from, selection.to);
    if (!text.trim()) return;
    const state = states.get(active)!;
    await job(async client => { state.results = await client.execute(text); }, "SQL completed");
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-engine]")) button.onclick = () => {
    active = button.dataset.engine as Engine;
    history.replaceState(null, "", `/labs/${active}${context && active === context.exercise.lab ? `?exercise=${context.exercise.id}` : ""}`);
    editor.dispatch({changes: {from:0, to:editor.state.doc.length, insert:states.get(active)!.draft}, effects:language.reconfigure(sql({dialect:active === "sqlite" ? SQLite : PostgreSQL}))});
    el<HTMLInputElement>("sql-table-name").value = "";
    display();
  };
  el("sql-load").onclick = () => { void job(async () => {}, "Engine ready"); };
  el("sql-run").onclick = () => { void run(); };
  function reset() {
    const state = states.get(active)!;
    state.token++; state.runtime.reset(); state.busy = false; state.tables = []; state.results = []; state.error = undefined; state.ms = undefined; state.status = "Sandbox cleared · cached engine assets retained"; display();
  }
  el("sql-reset").onclick = reset; el("sql-stop").onclick = reset;
  el("sql-import").onclick = () => el<HTMLInputElement>("sql-file").click();
  el<HTMLInputElement>("sql-file").onchange = event => {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
    if (!file) return;
    if (active === "pglite" && /\.(tar|tar\.gz|tgz)$/i.test(file.name) && !window.confirm("Restore this PGlite snapshot? This replaces the current in-memory database. Export any work you need to keep first.")) return;
    const name = el<HTMLInputElement>("sql-table-name").value.trim() || tableName(file.name);
    const state = states.get(active)!;
    void job(async client => {
      if (file.size > MAX_FILE_BYTES) throw new Error("Dataset exceeds 20 MB.");
      if (name.includes("\0") || name.length > 128) throw new Error("Use a table name up to 128 characters.");
      const imported = await client.importFile(name, file);
      state.results = [{columns: imported.kind === "table" ? ["table", "imported_rows"] : ["import", "name", "status"], rows: imported.kind === "table" ? [[imported.name,imported.rows]] : [[imported.kind,imported.name,imported.message ?? "Imported"]],count:1,truncated:false}];
    }, `Imported ${name}`);
  };
  el("sql-sample").onclick = () => {
    const state = states.get(active)!;
    void job(async client => {
      await client.importFile("sales", new File(["category,product,amount\nBooks,Algorithms,45\nBooks,Databases,35\nHardware,Keyboard,80\nHardware,Mouse,25\nBooks,Compilers,55\n"], "sales.csv", {type:"text/csv"}));
      state.results = await client.execute("SELECT * FROM sales;");
    }, "Sample loaded into sales");
  };
  el("sql-exercise-data").onclick = () => {
    if (!context?.exercise.setup || active !== context.exercise.lab) return;
    const state = states.get(active)!;
    void job(async client => {
      await client.execute("BEGIN;");
      try { await client.execute(context.exercise.setup!); await client.execute("COMMIT;"); }
      catch (error) { await client.execute("ROLLBACK;"); throw error; }
      state.results = [{columns:[],rows:[],count:0,truncated:false}];
    }, "Exercise data ready");
  };
  el("sql-export").onclick = () => {
    const result = [...states.get(active)!.results].reverse().find(r => r.columns.length);
    if (!result) return;
    const csv = [result.columns, ...result.rows].map(row => row.map(v => `"${(v === null ? "" : valueText(v)).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    const link = document.createElement("a"); link.href = url; link.download = `${active}-results.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener("beforeunload", () => { unsubscribe(); resizeObserver.disconnect(); for (const state of states.values()) state.runtime.reset(); editor.destroy(); });
  display();
}
