export function parseProgramArgs(value: string) {
  const args: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
  for (const match of value.matchAll(pattern)) {
    args.push((match[1] ?? match[2] ?? match[0]).replace(/\\([\\"'])/g, "$1"));
  }
  return args;
}
