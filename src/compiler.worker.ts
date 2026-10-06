/// <reference lib="webworker" />

import {
  ConsoleStdout,
  Directory,
  File,
  Inode,
  OpenFile,
  PreopenDirectory,
  WASI,
} from "@bjorn3/browser_wasi_shim";
import { compile } from "browsercc";
import { validateProjectFiles } from "./lib/project";
import type { CppStandard, ProjectFile, WorkerRequest, WorkerResponse } from "./types";

const worker = self as DedicatedWorkerGlobalScope;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function send(message: WorkerResponse) {
  worker.postMessage(message);
}

function compilerStandard(standard: CppStandard) {
  return standard === "c++23" ? "c++2b" : standard;
}

function createWorkspace(files: ProjectFile[]) {
  const root = new Map<string, Inode>();

  for (const projectFile of files) {
    const parts = projectFile.path.split("/").filter(Boolean);
    if (!parts.length) continue;
    let contents = root;

    for (const part of parts.slice(0, -1)) {
      const existing = contents.get(part);
      if (existing instanceof Directory) {
        contents = existing.contents;
      } else {
        const directory = new Directory(new Map());
        contents.set(part, directory);
        contents = directory.contents;
      }
    }

    contents.set(parts.at(-1)!, new File(encoder.encode(projectFile.content)));
  }

  return new PreopenDirectory("/workspace", root);
}

function readWorkspace(directory: Directory, prefix = ""): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (const [name, entry] of directory.contents) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry instanceof Directory) {
      files.push(...readWorkspace(entry, path));
    } else if (entry instanceof File) {
      files.push({ path, content: new TextDecoder().decode(entry.data) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

worker.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "run") return;

  const { id, entryFile, files, stdin, args, standard, optimization } = event.data;
  const compileStarted = performance.now();

  try {
    const validation = validateProjectFiles(files);
    if (!validation.ok) throw new Error(validation.error);
    send({ type: "status", id, phase: "loading" });
    await Promise.resolve();
    send({ type: "status", id, phase: "compiling" });

    const entry = files.find((file) => file.path === entryFile);
    if (!entry) throw new Error(`Entry file not found: ${entryFile}`);

    const extraFiles = Object.fromEntries(
      files.filter((file) => file.path !== entryFile).map((file) => [file.path, file.content]),
    );
    const { module, compileOutput } = await compile({
      source: entry.content,
      fileName: entryFile,
      flags: [
        `-std=${compilerStandard(standard)}`,
        `-O${optimization}`,
        "-Wall",
        "-Wextra",
        "-fno-exceptions",
        "-fdiagnostics-color=never",
      ],
      extraFiles,
    });

    const compileMs = performance.now() - compileStarted;
    if (!module) {
      send({
        type: "error",
        id,
        message: compileOutput || "Compilation failed without diagnostics.",
        compileMs,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    send({ type: "status", id, phase: "mounting" });
    const workspace = createWorkspace(files);
    const fds = [
      new OpenFile(new File(encoder.encode(stdin))),
      new ConsoleStdout((data: Uint8Array) => {
        stdout += decoder.decode(data, { stream: true });
      }),
      new ConsoleStdout((data: Uint8Array) => {
        stderr += decoder.decode(data, { stream: true });
      }),
      workspace,
    ];

    const wasi = new WASI([entryFile, ...args], ["HOME=/workspace", "PWD=/workspace"], fds);
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    send({ type: "status", id, phase: "running" });
    const runStarted = performance.now();
    let exitCode = 0;

    try {
      exitCode = wasi.start(instance as unknown as {
        exports: { memory: WebAssembly.Memory; _start: () => unknown };
      });
    } catch (error) {
      exitCode = 1;
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
    }

    const outputFiles = readWorkspace(workspace.dir);
    const outputValidation = validateProjectFiles(outputFiles);
    if (!outputValidation.ok) throw new Error(`Runtime filesystem rejected: ${outputValidation.error}`);

    send({
      type: "result",
      id,
      stdout,
      stderr,
      compileOutput,
      compileMs,
      runMs: performance.now() - runStarted,
      exitCode,
      files: outputFiles,
    });
  } catch (error) {
    send({
      type: "error",
      id,
      message: error instanceof Error ? error.stack || error.message : String(error),
      compileMs: performance.now() - compileStarted,
    });
  }
};

export {};
