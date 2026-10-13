import { basicSetup } from "codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap, EditorView, lineNumbers } from "@codemirror/view";
import { getCM, Vim, vim } from "@replit/codemirror-vim";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  AlignLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  House,
  Image as ImageIcon,
  Info,
  Keyboard,
  Maximize2,
  Minimize2,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Rows2,
  Search,
  Square,
  Terminal,
  Trash2,
  Upload,
  createIcons,
} from "lucide";
import { parseProgramArgs } from "./lib/args";
import {
  findEntryFile,
  loadStoredProject,
  normalizeProjectPath,
  projectFileByteLength,
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
const FOLDER_STORAGE_KEY = "local-cpp-lab:folders-v1";
const VIM_STORAGE_KEY = "local-cpp-lab:vim-enabled";
const EDITOR_TABS_STORAGE_KEY = "local-cpp-lab:editor-tabs-v1";
const EDITOR_LAYOUT_STORAGE_KEY = "local-cpp-lab:editor-layout-v1";
const PREFERENCES_STORAGE_KEY = "local-cpp-lab:preferences-v1";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

function renderEditorApp() {
app!.innerHTML = `
  <div class="shell app-frame">
    <aside class="site-sidebar" aria-label="Website navigation">
      <a class="site-brand" href="/welcome" aria-label="Local C++ Lab landing page"><span class="site-brand-mark">C++</span><span class="site-nav-label">Local C++ Lab</span></a>
      <nav class="site-navigation">
        <a class="site-nav-item active" href="/" aria-current="page"><i data-lucide="code-2"></i><span class="site-nav-label">Editor</span></a>
        <a class="site-nav-item" href="/labs/sqlite"><span>SQL</span><span class="site-nav-label">SQLite Lab</span></a>
        <a class="site-nav-item" href="/labs/duckdb"><span>DB</span><span class="site-nav-label">DuckDB Lab</span></a>
        <a class="site-nav-item" href="/labs/pglite"><span>PG</span><span class="site-nav-label">PGlite Lab</span></a>
        <a class="site-nav-item" href="/welcome"><i data-lucide="house"></i><span class="site-nav-label">Landing</span></a>
        <button class="site-nav-item" id="nav-shortcuts-button"><i data-lucide="keyboard"></i><span class="site-nav-label">Shortcuts</span></button>
      </nav>
      <button class="site-nav-item site-nav-collapse" id="site-nav-toggle" aria-label="Collapse website navigation" aria-pressed="true"><i data-lucide="panel-left-close"></i><span class="site-nav-label">Collapse</span></button>
    </aside>
    <main class="workspace">
      <section class="ide-card">
        <div class="ide-toolbar">
          <div class="toolbar-sidebar">
            <button class="chrome-button" id="explorer-toggle" aria-label="Toggle file explorer" aria-pressed="true"><i data-lucide="panel-left-close"></i></button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="editor-toolbar">
            <div class="editor-tabs" id="editor-tabs" role="tablist" aria-label="Open files"></div>
            <button class="chrome-button split-button" id="split-right-button" aria-label="Split editor right" title="Split editor right"><i data-lucide="columns-2"></i></button><button class="chrome-button split-button" id="split-down-button" aria-label="Split editor down" title="Split editor down"><i data-lucide="rows-2"></i></button><button class="chrome-button format-button" id="format-button" aria-label="Format document" title="Format document · ⇧⌥F"><i data-lucide="align-left"></i></button>
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
              <button class="run-button" id="run-button"><i data-lucide="play"></i><span>Run</span><kbd>⌘↵</kbd></button>
            </div>
          </div>
        </div>

        <div class="panes">
          <aside class="file-explorer">
            <div class="explorer-heading"><span>Explorer <b id="file-count"></b></span><div class="explorer-actions"><button id="import-button" aria-label="Import files" title="Import files"><i data-lucide="upload"></i></button><button id="new-folder-button" aria-label="New folder" title="New folder"><i data-lucide="folder-plus"></i></button><button id="new-file-button" aria-label="New file" title="New file"><i data-lucide="plus"></i></button></div></div>
            <label class="file-filter"><i data-lucide="search"></i><input id="file-filter" type="search" aria-label="Filter files" placeholder="Filter files" autocomplete="off" /></label>
            <div id="file-tree" class="file-tree"></div>
            <button class="mount-label" id="workspace-root" data-drop-folder="" title="Select the workspace root or drop an item here"><i data-lucide="folder"></i><span>Mounted at <b>/workspace</b></span></button>
          </aside>
          <div class="column-resizer" id="sidebar-resizer" role="separator" aria-label="Resize file explorer" aria-orientation="vertical" tabindex="0"></div>

          <div class="workbench">
            <div class="code-area">
              <div class="editor-grid" id="editor-grid"><section class="editor-pane active" data-editor-pane="pane-1"><div class="pane-title"><span data-pane-title></span><button class="pane-close" data-close-pane aria-label="Close editor pane" title="Close pane">×</button></div><div class="editor-host" id="editor"></div><div class="markdown-resizer" data-markdown-resizer role="separator" aria-label="Resize Markdown preview" aria-orientation="vertical" tabindex="0" hidden></div><article class="markdown-preview" data-markdown-preview tabindex="0" hidden></article></section></div>
              <div class="editor-status"><span id="cursor-position">Ln 1, Col 1</span><span id="file-size">0 B</span><span class="desktop-only">UTF-8</span><span class="desktop-only">Spaces: 4</span><button id="markdown-preview-toggle" aria-label="Preview Markdown" aria-pressed="false" hidden><i data-lucide="eye"></i><span>Preview</span></button><label class="theme-picker"><span class="sr-only">Color theme</span><select id="theme-select" aria-label="Color theme"><option value="local">Local Lab</option><option value="catppuccin-latte">Catppuccin Latte</option><option value="catppuccin-frappe">Catppuccin Frappé</option><option value="catppuccin-macchiato">Catppuccin Macchiato</option><option value="catppuccin-mocha">Catppuccin Mocha</option></select></label><button id="format-on-save-toggle" aria-label="Enable format on save" aria-pressed="false"><i data-lucide="align-left"></i><span>Format on save</span></button><button id="vim-toggle" aria-label="Enable Vim mode" aria-pressed="false"><i data-lucide="keyboard"></i><span>Vim</span></button><button id="panel-toggle" aria-label="Toggle bottom panel" aria-pressed="true"><i data-lucide="panel-bottom-close"></i><span>Panel</span></button><button id="zen-toggle" aria-label="Enter Zen mode" aria-pressed="false"><i data-lucide="maximize-2"></i><span>Zen</span></button></div>
            </div>
            <div class="row-resizer" id="panel-resizer" role="separator" aria-label="Resize bottom panel" aria-orientation="horizontal" tabindex="0"></div>
            <div class="io-pane">
              <div class="pane-heading output-heading">
                <div class="output-tabs" role="tablist" aria-label="Bottom panel">
                  <button class="output-tab active" data-output-tab="output" role="tab" aria-selected="true">Output</button>
                  <button class="output-tab" data-output-tab="diagnostics" role="tab" aria-selected="false">Problems <span id="diagnostic-count"></span></button>
                  <button class="output-tab" data-output-tab="input" role="tab" aria-selected="false">Input <span class="input-ready-dot" id="input-ready-dot"></span></button>
                </div>
                <div class="panel-actions"><button class="clear-button" id="copy-output-button" title="Copy output"><i data-lucide="copy"></i><span>Copy</span></button><button class="clear-button" id="clear-button">Clear</button><button class="clear-button icon-only" id="panel-close-button" aria-label="Close panel"><i data-lucide="panel-bottom-close"></i></button></div>
              </div>
              <div class="panel-body">
                <div class="terminal-wrap" id="result-panel">
                  <div class="empty-output" id="empty-output">
                    <i data-lucide="terminal"></i>
                    <p>Ready to run.</p>
                    <span>Press ⌘↵ to compile and execute this project.</span>
                  </div>
                  <pre id="output" aria-live="polite"></pre>
                </div>
                <div class="input-panel" id="input-panel" hidden>
                  <label class="input-field argv-row"><span>Arguments</span><div><code>$ ./main</code><input id="argv" aria-label="Program arguments" value="/workspace/data/numbers.txt" placeholder="e.g. --verbose data/input.txt" /></div></label>
                  <label class="input-field stdin-field"><span>Standard input <small>Passed to stdin when the program runs</small></span><textarea id="stdin" spellcheck="false" aria-label="Standard input" placeholder="Type program input here…"></textarea></label>
                </div>
              </div>
              <div class="run-meta" id="run-meta">
                <span class="status-indicator idle"></span><span id="status-text">Idle</span>
                <span class="save-state"><i data-lucide="check"></i><span id="save-status">Saved locally</span></span>
                <span class="sandbox-note"><strong>Browser-safe sandbox.</strong> Project files never leave this browser.</span>
                <span class="meta-spacer"></span>
                <div class="status-actions"><button id="capabilities-button" class="icon-only" aria-label="About capabilities and limitations" title="Capabilities and limitations"><i data-lucide="info"></i></button><button id="shortcuts-button"><i data-lucide="keyboard"></i><span>Shortcuts</span></button><button id="download-button"><i data-lucide="download"></i><span>Download current file</span></button></div>
                <span id="timing-text">—</span>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  </div>

  <input id="file-import" type="file" multiple hidden />

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <dialog id="new-file-dialog" class="small-dialog">
    <button class="dialog-close" data-close-dialog="new-file-dialog" aria-label="Close">×</button>
    <p class="eyebrow">Project filesystem</p>
    <h2>Create a file</h2>
    <form id="new-file-form">
      <p class="form-context" id="new-file-context"></p>
      <label>Path inside /workspace<input id="new-file-path" required autocomplete="off" placeholder="include/helpers.hpp" /></label>
      <p class="form-error" id="new-file-error"></p>
      <div class="dialog-actions"><button type="button" class="secondary-button" data-close-dialog="new-file-dialog">Cancel</button><button type="submit" class="primary-button">Create file</button></div>
    </form>
  </dialog>

  <dialog id="new-folder-dialog" class="small-dialog">
    <button class="dialog-close" data-close-dialog="new-folder-dialog" aria-label="Close">×</button>
    <p class="eyebrow">Project filesystem</p>
    <h2>Create a folder</h2>
    <form id="new-folder-form">
      <p class="form-context" id="new-folder-context"></p>
      <label>Path inside /workspace<input id="new-folder-path" required autocomplete="off" placeholder="include/utils" /></label>
      <p class="form-error" id="new-folder-error"></p>
      <div class="dialog-actions"><button type="button" class="secondary-button" data-close-dialog="new-folder-dialog">Cancel</button><button type="submit" class="primary-button">Create folder</button></div>
    </form>
  </dialog>

  <dialog id="rename-item-dialog" class="small-dialog">
    <button class="dialog-close" data-close-dialog="rename-item-dialog" aria-label="Close">×</button>
    <p class="eyebrow">Project filesystem</p>
    <h2 id="rename-item-title">Rename or move</h2>
    <form id="rename-item-form">
      <input id="rename-source-path" type="hidden" /><input id="rename-source-kind" type="hidden" />
      <label>Path inside /workspace<input id="rename-item-path" required autocomplete="off" /></label>
      <p class="form-help">Change the parent path to move this item.</p>
      <p class="form-error" id="rename-item-error"></p>
      <div class="dialog-actions"><button type="button" class="secondary-button" data-close-dialog="rename-item-dialog">Cancel</button><button type="submit" class="primary-button">Save changes</button></div>
    </form>
  </dialog>

  <dialog id="quick-open-dialog" class="quick-open-dialog">
    <label class="quick-open-search"><i data-lucide="search"></i><input id="quick-open-input" autocomplete="off" placeholder="Search files by name…" aria-label="Search files" /></label>
    <div id="quick-open-results" class="quick-open-results"></div>
    <p class="quick-open-help"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></p>
  </dialog>

  <dialog id="shortcuts-dialog" class="small-dialog shortcuts-dialog">
    <button class="dialog-close" data-close-dialog="shortcuts-dialog" aria-label="Close">×</button>
    <p class="eyebrow">Keyboard shortcuts</p>
    <h2>Move faster</h2>
    <div class="shortcut-list"><span>Save current file</span><kbd>⌘ S</kbd><span>Format document</span><kbd>⇧ ⌥ F</kbd><span>Run or stop project</span><kbd>⌘ Enter</kbd><span>Go to file</span><kbd>⌘ P</kbd><span>Toggle website navigation</span><kbd>⌘ ⇧ B</kbd><span>Toggle explorer</span><kbd>⌘ B</kbd><span>Toggle bottom panel</span><kbd>⌘ J</kbd><span>Toggle Vim mode</span><kbd>⌘ ⌥ V</kbd><span>Toggle Zen mode</span><kbd>⌘ ⌥ Z</kbd></div>
  </dialog>

  <dialog id="capabilities-dialog" class="capabilities-dialog">
    <button class="dialog-close" data-close-dialog="capabilities-dialog" aria-label="Close">×</button>
    <div class="dialog-icon"><i data-lucide="info"></i></div>
    <p class="eyebrow">Browser C++ workspace</p>
    <h2>What this editor can do</h2>
    <p>Compilation and execution happen locally in this browser through Clang and WASI. Project files are saved in this browser and are not uploaded to a compilation server.</p>
    <div class="capability-grid">
      <div class="supported">
        <b>Supported</b>
        <span>Compile and run C++11 through C++23</span>
        <span>Use headers and files inside <code>/workspace</code></span>
        <span>Pass stdin and command-line arguments</span>
        <span>Create, import, rename, move, and download files</span>
        <span>Edit Markdown with Mermaid diagrams</span>
      </div>
      <div class="limited">
        <b>Current limitations</b>
        <span>One <code>.cpp</code> entry point is compiled at a time</span>
        <span>No native threads, C++ exceptions, sockets, or dynamic libraries</span>
        <span>No direct access to your host filesystem</span>
        <span>Imported files are copies, not live-synced originals</span>
        <span>Large compiler assets make the first load slower</span>
      </div>
    </div>
    <p class="dialog-note"><strong>Storage limits:</strong> up to 100 files, 512 KB per file, and 2 MB total project content. Browser storage can be cleared by private browsing, site-data cleanup, or browser policy.</p>
  </dialog>
`;

const ICONS = { AlignLeft, Check, ChevronDown, ChevronRight, Code2, Columns2, Copy, Download, Eye, FileCode2, FileText, Folder, FolderPlus, House, Image: ImageIcon, Info, Keyboard, Maximize2, Minimize2, PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, Pencil, Play, Plus, RotateCcw, Rows2, Search, Square, Terminal, Trash2, Upload };
createIcons({ icons: ICONS });

function cloneDefaults() {
  return DEFAULT_FILES.map((file) => ({ ...file }));
}

function loadStoredFolders(storage: Storage) {
  try {
    const value = JSON.parse(storage.getItem(FOLDER_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return new Set<string>();
    return new Set(value.flatMap((path) => {
      if (typeof path !== "string") return [];
      const normalized = normalizeProjectPath(path);
      return normalized.ok ? [normalized.path] : [];
    }));
  } catch {
    return new Set<string>();
  }
}

function loadStoredEditorTabs(storage: Storage, files: ProjectFile[]) {
  const availablePaths = new Set(files.map((file) => file.path));
  const fallback = files.find((file) => file.path === "main.cpp")?.path || files[0].path;
  try {
    const value = JSON.parse(storage.getItem(EDITOR_TABS_STORAGE_KEY) || "null") as { paths?: unknown; activePath?: unknown; secondaryPath?: unknown } | null;
    const paths = Array.isArray(value?.paths)
      ? Array.from(new Set(value.paths.filter((path): path is string => typeof path === "string" && availablePaths.has(path))))
      : [];
    if (!paths.length) paths.push(fallback);
    const activePath = typeof value?.activePath === "string" && paths.includes(value.activePath) ? value.activePath : paths[0];
    const secondaryPath = typeof value?.secondaryPath === "string" && availablePaths.has(value.secondaryPath) ? value.secondaryPath : null;
    return { paths, activePath, secondaryPath };
  } catch {
    return { paths: [fallback], activePath: fallback, secondaryPath: null };
  }
}

type ThemeId = "local" | "catppuccin-latte" | "catppuccin-frappe" | "catppuccin-macchiato" | "catppuccin-mocha";

type StoredPreferences = {
  standard: CppStandard;
  optimization: WorkerRequest["optimization"];
  stdin: string;
  argv: string;
  explorerOpen: boolean;
  panelOpen: boolean;
  navigationOpen: boolean;
  theme: ThemeId;
  sidebarWidth: number;
  panelHeight: number;
  editorSplitRatio: number;
  markdownSplitRatio: number;
  formatOnSave: boolean;
  collapsedFolders: string[];
};

function loadStoredPreferences(storage: Storage): StoredPreferences {
  const mobile = window.matchMedia("(max-width: 680px)").matches;
  const defaults: StoredPreferences = { standard: "c++20", optimization: "2", stdin: "", argv: "/workspace/data/numbers.txt", explorerOpen: !mobile, panelOpen: true, navigationOpen: !mobile, theme: "local", sidebarWidth: 218, panelHeight: 230, editorSplitRatio: .5, markdownSplitRatio: .5, formatOnSave: false, collapsedFolders: [] };
  try {
    const value = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) || "null") as Partial<StoredPreferences> | null;
    if (!value) return defaults;
    return {
      standard: ["c++23", "c++20", "c++17", "c++14", "c++11"].includes(value.standard || "") ? value.standard! : defaults.standard,
      optimization: ["0", "2", "3", "s"].includes(value.optimization || "") ? value.optimization! : defaults.optimization,
      stdin: typeof value.stdin === "string" ? value.stdin : defaults.stdin,
      argv: typeof value.argv === "string" ? value.argv : defaults.argv,
      explorerOpen: typeof value.explorerOpen === "boolean" ? value.explorerOpen : defaults.explorerOpen,
      panelOpen: typeof value.panelOpen === "boolean" ? value.panelOpen : defaults.panelOpen,
      navigationOpen: typeof value.navigationOpen === "boolean" ? value.navigationOpen : defaults.navigationOpen,
      theme: ["local", "catppuccin-latte", "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-mocha"].includes(value.theme || "") ? value.theme! : defaults.theme,
      sidebarWidth: typeof value.sidebarWidth === "number" ? Math.max(150, Math.min(340, value.sidebarWidth)) : defaults.sidebarWidth,
      panelHeight: typeof value.panelHeight === "number" ? Math.max(150, value.panelHeight) : defaults.panelHeight,
      editorSplitRatio: typeof value.editorSplitRatio === "number" ? Math.max(.2, Math.min(.8, value.editorSplitRatio)) : defaults.editorSplitRatio,
      markdownSplitRatio: typeof value.markdownSplitRatio === "number" ? Math.max(.2, Math.min(.8, value.markdownSplitRatio)) : defaults.markdownSplitRatio,
      formatOnSave: typeof value.formatOnSave === "boolean" ? value.formatOnSave : defaults.formatOnSave,
      collapsedFolders: Array.isArray(value.collapsedFolders) ? value.collapsedFolders.filter((path): path is string => typeof path === "string") : [],
    };
  } catch {
    return defaults;
  }
}

let projectFiles = loadStoredProject(localStorage, STORAGE_KEY, DEFAULT_FILES);
let projectFolders = loadStoredFolders(localStorage);
const storedEditorTabs = loadStoredEditorTabs(localStorage, projectFiles);
const storedPreferences = loadStoredPreferences(localStorage);
let openPaths = storedEditorTabs.paths;
let activePath = storedEditorTabs.activePath;
let currentDirectory = activePath.includes("/") ? activePath.slice(0, activePath.lastIndexOf("/")) : "";
let suppressEditorSave = false;
const runtime = new CompilerRuntime();
let running = false;
let lastResult = { output: "", diagnostics: "" };
type PanelTab = "output" | "diagnostics" | "input";
let visibleTab: PanelTab = "output";
let toastTimer: number | undefined;
let quickOpenIndex = 0;
let explorerOpen = storedPreferences.explorerOpen;
let panelOpen = storedPreferences.panelOpen;
let navigationOpen = storedPreferences.navigationOpen;
let colorTheme = storedPreferences.theme;
let sidebarWidth = storedPreferences.sidebarWidth;
let panelHeight = storedPreferences.panelHeight;
let editorSplitRatio = storedPreferences.editorSplitRatio;
let markdownSplitRatio = storedPreferences.markdownSplitRatio;
let formatOnSave = storedPreferences.formatOnSave;
let zenMode = false;
let vimEnabled = localStorage.getItem(VIM_STORAGE_KEY) === "true";
const collapsedFolders = new Set(storedPreferences.collapsedFolders);
let draggedPath: string | null = null;
let draggedKind: "file" | "folder" | null = null;

function rememberParentFolders(path: string) {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) projectFolders.add(parts.slice(0, index).join("/"));
}

projectFiles.forEach((file) => rememberParentFolders(file.path));

const runKeymap = keymap.of([
  { key: "Mod-Enter", run: () => { void runCode(); return true; } },
  { key: "Mod-s", run: () => { void saveActiveFile(); return true; } },
  { key: "Shift-Alt-f", run: () => { void formatDocument(activeEditorPane); return true; } },
]);
type EditorPane = {
  id: string;
  path: string;
  container: HTMLElement;
  view: EditorView;
  editableConfig: Compartment;
  languageConfig: Compartment;
  vimConfig: Compartment;
  preview: HTMLElement;
  previewMode: boolean;
  viewingImage: boolean;
  previewObjectUrls: string[];
  previewRevision: number;
  previewTimer?: number;
};

const editorPanes: EditorPane[] = [];
let activeEditorPane: EditorPane;
let editor: EditorView;

function paneForView(view: EditorView) {
  return editorPanes.find((pane) => pane.view === view);
}

function isMarkdownPath(path: string) {
  return /\.md$/i.test(path);
}

function mimeTypeForPath(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif" } as Record<string, string>)[extension || ""] || "application/octet-stream";
}

function isImageFile(file: ProjectFile) {
  return file.mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(file.path);
}

function editableContent(file: ProjectFile) {
  return file.encoding === "base64" ? "" : file.content;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fileBlob(file: ProjectFile) {
  const value = file.encoding === "base64" ? decodeBase64(file.content) : file.content;
  return new Blob([value], { type: file.mimeType || mimeTypeForPath(file.path) });
}

function resolveProjectReference(fromPath: string, reference: string) {
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference || /^(?:[a-z]+:|\/\/|#)/i.test(reference)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(cleanReference); } catch { return null; }
  const parts = decoded.startsWith("/") ? [] : fromPath.split("/").slice(0, -1);
  for (const part of decoded.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}

function languageForPath(path: string) {
  if (isMarkdownPath(path)) return markdown();
  if (/\.(cpp|cc|cxx|h|hpp|hxx)$/i.test(path)) return cpp();
  return [];
}

function applyMarkdownSplitRatio(ratio: number) {
  markdownSplitRatio = Math.max(.2, Math.min(.8, ratio));
  document.querySelectorAll<HTMLElement>(".editor-pane").forEach((pane) => pane.style.setProperty("--markdown-split-ratio", `${markdownSplitRatio * 100}%`));
  document.querySelectorAll<HTMLElement>("[data-markdown-resizer]").forEach((handle) => handle.setAttribute("aria-valuenow", String(Math.round(markdownSplitRatio * 100))));
  requestAnimationFrame(requestEditorMeasure);
}

function createEditorPane(id: string, path: string, container: HTMLElement, host: HTMLElement) {
  const editableConfig = new Compartment();
  const languageConfig = new Compartment();
  const vimConfig = new Compartment();
  const preview = container.querySelector<HTMLElement>("[data-markdown-preview]")!;
  const target = projectFiles.find((file) => file.path === path) || projectFiles[0];
  const view = new EditorView({
    state: EditorState.create({
      doc: editableContent(target),
      extensions: [
        vimConfig.of(vimEnabled ? vim({ status: true }) : []),
        basicSetup,
        lineNumbers(),
        languageConfig.of(languageForPath(target.path)),
        runKeymap,
        editableConfig.of(EditorView.editable.of(!running)),
        EditorView.lineWrapping,
        EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto" } }),
        EditorView.updateListener.of((update) => {
          const pane = paneForView(update.view);
          if (update.docChanged && !suppressEditorSave && pane) {
            const file = projectFiles.find((entry) => entry.path === pane.path);
            if (file && file.encoding !== "base64") {
              file.content = update.state.doc.toString();
              persistProject();
            }
            if (pane.previewMode) renderMarkdownPreview(pane);
            if (pane === activeEditorPane) {
              markChanged();
              updateFileMeta();
            }
          }
          if ((update.selectionSet || update.docChanged) && pane === activeEditorPane) updateCursor(update.view);
        }),
      ],
    }),
    parent: host,
  });
  const pane: EditorPane = { id, path: target.path, container, view, editableConfig, languageConfig, vimConfig, preview, previewMode: false, viewingImage: false, previewObjectUrls: [], previewRevision: 0 };
  editorPanes.push(pane);
  container.style.setProperty("--markdown-split-ratio", `${markdownSplitRatio * 100}%`);
  const previewResizer = container.querySelector<HTMLElement>("[data-markdown-resizer]")!;
  previewResizer.setAttribute("aria-valuemin", "20");
  previewResizer.setAttribute("aria-valuemax", "80");
  previewResizer.setAttribute("aria-valuenow", String(Math.round(markdownSplitRatio * 100)));
  makeResizable(previewResizer, (event) => {
    const bounds = container.getBoundingClientRect();
    applyMarkdownSplitRatio((event.clientX - bounds.left) / bounds.width);
  }, persistPreferences);
  previewResizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    applyMarkdownSplitRatio(markdownSplitRatio + (event.key === "ArrowRight" ? .03 : -.03));
    persistPreferences();
  });
  container.querySelector<HTMLButtonElement>("[data-close-pane]")!.addEventListener("click", (event) => {
    event.stopPropagation();
    closeEditorPane(pane);
  });
  syncPanePresentation(pane, target);
  const activate = () => activateEditorPane(pane, false);
  container.addEventListener("pointerdown", activate);
  view.dom.addEventListener("focusin", activate);
  view.dom.addEventListener("keydown", (event) => {
    if (!vimEnabled || (event.key !== "Escape" && event.key !== "Esc")) return;
    exitVimToNormalMode(view);
    event.preventDefault();
    event.stopImmediatePropagation();
    view.focus();
  }, true);
  return pane;
}

function requestEditorMeasure() {
  editorPanes.forEach((pane) => pane.view.requestMeasure());
}

function activateEditorPane(pane: EditorPane, shouldFocus = true) {
  if (!editorPanes.includes(pane)) return;
  activeEditorPane = pane;
  editor = pane.view;
  activePath = pane.path;
  currentDirectory = activePath.includes("/") ? activePath.slice(0, activePath.lastIndexOf("/")) : "";
  editorPanes.forEach((entry) => entry.container.classList.toggle("active", entry === pane));
  persistEditorTabs();
  renderEditorTabs();
  renderFileTree();
  updateCursor(editor);
  updateFileMeta();
  syncMarkdownPreviewUi();
  syncFormatterUi();
  if (shouldFocus) {
    if (pane.viewingImage) pane.preview.focus();
    else editor.focus();
  }
}

const primaryContainer = document.querySelector<HTMLElement>("[data-editor-pane='pane-1']")!;
const primaryPane = createEditorPane("pane-1", activePath, primaryContainer, document.querySelector<HTMLDivElement>("#editor")!);
activeEditorPane = primaryPane;
editor = primaryPane.view;

type SplitDirection = "vertical" | "horizontal";
type EditorLayoutNode =
  | { type: "pane"; paneId: string }
  | { type: "split"; direction: SplitDirection; ratio: number; first: EditorLayoutNode; second: EditorLayoutNode };
type StoredEditorLayoutNode =
  | { type: "pane"; paneId: string; path: string }
  | { type: "split"; direction: SplitDirection; ratio: number; first: StoredEditorLayoutNode; second: StoredEditorLayoutNode };

let editorLayout: EditorLayoutNode = { type: "pane", paneId: primaryPane.id };
let paneIdCounter = 1;

function exitVimToNormalMode(targetEditor = editor) {
  if (!vimEnabled) return false;
  const cm = getCM(targetEditor);
  const state = cm?.state.vim;
  if (!cm) return false;

  const hadSelection = !targetEditor.state.selection.main.empty;
  const wasVisualMode = Boolean(state?.visualMode);
  const changedVimMode = Boolean(state?.insertMode || state?.visualMode || cm.state.dialog);
  if (changedVimMode) Vim.handleKey(cm, "<Esc>", "user");

  const clearVisualSelection = () => {
    const selection = targetEditor.state.selection.main;
    if (!selection.empty) targetEditor.dispatch({ selection: { anchor: selection.head } });
  };

  clearVisualSelection();
  targetEditor.focus();
  if (wasVisualMode || hadSelection) {
    // The Vim adapter can finish a linewise selection update after its key handler.
    // Clear and focus once more on the next frame so Escape cannot leave a stale
    // highlight or send the following j/k keypress to the page instead of Vim.
    requestAnimationFrame(() => {
      clearVisualSelection();
      targetEditor.focus();
    });
  }
  return changedVimMode || hadSelection;
}

Vim.defineEx("write", "w", () => {
  void saveActiveFile();
});
Vim.defineEx("format", "for", () => { void formatDocument(activeEditorPane); });

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
const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select")!;
standardSelect.value = storedPreferences.standard;
optimizationSelect.value = storedPreferences.optimization;
themeSelect.value = colorTheme;
stdin.value = storedPreferences.stdin;
argvInput.value = storedPreferences.argv;
document.querySelector<HTMLElement>(".ide-card")!.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
document.querySelector<HTMLElement>(".workbench")!.style.setProperty("--panel-height", `${panelHeight}px`);

function persistPreferences() {
  try {
    const value: StoredPreferences = {
      standard: standardSelect.value as CppStandard,
      optimization: optimizationSelect.value as WorkerRequest["optimization"],
      stdin: stdin.value,
      argv: argvInput.value,
      explorerOpen,
      panelOpen,
      navigationOpen,
      theme: colorTheme,
      sidebarWidth,
      panelHeight,
      editorSplitRatio,
      markdownSplitRatio,
      formatOnSave,
      collapsedFolders: Array.from(collapsedFolders),
    };
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    showToast("Editor preferences could not be saved in this browser.", "error");
  }
}

function currentFile() {
  return projectFiles.find((file) => file.path === activePath) || projectFiles[0];
}

type FormatResult = "changed" | "unchanged" | "unsupported" | "error";
const FORMAT_PATH_PATTERN = /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|ino|java|js|mjs|cjs|ts|json|m|mm|proto|cs)$/i;
const DEFAULT_CLANG_FORMAT_STYLE = JSON.stringify({ BasedOnStyle: "LLVM", IndentWidth: 4, TabWidth: 4, UseTab: "Never", ColumnLimit: 100, SortIncludes: "Never" });
let formatterModule: Promise<typeof import("@wasm-fmt/clang-format/vite")> | null = null;
let formatterBusy = false;

function canFormatPath(path: string) {
  const file = projectFiles.find((entry) => entry.path === path);
  return Boolean(file && file.encoding !== "base64" && FORMAT_PATH_PATTERN.test(path));
}

function syncFormatterUi() {
  const button = document.querySelector<HTMLButtonElement>("#format-button");
  if (!button || !activeEditorPane) return;
  const supported = canFormatPath(activeEditorPane.path);
  button.disabled = running || formatterBusy || !supported;
  button.setAttribute("aria-label", supported ? `Format ${activeEditorPane.path}` : "Formatting is unavailable for this file type");
  button.title = supported ? "Format document · ⇧⌥F" : "Formatting supports C, C++, and related source files";
}

function syncFormatOnSaveUi() {
  const button = document.querySelector<HTMLButtonElement>("#format-on-save-toggle")!;
  button.setAttribute("aria-pressed", String(formatOnSave));
  button.setAttribute("aria-label", formatOnSave ? "Disable format on save" : "Enable format on save");
  button.title = `${formatOnSave ? "Enabled" : "Disabled"} · Formats supported files when you press ⌘S or use :w`;
}

function setFormatOnSave(enabled: boolean) {
  formatOnSave = enabled;
  syncFormatOnSaveUi();
  persistPreferences();
  showToast(`Format on save ${enabled ? "enabled" : "disabled"}.`);
}

async function loadFormatter() {
  formatterModule ||= import("@wasm-fmt/clang-format/vite").then(async (module) => {
    await module.default();
    return module;
  }).catch((error) => {
    formatterModule = null;
    throw error;
  });
  return formatterModule;
}

function cursorAfterFormatting(source: string, lineNumber: number, column: number) {
  const lines = source.split("\n");
  const index = Math.max(0, Math.min(lineNumber - 1, lines.length - 1));
  let offset = 0;
  for (let line = 0; line < index; line += 1) offset += lines[line].length + 1;
  return offset + Math.min(column, lines[index].length);
}

async function formatDocument(pane = activeEditorPane, announce = true): Promise<FormatResult> {
  if (!canFormatPath(pane.path)) {
    if (announce) showToast("Formatting is available for C, C++, and related source files.", "error");
    return "unsupported";
  }
  if (formatterBusy) {
    if (announce) showToast("The formatter is already running.");
    return "error";
  }
  const file = projectFiles.find((entry) => entry.path === pane.path)!;
  const source = pane.view.state.doc.toString();
  const position = pane.view.state.selection.main.head;
  const currentLine = pane.view.state.doc.lineAt(position);
  formatterBusy = true;
  syncFormatterUi();
  if (announce && !formatterModule) showToast("Loading the C++ formatter…");
  try {
    const module = await loadFormatter();
    const projectStyle = projectFiles.find((entry) => entry.path === ".clang-format" && entry.encoding !== "base64")?.content;
    const formatted = module.format(source, file.path, projectStyle || DEFAULT_CLANG_FORMAT_STYLE);
    if (formatted === source) {
      if (announce) showToast("Document is already formatted.");
      return "unchanged";
    }
    pane.view.dispatch({
      changes: { from: 0, to: pane.view.state.doc.length, insert: formatted },
      selection: { anchor: cursorAfterFormatting(formatted, currentLine.number, position - currentLine.from) },
      userEvent: "input.format",
    });
    if (announce) showToast(`Formatted ${file.path}.`);
    return "changed";
  } catch (error) {
    showToast(error instanceof Error ? `Formatting failed: ${error.message}` : "Formatting failed.", "error");
    return "error";
  } finally {
    formatterBusy = false;
    syncFormatterUi();
  }
}

async function saveActiveFile() {
  const pane = activeEditorPane;
  const result = formatOnSave && canFormatPath(pane.path) ? await formatDocument(pane, false) : "unsupported";
  if (result === "error") return;
  const file = projectFiles.find((entry) => entry.path === pane.path);
  if (file && file.encoding !== "base64") file.content = pane.view.state.doc.toString();
  if (persistProject()) showToast(result === "changed" ? "Formatted and saved locally." : "Saved locally.");
}

function persistEditorTabs() {
  try {
    localStorage.setItem(EDITOR_TABS_STORAGE_KEY, JSON.stringify({ paths: openPaths, activePath }));
    persistEditorLayout();
  } catch {
    showToast("Open tabs could not be saved in this browser.", "error");
  }
}

function persistProject() {
  const result = saveStoredProject(localStorage, STORAGE_KEY, projectFiles);
  if (!result.ok) showToast(result.error, "error");
  else document.querySelector("#save-status")!.textContent = "Saved locally";
  return result.ok;
}

function persistFolders() {
  try {
    localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(Array.from(projectFolders).sort()));
    return true;
  } catch {
    showToast("Folder changes could not be saved in this browser.", "error");
    return false;
  }
}

function allProjectFolders() {
  const folders = new Set<string>();
  for (const path of [...projectFolders, ...projectFiles.map((file) => file.path)]) {
    const parts = path.split("/");
    const limit = projectFolders.has(path) ? parts.length : parts.length - 1;
    for (let index = 1; index <= limit; index += 1) folders.add(parts.slice(0, index).join("/"));
  }
  return folders;
}

let mermaidDiagramId = 0;
let mermaidPromise: Promise<(typeof import("mermaid"))["default"]> | null = null;

function clearPreviewObjectUrls(pane: EditorPane) {
  pane.previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  pane.previewObjectUrls = [];
}

function renderImagePreview(pane: EditorPane, file: ProjectFile) {
  clearPreviewObjectUrls(pane);
  pane.preview.replaceChildren();
  const figure = document.createElement("figure");
  const image = document.createElement("img");
  const caption = document.createElement("figcaption");
  const url = URL.createObjectURL(fileBlob(file));
  pane.previewObjectUrls.push(url);
  image.src = url;
  image.alt = file.path.split("/").at(-1) || file.path;
  caption.textContent = `/workspace/${file.path} · ${mimeTypeForPath(file.path)}`;
  figure.append(image, caption);
  pane.preview.append(figure);
}

function syncPanePresentation(pane: EditorPane, file: ProjectFile) {
  const viewingImage = isImageFile(file);
  pane.viewingImage = viewingImage;
  pane.container.classList.toggle("viewing-image", viewingImage);
  pane.preview.classList.toggle("image-preview", viewingImage);
  if (viewingImage) {
    pane.previewMode = false;
    pane.preview.hidden = false;
    pane.container.querySelector<HTMLElement>("[data-markdown-resizer]")!.hidden = true;
    renderImagePreview(pane, file);
    return;
  }
  clearPreviewObjectUrls(pane);
  pane.preview.classList.remove("image-preview");
  pane.preview.hidden = !pane.previewMode;
  pane.container.querySelector<HTMLElement>("[data-markdown-resizer]")!.hidden = !pane.previewMode;
}

function getMermaidEngine() {
  mermaidPromise ||= import("mermaid").then((module) => module.default);
  return mermaidPromise;
}

function configureMermaidTheme(engine: (typeof import("mermaid"))["default"]) {
  const styles = getComputedStyle(document.body);
  const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const isLatte = document.body.dataset.theme === "catppuccin-latte";
  engine.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    themeVariables: {
      darkMode: !isLatte,
      background: color("--ctp-base", "#111713"),
      primaryColor: color("--ctp-surface0", "#23342a"),
      primaryTextColor: color("--ctp-text", "#d6ddd8"),
      primaryBorderColor: color("--ctp-mauve", "#ef7443"),
      secondaryColor: color("--ctp-surface1", "#29322c"),
      tertiaryColor: color("--ctp-mantle", "#151b17"),
      lineColor: color("--ctp-overlay", "#87928a"),
      textColor: color("--ctp-text", "#d6ddd8"),
      noteBkgColor: color("--ctp-surface0", "#28312b"),
      noteTextColor: color("--ctp-text", "#d6ddd8"),
      noteBorderColor: color("--ctp-yellow", "#c39a5b"),
      fontFamily: "Inter, Avenir Next, system-ui, sans-serif",
    },
  });
}

async function renderMermaidDiagrams(pane: EditorPane, revision: number, diagrams: Array<{ holder: HTMLElement; source: string }>) {
  const engine = await getMermaidEngine();
  configureMermaidTheme(engine);
  for (const { holder, source } of diagrams) {
    if (revision !== pane.previewRevision || !holder.isConnected) return;
    try {
      const id = `mermaid-${++mermaidDiagramId}`;
      const { svg, bindFunctions } = await engine.render(id, source);
      if (revision !== pane.previewRevision || !holder.isConnected) return;
      holder.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
      holder.classList.remove("loading", "error");
      holder.setAttribute("role", "img");
      holder.setAttribute("aria-label", `Mermaid diagram: ${source.split("\n", 1)[0] || "diagram"}`);
      bindFunctions?.(holder);
    } catch (error) {
      if (revision !== pane.previewRevision || !holder.isConnected) return;
      holder.classList.remove("loading");
      holder.classList.add("error");
      const message = error instanceof Error ? error.message.split("\n", 1)[0] : "Invalid Mermaid diagram";
      holder.textContent = `Diagram error: ${message}`;
    }
  }
}

function renderMarkdownPreview(pane: EditorPane) {
  window.clearTimeout(pane.previewTimer);
  pane.previewRevision += 1;
  clearPreviewObjectUrls(pane);
  if (!isMarkdownPath(pane.path)) {
    pane.preview.replaceChildren();
    return;
  }
  const rendered = marked.parse(pane.view.state.doc.toString(), { async: false, gfm: true }) as string;
  pane.preview.innerHTML = DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } });
  pane.preview.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  pane.preview.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const path = resolveProjectReference(pane.path, image.getAttribute("src") || "");
    const file = path ? projectFiles.find((entry) => entry.path === path && isImageFile(entry)) : null;
    if (!file) return;
    const url = URL.createObjectURL(fileBlob(file));
    pane.previewObjectUrls.push(url);
    image.src = url;
    image.title ||= `/workspace/${file.path}`;
  });
  const diagrams = Array.from(pane.preview.querySelectorAll<HTMLElement>("pre > code.language-mermaid")).map((code) => {
    const holder = document.createElement("div");
    holder.className = "mermaid-diagram loading";
    holder.textContent = "Rendering diagram…";
    const source = code.textContent || "";
    code.parentElement?.replaceWith(holder);
    return { holder, source };
  });
  if (diagrams.length) {
    const revision = pane.previewRevision;
    pane.previewTimer = window.setTimeout(() => void renderMermaidDiagrams(pane, revision, diagrams), 120);
  }
}

function syncMarkdownPreviewUi() {
  const button = document.querySelector<HTMLButtonElement>("#markdown-preview-toggle");
  if (!button || !activeEditorPane) return;
  const supported = isMarkdownPath(activeEditorPane.path);
  button.hidden = !supported;
  button.setAttribute("aria-pressed", String(supported && activeEditorPane.previewMode));
  button.setAttribute("aria-label", activeEditorPane.previewMode ? "Hide Markdown preview" : "Show Markdown preview beside editor");
  button.innerHTML = `<i data-lucide="eye"></i><span>${activeEditorPane.previewMode ? "Hide preview" : "Preview"}</span>`;
  createIcons({ icons: ICONS });
}

function setMarkdownPreview(pane: EditorPane, enabled: boolean) {
  pane.previewMode = isMarkdownPath(pane.path) && enabled;
  if (!pane.previewMode) {
    window.clearTimeout(pane.previewTimer);
    pane.previewRevision += 1;
  }
  pane.container.classList.toggle("previewing-markdown", pane.previewMode);
  pane.preview.hidden = !pane.previewMode;
  pane.container.querySelector<HTMLElement>("[data-markdown-resizer]")!.hidden = !pane.previewMode;
  if (pane.previewMode) {
    renderMarkdownPreview(pane);
  }
  pane.view.focus();
  requestAnimationFrame(() => pane.view.requestMeasure());
  renderEditorPanes();
}

function renderEditorPanes() {
  const grid = document.querySelector<HTMLDivElement>("#editor-grid")!;
  grid.classList.toggle("multi-pane", editorPanes.length > 1);
  grid.replaceChildren(buildEditorLayoutElement(editorLayout));
  editorPanes.forEach((pane) => {
    const title = pane.container.querySelector<HTMLElement>("[data-pane-title]");
    if (title) title.textContent = `${pane.path}${pane.previewMode ? " · Preview" : ""}`;
    const close = pane.container.querySelector<HTMLButtonElement>("[data-close-pane]")!;
    close.hidden = editorPanes.length === 1;
    close.setAttribute("aria-label", `Close pane ${pane.path}`);
  });
  syncMarkdownPreviewUi();
  requestAnimationFrame(requestEditorMeasure);
}

function createPaneContainer(id: string) {
  const container = document.createElement("section");
  container.className = "editor-pane";
  container.dataset.editorPane = id;
  container.innerHTML = `<div class="pane-title"><span data-pane-title></span><button class="pane-close" data-close-pane aria-label="Close editor pane" title="Close pane">×</button></div><div class="editor-host"></div><div class="markdown-resizer" data-markdown-resizer role="separator" aria-label="Resize Markdown preview" aria-orientation="vertical" tabindex="0" hidden></div><article class="markdown-preview" data-markdown-preview tabindex="0" hidden></article>`;
  return container;
}

function nextPaneId() {
  let id: string;
  do { id = `pane-${++paneIdCounter}`; } while (editorPanes.some((pane) => pane.id === id));
  return id;
}

function replacePaneInLayout(node: EditorLayoutNode, paneId: string, replacement: EditorLayoutNode): EditorLayoutNode {
  if (node.type === "pane") return node.paneId === paneId ? replacement : node;
  return { ...node, first: replacePaneInLayout(node.first, paneId, replacement), second: replacePaneInLayout(node.second, paneId, replacement) };
}

function removePaneFromLayout(node: EditorLayoutNode, paneId: string): EditorLayoutNode | null {
  if (node.type === "pane") return node.paneId === paneId ? null : node;
  const first = removePaneFromLayout(node.first, paneId);
  const second = removePaneFromLayout(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function firstPaneId(node: EditorLayoutNode): string {
  return node.type === "pane" ? node.paneId : firstPaneId(node.first);
}

function applyLayoutRatio(element: HTMLElement, node: Extract<EditorLayoutNode, { type: "split" }>) {
  element.style.setProperty("--layout-split-ratio", `${node.ratio * 100}%`);
}

function buildEditorLayoutElement(node: EditorLayoutNode): HTMLElement {
  if (node.type === "pane") return editorPanes.find((pane) => pane.id === node.paneId)?.container || primaryPane.container;
  const group = document.createElement("div");
  group.className = `split-group split-${node.direction}`;
  applyLayoutRatio(group, node);
  const separator = document.createElement("div");
  separator.className = `layout-resizer layout-resizer-${node.direction}`;
  separator.tabIndex = 0;
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-orientation", node.direction === "vertical" ? "vertical" : "horizontal");
  separator.setAttribute("aria-label", `Resize ${node.direction === "vertical" ? "left and right" : "top and bottom"} editor panes`);
  separator.setAttribute("aria-valuemin", "20");
  separator.setAttribute("aria-valuemax", "80");
  separator.setAttribute("aria-valuenow", String(Math.round(node.ratio * 100)));
  makeResizable(separator, (event) => {
    const bounds = group.getBoundingClientRect();
    const position = node.direction === "vertical" ? event.clientX - bounds.left : event.clientY - bounds.top;
    const size = node.direction === "vertical" ? bounds.width : bounds.height;
    node.ratio = Math.max(.2, Math.min(.8, position / size));
    if (node.direction === "vertical") editorSplitRatio = node.ratio;
    applyLayoutRatio(group, node);
    separator.setAttribute("aria-valuenow", String(Math.round(node.ratio * 100)));
    requestEditorMeasure();
  }, persistEditorTabs);
  separator.addEventListener("keydown", (event) => {
    const decrease = node.direction === "vertical" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const increase = node.direction === "vertical" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!decrease && !increase) return;
    event.preventDefault();
    node.ratio = Math.max(.2, Math.min(.8, node.ratio + (increase ? .03 : -.03)));
    if (node.direction === "vertical") editorSplitRatio = node.ratio;
    applyLayoutRatio(group, node);
    separator.setAttribute("aria-valuenow", String(Math.round(node.ratio * 100)));
    persistEditorTabs();
    requestEditorMeasure();
  });
  group.append(buildEditorLayoutElement(node.first), separator, buildEditorLayoutElement(node.second));
  return group;
}

function serializeEditorLayout(node: EditorLayoutNode): StoredEditorLayoutNode {
  if (node.type === "pane") {
    const pane = editorPanes.find((entry) => entry.id === node.paneId) || primaryPane;
    return { type: "pane", paneId: pane.id, path: pane.path };
  }
  return { type: "split", direction: node.direction, ratio: node.ratio, first: serializeEditorLayout(node.first), second: serializeEditorLayout(node.second) };
}

function persistEditorLayout() {
  localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify({ layout: serializeEditorLayout(editorLayout), activePaneId: activeEditorPane?.id }));
}

function splitEditorPane(pane: EditorPane, direction: SplitDirection, preferredPath?: string) {
  if (editorPanes.length >= 8) { showToast("Up to eight editor panes can be open at once."); return; }
  const path = (preferredPath && projectFiles.some((file) => file.path === preferredPath) ? preferredPath : null)
    || openPaths.find((openPath) => openPath !== pane.path)
    || pane.path;
  if (!openPaths.includes(path)) openPaths.push(path);
  const id = nextPaneId();
  const container = createPaneContainer(id);
  const newPane = createEditorPane(id, path, container, container.querySelector<HTMLElement>(".editor-host")!);
  editorLayout = replacePaneInLayout(editorLayout, pane.id, {
    type: "split",
    direction,
    ratio: direction === "vertical" ? editorSplitRatio : .5,
    first: { type: "pane", paneId: pane.id },
    second: { type: "pane", paneId: id },
  });
  renderEditorPanes();
  activateEditorPane(newPane);
  persistEditorTabs();
}

function closeEditorPane(pane: EditorPane) {
  if (editorPanes.length === 1) { showToast("Keep at least one editor pane open."); return; }
  const nextLayout = removePaneFromLayout(editorLayout, pane.id);
  if (!nextLayout) return;
  editorLayout = nextLayout;
  window.clearTimeout(pane.previewTimer);
  clearPreviewObjectUrls(pane);
  pane.view.destroy();
  pane.container.remove();
  editorPanes.splice(editorPanes.indexOf(pane), 1);
  const nextPane = editorPanes.find((entry) => entry.id === firstPaneId(editorLayout)) || editorPanes[0];
  renderEditorPanes();
  if (activeEditorPane === pane) activateEditorPane(nextPane);
  else persistEditorTabs();
}

function restoreEditorLayout(legacySecondaryPath?: string | null) {
  try {
    const stored = JSON.parse(localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY) || "null") as { layout?: unknown; activePaneId?: unknown } | null;
    if (stored?.layout) {
      const seen = new Set<string>();
      let leafCount = 0;
      let usedPrimary = false;
      const restoreNode = (value: unknown): EditorLayoutNode => {
        if (!value || typeof value !== "object") throw new Error("Invalid editor layout");
        const node = value as Record<string, unknown>;
        if (node.type === "pane") {
          const id = typeof node.paneId === "string" && !seen.has(node.paneId) ? node.paneId : nextPaneId();
          const path = typeof node.path === "string" && projectFiles.some((file) => file.path === node.path) ? node.path : projectFiles[0].path;
          seen.add(id);
          leafCount += 1;
          if (leafCount > 8) throw new Error("Too many panes");
          let pane: EditorPane;
          if (!usedPrimary) {
            usedPrimary = true;
            primaryPane.id = id;
            primaryPane.container.dataset.editorPane = id;
            pane = primaryPane;
          } else {
            const container = createPaneContainer(id);
            pane = createEditorPane(id, path, container, container.querySelector<HTMLElement>(".editor-host")!);
          }
          loadFileIntoPane(pane, path);
          if (!openPaths.includes(path)) openPaths.push(path);
          const numericId = Number(id.match(/(\d+)$/)?.[1] || 0);
          paneIdCounter = Math.max(paneIdCounter, numericId);
          return { type: "pane", paneId: id };
        }
        if (node.type !== "split" || (node.direction !== "vertical" && node.direction !== "horizontal")) throw new Error("Invalid editor split");
        const ratio = typeof node.ratio === "number" ? Math.max(.2, Math.min(.8, node.ratio)) : .5;
        return { type: "split", direction: node.direction, ratio, first: restoreNode(node.first), second: restoreNode(node.second) };
      };
      editorLayout = restoreNode(stored.layout);
      renderEditorPanes();
      const restoredActive = typeof stored.activePaneId === "string" ? editorPanes.find((pane) => pane.id === stored.activePaneId) : null;
      activateEditorPane(restoredActive || editorPanes.find((pane) => pane.id === firstPaneId(editorLayout)) || primaryPane, false);
      persistEditorTabs();
      return;
    }
  } catch {
    localStorage.removeItem(EDITOR_LAYOUT_STORAGE_KEY);
    editorPanes.filter((pane) => pane !== primaryPane).forEach((pane) => {
      window.clearTimeout(pane.previewTimer);
      clearPreviewObjectUrls(pane);
      pane.view.destroy();
      pane.container.remove();
    });
    editorPanes.splice(0, editorPanes.length, primaryPane);
    primaryPane.id = "pane-1";
    primaryPane.container.dataset.editorPane = primaryPane.id;
    paneIdCounter = 1;
  }
  loadFileIntoPane(primaryPane, activePath);
  editorLayout = { type: "pane", paneId: primaryPane.id };
  renderEditorPanes();
  if (legacySecondaryPath) {
    splitEditorPane(primaryPane, "vertical", legacySecondaryPath);
    activateEditorPane(primaryPane, false);
  } else activateEditorPane(primaryPane, false);
  persistEditorTabs();
}

function loadFileIntoPane(pane: EditorPane, path: string) {
  const target = projectFiles.find((file) => file.path === path);
  if (!target) return false;
  exitVimToNormalMode(pane.view);
  window.clearTimeout(pane.previewTimer);
  pane.previewRevision += 1;
  pane.path = path;
  if (!isMarkdownPath(path)) {
    pane.previewMode = false;
  }
  pane.container.classList.toggle("previewing-markdown", pane.previewMode);
  syncPanePresentation(pane, target);
  suppressEditorSave = true;
  pane.view.dispatch({
    changes: { from: 0, to: pane.view.state.doc.length, insert: editableContent(target) },
    effects: pane.languageConfig.reconfigure(languageForPath(path)),
  });
  suppressEditorSave = false;
  if (pane.previewMode) renderMarkdownPreview(pane);
  renderEditorPanes();
  return true;
}

function repairEditorPanes() {
  const available = new Set(projectFiles.map((file) => file.path));
  const fallback = openPaths.find((path) => available.has(path)) || projectFiles[0].path;
  if (!openPaths.includes(fallback)) openPaths.push(fallback);
  editorPanes.forEach((pane) => {
    if (!available.has(pane.path)) loadFileIntoPane(pane, fallback);
  });
  activateEditorPane(activeEditorPane, false);
}

function renderEditorTabs() {
  const tabs = document.querySelector<HTMLDivElement>("#editor-tabs")!;
  tabs.innerHTML = openPaths.map((path) => {
    const active = path === activePath;
    const name = path.split("/").at(-1) || path;
    return `<div class="editor-tab ${active ? "active" : ""}" data-editor-tab="${escapeHtml(path)}">
      <button class="editor-tab-select" data-switch-tab="${escapeHtml(path)}" role="tab" aria-selected="${active}" tabindex="${active ? "0" : "-1"}" title="/workspace/${escapeHtml(path)}"><span class="cpp-badge">${fileType(path)}</span><span class="editor-tab-name">${escapeHtml(name)}</span><i class="unsaved-dot" aria-label="Saving"></i></button>
      <button class="editor-tab-close" data-close-tab="${escapeHtml(path)}" aria-label="Close ${escapeHtml(name)}" title="Close tab">×</button>
    </div>`;
  }).join("");
  tabs.querySelectorAll<HTMLButtonElement>("[data-switch-tab]").forEach((button) => button.addEventListener("click", () => switchFile(button.dataset.switchTab!)));
  tabs.querySelectorAll<HTMLButtonElement>("[data-close-tab]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    closeEditorTab(button.dataset.closeTab!);
  }));
  Array.from(tabs.querySelectorAll<HTMLButtonElement>("[data-switch-tab]")).find((button) => button.dataset.switchTab === activePath)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  tabs.onkeydown = (event) => {
    const current = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-switch-tab]");
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = openPaths.indexOf(current.dataset.switchTab!);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? openPaths.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + openPaths.length) % openPaths.length;
    switchFile(openPaths[nextIndex]);
  };
}

function closeEditorTab(path: string) {
  const index = openPaths.indexOf(path);
  if (index < 0) return;
  if (openPaths.length === 1) {
    showToast("Keep at least one file tab open.");
    return;
  }
  openPaths.splice(index, 1);
  const fallback = openPaths[Math.min(index, openPaths.length - 1)];
  const affectedPanes = editorPanes.filter((pane) => pane.path === path);
  affectedPanes.filter((pane) => pane !== activeEditorPane).forEach((pane) => loadFileIntoPane(pane, fallback));
  if (activeEditorPane.path === path) switchFile(fallback);
  else {
    persistEditorTabs();
    renderEditorPanes();
    renderEditorTabs();
  }
}

function switchFile(path: string) {
  const target = projectFiles.find((file) => file.path === path);
  if (!target) return;
  if (!openPaths.includes(path)) openPaths.push(path);
  if (!loadFileIntoPane(activeEditorPane, path)) return;
  activePath = path;
  activeEditorPane.path = path;
  currentDirectory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) collapsedFolders.delete(parts.slice(0, index).join("/"));
  persistPreferences();
  persistEditorTabs();
  renderEditorTabs();
  renderFileTree();
  updateFileMeta();
  if (activeEditorPane.viewingImage) activeEditorPane.preview.focus();
  else editor.focus();
  if (window.matchMedia("(max-width: 680px)").matches) setExplorerOpen(false);
}

function fileType(path: string) {
  if (/\.(cpp|cc|cxx)$/i.test(path)) return "C++";
  if (/\.(h|hpp|hxx)$/i.test(path)) return "H";
  if (/\.md$/i.test(path)) return "MD";
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path)) return "IMG";
  return "TXT";
}

function fileIcon(path: string) {
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path)) return "image";
  return /\.(cpp|cc|cxx|h|hpp|hxx)$/i.test(path) ? "file-code-2" : "file-text";
}

function renderFileTree() {
  const tree = document.querySelector<HTMLDivElement>("#file-tree")!;
  const query = document.querySelector<HTMLInputElement>("#file-filter")!.value.trim().toLowerCase();
  const visibleFiles = query ? projectFiles.filter((file) => file.path.toLowerCase().includes(query)) : projectFiles;
  document.querySelector("#file-count")!.textContent = String(projectFiles.length);
  document.querySelector("#workspace-root")!.classList.toggle("current", currentDirectory === "");
  const allFolders = Array.from(allProjectFolders());
  const directFolderMatches = query ? allFolders.filter((path) => path.toLowerCase().includes(query)) : allFolders;
  const visibleFolders = query ? allFolders.filter((path) => directFolderMatches.some((match) => match === path || match.startsWith(`${path}/`)) || visibleFiles.some((file) => file.path.startsWith(`${path}/`))) : allFolders;
  const entries = [
    ...visibleFolders.map((path) => ({ path, folder: true })),
    ...visibleFiles.map((file) => ({ path: file.path, folder: false })),
  ].sort((a, b) => a.path.localeCompare(b.path) || Number(b.folder) - Number(a.folder)).filter((entry) => {
    if (query) return true;
    const parts = entry.path.split("/");
    return !parts.slice(0, -1).some((_, index) => collapsedFolders.has(parts.slice(0, index + 1).join("/")));
  });

  tree.innerHTML = entries.length ? entries.map((entry) => {
    const depth = entry.path.split("/").length - 1;
    const name = entry.path.split("/").at(-1);
    if (entry.folder) {
      const expanded = !collapsedFolders.has(entry.path);
      return `<div class="folder-row drop-target ${entry.path === currentDirectory ? "current" : ""}" draggable="true" data-drag-folder="${escapeHtml(entry.path)}" data-drop-folder="${escapeHtml(entry.path)}" style="--depth:${depth}"><button class="folder-disclosure" data-folder="${escapeHtml(entry.path)}" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(name || entry.path)}"><i data-lucide="${expanded ? "chevron-down" : "chevron-right"}"></i></button><button class="folder-select" data-select-folder="${escapeHtml(entry.path)}" aria-label="Select folder ${escapeHtml(entry.path)}"><i data-lucide="folder"></i><span>${escapeHtml(name || entry.path)}</span></button><span class="file-actions"><button class="file-action" data-rename-folder="${escapeHtml(entry.path)}" aria-label="Rename folder ${escapeHtml(entry.path)}" title="Rename or move"><i data-lucide="pencil"></i></button><button class="file-action file-delete" data-delete-folder="${escapeHtml(entry.path)}" aria-label="Delete folder ${escapeHtml(entry.path)}" title="Delete folder"><i data-lucide="trash-2"></i></button></span></div>`;
    }
    return `<div class="file-row ${entry.path === activePath ? "active" : ""}" draggable="true" data-drag-file="${escapeHtml(entry.path)}" style="--depth:${depth}">
      <button class="file-select" data-file="${escapeHtml(entry.path)}"><i data-lucide="${fileIcon(entry.path)}"></i><span>${escapeHtml(name || entry.path)}</span></button>
      <span class="file-actions"><button class="file-action" data-rename-file="${escapeHtml(entry.path)}" aria-label="Rename ${escapeHtml(entry.path)}" title="Rename or move"><i data-lucide="pencil"></i></button><button class="file-action file-delete" data-delete-file="${escapeHtml(entry.path)}" aria-label="Delete ${escapeHtml(entry.path)}" title="Delete"><i data-lucide="trash-2"></i></button></span>
    </div>`;
  }).join("") : `<div class="empty-tree"><i data-lucide="search"></i><span>No items match “${escapeHtml(query)}”</span></div>`;
  createIcons({ icons: ICONS });
  tree.querySelectorAll<HTMLButtonElement>("[data-folder]").forEach((button) => button.addEventListener("click", () => {
    const folder = button.dataset.folder!;
    if (collapsedFolders.has(folder)) collapsedFolders.delete(folder);
    else collapsedFolders.add(folder);
    persistPreferences();
    renderFileTree();
  }));
  tree.querySelectorAll<HTMLButtonElement>("[data-select-folder]").forEach((button) => button.addEventListener("click", () => {
    currentDirectory = button.dataset.selectFolder!;
    renderFileTree();
  }));
  tree.querySelectorAll<HTMLButtonElement>("[data-file]").forEach((button) => button.addEventListener("click", () => switchFile(button.dataset.file!)));
  tree.querySelectorAll<HTMLButtonElement>("[data-rename-file]").forEach((button) => button.addEventListener("click", () => openRenameDialog(button.dataset.renameFile!, "file")));
  tree.querySelectorAll<HTMLButtonElement>("[data-rename-folder]").forEach((button) => button.addEventListener("click", () => openRenameDialog(button.dataset.renameFolder!, "folder")));
  tree.querySelectorAll<HTMLButtonElement>("[data-delete-file]").forEach((button) => button.addEventListener("click", () => deleteFile(button.dataset.deleteFile!)));
  tree.querySelectorAll<HTMLButtonElement>("[data-delete-folder]").forEach((button) => button.addEventListener("click", () => deleteFolder(button.dataset.deleteFolder!)));
  tree.querySelectorAll<HTMLElement>("[data-drag-file]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      draggedPath = row.dataset.dragFile!;
      draggedKind = "file";
      event.dataTransfer!.effectAllowed = "move";
      event.dataTransfer!.setData("text/plain", draggedPath);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      draggedPath = null;
      draggedKind = null;
      document.querySelectorAll(".dragging, .drag-over").forEach((element) => element.classList.remove("dragging", "drag-over"));
    });
  });
  tree.querySelectorAll<HTMLElement>("[data-drag-folder]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      draggedPath = row.dataset.dragFolder!;
      draggedKind = "folder";
      event.dataTransfer!.effectAllowed = "move";
      event.dataTransfer!.setData("text/plain", draggedPath);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      draggedPath = null;
      draggedKind = null;
      document.querySelectorAll(".dragging, .drag-over").forEach((element) => element.classList.remove("dragging", "drag-over"));
    });
  });
  bindDropTargets(tree);
}

function deleteFile(path: string) {
  if (projectFiles.length === 1 || !window.confirm(`Delete /workspace/${path}?`)) return;
  rememberParentFolders(path);
  projectFiles = projectFiles.filter((file) => file.path !== path);
  openPaths = openPaths.filter((openPath) => openPath !== path);
  persistProject();
  persistFolders();
  repairEditorPanes();
  renderFileTree();
}

function openRenameDialog(path: string, kind: "file" | "folder") {
  const dialog = document.querySelector<HTMLDialogElement>("#rename-item-dialog")!;
  document.querySelector<HTMLInputElement>("#rename-source-path")!.value = path;
  document.querySelector<HTMLInputElement>("#rename-source-kind")!.value = kind;
  document.querySelector("#rename-item-title")!.textContent = `Rename or move ${kind}`;
  const input = document.querySelector<HTMLInputElement>("#rename-item-path")!;
  input.value = path;
  document.querySelector("#rename-item-error")!.textContent = "";
  dialog.showModal();
  input.focus();
  input.select();
}

function renameProjectFile(sourcePath: string, requestedPath: string) {
  const source = projectFiles.find((file) => file.path === sourcePath);
  if (!source) return { ok: false as const, error: "That source file no longer exists." };
  const normalized = normalizeProjectPath(requestedPath);
  if (!normalized.ok) return normalized;
  const nextPath = normalized.path;
  if (nextPath === sourcePath) return { ok: true as const, path: nextPath };
  if (projectFiles.some((file) => file.path === nextPath) || allProjectFolders().has(nextPath)) return { ok: false as const, error: "A file or folder already exists at that path." };

  if (sourcePath === activePath && source.encoding !== "base64") source.content = editor.state.doc.toString();
  rememberParentFolders(sourcePath);
  rememberParentFolders(nextPath);
  source.path = nextPath;
  openPaths = openPaths.map((path) => path === sourcePath ? nextPath : path);
  editorPanes.forEach((pane) => { if (pane.path === sourcePath) pane.path = nextPath; });
  persistProject();
  persistFolders();
  if (activePath === sourcePath) switchFile(nextPath);
  else {
    persistEditorTabs();
    renderEditorPanes();
    renderEditorTabs();
    renderFileTree();
  }
  return { ok: true as const, path: nextPath };
}

function renameProjectFolder(sourcePath: string, requestedPath: string) {
  const folders = allProjectFolders();
  if (!folders.has(sourcePath)) return { ok: false as const, error: "That source folder no longer exists." };
  const normalized = normalizeProjectPath(requestedPath);
  if (!normalized.ok) return normalized;
  const nextPath = normalized.path;
  if (nextPath === sourcePath) return { ok: true as const, path: nextPath };
  if (nextPath.startsWith(`${sourcePath}/`)) return { ok: false as const, error: "A folder cannot be moved inside itself." };
  if (projectFiles.some((file) => file.path === nextPath) || folders.has(nextPath)) return { ok: false as const, error: "A file or folder already exists at that path." };

  const movingFiles = projectFiles.filter((file) => file.path.startsWith(`${sourcePath}/`));
  const movingPaths = new Set(movingFiles.map((file) => file.path));
  const nextFilePaths = movingFiles.map((file) => `${nextPath}${file.path.slice(sourcePath.length)}`);
  if (nextFilePaths.some((path) => projectFiles.some((file) => !movingPaths.has(file.path) && file.path === path))) return { ok: false as const, error: "The destination contains a file with the same name." };

  if (activePath.startsWith(`${sourcePath}/`) && currentFile().encoding !== "base64") currentFile().content = editor.state.doc.toString();
  for (const file of movingFiles) file.path = `${nextPath}${file.path.slice(sourcePath.length)}`;
  openPaths = openPaths.map((path) => path.startsWith(`${sourcePath}/`) ? `${nextPath}${path.slice(sourcePath.length)}` : path);
  editorPanes.forEach((pane) => { if (pane.path.startsWith(`${sourcePath}/`)) pane.path = `${nextPath}${pane.path.slice(sourcePath.length)}`; });
  projectFolders = new Set(Array.from(projectFolders, (folder) => folder === sourcePath || folder.startsWith(`${sourcePath}/`) ? `${nextPath}${folder.slice(sourcePath.length)}` : folder));
  const nextCollapsed = new Set<string>();
  for (const folder of collapsedFolders) nextCollapsed.add(folder === sourcePath || folder.startsWith(`${sourcePath}/`) ? `${nextPath}${folder.slice(sourcePath.length)}` : folder);
  collapsedFolders.clear();
  nextCollapsed.forEach((folder) => collapsedFolders.add(folder));
  const nextActivePath = activePath.startsWith(`${sourcePath}/`) ? `${nextPath}${activePath.slice(sourcePath.length)}` : activePath;
  if (currentDirectory === sourcePath || currentDirectory.startsWith(`${sourcePath}/`)) currentDirectory = `${nextPath}${currentDirectory.slice(sourcePath.length)}`;
  persistProject();
  persistFolders();
  persistPreferences();
  if (nextActivePath !== activePath) switchFile(nextActivePath);
  else {
    persistEditorTabs();
    renderEditorPanes();
    renderEditorTabs();
    renderFileTree();
  }
  return { ok: true as const, path: nextPath };
}

function deleteFolder(path: string) {
  const files = projectFiles.filter((file) => file.path.startsWith(`${path}/`));
  if (files.length === projectFiles.length && files.length > 0) { showToast("Keep at least one project file.", "error"); return; }
  const description = files.length ? ` and its ${files.length} file${files.length === 1 ? "" : "s"}` : "";
  if (!window.confirm(`Delete /workspace/${path}${description}?`)) return;
  projectFiles = projectFiles.filter((file) => !file.path.startsWith(`${path}/`));
  openPaths = openPaths.filter((openPath) => !openPath.startsWith(`${path}/`));
  projectFolders = new Set(Array.from(projectFolders).filter((folder) => folder !== path && !folder.startsWith(`${path}/`)));
  if (currentDirectory === path || currentDirectory.startsWith(`${path}/`)) currentDirectory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  for (const folder of Array.from(collapsedFolders)) if (folder === path || folder.startsWith(`${path}/`)) collapsedFolders.delete(folder);
  persistProject();
  persistFolders();
  persistPreferences();
  repairEditorPanes();
  renderFileTree();
}

function moveFileToFolder(sourcePath: string, folderPath: string) {
  const fileName = sourcePath.split("/").at(-1)!;
  const nextPath = folderPath ? `${folderPath}/${fileName}` : fileName;
  if (nextPath === sourcePath) return;
  const result = renameProjectFile(sourcePath, nextPath);
  if (!result.ok) { showToast(result.error, "error"); return; }
  showToast(`Moved to /workspace/${result.path}`);
}

function moveFolderToFolder(sourcePath: string, folderPath: string) {
  const folderName = sourcePath.split("/").at(-1)!;
  const nextPath = folderPath ? `${folderPath}/${folderName}` : folderName;
  if (nextPath === sourcePath) return;
  const result = renameProjectFolder(sourcePath, nextPath);
  if (!result.ok) { showToast(result.error, "error"); return; }
  showToast(`Moved folder to /workspace/${result.path}`);
}

function bindDropTargets(root: ParentNode) {
  const targets = [
    ...(root instanceof HTMLElement && root.matches("[data-drop-folder]") ? [root] : []),
    ...root.querySelectorAll<HTMLElement>("[data-drop-folder]"),
  ];
  targets.forEach((target) => {
    target.addEventListener("dragover", (event) => {
      if (!draggedPath) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer!.dropEffect = "move";
      target.classList.add("drag-over");
    });
    target.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      target.classList.remove("drag-over");
    });
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("drag-over");
      const sourcePath = draggedPath || event.dataTransfer?.getData("text/plain");
      if (sourcePath && draggedKind === "folder") moveFolderToFolder(sourcePath, target.dataset.dropFolder || "");
      else if (sourcePath) moveFileToFolder(sourcePath, target.dataset.dropFolder || "");
      draggedPath = null;
      draggedKind = null;
    });
  });
}

function updateCursor(view: EditorView) {
  if (activeEditorPane.viewingImage) {
    document.querySelector<HTMLSpanElement>("#cursor-position")!.textContent = "Image";
    return;
  }
  const position = view.state.selection.main.head;
  const line = view.state.doc.lineAt(position);
  document.querySelector<HTMLSpanElement>("#cursor-position")!.textContent = `Ln ${line.number}, Col ${position - line.from + 1}`;
}

function updateFileMeta() {
  const bytes = projectFileByteLength(currentFile());
  document.querySelector<HTMLSpanElement>("#file-size")!.textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function markChanged() {
  const activeTab = document.querySelector<HTMLElement>(".editor-tab.active .unsaved-dot");
  activeTab?.classList.add("visible");
  document.querySelector("#save-status")!.textContent = "Saving…";
  window.setTimeout(() => {
    activeTab?.classList.remove("visible");
    document.querySelector("#save-status")!.textContent = "Saved locally";
  }, 450);
}

async function runCode() {
  if (running) { stopRun(); return; }
  if (currentFile().encoding !== "base64") currentFile().content = editor.state.doc.toString();
  const validation = validateProjectFiles(projectFiles);
  if (!validation.ok) { finishWithError(validation.error); return; }
  const entry = findEntryFile(projectFiles);
  if (!entry) { finishWithError("Add a .cpp entry file before running the project."); return; }

  running = true;
  setPanelOpen(true);
  visibleTab = "output";
  syncTabs();
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
  projectFiles.forEach((file) => rememberParentFolders(file.path));
  persistProject();
  persistFolders();
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
  setPanelOpen(true);
  syncTabs();
  setStatus("Something went wrong", "error");
  timingText.textContent = "—";
  renderOutput();
}

function cleanDiagnostics(value: string) {
  return value.replaceAll("/tmp/", "").replaceAll(".cpp.cpp", ".cpp").trim();
}

function renderOutput() {
  const inputPanel = document.querySelector<HTMLDivElement>("#input-panel")!;
  const resultPanel = document.querySelector<HTMLDivElement>("#result-panel")!;
  const isInput = visibleTab === "input";
  inputPanel.hidden = !isInput;
  resultPanel.hidden = isInput;
  const value = visibleTab === "input" ? "" : visibleTab === "output" ? lastResult.output : lastResult.diagnostics;
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
  const resultActionsHidden = visibleTab === "input";
  document.querySelector<HTMLButtonElement>("#copy-output-button")!.hidden = resultActionsHidden;
  document.querySelector<HTMLButtonElement>("#clear-button")!.hidden = resultActionsHidden;
}

function setStatus(label: string, state: "idle" | "busy" | "success" | "error") {
  statusText.textContent = label;
  statusIndicator.className = `status-indicator ${state}`;
}

function setRunButton(isRunning: boolean) {
  runButton.classList.toggle("running", isRunning);
  runButton.querySelector("span")!.textContent = isRunning ? "Stop" : "Run";
  runButton.querySelector("kbd")!.hidden = isRunning;
  runButton.querySelector("svg")?.remove();
  const icon = document.createElement("i");
  icon.dataset.lucide = isRunning ? "square" : "play";
  runButton.prepend(icon);
  editorPanes.forEach((pane) => pane.view.dispatch({ effects: pane.editableConfig.reconfigure(EditorView.editable.of(!isRunning)) }));
  document.querySelector(".ide-card")?.classList.toggle("locked", isRunning);
  [standardSelect, optimizationSelect, stdin, argvInput, document.querySelector<HTMLSelectElement>("#example-select")!, document.querySelector<HTMLButtonElement>("#reset-button")!, document.querySelector<HTMLButtonElement>("#new-file-button")!, document.querySelector<HTMLButtonElement>("#new-folder-button")!, document.querySelector<HTMLButtonElement>("#import-button")!, document.querySelector<HTMLInputElement>("#file-filter")!]
    .forEach((control) => { control.disabled = isRunning; });
  syncFormatterUi();
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

function setSiteNavigationOpen(open: boolean) {
  navigationOpen = open;
  document.querySelector(".app-frame")!.classList.toggle("site-nav-collapsed", !open);
  const button = document.querySelector<HTMLButtonElement>("#site-nav-toggle")!;
  button.setAttribute("aria-pressed", String(open));
  button.setAttribute("aria-label", open ? "Collapse website navigation" : "Expand website navigation");
  button.innerHTML = `<i data-lucide="${open ? "panel-left-close" : "panel-left-open"}"></i><span class="site-nav-label">${open ? "Collapse" : "Expand"}</span>`;
  createIcons({ icons: ICONS });
  persistPreferences();
  requestAnimationFrame(requestEditorMeasure);
}

function setColorTheme(theme: ThemeId, save = true) {
  colorTheme = theme;
  themeSelect.value = theme;
  if (theme === "local") delete document.body.dataset.theme;
  else document.body.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "catppuccin-latte" ? "light" : "dark";
  editorPanes.forEach((pane) => { if (pane.previewMode) renderMarkdownPreview(pane); });
  if (save) {
    persistPreferences();
    showToast(theme === "local" ? "Local Lab theme enabled." : `${themeSelect.selectedOptions[0]?.textContent || "Catppuccin"} enabled.`);
  }
  requestAnimationFrame(requestEditorMeasure);
}

function setExplorerOpen(open: boolean) {
  explorerOpen = open;
  document.querySelector(".ide-card")!.classList.toggle("explorer-hidden", !open);
  const button = document.querySelector<HTMLButtonElement>("#explorer-toggle")!;
  button.setAttribute("aria-pressed", String(open));
  button.innerHTML = `<i data-lucide="${open ? "panel-left-close" : "panel-left-open"}"></i>`;
  createIcons({ icons: ICONS });
  persistPreferences();
}

function setPanelOpen(open: boolean) {
  panelOpen = open;
  document.querySelector(".ide-card")!.classList.toggle("panel-hidden", !open);
  const button = document.querySelector<HTMLButtonElement>("#panel-toggle")!;
  button.setAttribute("aria-pressed", String(open));
  button.innerHTML = `<i data-lucide="${open ? "panel-bottom-close" : "panel-bottom-open"}"></i><span>Panel</span>`;
  createIcons({ icons: ICONS });
  persistPreferences();
  if (open) window.setTimeout(requestEditorMeasure, 0);
}

function syncVimModeUi() {
  const button = document.querySelector<HTMLButtonElement>("#vim-toggle")!;
  button.setAttribute("aria-pressed", String(vimEnabled));
  button.setAttribute("aria-label", vimEnabled ? "Disable Vim mode" : "Enable Vim mode");
  button.title = vimEnabled ? "Vim enabled · Esc normal · v visual · i insert" : "Enable Vim keybindings";
  document.querySelector(".ide-card")!.classList.toggle("vim-enabled", vimEnabled);
}

function setVimEnabled(enabled: boolean) {
  if (enabled === vimEnabled) return;
  vimEnabled = enabled;
  editorPanes.forEach((pane) => pane.view.dispatch({ effects: pane.vimConfig.reconfigure(enabled ? vim({ status: true }) : []) }));
  try { localStorage.setItem(VIM_STORAGE_KEY, String(enabled)); }
  catch { showToast("The Vim preference could not be saved.", "error"); }
  syncVimModeUi();
  showToast(enabled ? "Vim enabled · i inserts · Esc returns to normal · v enters visual mode." : "Vim mode disabled.");
  if (activeEditorPane.viewingImage) activeEditorPane.preview.focus();
  else editor.focus();
}

function setZenMode(enabled: boolean) {
  if (enabled === zenMode) return;
  zenMode = enabled;
  document.body.classList.toggle("zen-mode", enabled);
  const button = document.querySelector<HTMLButtonElement>("#zen-toggle")!;
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute("aria-label", enabled ? "Exit Zen mode" : "Enter Zen mode");
  button.innerHTML = `<i data-lucide="${enabled ? "minimize-2" : "maximize-2"}"></i><span>${enabled ? "Exit Zen" : "Zen"}</span>`;
  createIcons({ icons: ICONS });
  window.setTimeout(() => {
    requestEditorMeasure();
    if (activeEditorPane.viewingImage) activeEditorPane.preview.focus();
    else editor.focus();
  }, 0);
}

function openQuickOpen() {
  const dialog = document.querySelector<HTMLDialogElement>("#quick-open-dialog")!;
  const input = document.querySelector<HTMLInputElement>("#quick-open-input")!;
  input.value = "";
  quickOpenIndex = 0;
  renderQuickOpen();
  if (!dialog.open) dialog.showModal();
  input.focus();
}

function quickOpenMatches() {
  const query = document.querySelector<HTMLInputElement>("#quick-open-input")!.value.trim().toLowerCase();
  return projectFiles.filter((file) => file.path.toLowerCase().includes(query));
}

function renderQuickOpen() {
  const results = document.querySelector<HTMLDivElement>("#quick-open-results")!;
  const matches = quickOpenMatches();
  quickOpenIndex = Math.max(0, Math.min(quickOpenIndex, matches.length - 1));
  results.innerHTML = matches.length ? matches.map((file, index) => `<button class="quick-open-result ${index === quickOpenIndex ? "selected" : ""}" data-quick-file="${escapeHtml(file.path)}"><i data-lucide="${fileIcon(file.path)}"></i><span><b>${escapeHtml(file.path.split("/").at(-1) || file.path)}</b><small>${escapeHtml(file.path)}</small></span><em>${fileType(file.path)}</em></button>`).join("") : `<div class="quick-open-empty">No matching files</div>`;
  createIcons({ icons: ICONS });
  results.querySelectorAll<HTMLButtonElement>("[data-quick-file]").forEach((button) => button.addEventListener("click", () => {
    switchFile(button.dataset.quickFile!);
    document.querySelector<HTMLDialogElement>("#quick-open-dialog")!.close();
  }));
  results.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function encodeBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

async function importFiles(files: FileList) {
  let added = 0;
  let skipped = 0;
  let renamed = 0;
  for (const file of Array.from(files)) {
    const safeName = file.name.normalize("NFKD").replace(/[^\w.+@-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (safeName !== file.name) renamed += 1;
    const candidate = normalizeProjectPath(currentDirectory ? `${currentDirectory}/${safeName}` : safeName);
    if (!candidate.ok || projectFiles.some((entry) => entry.path === candidate.path)) { skipped += 1; continue; }
    const image = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(file.name);
    projectFiles.push(image
      ? { path: candidate.path, content: encodeBase64(await file.arrayBuffer()), encoding: "base64", mimeType: file.type || mimeTypeForPath(file.name) }
      : { path: candidate.path, content: await file.text() });
    added += 1;
  }
  const validation = validateProjectFiles(projectFiles);
  if (!validation.ok) {
    projectFiles.splice(projectFiles.length - added, added);
    showToast(validation.error, "error");
    return;
  }
  if (added) {
    persistProject();
    renderFileTree();
    switchFile(projectFiles.at(-1)!.path);
  }
  showToast(`${added} file${added === 1 ? "" : "s"} imported${renamed ? ` · ${renamed} filename${renamed === 1 ? "" : "s"} normalized` : ""}${skipped ? ` · ${skipped} skipped` : ""}.`);
}

function makeResizable(handle: HTMLElement, onMove: (event: PointerEvent) => void, onStop: () => void = () => {}) {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const resizeClass = handle.getAttribute("aria-orientation") === "horizontal" ? "resizing-row" : "resizing";
    document.body.classList.add(resizeClass);
    const move = (moveEvent: PointerEvent) => onMove(moveEvent);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing", "resizing-row");
      requestEditorMeasure();
      onStop();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  });
}

applyMarkdownSplitRatio(markdownSplitRatio);

runButton.addEventListener("click", () => void runCode());
document.querySelector<HTMLButtonElement>("#site-nav-toggle")!.addEventListener("click", () => setSiteNavigationOpen(!navigationOpen));
document.querySelector<HTMLButtonElement>("#nav-shortcuts-button")!.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#shortcuts-dialog")!.showModal());
document.querySelector<HTMLButtonElement>("#split-right-button")!.addEventListener("click", () => splitEditorPane(activeEditorPane, "vertical"));
document.querySelector<HTMLButtonElement>("#split-down-button")!.addEventListener("click", () => splitEditorPane(activeEditorPane, "horizontal"));
document.querySelector<HTMLButtonElement>("#format-button")!.addEventListener("click", () => void formatDocument(activeEditorPane));
document.querySelector<HTMLButtonElement>("#clear-button")!.addEventListener("click", () => {
  lastResult = { output: "", diagnostics: "" };
  setStatus("Idle", "idle");
  timingText.textContent = "—";
  renderOutput();
});
document.querySelector<HTMLButtonElement>("#copy-output-button")!.addEventListener("click", async () => {
  const value = visibleTab === "input" ? "" : visibleTab === "output" ? lastResult.output : lastResult.diagnostics;
  if (!value) { showToast("There is nothing to copy yet."); return; }
  try {
    await navigator.clipboard.writeText(value);
    showToast(`${visibleTab === "diagnostics" ? "Problems" : "Output"} copied.`);
  } catch {
    showToast("Clipboard access is unavailable in this browser.", "error");
  }
});

document.querySelector<HTMLButtonElement>("#reset-button")!.addEventListener("click", () => {
  if (!window.confirm("Reset every file in this local project?")) return;
  projectFiles = cloneDefaults();
  projectFolders = new Set();
  openPaths = ["main.cpp"];
  persistProject();
  persistFolders();
  stdin.value = "";
  argvInput.value = "/workspace/data/numbers.txt";
  persistPreferences();
  switchFile("main.cpp");
  editorPanes.filter((pane) => pane !== activeEditorPane).forEach((pane) => loadFileIntoPane(pane, "main.cpp"));
  renderEditorPanes();
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
  persistPreferences();
  persistProject();
  switchFile("main.cpp");
  editorPanes.filter((pane) => pane !== activeEditorPane && pane.path === "main.cpp").forEach((pane) => loadFileIntoPane(pane, "main.cpp"));
  select.value = "";
});

document.querySelectorAll<HTMLButtonElement>(".output-tab").forEach((tab) => tab.addEventListener("click", () => {
  visibleTab = tab.dataset.outputTab as PanelTab;
  setPanelOpen(true);
  syncTabs();
  renderOutput();
}));

document.querySelector<HTMLInputElement>("#file-filter")!.addEventListener("input", renderFileTree);
document.querySelector<HTMLButtonElement>("#explorer-toggle")!.addEventListener("click", () => setExplorerOpen(!explorerOpen));
document.querySelector<HTMLButtonElement>("#panel-toggle")!.addEventListener("click", () => setPanelOpen(!panelOpen));
document.querySelector<HTMLButtonElement>("#panel-close-button")!.addEventListener("click", () => setPanelOpen(false));
document.querySelector<HTMLButtonElement>("#vim-toggle")!.addEventListener("click", () => setVimEnabled(!vimEnabled));
document.querySelector<HTMLButtonElement>("#format-on-save-toggle")!.addEventListener("click", () => setFormatOnSave(!formatOnSave));
document.querySelector<HTMLButtonElement>("#markdown-preview-toggle")!.addEventListener("click", () => setMarkdownPreview(activeEditorPane, !activeEditorPane.previewMode));
document.querySelector<HTMLButtonElement>("#zen-toggle")!.addEventListener("click", () => setZenMode(!zenMode));
document.querySelector<HTMLButtonElement>("#shortcuts-button")!.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#shortcuts-dialog")!.showModal());
document.querySelector<HTMLButtonElement>("#capabilities-button")!.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#capabilities-dialog")!.showModal());
document.querySelector<HTMLButtonElement>("#workspace-root")!.addEventListener("click", () => {
  currentDirectory = "";
  renderFileTree();
});

const importInput = document.querySelector<HTMLInputElement>("#file-import")!;
document.querySelector<HTMLButtonElement>("#import-button")!.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", () => {
  if (importInput.files?.length) void importFiles(importInput.files);
  importInput.value = "";
});

const quickOpenInput = document.querySelector<HTMLInputElement>("#quick-open-input")!;
quickOpenInput.addEventListener("input", () => { quickOpenIndex = 0; renderQuickOpen(); });
quickOpenInput.addEventListener("keydown", (event) => {
  const matches = quickOpenMatches();
  if (event.key === "ArrowDown") { event.preventDefault(); quickOpenIndex = Math.min(quickOpenIndex + 1, matches.length - 1); renderQuickOpen(); }
  if (event.key === "ArrowUp") { event.preventDefault(); quickOpenIndex = Math.max(quickOpenIndex - 1, 0); renderQuickOpen(); }
  if (event.key === "Enter" && matches[quickOpenIndex]) {
    event.preventDefault();
    switchFile(matches[quickOpenIndex].path);
    document.querySelector<HTMLDialogElement>("#quick-open-dialog")!.close();
  }
});

[stdin, argvInput].forEach((control) => control.addEventListener("input", () => {
  const hasInput = Boolean(stdin.value || argvInput.value);
  document.querySelector("#input-ready-dot")!.classList.toggle("visible", hasInput);
  persistPreferences();
}));
standardSelect.addEventListener("change", persistPreferences);
optimizationSelect.addEventListener("change", persistPreferences);
themeSelect.addEventListener("change", () => setColorTheme(themeSelect.value as ThemeId));

makeResizable(document.querySelector<HTMLElement>("#sidebar-resizer")!, (event) => {
  const panes = document.querySelector<HTMLElement>(".panes")!;
  const left = panes.getBoundingClientRect().left;
  sidebarWidth = Math.max(150, Math.min(340, event.clientX - left));
  document.querySelector<HTMLElement>(".ide-card")!.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
}, persistPreferences);
makeResizable(document.querySelector<HTMLElement>("#panel-resizer")!, (event) => {
  const workbench = document.querySelector<HTMLElement>(".workbench")!;
  const bottom = workbench.getBoundingClientRect().bottom;
  panelHeight = Math.max(150, Math.min(workbench.clientHeight - 180, bottom - event.clientY));
  workbench.style.setProperty("--panel-height", `${panelHeight}px`);
}, persistPreferences);

window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;
  if (event.key === "Escape" && zenMode && !document.querySelector("dialog[open]")) {
    event.preventDefault();
    setZenMode(false);
    return;
  }
  if (event.key.toLowerCase() === "f" && event.shiftKey && event.altKey) { event.preventDefault(); void formatDocument(activeEditorPane); return; }
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  if (event.key.toLowerCase() === "s") { event.preventDefault(); void saveActiveFile(); return; }
  if (event.key.toLowerCase() === "p") { event.preventDefault(); openQuickOpen(); }
  if (event.key.toLowerCase() === "b" && event.shiftKey) { event.preventDefault(); setSiteNavigationOpen(!navigationOpen); return; }
  if (event.key.toLowerCase() === "b" && !zenMode) { event.preventDefault(); setExplorerOpen(!explorerOpen); }
  if (event.key.toLowerCase() === "j" && !zenMode) { event.preventDefault(); setPanelOpen(!panelOpen); }
  if (event.key.toLowerCase() === "v" && event.altKey) { event.preventDefault(); setVimEnabled(!vimEnabled); }
  if (event.key.toLowerCase() === "z" && event.altKey) { event.preventDefault(); setZenMode(!zenMode); }
  if (event.key === "Enter" && !(event.target as HTMLElement).closest(".cm-editor")) { event.preventDefault(); void runCode(); }
});

document.querySelector<HTMLButtonElement>("#download-button")!.addEventListener("click", () => {
  const file = currentFile();
  const blob = file.encoding === "base64" ? fileBlob(file) : new Blob([file.content], { type: file.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.path.split("/").at(-1) || "file.txt";
  link.click();
  URL.revokeObjectURL(url);
});

const newFileDialog = document.querySelector<HTMLDialogElement>("#new-file-dialog")!;
const newFolderDialog = document.querySelector<HTMLDialogElement>("#new-folder-dialog")!;
const renameItemDialog = document.querySelector<HTMLDialogElement>("#rename-item-dialog")!;
document.querySelector<HTMLButtonElement>("#new-file-button")!.addEventListener("click", () => {
  const input = document.querySelector<HTMLInputElement>("#new-file-path")!;
  input.value = currentDirectory ? `${currentDirectory}/` : "";
  document.querySelector("#new-file-context")!.textContent = `Creating in /workspace${currentDirectory ? `/${currentDirectory}` : ""}`;
  document.querySelector("#new-file-error")!.textContent = "";
  newFileDialog.showModal();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});
document.querySelector<HTMLButtonElement>("#new-folder-button")!.addEventListener("click", () => {
  const input = document.querySelector<HTMLInputElement>("#new-folder-path")!;
  input.value = currentDirectory ? `${currentDirectory}/` : "";
  document.querySelector("#new-folder-context")!.textContent = `Creating in /workspace${currentDirectory ? `/${currentDirectory}` : ""}`;
  document.querySelector("#new-folder-error")!.textContent = "";
  newFolderDialog.showModal();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});
document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => document.querySelector<HTMLDialogElement>(`#${button.dataset.closeDialog}`)?.close()));

document.querySelector<HTMLFormElement>("#new-file-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#new-file-path")!;
  const error = document.querySelector<HTMLParagraphElement>("#new-file-error")!;
  const normalized = normalizeProjectPath(input.value);
  if (!normalized.ok) { error.textContent = normalized.error; return; }
  const path = normalized.path;
  if (projectFiles.some((file) => file.path === path) || allProjectFolders().has(path)) { error.textContent = "A file or folder already exists at that path."; return; }
  const content = /\.(cpp|cc|cxx)$/i.test(path) ? "#include <iostream>\n\nint main() {\n    std::cout << \"Hello\\n\";\n}\n" : /\.(h|hpp|hxx)$/i.test(path) ? "#pragma once\n" : "";
  projectFiles.push({ path, content });
  rememberParentFolders(path);
  persistProject();
  persistFolders();
  newFileDialog.close();
  switchFile(path);
});

document.querySelector<HTMLFormElement>("#new-folder-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#new-folder-path")!;
  const error = document.querySelector<HTMLParagraphElement>("#new-folder-error")!;
  const normalized = normalizeProjectPath(input.value);
  if (!normalized.ok) { error.textContent = normalized.error; return; }
  const path = normalized.path;
  if (projectFiles.some((file) => file.path === path) || allProjectFolders().has(path)) { error.textContent = "A file or folder already exists at that path."; return; }
  projectFolders.add(path);
  currentDirectory = path;
  persistFolders();
  newFolderDialog.close();
  renderFileTree();
  showToast(`Created /workspace/${path}`);
});

document.querySelector<HTMLFormElement>("#rename-item-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const sourcePath = document.querySelector<HTMLInputElement>("#rename-source-path")!.value;
  const kind = document.querySelector<HTMLInputElement>("#rename-source-kind")!.value as "file" | "folder";
  const input = document.querySelector<HTMLInputElement>("#rename-item-path")!;
  const error = document.querySelector<HTMLParagraphElement>("#rename-item-error")!;
  const result = kind === "folder" ? renameProjectFolder(sourcePath, input.value) : renameProjectFile(sourcePath, input.value);
  if (!result.ok) { error.textContent = result.error; return; }
  renameItemDialog.close();
  showToast(sourcePath === result.path ? `${kind === "folder" ? "Folder" : "File"} path unchanged.` : `${kind === "folder" ? "Folder" : "File"} moved to /workspace/${result.path}`);
});

renderFileTree();
bindDropTargets(document.querySelector<HTMLElement>(".mount-label")!);
setColorTheme(colorTheme, false);
setSiteNavigationOpen(navigationOpen);
setExplorerOpen(explorerOpen);
setPanelOpen(panelOpen);
syncVimModeUi();
syncFormatOnSaveUi();
restoreEditorLayout(storedEditorTabs.secondaryPath);
document.querySelector("#input-ready-dot")!.classList.toggle("visible", Boolean(stdin.value || argvInput.value));
updateCursor(editor);
updateFileMeta();
syncTabs();
renderOutput();
window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason instanceof Error ? event.reason.message : "An unexpected error occurred.";
  showToast(message, "error");
});
window.addEventListener("beforeunload", () => runtime.dispose());
}

function renderLandingPage() {
  document.body.classList.add("landing-page");
  app!.innerHTML = `<main class="landing-shell"><div class="landing-copy"><span class="landing-kicker">Local C++ Lab</span><h1>Compile and run C++ in your browser.</h1><p>A private Clang + WASI workspace with files, Vim motions, split editing, and no server upload.</p><a href="/">Open C++ editor</a><p><a href="/labs/sqlite">SQLite Lab</a> · <a href="/labs/duckdb">DuckDB Lab</a> · <a href="/labs/pglite">PGlite Lab</a></p></div></main>`;
}

if (/^\/(welcome|home)\/?$/.test(window.location.pathname)) renderLandingPage();
else if (/^\/labs\/(sqlite|duckdb|pglite)\/?$/.test(window.location.pathname)) {
  const engine = window.location.pathname.split("/")[2] as "sqlite" | "duckdb" | "pglite";
  void import("./sql/lab").then(({renderSqlLab}) => renderSqlLab(app!, engine));
} else renderEditorApp();
