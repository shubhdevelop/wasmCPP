import { basicSetup } from "codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap, EditorView, lineNumbers } from "@codemirror/view";
import {
  Code2,
  Download,
  FileCode2,
  FileText,
  Folder,
  Info,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  createIcons,
} from "lucide";
import { parseProgramArgs } from "./lib/args";
import {
  findEntryFile,
  loadStoredProject,
  normalizeProjectPath,
  saveStoredProject,
  validateProjectFiles,
} from "./lib/project";
import { CompilerRuntime, RuntimeStoppedError } from "./runtime-client";
import type { CppStandard, ProjectFile, WorkerRequest, WorkerResponse } from "./types";
import "./style.css";

const FILESYSTEM_CODE = `#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include "include/stats.hpp"

int main(int argc, char** argv) {
    const std::string path = argc > 1
        ? argv[1]
        : "/workspace/data/numbers.txt";

    std::ifstream input(path);
    if (!input) {
        std::cerr << "Could not open " << path << '\\n';
        return 1;
    }

    std::vector<int> values;
    for (int value; input >> value;) {
        values.push_back(value);
    }

    const int total = stats::sum(values);
    std::ofstream report("/workspace/result.txt");
    report << "count=" << values.size() << "\\nsum=" << total << '\\n';

    std::cout << "Read " << values.size() << " values\\n";
    std::cout << "Sum: " << total << '\\n';
    std::cout << "Wrote /workspace/result.txt\\n";
}`;

const DEFAULT_FILES: ProjectFile[] = [
  { path: "main.cpp", content: FILESYSTEM_CODE },
  {
    path: "include/stats.hpp",
    content: `#pragma once

#include <numeric>
#include <vector>

namespace stats {
inline int sum(const std::vector<int>& values) {
    return std::accumulate(values.begin(), values.end(), 0);
}
}  // namespace stats
`,
  },
  { path: "data/numbers.txt", content: "4 8 15 16 23 42\n" },
];

const EXAMPLES: Record<string, { code: string; stdin: string; args: string }> = {
  "Sandboxed files": { code: FILESYSTEM_CODE, stdin: "", args: "/workspace/data/numbers.txt" },
  "Hello, name": {
    code: `#include <iostream>
#include <string>

int main() {
    std::string name;
    std::getline(std::cin, name);
    std::cout << "Hello, " << name << "!\\n";
}`,
    stdin: "Ada Lovelace\n",
    args: "",
  },
  "C++20 ranges": {
    code: `#include <algorithm>
#include <iostream>
#include <ranges>
#include <vector>

int main() {
    std::vector values{9, 4, 7, 2, 8, 1};
    auto even = values | std::views::filter([](int n) { return n % 2 == 0; });
    for (int value : even) std::cout << value << ' ';
    std::cout << '\\n';
}`,
    stdin: "",
    args: "",
  },
};

const STORAGE_KEY = "local-cpp-lab:project-v2";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Local C++ Lab home">
        <span class="brand-mark"><i data-lucide="code-2"></i></span>
        <span>Local C++ Lab</span>
        <span class="beta">Workspace</span>
      </a>
      <div class="support-strip" aria-label="Supported features">
        <span>C++11—23</span><span>STL</span><span>Virtual FS</span>
      </div>
      <div class="privacy"><i data-lucide="shield-check"></i><span>Files stay in this browser</span></div>
      <button class="icon-button" id="about-button" aria-label="About this workspace"><i data-lucide="info"></i></button>
    </header>

    <main class="workspace">
      <section class="intro">
        <div>
          <p class="eyebrow">Clang + WASI workspace</p>
          <h1>A real C++ workspace. <em>Still local.</em></h1>
          <p class="lede">Compile modern C++, include your own headers, and read or write files in a sandboxed <code>/workspace</code>—entirely inside this tab.</p>
        </div>
        <div class="pipeline" aria-label="Execution pipeline">
          <span>Project files</span><b>→</b><span>Clang.wasm</span><b>→</b><span>WASI sandbox</span>
        </div>
      </section>

      <section class="ide-card">
        <div class="ide-toolbar">
          <div class="file-tab"><span class="cpp-badge" id="active-file-type">C++</span><span id="active-file-name">main.cpp</span><i class="unsaved-dot" aria-label="Saved locally"></i></div>
          <div class="toolbar-actions">
            <label class="select-wrap">
              <span class="sr-only">Example</span>
              <select id="example-select" aria-label="Load example into main.cpp">
                <option value="">Examples</option>
                ${Object.keys(EXAMPLES).map((name) => `<option value="${name}">${name}</option>`).join("")}
              </select>
            </label>
            <label class="select-wrap compact">
              <span class="sr-only">C++ standard</span>
              <select id="standard-select" aria-label="C++ standard">
                <option value="c++23">C++23</option>
                <option value="c++20" selected>C++20</option>
                <option value="c++17">C++17</option>
                <option value="c++14">C++14</option>
                <option value="c++11">C++11</option>
              </select>
            </label>
            <label class="select-wrap optimization">
              <span class="sr-only">Optimization level</span>
              <select id="optimization-select" aria-label="Optimization level">
                <option value="0">Debug · O0</option>
                <option value="2" selected>Release · O2</option>
                <option value="3">Fast · O3</option>
                <option value="s">Small · Os</option>
              </select>
            </label>
            <button class="ghost-button" id="reset-button"><i data-lucide="rotate-ccw"></i><span>Reset</span></button>
            <button class="run-button" id="run-button"><i data-lucide="play"></i><span>Run project</span><kbd>⌘↵</kbd></button>
          </div>
        </div>

        <div class="panes">
          <div class="editor-pane">
            <aside class="file-explorer">
              <div class="explorer-heading"><span>Files</span><button id="new-file-button" aria-label="New file"><i data-lucide="plus"></i></button></div>
              <div id="file-tree" class="file-tree"></div>
              <div class="mount-label"><i data-lucide="folder"></i><span>Mounted at<br><b>/workspace</b></span></div>
            </aside>
            <div class="code-area">
              <div id="editor"></div>
              <div class="editor-status"><span id="cursor-position">Ln 1, Col 1</span><span id="file-size">0 B</span><span>UTF-8</span><span>Spaces: 4</span></div>
            </div>
          </div>

          <div class="io-pane">
            <div class="io-section input-section">
              <div class="pane-heading"><span>Program input</span><span class="hint">stdin + argv</span></div>
              <label class="argv-row"><span>$ ./main</span><input id="argv" aria-label="Program arguments" value="/workspace/data/numbers.txt" placeholder="arguments" /></label>
              <textarea id="stdin" spellcheck="false" aria-label="Standard input" placeholder="Standard input for your program…"></textarea>
            </div>
            <div class="io-section output-section">
              <div class="pane-heading output-heading">
                <div class="output-tabs" role="tablist">
                  <button class="output-tab active" data-output-tab="output" role="tab" aria-selected="true">Output</button>
                  <button class="output-tab" data-output-tab="diagnostics" role="tab" aria-selected="false">Diagnostics <span id="diagnostic-count"></span></button>
                </div>
                <button class="clear-button" id="clear-button">Clear</button>
              </div>
              <div class="terminal-wrap">
                <div class="empty-output" id="empty-output">
                  <i data-lucide="terminal"></i>
                  <p>Workspace ready.</p>
                  <span>Run the project to compile and mount its files.</span>
                </div>
                <pre id="output" aria-live="polite"></pre>
              </div>
              <div class="run-meta" id="run-meta">
                <span class="status-indicator idle"></span><span id="status-text">Idle</span>
                <span class="meta-spacer"></span><span id="timing-text">—</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <p><strong>Native-like, browser-safe.</strong> Filesystem access is limited to the in-memory <code>/workspace</code> mount.</p>
        <button id="download-button"><i data-lucide="download"></i> Download current file</button>
      </footer>
    </main>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <dialog id="about-dialog">
    <button class="dialog-close" data-close-dialog="about-dialog" aria-label="Close">×</button>
    <span class="dialog-icon"><i data-lucide="code-2"></i></span>
    <p class="eyebrow">Capability map</p>
    <h2>Modern C++, within WASI’s boundaries.</h2>
    <p>Clang runs in a Web Worker and compiles one selected entry translation unit plus project headers. The generated program receives a writable, in-memory <code>/workspace</code> filesystem.</p>
    <div class="capability-grid">
      <div class="supported"><b>Supported</b><span>C++11/14/17/20/23 modes</span><span>STL containers & algorithms</span><span>Headers and text files</span><span>stdin, stdout, stderr, argv</span><span>File read/write & directories</span></div>
      <div class="limited"><b>WASI limits</b><span>C++ exceptions</span><span>Native threads</span><span>Sockets & host networking</span><span>Dynamic libraries</span><span>Host filesystem access</span></div>
    </div>
    <p class="dialog-note">One <code>.cpp</code> entry point is compiled at a time. Add reusable code as headers; separate native translation-unit linking is not included in this toolchain.</p>
  </dialog>

  <dialog id="new-file-dialog" class="small-dialog">
    <button class="dialog-close" data-close-dialog="new-file-dialog" aria-label="Close">×</button>
    <p class="eyebrow">Project filesystem</p>
    <h2>Create a file</h2>
    <form id="new-file-form">
      <label>Path inside /workspace<input id="new-file-path" required autocomplete="off" placeholder="include/helpers.hpp" /></label>
      <p class="form-error" id="new-file-error"></p>
      <div class="dialog-actions"><button type="button" class="secondary-button" data-close-dialog="new-file-dialog">Cancel</button><button type="submit" class="primary-button">Create file</button></div>
    </form>
  </dialog>
`;

const ICONS = { Code2, Download, FileCode2, FileText, Folder, Info, Play, Plus, RotateCcw, ShieldCheck, Square, Terminal, Trash2 };
createIcons({ icons: ICONS });

function cloneDefaults() {
  return DEFAULT_FILES.map((file) => ({ ...file }));
}

let projectFiles = loadStoredProject(localStorage, STORAGE_KEY, DEFAULT_FILES);
let activePath = projectFiles.find((file) => file.path === "main.cpp")?.path || projectFiles[0].path;
let suppressEditorSave = false;
const runtime = new CompilerRuntime();
let running = false;
let lastResult = { output: "", diagnostics: "" };
let visibleTab: "output" | "diagnostics" = "output";
let toastTimer: number | undefined;

const runKeymap = keymap.of([{ key: "Mod-Enter", run: () => { void runCode(); return true; } }]);
const editableConfig = new Compartment();
const editor = new EditorView({
  state: EditorState.create({
    doc: currentFile().content,
    extensions: [
      basicSetup,
      lineNumbers(),
      cpp(),
      runKeymap,
      editableConfig.of(EditorView.editable.of(true)),
      EditorView.lineWrapping,
      EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto" } }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressEditorSave) {
          currentFile().content = update.state.doc.toString();
          persistProject();
          markChanged();
          updateFileMeta();
        }
        if (update.selectionSet || update.docChanged) updateCursor(update.view);
      }),
    ],
  }),
  parent: document.querySelector<HTMLDivElement>("#editor")!,
});

const stdin = document.querySelector<HTMLTextAreaElement>("#stdin")!;
const argvInput = document.querySelector<HTMLInputElement>("#argv")!;
const output = document.querySelector<HTMLPreElement>("#output")!;
const emptyOutput = document.querySelector<HTMLDivElement>("#empty-output")!;
const statusText = document.querySelector<HTMLSpanElement>("#status-text")!;
const timingText = document.querySelector<HTMLSpanElement>("#timing-text")!;
const statusIndicator = document.querySelector<HTMLSpanElement>(".status-indicator")!;
const runButton = document.querySelector<HTMLButtonElement>("#run-button")!;
const diagnosticCount = document.querySelector<HTMLSpanElement>("#diagnostic-count")!;
const standardSelect = document.querySelector<HTMLSelectElement>("#standard-select")!;
const optimizationSelect = document.querySelector<HTMLSelectElement>("#optimization-select")!;

function currentFile() {
  return projectFiles.find((file) => file.path === activePath) || projectFiles[0];
}

function persistProject() {
  const result = saveStoredProject(localStorage, STORAGE_KEY, projectFiles);
  if (!result.ok) showToast(result.error, "error");
  return result.ok;
}

function switchFile(path: string) {
  const target = projectFiles.find((file) => file.path === path);
  if (!target) return;
  activePath = path;
  suppressEditorSave = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: target.content } });
  suppressEditorSave = false;
  document.querySelector("#active-file-name")!.textContent = path;
  document.querySelector("#active-file-type")!.textContent = fileType(path);
  renderFileTree();
  updateFileMeta();
  editor.focus();
}

function fileType(path: string) {
  if (/\.(cpp|cc|cxx)$/i.test(path)) return "C++";
  if (/\.(h|hpp|hxx)$/i.test(path)) return "H";
  return "TXT";
}

function fileIcon(path: string) {
  return /\.(cpp|cc|cxx|h|hpp|hxx)$/i.test(path) ? "file-code-2" : "file-text";
}

function renderFileTree() {
  const tree = document.querySelector<HTMLDivElement>("#file-tree")!;
  const folders = new Set<string>();
  for (const file of projectFiles) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
  }
  const entries = [
    ...Array.from(folders).map((path) => ({ path, folder: true })),
    ...projectFiles.map((file) => ({ path: file.path, folder: false })),
  ].sort((a, b) => a.path.localeCompare(b.path) || Number(b.folder) - Number(a.folder));

  tree.innerHTML = entries.map((entry) => {
    const depth = entry.path.split("/").length - 1;
    const name = entry.path.split("/").at(-1);
    if (entry.folder) return `<div class="folder-row" style="--depth:${depth}"><i data-lucide="folder"></i><span>${escapeHtml(name || entry.path)}</span></div>`;
    return `<div class="file-row ${entry.path === activePath ? "active" : ""}" style="--depth:${depth}">
      <button class="file-select" data-file="${escapeHtml(entry.path)}"><i data-lucide="${fileIcon(entry.path)}"></i><span>${escapeHtml(name || entry.path)}</span></button>
      <button class="file-delete" data-delete-file="${escapeHtml(entry.path)}" aria-label="Delete ${escapeHtml(entry.path)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }).join("");
  createIcons({ icons: ICONS });
  tree.querySelectorAll<HTMLButtonElement>("[data-file]").forEach((button) => button.addEventListener("click", () => switchFile(button.dataset.file!)));
  tree.querySelectorAll<HTMLButtonElement>("[data-delete-file]").forEach((button) => button.addEventListener("click", () => deleteFile(button.dataset.deleteFile!)));
}

function deleteFile(path: string) {
  if (projectFiles.length === 1 || !window.confirm(`Delete /workspace/${path}?`)) return;
  projectFiles = projectFiles.filter((file) => file.path !== path);
  persistProject();
  if (activePath === path) switchFile(projectFiles[0].path);
  else renderFileTree();
}

function updateCursor(view: EditorView) {
  const position = view.state.selection.main.head;
  const line = view.state.doc.lineAt(position);
  document.querySelector<HTMLSpanElement>("#cursor-position")!.textContent = `Ln ${line.number}, Col ${position - line.from + 1}`;
}

function updateFileMeta() {
  const bytes = new TextEncoder().encode(editor.state.doc.toString()).byteLength;
  document.querySelector<HTMLSpanElement>("#file-size")!.textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function markChanged() {
  document.querySelector<HTMLElement>(".unsaved-dot")?.classList.add("visible");
  window.setTimeout(() => document.querySelector<HTMLElement>(".unsaved-dot")?.classList.remove("visible"), 450);
}

async function runCode() {
  if (running) { stopRun(); return; }
  currentFile().content = editor.state.doc.toString();
  const validation = validateProjectFiles(projectFiles);
  if (!validation.ok) { finishWithError(validation.error); return; }
  const entry = findEntryFile(projectFiles);
  if (!entry) { finishWithError("Add a .cpp entry file before running the project."); return; }

  running = true;
  setRunButton(true);
  setStatus("Preparing browser compiler…", "busy");
  timingText.textContent = `${projectFiles.length} files · first run may take a moment`;
  lastResult = { output: "", diagnostics: "" };
  renderOutput();

  try {
    const message = await runtime.run({
      entryFile: entry.path,
      files: projectFiles,
      stdin: stdin.value,
      args: parseProgramArgs(argvInput.value),
      standard: standardSelect.value as CppStandard,
      optimization: optimizationSelect.value as WorkerRequest["optimization"],
    }, (phase) => {
      const labels = { loading: "Loading toolchain…", compiling: "Compiling project…", mounting: "Mounting /workspace…", running: "Running in sandbox…" };
      setStatus(labels[phase], "busy");
    });
    handleWorkerResult(message);
  } catch (error) {
    if (error instanceof RuntimeStoppedError) return;
    finishWithError(error instanceof Error ? error.message : String(error));
  }
}

function stopRun() {
  runtime.stop();
  running = false;
  setRunButton(false);
  setStatus("Stopped", "error");
  timingText.textContent = "Worker restarted";
}

function handleWorkerResult(message: Exclude<WorkerResponse, { type: "status" }>) {
  running = false;
  setRunButton(false);
  if (message.type === "error") {
    lastResult = { output: "", diagnostics: cleanDiagnostics(message.message) };
    visibleTab = "diagnostics";
    syncTabs();
    setStatus("Build failed", "error");
    timingText.textContent = `${formatMs(message.compileMs)} compile`;
    renderOutput();
    return;
  }

  projectFiles = message.files;
  persistProject();
  renderFileTree();
  lastResult = { output: message.stdout + (message.stderr ? `\n${message.stderr}` : ""), diagnostics: cleanDiagnostics(message.compileOutput) };
  visibleTab = message.exitCode === 0 ? "output" : "diagnostics";
  if (message.exitCode !== 0 && !lastResult.diagnostics) lastResult.diagnostics = message.stderr;
  syncTabs();
  setStatus(message.exitCode === 0 ? "Finished successfully" : `Exited with code ${message.exitCode}`, message.exitCode === 0 ? "success" : "error");
  timingText.textContent = `${formatMs(message.compileMs)} compile · ${formatMs(message.runMs)} run · ${message.files.length} files`;
  renderOutput();
}

function finishWithError(message: string) {
  running = false;
  setRunButton(false);
  lastResult.diagnostics = message;
  visibleTab = "diagnostics";
  syncTabs();
  setStatus("Something went wrong", "error");
  timingText.textContent = "—";
  renderOutput();
}

function cleanDiagnostics(value: string) {
  return value.replaceAll("/tmp/", "").replaceAll(".cpp.cpp", ".cpp").trim();
}

function renderOutput() {
  const value = lastResult[visibleTab];
  output.textContent = value;
  output.classList.toggle("diagnostics", visibleTab === "diagnostics");
  emptyOutput.hidden = Boolean(value);
  output.hidden = !value;
  const count = lastResult.diagnostics ? (lastResult.diagnostics.match(/\b(error|warning):/g) || []).length : 0;
  diagnosticCount.textContent = count ? String(count) : "";
}

function syncTabs() {
  document.querySelectorAll<HTMLButtonElement>(".output-tab").forEach((tab) => {
    const active = tab.dataset.outputTab === visibleTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function setStatus(label: string, state: "idle" | "busy" | "success" | "error") {
  statusText.textContent = label;
  statusIndicator.className = `status-indicator ${state}`;
}

function setRunButton(isRunning: boolean) {
  runButton.classList.toggle("running", isRunning);
  runButton.querySelector("span")!.textContent = isRunning ? "Stop" : "Run project";
  runButton.querySelector("kbd")!.hidden = isRunning;
  runButton.querySelector("svg")?.remove();
  const icon = document.createElement("i");
  icon.dataset.lucide = isRunning ? "square" : "play";
  runButton.prepend(icon);
  editor.dispatch({ effects: editableConfig.reconfigure(EditorView.editable.of(!isRunning)) });
  document.querySelector(".ide-card")?.classList.toggle("locked", isRunning);
  [standardSelect, optimizationSelect, stdin, argvInput, document.querySelector<HTMLSelectElement>("#example-select")!, document.querySelector<HTMLButtonElement>("#reset-button")!, document.querySelector<HTMLButtonElement>("#new-file-button")!]
    .forEach((control) => { control.disabled = isRunning; });
  createIcons({ icons: ICONS });
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]!);
}

function showToast(message: string, tone: "info" | "error" = "info") {
  const toast = document.querySelector<HTMLDivElement>("#toast")!;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast visible ${tone}`;
  toastTimer = window.setTimeout(() => { toast.className = "toast"; }, 4_500);
}

runButton.addEventListener("click", () => void runCode());
document.querySelector<HTMLButtonElement>("#clear-button")!.addEventListener("click", () => {
  lastResult = { output: "", diagnostics: "" };
  setStatus("Idle", "idle");
  timingText.textContent = "—";
  renderOutput();
});

document.querySelector<HTMLButtonElement>("#reset-button")!.addEventListener("click", () => {
  if (!window.confirm("Reset every file in this local project?")) return;
  projectFiles = cloneDefaults();
  persistProject();
  stdin.value = "";
  argvInput.value = "/workspace/data/numbers.txt";
  switchFile("main.cpp");
});

document.querySelector<HTMLSelectElement>("#example-select")!.addEventListener("change", (event) => {
  const select = event.currentTarget as HTMLSelectElement;
  const example = EXAMPLES[select.value];
  if (!example) return;
  let main = projectFiles.find((file) => file.path === "main.cpp");
  if (!main) { main = { path: "main.cpp", content: "" }; projectFiles.push(main); }
  main.content = example.code;
  stdin.value = example.stdin;
  argvInput.value = example.args;
  persistProject();
  switchFile("main.cpp");
  select.value = "";
});

document.querySelectorAll<HTMLButtonElement>(".output-tab").forEach((tab) => tab.addEventListener("click", () => {
  visibleTab = tab.dataset.outputTab as "output" | "diagnostics";
  syncTabs();
  renderOutput();
}));

document.querySelector<HTMLButtonElement>("#download-button")!.addEventListener("click", () => {
  const file = currentFile();
  const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.path.split("/").at(-1) || "file.txt";
  link.click();
  URL.revokeObjectURL(url);
});

const aboutDialog = document.querySelector<HTMLDialogElement>("#about-dialog")!;
const newFileDialog = document.querySelector<HTMLDialogElement>("#new-file-dialog")!;
document.querySelector<HTMLButtonElement>("#about-button")!.addEventListener("click", () => aboutDialog.showModal());
document.querySelector<HTMLButtonElement>("#new-file-button")!.addEventListener("click", () => {
  document.querySelector<HTMLInputElement>("#new-file-path")!.value = "";
  document.querySelector("#new-file-error")!.textContent = "";
  newFileDialog.showModal();
  document.querySelector<HTMLInputElement>("#new-file-path")!.focus();
});
document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => document.querySelector<HTMLDialogElement>(`#${button.dataset.closeDialog}`)?.close()));

document.querySelector<HTMLFormElement>("#new-file-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#new-file-path")!;
  const error = document.querySelector<HTMLParagraphElement>("#new-file-error")!;
  const normalized = normalizeProjectPath(input.value);
  if (!normalized.ok) { error.textContent = normalized.error; return; }
  const path = normalized.path;
  if (projectFiles.some((file) => file.path === path)) { error.textContent = "That file already exists."; return; }
  const content = /\.(cpp|cc|cxx)$/i.test(path) ? "#include <iostream>\n\nint main() {\n    std::cout << \"Hello\\n\";\n}\n" : /\.(h|hpp|hxx)$/i.test(path) ? "#pragma once\n" : "";
  projectFiles.push({ path, content });
  persistProject();
  newFileDialog.close();
  switchFile(path);
});

renderFileTree();
switchFile(activePath);
updateCursor(editor);
updateFileMeta();
renderOutput();
window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason instanceof Error ? event.reason.message : "An unexpected error occurred.";
  showToast(message, "error");
});
window.addEventListener("beforeunload", () => runtime.dispose());
