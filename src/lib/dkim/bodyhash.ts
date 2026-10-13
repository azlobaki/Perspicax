import type { ParsedEmail } from "../email.ts";
import type { Finding } from "../finding.ts";
import { binaryToBytes, bytesToBinary } from "../mime/bytes.ts";
import { getHeaders } from "../mime/headers.ts";

type Canon = "simple" | "relaxed";

export type DkimSignature = {
  domain: string;
  selector: string;
  algorithm: string;
  headerCanon: Canon;
  bodyCanon: Canon;
  /** `bh=`, base64. */
  bodyHash: string;
  /** `l=`: only this many canonical body bytes were signed. */
  length: number | null;
};

const canon = (value: string | undefined): Canon => (value === "relaxed" ? "relaxed" : "simple");

export function parseDkimSignature(value: string): DkimSignature | null {
  const tags = new Map<string, string>();
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).replace(/\s+/g, ""));
  }
  const domain = tags.get("d");
  const bodyHash = tags.get("bh");
  const algorithm = (tags.get("a") ?? "").toLowerCase();
  if (!domain || !bodyHash || !algorithm) return null;
  const [header, body] = (tags.get("c") ?? "simple/simple").toLowerCase().split("/");
  const length = tags.has("l") ? Number(tags.get("l")) : null;
  return {
    domain: domain.toLowerCase(),
    selector: tags.get("s") ?? "",
    algorithm,
    headerCanon: canon(header),
    bodyCanon: canon(body),
    bodyHash,
    length: length !== null && Number.isFinite(length) ? length : null,
  };
}

/**
 * RFC 6376 §3.4.3–3.4.4. Line ends are normalised to CRLF first: a message
 * saved to disk on Unix has lost them, but they are what was signed.
 */
export function canonicalizeBody(body: Uint8Array, mode: Canon): Uint8Array {
  let lines = bytesToBinary(body).split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop(); // the final line break, not an empty line
  if (mode === "relaxed") lines = lines.map((line) => line.replace(/[ \t]+/g, " ").replace(/ $/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return mode === "simple" ? binaryToBytes("\r\n") : new Uint8Array(0);
  return binaryToBytes(lines.map((line) => `${line}\r\n`).join(""));
}

export type DkimCheck = { signature: DkimSignature; result: "match" | "mismatch" | "unsupported" };

const DIGESTS: Record<string, string> = { "rsa-sha256": "SHA-256", "ed25519-sha256": "SHA-256", "rsa-sha1": "SHA-1" };

export async function checkBodyHash(signature: DkimSignature, body: Uint8Array): Promise<DkimCheck["result"]> {
  const digest = DIGESTS[signature.algorithm];
  if (!digest) return "unsupported";
  let canonical = canonicalizeBody(body, signature.bodyCanon);
  if (signature.length !== null) canonical = canonical.subarray(0, signature.length);
  const hash = new Uint8Array(await crypto.subtle.digest(digest, canonical.slice()));
  return btoa(bytesToBinary(hash)) === signature.bodyHash ? "match" : "mismatch";
}

/** Every DKIM-Signature's body hash against this file's body. The signature itself needs DNS and is not verified. */
export async function dkimChecks(email: ParsedEmail): Promise<DkimCheck[]> {
  if (email.rawBody === null) return [];
  const checks: DkimCheck[] = [];
  for (const value of getHeaders(email.headers, "dkim-signature")) {
    const signature = parseDkimSignature(value);
    if (signature) checks.push({ signature, result: await checkBodyHash(signature, email.rawBody) });
  }
  return checks;
}

export function dkimFindings(checks: readonly DkimCheck[]): Finding[] {
  const changed = checks.filter((check) => check.result === "mismatch");
  if (changed.length === 0) return [];
  return [{
    id: "dkim.body-modified", category: "auth", severity: "medium", title: "Body changed after signing",
    explanation:
      "The body hash in the DKIM signature does not match this file's body: the content was altered after the sender signed it — by a gateway adding a banner, by forwarding, or by tampering.",
    evidence: changed.map((c) => `d=${c.signature.domain} s=${c.signature.selector} c=${c.signature.headerCanon}/${c.signature.bodyCanon}`),
    weight: 6,
  }];
}
