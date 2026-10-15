import { isFreeMail } from "../data/freemail.ts";
import type { Finding } from "../finding.ts";
import { sameOrg } from "../net/domain.ts";

// Matched against a lowercased, accent-free copy of the text (see `fold`).
const BANK =
  /\b(?:rib|iban|releve d'identite bancaire|(?:coordonnees|informations?|donnees|references|domiciliation) bancaires?|compte (?:bancaire|en banque)|bank(?:ing)? (?:details|information|info|account|coordinates)|banks?|account number|routing number|sort code|direct deposit|(?:payment|remittance) (?:details|information|instructions))\b/g;
const CHANGE =
  /\b(?:modifi\w*|chang\w*|mettre a jour|mise a jour|actualis\w*|remplac\w*|nouvel(?:le)?s?|nouveaux?|update[ds]?|updating|new|modify|switch\w*|replac\w*|amend\w*)\b/;
const PAYMENT =
  /\b(?:paie|salaires?|virements?|bulletins? de (?:paie|salaire)|payroll|salary|pay ?checks?|payslips?|wages?|wire|transfers?|invoice payments?)\b/;

/** How far apart the bank words and the request may sit. */
const WINDOW = 150;

/**
 * Lowercase without accents, one char per char, so offsets still point into
 * the original text when quoting it.
 */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD")[0].toLowerCase()[0];
    out += ch.length === 2 ? `${base} ` : base;
  }
  return out.replace(/[’‘`´]/g, "'");
}

function quote(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 60);
  const to = Math.min(text.length, end + 100);
  const excerpt = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${excerpt}${to < text.length ? "…" : ""}`;
}

/**
 * Payroll diversion, supplier and CEO fraud need no link and no attachment:
 * just a believable request to send money somewhere new. The words are the tell.
 */
export function bankChangeFindings(input: {
  texts: (string | null)[];
  fromDomain: string | null;
  orgDomains: readonly string[];
}): Finding[] {
  const { fromDomain, orgDomains } = input;
  // From the organisation itself: spoofing it is DMARC's business, not this check's.
  if (fromDomain !== null && orgDomains.some((d) => sameOrg(d, fromDomain))) return [];

  for (const text of input.texts) {
    if (!text) continue;
    const folded = fold(text);
    for (const match of folded.matchAll(BANK)) {
      const start = match.index;
      const end = start + match[0].length;
      const around = folded.slice(Math.max(0, start - WINDOW), end + WINDOW);
      // "bank" alone is too common: it needs a payment word, not just "new".
      const lone = match[0] === "bank" || match[0] === "banks";
      if (!PAYMENT.test(around) && (lone || !CHANGE.test(around))) continue;

      const free = fromDomain !== null && isFreeMail(fromDomain);
      return [{
        id: "content.payment-details",
        category: "content",
        severity: free ? "high" : "medium",
        title: free
          ? { en: "Payment or bank-details request from a webmail address", fr: "Demande de paiement ou de coordonnées bancaires depuis une adresse de messagerie gratuite" }
          : { en: "Payment or bank-details request", fr: "Demande de paiement ou de coordonnées bancaires" },
        explanation: {
          en:
            "Payroll, supplier and CEO fraud need no link or attachment: a message simply asks for a transfer, or to pay into a new account." +
            (free ? " This one comes from a free webmail address, which anyone can open in a colleague's or supplier's name." : "") +
            " Confirm by phone, on a number you already had, before changing anything.",
          fr:
            "La fraude au salaire, au fournisseur ou au président n’exige ni lien ni pièce jointe\u00a0: un simple message demande un virement, ou un paiement sur un nouveau compte." +
            (free ? " Celui-ci provient d’une adresse de messagerie gratuite, que n’importe qui peut ouvrir au nom d’un collègue ou d’un fournisseur." : "") +
            " Confirmez par téléphone, à un numéro que vous aviez déjà, avant de modifier quoi que ce soit.",
        },
        evidence: [quote(text, start, end)],
        weight: free ? 20 : 10,
      }];
    }
  }
  return [];
}
