import "./landing.css";

const examples = {
  cpp: {
    label: "C++", file: "main.cpp", href: "/", language: "Clang + WASI",
    code: `<span class="lp-code-muted">#include &lt;iostream&gt;</span>\n\n<span class="lp-code-orange">int</span> main() {\n    <span class="lp-code-muted">// A real compiler. Right here.</span>\n    std::cout &lt;&lt; <span class="lp-code-green">"Hello, local world!\\n"</span>;\n    <span class="lp-code-orange">return</span> 0;\n}`,
    output: '<span class="lp-code-muted">$ ./main</span>\nHello, local world!<span class="lp-output-success">Process exited successfully</span>',
  },
  sqlite: {
    label: "SQLite", file: "query.sql", href: "/labs/sqlite", language: "SQLite WASM",
    code: `<span class="lp-code-muted">-- Start with the built-in sales dataset.</span>\n<span class="lp-code-orange">SELECT</span> category, <span class="lp-code-green">SUM</span>(amount) <span class="lp-code-orange">AS</span> total\n<span class="lp-code-orange">FROM</span> sales\n<span class="lp-code-orange">GROUP BY</span> category\n<span class="lp-code-orange">ORDER BY</span> total <span class="lp-code-orange">DESC</span>;`,
    output: '<span class="lp-code-muted">category          total</span>\nBooks             135\nHardware          105<span class="lp-output-success">2 rows returned</span>',
  },
  duckdb: {
    label: "DuckDB", file: "analysis.sql", href: "/labs/duckdb", language: "DuckDB WASM",
    code: `<span class="lp-code-muted">-- Explore an imported dataset with SQL.</span>\n<span class="lp-code-orange">SELECT</span> category,\n       <span class="lp-code-green">COUNT</span>(*) <span class="lp-code-orange">AS</span> items,\n       <span class="lp-code-green">SUM</span>(amount) <span class="lp-code-orange">AS</span> total\n<span class="lp-code-orange">FROM</span> sales\n<span class="lp-code-orange">GROUP BY</span> category;`,
    output: '<span class="lp-code-muted">category       items    total</span>\nBooks          3        135\nHardware       2        105<span class="lp-output-success">2 rows returned</span>',
  },
  pglite: {
    label: "PGlite", file: "postgres.sql", href: "/labs/pglite", language: "PostgreSQL via PGlite",
    code: `<span class="lp-code-muted">-- Try PostgreSQL without a running server.</span>\n<span class="lp-code-orange">SELECT</span> product, amount,\n       <span class="lp-code-green">RANK</span>() <span class="lp-code-orange">OVER</span> (\n         <span class="lp-code-orange">ORDER BY</span> amount <span class="lp-code-orange">DESC</span>\n       ) <span class="lp-code-orange">AS</span> position\n<span class="lp-code-orange">FROM</span> sales <span class="lp-code-orange">LIMIT</span> 3;`,
    output: '<span class="lp-code-muted">product       amount    position</span>\nKeyboard      80        1\nCompilers     55        2\nAlgorithms    45        3<span class="lp-output-success">3 rows returned</span>',
  },
};

export function renderLandingPage(app: HTMLDivElement) {
  document.body.classList.add("landing-page");
  document.title = "Local WASM Labs — Less setup. More discovery.";
  app.innerHTML = `
    <a class="lp-skip" href="#main-content">Skip to content</a>
    <header class="lp-header"><div class="lp-container lp-nav">
      <a class="lp-brand" href="/welcome" aria-label="Local WASM Labs home"><span class="lp-brand-mark">{ }</span>Local WASM Labs</a>
      <nav aria-label="Main navigation"><a href="/learn">Learn</a><a href="#labs">The labs</a><a href="#why-local">Why local?</a><a href="#faq">FAQ</a></nav>
      <a class="lp-button lp-button-small" href="#labs">Find your lab <span aria-hidden="true">↗</span></a>
    </div></header>
    <main id="main-content">
      <section class="lp-hero lp-container">
        <div class="lp-hero-copy"><p class="lp-eyebrow"><span class="lp-dot"></span> YOUR BROWSER. YOUR WORKBENCH.</p>
          <h1>Less setup.<br>More <em>discovery.</em></h1>
          <p class="lp-lead">Compile C++. Query your data. Try an idea before it becomes a project. Four real engines, one browser, and nothing to install.</p>
          <div class="lp-hero-actions"><a class="lp-button" href="#labs">Choose a lab <span aria-hidden="true">↗</span></a><a class="lp-text-link" href="/">Jump into C++ <span aria-hidden="true">→</span></a></div>
          <p class="lp-hero-note"><span aria-hidden="true">✓</span> No account <span aria-hidden="true">✓</span> No compilation backend <span aria-hidden="true">✓</span> Files stay on your device</p>
        </div>
        <div class="lp-demo" aria-label="Example workspace preview">
          <div class="lp-demo-top"><span class="lp-window-dots" aria-hidden="true"><b></b><b></b><b></b></span><span>local / playground</span><span class="lp-demo-local"><span class="lp-dot"></span> ON DEVICE</span></div>
          <div class="lp-demo-tabs" role="tablist" aria-label="Example engines">${Object.entries(examples).map(([key, example], i) => `<button id="lp-tab-${key}" data-preview="${key}" role="tab" aria-selected="${i === 0}" aria-controls="lp-preview-panel" tabindex="${i === 0 ? 0 : -1}">${example.label}</button>`).join("")}</div>
          <div id="lp-preview-panel" role="tabpanel" aria-labelledby="lp-tab-cpp"><div class="lp-demo-filename"><span id="lp-demo-file">main.cpp</span><a href="/" id="lp-demo-open">Open this lab <span aria-hidden="true">↗</span></a></div><pre class="lp-demo-code"><code id="lp-demo-code">${examples.cpp.code}</code></pre><div class="lp-demo-output"><div>OUTPUT <span>Illustrative example</span></div><pre id="lp-demo-output">${examples.cpp.output}</pre></div></div>
          <div class="lp-demo-footer"><span id="lp-demo-language">Clang + WASI</span><span>Powered by WebAssembly</span></div>
        </div>
      </section>
      <div class="lp-engine-strip"><div class="lp-container"><span>REAL ENGINES.<br>LOCAL EXECUTION.</span><b>Clang <small>+ WASI</small></b><b>SQLite</b><b>DuckDB</b><b>PostgreSQL <small>via PGlite</small></b></div></div>
      <section class="lp-section lp-container" id="labs">
        <div class="lp-section-heading"><div><p class="lp-eyebrow">01 / THE LABS</p><h2>Pick a tool.<br>Follow your curiosity.</h2></div><p>Each lab has its own workspace. Only the engine you use loads, and its downloads are cached for the next experiment.</p></div>
        <div class="lp-labs-grid">
          <a class="lp-lab lp-lab-cpp" href="/"><div class="lp-lab-top"><span class="lp-lab-symbol">C++</span><span class="lp-lab-type">COMPILE & RUN</span><span class="lp-lab-arrow" aria-hidden="true">↗</span></div><h3>A compiler, minus the setup.</h3><p>Write real C++ with Clang and WASI. Work with headers, project files, stdin, and arguments in a focused editor.</p><div class="lp-lab-tags"><span>C++11–23</span><span>Vim mode</span><span>Split editors</span></div><span class="lp-lab-cta">Open C++ Lab <span aria-hidden="true">→</span></span></a>
          <a class="lp-lab" href="/labs/sqlite"><div class="lp-lab-top"><span class="lp-lab-symbol lp-symbol-sql">SQ</span><span class="lp-lab-type">LEARN & EXPLORE</span><span class="lp-lab-arrow" aria-hidden="true">↗</span></div><h3>Small database. Big possibilities.</h3><p>Learn SQL, test a schema, or explore a local dataset with SQLite. Go from a CSV or JSON file to your first query.</p><div class="lp-lab-tags"><span>SQLite WASM</span><span>CSV / JSON</span><span>Schema explorer</span></div><span class="lp-lab-cta">Open SQLite Lab <span aria-hidden="true">→</span></span></a>
          <a class="lp-lab" href="/labs/duckdb"><div class="lp-lab-top"><span class="lp-lab-symbol lp-symbol-duck">DB</span><span class="lp-lab-type">ANALYZE & DISCOVER</span><span class="lp-lab-arrow" aria-hidden="true">↗</span></div><h3>Find the story in your data.</h3><p>Bring a dataset or a native DuckDB file. Use DuckDB to group, join, filter, and turn rows into answers, all in your browser.</p><div class="lp-lab-tags"><span>DuckDB WASM</span><span>Parquet import</span><span>CSV export</span></div><span class="lp-lab-cta">Open DuckDB Lab <span aria-hidden="true">→</span></span></a>
          <a class="lp-lab" href="/labs/pglite"><div class="lp-lab-top"><span class="lp-lab-symbol lp-symbol-pg">PG</span><span class="lp-lab-type">TRY POSTGRESQL</span><span class="lp-lab-arrow" aria-hidden="true">↗</span></div><h3>Postgres ideas. No server required.</h3><p>Experiment with PostgreSQL syntax, tables, and queries using PGlite. Test the next idea without provisioning a database.</p><div class="lp-lab-tags"><span>PGlite</span><span>PostgreSQL</span><span>Separate sandbox</span></div><span class="lp-lab-cta">Open PGlite Lab <span aria-hidden="true">→</span></span></a>
        </div>
      </section>
      <section class="lp-learning-callout lp-container"><div><p class="lp-eyebrow">GO FROM PLAYGROUND TO LEARNING PATH.</p><h2>A concept. An exercise.<br>A place to try it.</h2><p>Study C++ and DSA, database systems, networking, operating systems, LLD, HLD, and design patterns. Follow a module, collect the concepts, and practice in a lab.</p></div><a class="lp-button" href="/learn">Explore learning paths <span aria-hidden="true">↗</span></a></section>
      <section class="lp-why" id="why-local"><div class="lp-container lp-why-grid"><div class="lp-why-intro"><p class="lp-eyebrow">02 / WHY LOCAL WASM LABS</p><h2>Your next idea<br>deserves a<br><em>shorter runway.</em></h2><p>You shouldn’t need a toolchain, a database server, and a deployment just to answer “what happens if?”</p><div class="lp-local-diagram" aria-label="Code and data execute in your browser"><span>YOUR CODE<br>YOUR DATA</span><span aria-hidden="true">→</span><strong>YOUR BROWSER<span>WebAssembly engines</span></strong></div></div><div class="lp-reasons">
        <article><span class="lp-reason-number">01</span><div><h3>Keep your experiments close.</h3><p>Compilation and queries run on your device. Imported files are local copies; they aren’t sent to a compilation or database backend.</p></div></article>
        <article><span class="lp-reason-number">02</span><div><h3>Use the real thing.</h3><p>Clang, SQLite, DuckDB, and PostgreSQL via PGlite run as WebAssembly. Explore actual language and database behavior with familiar tools.</p></div></article>
        <article><span class="lp-reason-number">03</span><div><h3>Load what you need.</h3><p>Engines initialize on demand. Browser caching reuses downloaded assets, and each SQL lab keeps its own database while you switch between them.</p></div></article>
        <article><span class="lp-reason-number">04</span><div><h3>Spend your time on the question.</h3><p>Sample data, editable SQL, visible schemas, and result grids shorten the path from “I wonder” to “now I know.” No sign-up stands in the way.</p></div></article>
      </div></div></section>
      <section class="lp-section lp-container lp-workflow"><div class="lp-section-heading"><div><p class="lp-eyebrow">03 / FROM IDEA TO ANSWER</p><h2>Open. Explore. Repeat.</h2></div><p>Built for learning a concept, checking a query, or trying a small experiment before you set up a full environment.</p></div><ol class="lp-steps"><li><span>01</span><h3>Choose your engine.</h3><p>Open the C++ editor or a SQL lab. The runtime loads when you’re ready to use it.</p></li><li><span>02</span><h3>Bring something to try.</h3><p>Write a program, load the sample dataset, or import your own files.</p></li><li><span>03</span><h3>Run it. See what changes.</h3><p>Inspect output and results. Adjust the code or query, run again, and download what you need.</p></li></ol></section>
      <section class="lp-section lp-container lp-faq" id="faq"><div><p class="lp-eyebrow">04 / GOOD TO KNOW</p><h2>A few practical details.</h2><p class="lp-faq-intro">A useful scratchpad starts with clear expectations.</p></div><div class="lp-faq-items">
        <details open><summary>Do my code and datasets leave my device?</summary><p>The labs execute locally in Web Workers. Code and imported datasets aren’t uploaded to a compilation or database backend. Your browser downloads the app and the WASM engine assets from the hosting server.</p></details>
        <details><summary>Will my work be there when I return?</summary><p>C++ project drafts and SQL editor drafts are saved in this browser’s local storage. SQL databases and imported datasets stay in memory: they survive switching between SQL labs, but reloads, resets, timeouts, or leaving the SQL workspace clear them. Export results before you leave. Browser site-data cleanup can also remove saved drafts and cached assets.</p></details>
        <details><summary>What data can I import?</summary><p>All SQL labs accept CSV files with headers and JSON arrays of objects. DuckDB also accepts Parquet, Arrow/Feather/IPC, and native DuckDB files. SQLite accepts native SQLite files; PGlite accepts compatible SQL scripts and PGlite snapshots. TSV and JSONL/NDJSON work across the SQL labs. Files can be up to 20 MB; CSV/JSON imports allow up to 20,000 rows and 100 columns. Result grids show the first 1,000 rows, and CSV export uses the displayed result set.</p></details>
        <details><summary>Why does the first run take longer?</summary><p>The engine needs to download and initialize before your first run. The C++ toolchain and DuckDB assets are especially large. Downloads are cached for reuse, so later experiments can start faster. You need a connection to fetch assets that aren’t cached yet.</p></details>
        <details><summary>Is this a replacement for a development environment?</summary><p>It’s a place for learning, prototyping, and focused experiments. The C++ lab compiles one source entry point and doesn’t support native threads, exceptions, or sockets. SQL databases are temporary. Execution has time limits, and browser memory limits still apply.</p></details>
      </div></section>
      <section class="lp-final"><div class="lp-container"><p class="lp-eyebrow">MAKE ROOM FOR A LITTLE EXPERIMENT.</p><h2>What will you try today?</h2><p>A few lines of C++. A question about your data.<br>A query you’ve been meaning to test. Start here.</p><a class="lp-button" href="#labs">Find your lab <span aria-hidden="true">↗</span></a><span class="lp-final-note">No install. No account. Just an idea.</span></div></section>
    </main>
    <footer class="lp-footer lp-container"><a class="lp-brand" href="/welcome"><span class="lp-brand-mark">{ }</span>Local WASM Labs</a><p>A small place for big “what ifs.”</p><a href="https://github.com/shubhdevelop/wasmCPP" target="_blank" rel="noopener noreferrer">View source <span aria-hidden="true">↗</span></a></footer>`;

  function selectExample(key: keyof typeof examples, focus = false) {
    const example = examples[key];
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-preview]")) {
      const selected = button.dataset.preview === key;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    }
    app.querySelector("#lp-preview-panel")!.setAttribute("aria-labelledby", `lp-tab-${key}`);
    app.querySelector("#lp-demo-file")!.textContent = example.file;
    app.querySelector("#lp-demo-code")!.innerHTML = example.code;
    app.querySelector("#lp-demo-output")!.innerHTML = example.output;
    app.querySelector("#lp-demo-language")!.textContent = example.language;
    app.querySelector<HTMLAnchorElement>("#lp-demo-open")!.href = example.href;
  }
  const keys = Object.keys(examples) as (keyof typeof examples)[];
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-preview]")) {
    button.onclick = () => selectExample(button.dataset.preview as keyof typeof examples);
    button.onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const i = keys.indexOf(button.dataset.preview as keyof typeof examples);
      const next = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
      selectExample(keys[next], true);
    };
  }
}
