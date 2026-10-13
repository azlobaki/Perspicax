import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import type { Attachment } from "../email.ts";
import { parseEmail } from "../mime/parse.ts";
import { decodePng } from "../testing/png.ts";
import { analyzeAttachments, attachmentFindings } from "./analyze.ts";

const attachmentsOf = (name: string) =>
  parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url))).attachments;
const file = (filename: string, data: Uint8Array, contentType = "application/octet-stream"): Attachment => ({
  filename, contentType, contentId: null, inline: false, data,
});
const decodeImage = async (data: Uint8Array) => decodePng(data);

test("unmasks the spoofed invoice's smuggling page", async () => {
  const [report] = await analyzeAttachments(attachmentsOf("spoofed-invoice.eml"));
  assert.equal(report.detected.kind, "html");
  assert.deepEqual(report.flags, ["web-page", "double-extension", "html-smuggling"]);
  assert.equal(report.hashes.sha256, createHash("sha256").update(report.html ?? "").digest("hex"));
  assert.deepEqual(attachmentFindings([report]).map((f) => f.id), ["attachment.html-smuggling", "attachment.double-extension"]);
});

test("finds the macros and remote template in the .docm", async () => {
  const [report] = await analyzeAttachments(attachmentsOf("macro-docm.eml"));
  assert.equal(report.detected.kind, "docx");
  assert.deepEqual(report.flags, ["macros", "remote-template"]);
  assert.equal(report.details["remote-template"], "https://cdn-office365.top/templates/releve.dotm");
  assert.deepEqual(report.urls, ["https://cdn-office365.top/templates/releve.dotm"]);
  assert.deepEqual(attachmentFindings([report]).map((f) => f.id), ["attachment.macros", "attachment.remote-template"]);
});

test("sees through the reversed name and into the archive", async () => {
  const [report] = await analyzeAttachments(attachmentsOf("rtlo-archive.eml"));
  assert.equal(report.visibleName, "Commande_4471⟨U+202E⟩fdp.zip");
  assert.deepEqual(report.entries, [{ name: "Commande_4471.pdf.exe", size: 128, encrypted: false, flagged: true }]);
  assert.deepEqual(attachmentFindings([report]).map((f) => f.id).sort(), ["attachment.archive-hides-program", "attachment.rtlo"]);
});

test("reads the QR code when an image decoder is available", async () => {
  const withDecoder = await analyzeAttachments(attachmentsOf("quishing-qr.eml"), { decodeImage });
  assert.deepEqual(withDecoder[0].qr, ["https://login-micros0ft365.com.verify-mfa.top/?e=claire.dupont"]);
  assert.deepEqual(withDecoder[0].flags, ["qr-code"]);
  const without = await analyzeAttachments(attachmentsOf("quishing-qr.eml"));
  assert.deepEqual(without[0].qr, []);
});

test("flags a misnamed file, an encrypted archive and an active PDF", async () => {
  const zip = zipSync({ "a.txt": strToU8("x") });
  const encrypted = zip.slice();
  const central = encrypted.findIndex((_, i) => encrypted[i] === 0x50 && encrypted[i + 1] === 0x4b && encrypted[i + 2] === 1 && encrypted[i + 3] === 2);
  encrypted[central + 8] |= 1;
  const reports = await analyzeAttachments([
    file("invoice.pdf", zip),
    file("scan.zip", encrypted),
    file("terms.pdf", strToU8("%PDF-1.7\n1 0 obj\n<< /OpenAction << /S /Launch /F (cmd.exe) >> >>\nendobj\n")),
  ]);
  assert.equal(reports[0].details["type-mismatch"], "named .pdf, actually ZIP archive");
  assert.ok(reports[1].flags.includes("encrypted-archive"));
  assert.equal(reports[2].details["pdf-active"], "runs an action when opened, launches a program");
  assert.deepEqual(attachmentFindings(reports).map((f) => f.id), [
    "attachment.encrypted-archive",
    "attachment.type-mismatch",
    "attachment.pdf-active",
  ]);
});

test("leaves ordinary attachments alone", async () => {
  const reports = await analyzeAttachments([file("photo.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")]);
  assert.deepEqual(reports[0].flags, []);
  assert.deepEqual(attachmentFindings(reports), []);
});
