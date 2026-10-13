import { decodeEncodedWords } from "./encoded-words.ts";

export type Address = {
  /** Display name, decoded; empty when there is none. */
  name: string;
  /** `local@domain`, domain lowercased (the local part is case-sensitive). */
  address: string;
  domain: string;
};

/**
 * Parses an address-list header (From, To, Reply-To…). Lenient on purpose:
 * phishing mail is often malformed, so anything shaped like `local@domain`
 * is picked up, inside angle brackets or not.
 */
export function parseAddressList(value: string): Address[] {
  const out: Address[] = [];
  for (const item of splitAddresses(value)) {
    const parsed = parseMailbox(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Splits on commas outside quotes, comments and angle brackets; drops group syntax (`team: a, b;`). */
function splitAddresses(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quoted = false;
  let angle = 0;
  let paren = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quoted) {
      current += ch;
      if (ch === "\\") current += value[++i] ?? "";
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "<") angle++;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    else if (paren === 0 && angle === 0) {
      if (ch === "," || ch === ";") {
        items.push(current);
        current = "";
        continue;
      }
      if (ch === ":") {
        // End of a group name; its members follow.
        current = "";
        continue;
      }
    }
    current += ch;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

function parseMailbox(item: string): Address | null {
  const text = stripComments(item);
  const open = text.lastIndexOf("<");
  const close = open === -1 ? -1 : text.indexOf(">", open);
  let name = "";
  let spec = text;
  if (open !== -1 && close !== -1) {
    name = text.slice(0, open);
    spec = text.slice(open + 1, close);
  }
  const match = /([^\s<>()[\],;:"@]+)@([^\s<>()[\],;:"@]+)/.exec(spec);
  if (!match) return null;
  const domain = match[2].toLowerCase().replace(/\.$/, "");
  return { name: cleanName(name), address: `${match[1]}@${domain}`, domain };
}

function cleanName(name: string): string {
  let n = name.trim();
  if (n.length >= 2 && n.startsWith('"') && n.endsWith('"')) n = n.slice(1, -1).replace(/\\(.)/g, "$1");
  return decodeEncodedWords(n).replace(/\s+/g, " ").trim();
}

function stripComments(text: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') quoted = false;
      continue;
    }
    if (depth === 0 && ch === '"') {
      quoted = true;
      out += ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}
