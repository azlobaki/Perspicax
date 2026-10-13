import * as CFB from "cfb";
import { decodeUtf8OrLegacy } from "../mime/charset.ts";
import { readZipEntry, type ZipEntry } from "./zip.ts";

export type OoxmlInfo = {
  /** docx / xlsx / pptx / jar, or null for an ordinary ZIP. */
  kind: string | null;
  /** Where the VBA project sits, when there is one. */
  macros: string | null;
  /** A template fetched from the network when the document opens (template injection). */
  remoteTemplate: string | null;
  /** Every external http(s) target in the package's relationships. */
  externalUrls: string[];
};

const RELATIONSHIP = /<Relationship\b[^>]*>/gi;

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;
}

export function inspectOoxml(data: Uint8Array, entries: ZipEntry[]): OoxmlInfo {
  const names = entries.map((e) => e.name);
  const under = (prefix: string) => names.some((n) => n.startsWith(prefix));
  let kind: string | null = null;
  if (names.includes("[Content_Types].xml")) {
    kind = under("word/") ? "docx" : under("xl/") ? "xlsx" : under("ppt/") ? "pptx" : null;
  } else if (names.some((n) => n.toUpperCase() === "META-INF/MANIFEST.MF")) {
    kind = "jar";
  }

  const macros = names.find((n) => /(^|\/)vbaProject\.bin$/i.test(n)) ?? null;
  let remoteTemplate: string | null = null;
  const externalUrls: string[] = [];
  for (const entry of entries) {
    if (!/\.rels$/i.test(entry.name)) continue;
    const content = readZipEntry(data, entry);
    if (!content) continue;
    for (const tag of decodeUtf8OrLegacy(content).match(RELATIONSHIP) ?? []) {
      const target = attribute(tag, "Target");
      if (!target || !/^https?:\/\//i.test(target) || (attribute(tag, "TargetMode") ?? "").toLowerCase() !== "external") continue;
      if (!externalUrls.includes(target)) externalUrls.push(target);
      if (/attachedTemplate$/i.test(attribute(tag, "Type") ?? "")) remoteTemplate = target;
    }
  }
  return { kind, macros, remoteTemplate, externalUrls };
}

export type OleInfo = { kind: string | null; macros: string | null };

/** Legacy Office (OLE compound file): which application, and whether it carries a VBA project. */
export function inspectOle(data: Uint8Array): OleInfo {
  let paths: string[];
  try {
    paths = CFB.read(data, { type: "array" }).FullPaths.map((p) => p.replace(/^Root Entry\//, "").replace(/\/$/, ""));
  } catch {
    return { kind: null, macros: null };
  }
  const segments = new Set(paths.flatMap((p) => p.split("/")).map((s) => s.toLowerCase()));
  const kind = segments.has("worddocument")
    ? "doc"
    : segments.has("workbook") || segments.has("book")
      ? "xls"
      : segments.has("powerpoint document")
        ? "ppt"
        : paths.some((p) => p.toLowerCase().includes("__properties_version1.0"))
          ? "msg"
          : null;
  const macros =
    paths.find((p) => /(^|\/)(Macros|_VBA_PROJECT_CUR)\/VBA$/i.test(p)) ??
    paths.find((p) => /(^|\/)VBA$/i.test(p)) ??
    null;
  return { kind, macros };
}
