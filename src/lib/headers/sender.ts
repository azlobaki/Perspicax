import { BRANDS } from "../data/brands.ts";
import { isFreeMail } from "../data/freemail.ts";
import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { parseAddressList, type Address } from "../mime/address.ts";
import { getHeader, getHeaders } from "../mime/headers.ts";
import { orgDomain, sameOrg } from "../net/domain.ts";

export type SenderRow = {
  header: "From" | "Sender" | "Reply-To" | "Return-Path" | "Message-ID";
  value: string;
  domain: string | null;
  /** Same organisation as the From domain; null for From itself or when unknown. */
  matchesFrom: boolean | null;
  freeMail: boolean;
};

export type SenderInfo = { from: Address | null; fromCount: number; rows: SenderRow[] };

export function senderInfo(headers: readonly HeaderField[]): SenderInfo {
  const fromList = getHeaders(headers, "from").flatMap(parseAddressList);
  const from = fromList[0] ?? null;
  const row = (header: SenderRow["header"], value: string, domain: string | null): SenderRow => ({
    header,
    value,
    domain,
    matchesFrom: header === "From" || domain === null || from === null ? null : sameOrg(domain, from.domain),
    freeMail: domain !== null && isFreeMail(domain),
  });

  const rows = fromList.map((a) => row("From", a.address, a.domain));
  for (const a of parseAddressList(getHeader(headers, "sender") ?? "")) rows.push(row("Sender", a.address, a.domain));
  for (const a of getHeaders(headers, "reply-to").flatMap(parseAddressList)) rows.push(row("Reply-To", a.address, a.domain));
  const returnPath = getHeader(headers, "return-path");
  if (returnPath !== null) {
    const [a] = parseAddressList(returnPath);
    rows.push(row("Return-Path", a ? a.address : returnPath.trim(), a ? a.domain : null));
  }
  const messageId = getHeader(headers, "message-id");
  if (messageId !== null) {
    const domain = /@([^>\s]+)>?\s*$/.exec(messageId.trim());
    rows.push(row("Message-ID", messageId.trim(), domain ? domain[1].toLowerCase() : null));
  }
  return { from, fromCount: fromList.length, rows };
}

function normaliseName(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function senderFindings(info: SenderInfo, orgDomains: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const fromValues = info.rows.filter((r) => r.header === "From").map((r) => `From: ${r.value}`);

  if (info.fromCount === 0) {
    findings.push({
      id: "sender.no-from", category: "sender", severity: "medium", title: "No usable From address",
      explanation: "The From header is missing or unreadable, so the message does not say who sent it.",
      evidence: [], weight: 6,
    });
  } else if (info.fromCount > 1) {
    findings.push({
      id: "sender.multiple-from", category: "sender", severity: "medium", title: "Several From addresses",
      explanation: "Mail clients show only one of them, and which one depends on the client.",
      evidence: fromValues, weight: 6,
    });
  }

  const diverted = info.rows.filter((r) => r.header === "Reply-To" && r.matchesFrom === false);
  if (diverted.length > 0) {
    const domains = [...new Set(diverted.map((r) => r.domain))].join(", ");
    findings.push({
      id: "sender.reply-to-mismatch", category: "sender", severity: "medium", title: "Replies go to a different domain",
      explanation:
        `Answering this email sends the reply to ${domains}, not to the sender shown` +
        (diverted.some((r) => r.freeMail) ? ", and to a free webmail address." : "."),
      evidence: diverted.map((r) => `Reply-To: ${r.value}`), weight: 8,
    });
  }

  const from = info.from;
  if (from && from.name) {
    const evidence = [`From: ${from.name} <${from.address}>`];
    const shown = /[^\s<>"@]+@([^\s<>"@]+\.[^\s<>"@]+)/.exec(from.name);
    if (shown && !sameOrg(shown[1], from.domain)) {
      findings.push({
        id: "sender.display-name-address", category: "sender", severity: "high", title: "Display name shows another address",
        explanation: "Many mail clients only show the display name, so the reader sees an address this message did not come from.",
        evidence, weight: 15,
      });
    }
    const brand = BRANDS.find((b) => b.pattern.test(from.name) && !b.domains.some((d) => sameOrg(d, from.domain)));
    if (brand) {
      findings.push({
        id: "sender.brand-impersonation", category: "sender", severity: "medium", title: `Display name invokes ${brand.name}`,
        explanation: `The sender calls itself ${brand.name} but writes from ${from.domain}, which is not one of ${brand.name}'s domains.`,
        evidence, weight: 10,
      });
    }
    const name = normaliseName(from.name);
    const imitated = orgDomains.find((d) => {
      const label = normaliseName(orgDomain(d).split(".")[0]);
      return label.length >= 4 && name.includes(label) && !sameOrg(d, from.domain);
    });
    if (imitated) {
      findings.push({
        id: "sender.org-impersonation", category: "sender", severity: "medium", title: "Display name imitates your organisation",
        explanation: `The display name looks like ${imitated}, but the address is at ${from.domain}.`,
        evidence, weight: 10,
      });
    }
  }
  return findings;
}
