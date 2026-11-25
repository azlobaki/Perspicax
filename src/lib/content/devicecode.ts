import type { Finding } from "../finding.ts";
import { sameOrg } from "../net/domain.ts";

// Pages where a code shown on another device is typed in to sign that device in.
const DEVICE_PAGE =
  /\b(?:https?:\/\/)?(?:www\.)?(microsoft\.com\/devicelogin|aka\.ms\/devicelogin|login\.microsoftonline\.com\/[\w.-]+\/oauth2\/deviceauth|login\.microsoft\.com\/device|microsoft\.com\/link|google\.com\/device|github\.com\/login\/device|device\.sso\.[a-z0-9-]+\.amazonaws\.com)\b/i;
// Microsoft: 8–9 letters and digits, both present; Google and GitHub: XXXX-XXXX or XXX-XXX-XXX.
const CODE = /\b(?=[A-Z0-9]{8,9}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,9}\b|\b[A-Z0-9]{4}-[A-Z0-9]{4}\b|\b[A-Z]{3}-[A-Z]{3}-[A-Z]{3}\b/;

/**
 * Device-code phishing sends no fake page: it asks the reader to type a
 * code on the provider's real device sign-in page, which hands the
 * attacker a token for the reader's account, past MFA. The page is often
 * written out without a link, so the text is read as well as the links.
 */
export function deviceCodeFindings(input: {
  texts: (string | null)[];
  urls: readonly string[];
  fromDomain: string | null;
  orgDomains: readonly string[];
}): Finding[] {
  let page: string | null = null;
  let code: string | null = null;
  for (const text of [...input.texts, ...input.urls]) {
    if (!text) continue;
    const m = DEVICE_PAGE.exec(text);
    if (!m) continue;
    page ??= m[1].toLowerCase();
    if (!code) {
      const around = text.slice(Math.max(0, m.index - 300), m.index + m[0].length + 300);
      code = CODE.exec(around)?.[0] ?? null;
    }
  }
  if (!page) return [];
  for (const text of input.texts) {
    if (code || !text) break;
    code = CODE.exec(text)?.[0] ?? null;
  }
  const own = input.fromDomain !== null && input.orgDomains.some((d) => sameOrg(d, input.fromDomain as string));
  const [severity, weight]: [Finding["severity"], number] = own ? ["low", 4] : code ? ["high", 18] : ["medium", 10];
  return [{
    id: "content.device-code",
    category: "content",
    severity,
    title: code
      ? { en: "Asks to enter a code on a device sign-in page", fr: "Demande de saisir un code sur une page de connexion d’appareil" }
      : { en: "Points to a device sign-in page", fr: "Renvoie vers une page de connexion d’appareil" },
    explanation: {
      en:
        "Device-code phishing needs no fake page: the reader types a code on the provider's genuine page, and that signs the attacker's device into their account, past MFA. " +
        "No provider sends such codes by email unprompted." +
        (own ? " This one comes from your own domain: check that IT really sent it." : ""),
      fr:
        "L’hameçonnage par code d’appareil n’a pas besoin de fausse page\u00a0: le lecteur saisit un code sur la vraie page du fournisseur, ce qui connecte l’appareil de l’attaquant à son compte, sans passer par l’authentification multifacteur. " +
        "Aucun fournisseur n’envoie de tel code par e-mail sans qu’on le lui demande." +
        (own ? " Celui-ci vient de votre propre domaine\u00a0: vérifiez que le service informatique l’a bien envoyé." : ""),
    },
    evidence: code ? [page, code] : [page],
    weight,
  }];
}
