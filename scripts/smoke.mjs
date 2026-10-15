// Browser smoke test. Serves out/ (run `npm run build` first), drives headless
// Chromium over the DevTools protocol and, for each theme: loads the page,
// opens every fixture listed in fixtures/smoke.json through the file input,
// checks the expected text, takes a screenshot into .smoke/, and fails if any
// request leaves the local server. Set CHROME to override the browser binary.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const SHOTS = join(ROOT, ".smoke");
const THEMES = ["suisse", "console", "dossier"];
const WIDTH = 1440;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function serve() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    // A page of the app's origin that runs nothing, for writing settings.
    if (path === "/smoke-blank") return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>blank</title><link rel="icon" href="data:,">`);
    if (path.endsWith("/")) path += "index.html";
    let file = join(OUT, path);
    if (!file.startsWith(OUT)) return res.writeHead(403).end();
    // Next exports /page as page.html, sometimes next to a page/ directory of its own.
    const isFile = (f) => existsSync(f) && statSync(f).isFile();
    if (!isFile(file) && isFile(`${file}.html`)) file += ".html";
    if (!existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "perspicax-smoke-"));
  const proc = spawn(
    process.env.CHROME ?? "chromium",
    [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      // The app follows the browser's language: pin English so the run does not depend on the machine.
      "--lang=en-US",
      // Ubuntu 24.04 CI runners forbid the unprivileged user namespaces Chrome's
      // sandbox needs; the pages loaded here are our own build and fixtures.
      ...(process.env.CI ? ["--no-sandbox"] : []),
      `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((ok, fail) => {
    let log = "";
    proc.stderr.on("data", (chunk) => {
      log += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (match) ok(match[1]);
    });
    proc.on("exit", (code) => fail(new Error(`Chromium exited (${code}):\n${log}`)));
  });
  return { proc, profile, wsUrl };
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let seq = 0;
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else ok(msg.result);
    } else {
      for (const listener of listeners) listener(msg);
    }
  };
  return {
    opened: new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    }),
    send(method, params = {}, sessionId) {
      return new Promise((ok, fail) => {
        const id = ++seq;
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    once(method, sessionId) {
      return new Promise((ok) => {
        const listener = (msg) => {
          if (msg.method === method && msg.sessionId === sessionId) {
            listeners.delete(listener);
            ok(msg.params);
          }
        };
        listeners.add(listener);
      });
    },
    on(listener) {
      listeners.add(listener);
    },
    close() {
      ws.close();
    },
  };
}

const fixtures = JSON.parse(readFileSync(join(ROOT, "fixtures", "smoke.json"), "utf8"));
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const { proc, profile, wsUrl } = await launch();
const cdp = connect(wsUrl);
const failures = [];
const external = [];
const errors = [];

try {
  await cdp.opened;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  for (const domain of ["Page", "Network", "Runtime", "DOM", "Log"]) await page(`${domain}.enable`);
  // The app follows the browser's language: pin English (French passes are added separately).
  await page("Emulation.setLocaleOverride", { locale: "en-US" });
  const { userAgent } = await cdp.send("Browser.getVersion");
  await page("Emulation.setUserAgentOverride", { userAgent, acceptLanguage: "en-US,en" });
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 1000, deviceScaleFactor: 1, mobile: false });
  cdp.on((msg) => {
    if (msg.method !== "Network.requestWillBeSent" || msg.sessionId !== sessionId) return;
    const url = msg.params.request.url;
    // Only network schemes count: browser-internal ones (chrome-extension:,
    // data:, blob:) never leave the machine.
    if (/^(https?|wss?):/.test(url) && !url.startsWith(base)) external.push(url);
  });
  // CSP violations, React errors and uncaught exceptions all land here.
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params.exceptionDetails;
      errors.push(details.exception?.description ?? details.text);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      errors.push(msg.params.entry.text);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
  });

  const load = async (url) => {
    const loaded = cdp.once("Page.loadEventFired", sessionId);
    await page("Page.navigate", { url });
    await loaded;
  };
  const evaluate = async (expression) => {
    const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot = async (name) => {
    // Chromium leaves iframes blank in captures beyond the viewport, so a page
    // showing one (the safe preview) is captured as the viewport around it.
    const framed = await evaluate(`(() => {
      const frame = document.querySelector("iframe");
      if (frame) frame.scrollIntoView({ block: "end" });
      return frame !== null;
    })()`);
    if (framed) {
      await evaluate("new Promise((ok) => setTimeout(ok, 300))");
      const { data } = await page("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
      return;
    }
    const { cssContentSize } = await page("Page.getLayoutMetrics");
    const { data } = await page("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: WIDTH, height: Math.ceil(cssContentSize.height), scale: 1 },
    });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
  };

  // Settings are written from a page of the same origin where the app does not
  // run: the app rewrites its normalised settings once hydrated, and on its own
  // page that write could land after ours and undo it.
  const loadWithSettings = async (settings) => {
    await load(`${base}smoke-blank`);
    await evaluate(`localStorage.setItem("perspicax.settings.v1", ${JSON.stringify(JSON.stringify(settings))})`);
    await load(base);
  };

  // Hands a fixture to the page's file input; false when the page has none.
  const openFixture = async (file) => {
    const { root } = await page("DOM.getDocument");
    const { nodeId } = await page("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
    if (!nodeId) return false;
    await page("DOM.setFileInputFiles", { nodeId, files: [join(ROOT, "fixtures", file)] });
    return true;
  };
  // Waits up to 5 s for the report's tabs; records a failure for `where` and returns false when they never come.
  const waitForTabs = async (where) => {
    const shown = await evaluate(`new Promise((ok) => {
      const start = Date.now();
      (function poll() {
        if (document.querySelector('[role="tab"]')) ok(true);
        else if (Date.now() - start > 5000) ok(false);
        else setTimeout(poll, 50);
      })();
    })`);
    if (!shown) failures.push(`${where}: the report's tabs never appeared`);
    return shown;
  };
  // Clicks every tab in turn, letting it settle, and runs `visit` on each.
  const forEachTab = async (visit) => {
    const tabs = await evaluate(`[...document.querySelectorAll('[role="tab"]')].map((t) => t.id)`);
    for (const id of tabs) {
      await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
      await evaluate("new Promise((ok) => setTimeout(ok, 300))");
      await visit(id);
    }
  };

  mkdirSync(SHOTS, { recursive: true });

  // A first visit that changes nothing must leave nothing in the browser.
  await load(base);
  await evaluate("new Promise((ok) => setTimeout(ok, 1500))");
  const stored = await evaluate("localStorage.length");
  if (stored !== 0) failures.push(`a first visit wrote ${stored} localStorage key(s)`);

  for (const theme of THEMES) {
    await loadWithSettings({ theme });
    const applied = await evaluate("document.documentElement.dataset.theme");
    if (applied !== theme) failures.push(`${theme}: <html> has data-theme=${applied}`);
    await screenshot(`${theme}-empty.png`);
    await evaluate(`document.getElementById("open-settings").click()`);
    await evaluate("new Promise((ok) => setTimeout(ok, 300))");
    await screenshot(`${theme}-settings.png`);
    for (const [locale, wants] of [
      ["fr", ["Vercel Inc.", "contact.azlobaki@pm.me", "ne remplace pas l'analyse d'une personne qualifiée"]],
      ["en", ["Vercel Inc.", "contact.azlobaki@pm.me", "the French text is the legally binding one"]],
    ]) {
      await loadWithSettings({ theme, locale });
      await load(`${base}mentions-legales`);
      const legal = await evaluate("document.body.innerText");
      for (const want of wants) {
        if (!legal.includes(want)) failures.push(`${theme}: ${locale} legal notice misses "${want}"`);
      }
      if (locale === "en") await screenshot(`${theme}-legal.png`);
    }

    for (const fixture of fixtures) {
      // A fixture may run under settings of its own (organisation domains…).
      await loadWithSettings({ theme, ...fixture.settings });
      const before = external.length;
      if (!(await openFixture(fixture.file))) {
        failures.push(`${theme}: no file input on the page`);
        break;
      }
      const first = JSON.stringify(fixture.expect[0].toLowerCase());
      const text = await evaluate(`new Promise((ok) => {
        const start = Date.now();
        (function poll() {
          const text = document.body.innerText.toLowerCase();
          if (text.includes(${first}) || Date.now() - start > 5000) ok(text);
          else setTimeout(poll, 50);
        })();
      })`);
      const name = `${theme}-${fixture.file.replace(/\W+/g, "-")}${fixture.settings ? "-with-settings" : ""}`;
      let seen = text;
      await forEachTab(async (id) => {
        await screenshot(`${name}-${id.replace(/^tab-/, "")}.png`);
        seen += ` ${await evaluate("document.body.innerText.toLowerCase()")}`;
      });
      // Expectations may sit on any tab: the attachments' names, say.
      for (const want of fixture.expect) {
        if (!seen.includes(want.toLowerCase())) failures.push(`${theme} / ${fixture.file}: missing "${want}"`);
      }
      if (external.length > before) failures.push(`${theme} / ${fixture.file}: ${external.length - before} external request(s)`);
    }
  }
  // First visit from a French browser: the interface follows it and stores nothing.
  await page("Emulation.setLocaleOverride", { locale: "fr-FR" });
  await page("Emulation.setUserAgentOverride", { userAgent, acceptLanguage: "fr-FR,fr" });
  await load(`${base}smoke-blank`);
  await evaluate("localStorage.clear()");
  await load(base);
  await evaluate("new Promise((ok) => setTimeout(ok, 1500))");
  const frLang = await evaluate("document.documentElement.lang");
  if (frLang !== "fr") failures.push(`French browser: <html lang> is "${frLang}"`);
  if (!(await evaluate("document.body.innerText")).includes("Réglages")) failures.push('French browser: the page does not show "Réglages"');
  const frStored = await evaluate("localStorage.length");
  if (frStored !== 0) failures.push(`French browser: a first visit wrote ${frStored} localStorage key(s)`);
  // Back to English for every later pass.
  await page("Emulation.setLocaleOverride", { locale: "en-US" });
  await page("Emulation.setUserAgentOverride", { userAgent, acceptLanguage: "en-US,en" });

  // Every theme in French: no English left on any tab, French where it matters.
  const ENGLISH = ["Risk score", "Findings", "Relay chain", "Safe preview", "Raw source", "New email", "Settings", "Organisation domains", "Link text shows another destination"];
  const FRENCH = ["Réglages", "Indicateurs malveillants", "Le texte du lien montre une autre destination", "Chaîne de relais"];
  for (const theme of THEMES) {
    await loadWithSettings({ theme, locale: "fr" });
    const before = external.length;
    if (!(await openFixture("spoofed-invoice.eml"))) {
      failures.push(`${theme} in French: no file input on the page`);
      continue;
    }
    if (!(await waitForTabs(`${theme} in French`))) continue;
    let seen = await evaluate("document.body.innerText");
    await forEachTab(async () => {
      seen += ` ${await evaluate("document.body.innerText")}`;
    });
    // innerText follows CSS text-transform: compare without case.
    const lower = seen.toLowerCase();
    for (const word of ENGLISH) if (lower.includes(word.toLowerCase())) failures.push(`${theme} in French: still shows "${word}"`);
    for (const word of FRENCH) if (!lower.includes(word.toLowerCase())) failures.push(`${theme} in French: lacks "${word}"`);
    await screenshot(`${theme}-fr.png`);
    if (external.length > before) failures.push(`${theme} in French: ${external.length - before} external request(s)`);
  }
  // Phone width: every tab of the richest fixture, in every theme, without horizontal scrolling.
  // Not emulated as "mobile": Chromium would then widen the layout viewport to fit
  // the content, hiding the very overflow this pass looks for.
  await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  for (const theme of THEMES) {
    await loadWithSettings({ theme });
    if (!(await openFixture("spoofed-invoice.eml"))) {
      failures.push(`${theme} at 390 px: no file input on the page`);
      continue;
    }
    if (!(await waitForTabs(`${theme} at 390 px`))) continue;
    await forEachTab(async (id) => {
      const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
      if (overflow > 0) failures.push(`${theme} at 390 px, ${id}: ${overflow} px of horizontal overflow`);
    });
    await evaluate(`document.getElementById("tab-headers").click()`);
    const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(join(SHOTS, `${theme}-phone.png`), Buffer.from(data, "base64"));
  }
  // French words are longer: one theme at phone width in French, every tab.
  await loadWithSettings({ theme: "suisse", locale: "fr" });
  if (!(await openFixture("spoofed-invoice.eml"))) {
    failures.push("suisse in French at 390 px: no file input on the page");
  } else if (await waitForTabs("suisse in French at 390 px")) {
    await forEachTab(async (id) => {
      const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
      if (overflow > 0) failures.push(`suisse in French at 390 px, ${id}: ${overflow} px of horizontal overflow`);
    });
  }
} finally {
  cdp.close();
  // Chromium keeps writing its profile until it has exited.
  const exited = new Promise((ok) => proc.once("exit", ok));
  proc.kill();
  await exited;
  server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (external.length > 0) console.error(`External requests:\n  ${[...new Set(external)].join("\n  ")}`);
if (external.length > 0 && failures.length === 0) failures.push(`${external.length} external request(s)`);
if (errors.length > 0) failures.push(`Page errors:\n  ${[...new Set(errors)].join("\n  ")}`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Smoke test passed: ${THEMES.length} themes × ${fixtures.length} fixtures. Screenshots in .smoke/`);
