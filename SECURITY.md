# Security model

Local C++ Lab is a static application. Compilation and execution happen in a dedicated Web Worker in the visitor's browser; no source code is sent to an application server.

## Boundaries

- A WASI preopened directory exposes only an in-memory `/workspace` tree.
- The program cannot access the visitor's host filesystem, browser DOM, cookies, or application JavaScript context.
- The compiler worker is terminated when a run is stopped, exceeds 30 seconds, or crashes.
- Project paths and text sizes are validated in both the main thread and worker.
- Production headers isolate the document and restrict scripts, framing, browser capabilities, and network connections.

## Known limits

WASI and WebAssembly reduce capability access; they do not provide a promise against browser-engine vulnerabilities. Memory limits depend on the browser. Do not add network APIs, credential-bearing endpoints, or host filesystem bridges to the worker without a separate threat-model review.

To report a vulnerability, contact the repository owner privately rather than opening a public issue with exploit details.
