export type CppStandard = "c++11" | "c++14" | "c++17" | "c++20" | "c++23";

export type ProjectFile = {
  path: string;
  content: string;
  encoding?: "base64";
  mimeType?: string;
};

export type WorkerRequest = {
  type: "run";
  id: number;
  entryFile: string;
  files: ProjectFile[];
  stdin: string;
  args: string[];
  standard: CppStandard;
  optimization: "0" | "1" | "2" | "3" | "s";
};

export type WorkerResponse =
  | { type: "status"; id: number; phase: "loading" | "compiling" | "mounting" | "running" }
  | {
      type: "result";
      id: number;
      stdout: string;
      stderr: string;
      compileOutput: string;
      compileMs: number;
      runMs: number;
      exitCode: number;
      files: ProjectFile[];
    }
  | { type: "error"; id: number; message: string; compileMs: number };
