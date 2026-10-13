import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { sql, SQLite, PostgreSQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { SqlRuntime } from "./runtime";
import { MAX_FILE_BYTES, quoteIdentifier, tableName } from "./data";
import type { Engine, QueryResult, TableInfo } from "./data";

const engines: Engine[] = ["sqlite", "duckdb", "pglite"];
const labels = {sqlite: "SQLite", duckdb: "DuckDB", pglite: "PGlite"};
const example = `-- Load the sample dataset or import your own CSV / JSON.\nSELECT category, COUNT(*) AS items, SUM(amount) AS total\nFROM sales\nGROUP BY category\nORDER BY total DESC;`;
type LabState = {runtime: SqlRuntime; draft: string; busy: boolean; status: string; results: QueryResult[]; tables: TableInfo[]; ms?: number; error?: string; token: number};
const states = new Map<Engine, LabState>();
const language = new Compartment();
const escape = (text: unknown): string => String(text).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));
const valueText = (value: unknown): string => value === null ? "NULL" : typeof value === "object" ? JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v) : String(value);

export function renderSqlLab(app: HTMLDivElement, initial: Engine) {
  for (const engine of engines) {
    let draft = example;
    try { draft = localStorage.getItem(`sql-lab:${engine}:draft`) ?? example; } catch { /* Storage unavailable. */ }
    states.set(engine, {runtime: new SqlRuntime(engine), draft, busy: false, status: "Engine not loaded", results: [], tables: [], token: 0});
  }
  let active = initial;
  app.innerHTML = `<div class="shell app-frame sql-frame">
    <aside class="site-sidebar" aria-label="Labs navigation">
      <a class="site-brand" href="/welcome"><span class="site-brand-mark">SQL</span><span>Local WASM Labs</span></a>
      <nav class="site-navigation"><a class="site-nav-item" href="/">C++ Lab</a>${engines.map(engine => `<button class="site-nav-item" data-engine="${engine}">${labels[engine]} Lab</button>`).join("")}<a class="site-nav-item" href="/welcome">Landing</a></nav>
      <p class="sql-sidebar-note">Runs on your device.<br>Datasets stay in this tab.</p>
    </aside>
    <main class="sql-workspace">
      <header class="sql-toolbar"><div><h1 id="sql-title"></h1><span id="sql-subtitle"></span></div><div class="sql-actions"><button class="ghost-button" id="sql-load">Load engine</button><button class="ghost-button" id="sql-reset">Reset sandbox</button><button class="ghost-button" id="sql-stop" hidden>Stop & clear</button><button class="run-button" id="sql-run">Run SQL <kbd>⌘↵</kbd></button></div></header>
      <div class="sql-body"><aside class="sql-explorer"><h2>Datasets & tables</h2><label class="sql-field">Table name<input id="sql-table-name" placeholder="From filename" maxlength="128"></label><button class="ghost-button" id="sql-import">Import dataset</button><input type="file" id="sql-file" accept=".csv,.json" hidden><button class="ghost-button" id="sql-sample">Load sample sales</button><p id="sql-import-note" class="sql-help"></p><div id="sql-tables"></div></aside>
      <section class="sql-workbench"><div class="sql-editor-heading"><span>query.sql</span><span>Run selection or entire script</span></div><div id="sql-editor"></div><section class="sql-results" aria-label="Query results"><div class="sql-results-heading"><h2>Results</h2><button class="ghost-button" id="sql-export" disabled>Export CSV</button></div><div id="sql-results" aria-live="polite"></div></section></section></div>
      <footer class="sql-status"><span id="sql-status" role="status"></span><span>WASM cached locally · databases in memory</span></footer>
    </main></div>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => app.querySelector<T>(`#${id}`)!;
  const editor = new EditorView({parent: el("sql-editor"), doc: states.get(active)!.draft, extensions: [basicSetup, oneDark, language.of(sql({dialect: active === "sqlite" ? SQLite : PostgreSQL})), keymap.of([{key: "Mod-Enter", run: () => { void run(); return true; }}]), EditorView.updateListener.of(update => {
    if (!update.docChanged) return;
    const state = states.get(active)!;
    state.draft = update.state.doc.toString();
    try { localStorage.setItem(`sql-lab:${active}:draft`, state.draft); } catch { /* Storage unavailable. */ }
  })]});
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
    for (const id of ["sql-load", "sql-run", "sql-import", "sql-sample", "sql-reset"]) el<HTMLButtonElement>(id).disabled = state.busy;
    el<HTMLButtonElement>("sql-load").hidden = state.runtime.ready;
    el<HTMLButtonElement>("sql-stop").hidden = !state.busy;
    el<HTMLInputElement>("sql-file").accept = active === "duckdb" ? ".csv,.json,.parquet" : ".csv,.json";
    el("sql-import-note").textContent = `CSV with headers or JSON array of objects${active === "duckdb" ? ", plus Parquet" : ""}. Up to 20 MB; CSV/JSON up to 20,000 rows. ${active === "sqlite" ? "Scripts show the first result set." : active === "duckdb" ? "Scripts show the last result set." : "Scripts show all result sets."} Existing table names are preserved; choose a new name to import again.`;
    el("sql-tables").replaceChildren();
    if (!state.tables.length) el("sql-tables").innerHTML = '<p class="sql-help">Load a dataset or create a table with SQL.</p>';
    for (const table of state.tables) {
      const card = document.createElement("details"); card.open = true;
      const summary = document.createElement("summary"); summary.textContent = table.name;
      card.append(summary);
      for (const column of table.columns) { const item = document.createElement("div"); item.className = "sql-column"; item.textContent = column; card.append(item); }
      const preview = document.createElement("button"); preview.className = "ghost-button"; preview.textContent = "Query table";
      preview.onclick = () => { editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: `SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`}}); editor.focus(); };
      card.append(preview); el("sql-tables").append(card);
    }
    const results = el("sql-results");
    if (state.error) results.innerHTML = `<pre class="sql-error">${escape(state.error)}</pre>`;
    else if (!state.results.length) results.innerHTML = '<p class="sql-empty">Import data, then run SQL to see results here.</p>';
    else results.innerHTML = state.results.map((result, i) => `<article class="sql-result"><p>Result ${i + 1} · ${result.count.toLocaleString()} ${result.columns.length ? "rows" : "rows affected"}${result.truncated ? " · showing first 1,000" : ""}</p>${result.columns.length ? `<div class="sql-table-scroll"><table><thead><tr>${result.columns.map(c => `<th>${escape(c)}</th>`).join("")}</tr></thead><tbody>${result.rows.map(row => `<tr>${row.map(value => `<td title="${escape(valueText(value))}">${escape(valueText(value))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="sql-help">Command completed.</p>'}</article>`).join("");
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
    history.replaceState(null, "", `/labs/${active}`);
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
    const name = el<HTMLInputElement>("sql-table-name").value.trim() || tableName(file.name);
    const state = states.get(active)!;
    void job(async client => {
      if (file.size > MAX_FILE_BYTES) throw new Error("Dataset exceeds 20 MB.");
      if (name.includes("\0") || name.length > 128) throw new Error("Use a table name up to 128 characters.");
      const count = await client.importFile(name, file);
      state.results = [{columns:["table", "imported_rows"],rows:[[name,count]],count:1,truncated:false}];
    }, `Imported ${name}`);
  };
  el("sql-sample").onclick = () => {
    const state = states.get(active)!;
    void job(async client => {
      await client.importFile("sales", new File(["category,product,amount\nBooks,Algorithms,45\nBooks,Databases,35\nHardware,Keyboard,80\nHardware,Mouse,25\nBooks,Compilers,55\n"], "sales.csv", {type:"text/csv"}));
      state.results = await client.execute("SELECT * FROM sales;");
    }, "Sample loaded into sales");
  };
  el("sql-export").onclick = () => {
    const result = [...states.get(active)!.results].reverse().find(r => r.columns.length);
    if (!result) return;
    const csv = [result.columns, ...result.rows].map(row => row.map(v => `"${(v === null ? "" : valueText(v)).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    const link = document.createElement("a"); link.href = url; link.download = `${active}-results.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener("beforeunload", () => { for (const state of states.values()) state.runtime.reset(); editor.destroy(); });
  display();
}
