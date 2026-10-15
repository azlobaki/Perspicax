import { BRANDS } from "../data/brands.ts";
import { isFreeMail } from "../data/freemail.ts";
import type { HeaderField } from "../email.ts";
import { evidenceIn, type Evidence, type Finding } from "../finding.ts";
import { parseAddressList, type Address } from "../mime/address.ts";
import { getHeader, getHeaders } from "../mime/headers.ts";
import { orgDomain, sameOrg } from "../net/domain.ts";
import { lookalikeOf, referencesFor } from "../urls/lookalike.ts";
import { hostToUnicode } from "../urls/punycode.ts";

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

/** Words of a person's name: no accents, no case, hyphens and punctuation as spaces. */
function nameWords(text: string): string[] {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function senderFindings(info: SenderInfo, orgDomains: readonly string[], vipNames: readonly string[] = []): Finding[] {
  const findings: Finding[] = [];
  const fromValues = info.rows.filter((r) => r.header === "From").map((r) => `From: ${r.value}`);

  if (info.fromCount === 0) {
    findings.push({
      id: "sender.no-from", category: "sender", severity: "medium", title: { en: "No usable From address", fr: "Aucune adresse From exploitable" },
      explanation: {
        en: "The From header is missing or unreadable, so the message does not say who sent it.",
        fr: "L’en-tête From est absent ou illisible\u00a0: le message n’indique pas qui l’a envoyé.",
      },
      evidence: [], weight: 6,
    });
  } else if (info.fromCount > 1) {
    findings.push({
      id: "sender.multiple-from", category: "sender", severity: "medium", title: { en: "Several From addresses", fr: "Plusieurs adresses From" },
      explanation: {
        en: "Mail clients show only one of them, and which one depends on the client.",
        fr: "Les clients de messagerie n’en affichent qu’une seule, et laquelle dépend du client.",
      },
      evidence: fromValues, weight: 6,
    });
  }

  const diverted = info.rows.filter((r) => r.header === "Reply-To" && r.matchesFrom === false);
  if (diverted.length > 0) {
    const domains = [...new Set(diverted.map((r) => r.domain))].join(", ");
    findings.push({
      id: "sender.reply-to-mismatch", category: "sender", severity: "medium", title: { en: "Replies go to a different domain", fr: "Les réponses partent vers un autre domaine" },
      explanation: {
        en:
          `Answering this email sends the reply to ${domains}, not to the sender shown` +
          (diverted.some((r) => r.freeMail) ? ", and to a free webmail address." : "."),
        fr:
          `Répondre à cet e-mail envoie la réponse à ${domains}, et non à l’expéditeur affiché` +
          (diverted.some((r) => r.freeMail) ? ", et vers une adresse de messagerie gratuite." : "."),
      },
      evidence: diverted.map((r) => `Reply-To: ${r.value}`), weight: 8,
    });
  }

  // An attacker who registers a lookalike domain passes SPF, DKIM and DMARC:
  // the domain itself is the tell.
  const references = referencesFor(orgDomains);
  const imitations = info.rows
    .filter((row) => row.header !== "Message-ID" && row.domain !== null && !row.freeMail)
    .map((row) => ({ row, imitates: lookalikeOf(hostToUnicode(row.domain as string), references) }))
    .filter((x): x is { row: SenderRow; imitates: string } => x.imitates !== null);
  if (imitations.length > 0) {
    const imitated = [...new Set(imitations.map((x) => x.imitates))].join(", ");
    const line = (row: SenderRow): Evidence => {
      const domain = row.domain as string;
      const quoted = `${row.header}: ${row.value}`;
      return hostToUnicode(domain) !== domain
        ? { en: `${quoted} (reads as ${hostToUnicode(domain)})`, fr: `${quoted} (se lit ${hostToUnicode(domain)})` }
        : quoted;
    };
    findings.push({
      id: "sender.lookalike-domain", category: "sender", severity: "high",
      title: {
        en: `Sender domain imitates ${imitated}`,
        fr: `Le domaine de l’expéditeur imite ${imitated}`,
      },
      explanation: {
        en: "The address is at a domain built to be mistaken for a familiar one — your organisation's or a well-known brand's. Its owner can make it pass SPF, DKIM and DMARC.",
        fr: "L’adresse appartient à un domaine conçu pour être pris pour un domaine familier, celui de votre organisation ou d’une marque connue. Son propriétaire peut lui faire passer SPF, DKIM et DMARC.",
      },
      evidence: [...new Map(imitations.map(({ row }) => line(row)).map((e) => [evidenceIn(e, "en"), e])).values()],
      weight: 15,
    });
  }

  const from = info.from;
  if (from && from.name) {
    const evidence = [`From: ${from.name} <${from.address}>`];
    const shown = /[^\s<>"@]+@([^\s<>"@]+\.[^\s<>"@]+)/.exec(from.name);
    if (shown && !sameOrg(shown[1], from.domain)) {
      findings.push({
        id: "sender.display-name-address", category: "sender", severity: "high", title: { en: "Display name shows another address", fr: "Le nom affiché montre une autre adresse" },
        explanation: {
          en: "Many mail clients only show the display name, so the reader sees an address this message did not come from.",
          fr: "De nombreux clients de messagerie n’affichent que le nom, si bien que le lecteur voit une adresse dont le message ne provient pas.",
        },
        evidence, weight: 15,
      });
    }
    const brand = BRANDS.find((b) => b.pattern.test(from.name) && !b.domains.some((d) => sameOrg(d, from.domain)));
    if (brand) {
      findings.push({
        id: "sender.brand-impersonation", category: "sender", severity: "medium", title: { en: `Display name invokes ${brand.name}`, fr: `Le nom affiché se réclame de ${brand.name}` },
        explanation: {
          en: `The sender calls itself ${brand.name} but writes from ${from.domain}, which is not one of ${brand.name}'s domains.`,
          fr: `L’expéditeur se présente comme ${brand.name} mais écrit depuis ${from.domain}, qui n’est pas l’un des domaines de ${brand.name}.`,
        },
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
        id: "sender.org-impersonation", category: "sender", severity: "medium", title: { en: "Display name imitates your organisation", fr: "Le nom affiché imite votre organisation" },
        explanation: {
          en: `The display name looks like ${imitated}, but the address is at ${from.domain}.`,
          fr: `Le nom affiché ressemble à ${imitated}, mais l’adresse est sur ${from.domain}.`,
        },
        evidence, weight: 10,
      });
    }
    // The CEO-fraud classic: a protected person's name, any order, on an address outside the organisation.
    const displayed = nameWords(from.name);
    const vip = vipNames.find((v) => {
      const words = nameWords(v);
      return words.length >= 2 && words.every((w) => displayed.includes(w));
    });
    if (vip && !orgDomains.some((d) => sameOrg(d, from.domain))) {
      findings.push({
        id: "sender.vip-impersonation", category: "sender", severity: "high", title: { en: `Display name of a protected person: ${vip}`, fr: `Nom affiché d’une personne protégée\u00a0: ${vip}` },
        explanation: {
          en:
            `The sender shows the name of ${vip}, on your list of protected people, but writes from ${from.domain}` +
            (isFreeMail(from.domain) ? ", a free webmail address." : ", which is not one of your organisation's domains.") +
            " Fraudsters borrow executives' names to ask for urgent transfers or bank-detail changes." +
            (orgDomains.length === 0 ? " Add your organisation's domains in Settings so mail from the real person is recognised." : ""),
          fr:
            `L’expéditeur affiche le nom de ${vip}, qui figure dans votre liste de personnes protégées, mais écrit depuis ${from.domain}` +
            (isFreeMail(from.domain) ? ", une adresse de messagerie gratuite." : ", qui n’est pas l’un des domaines de votre organisation.") +
            " Les fraudeurs empruntent le nom de dirigeants pour réclamer des virements urgents ou des changements de coordonnées bancaires." +
            (orgDomains.length === 0 ? " Ajoutez les domaines de votre organisation dans les Réglages pour que les messages de la vraie personne soient reconnus." : ""),
        },
        evidence, weight: 20,
      });
    }
  }
  return findings;
}
