import { isKnownTracker } from "../data/trackers.ts";
import type { ParsedEmail } from "../email.ts";
import { evidenceIn, noted, type Evidence, type Finding, type Severity } from "../finding.ts";
import type { Text } from "../i18n/text.ts";
import { extractHtml, type HtmlForm, type HtmlLink, type HtmlOrigin } from "../html/extract.ts";
import { sameOrg } from "../net/domain.ts";
import { inspectUrl, type InspectedUrl, type UrlFlag } from "../urls/inspect.ts";
import type { OAuthRequest } from "../urls/oauth.ts";
import type { Reference } from "../urls/lookalike.ts";
import { findUrlsInText } from "../urls/text.ts";
import { findRecipients, redactRecipients } from "./recipient.ts";

/** The extractor's reasons are English phrases or CSS declarations; the declarations read the same in both languages. */
export const HIDDEN_FR: Record<string, string> = {
  "hidden attribute": "attribut hidden",
  "same colour as background": "même couleur que le fond",
  "zero size": "taille nulle",
  "off-screen": "hors écran",
};

function hiddenText(reason: string | null): Text | null {
  return reason === null ? null : { en: reason, fr: HIDDEN_FR[reason] ?? reason };
}

export type LinkOrigin = HtmlOrigin | "text" | "file" | "qr";

export type Link = {
  source: "html" | "text" | "attachment";
  /** Name of the attachment the link was found in, for `source: "attachment"`. */
  attachment: string | null;
  origin: LinkOrigin;
  text: string | null;
  hidden: Text | null;
  url: InspectedUrl;
  /** Domain the link text displays, when it is not where the link goes. */
  shownHost: string | null;
  tracking: "pixel" | "tracker" | null;
};

/** What an attachment contributes: its parsed HTML, the URLs inside it, its QR codes. */
export type AttachmentContent = { name: string; html: Document | null; urls: string[]; qr: string[] };

export type LocatedForm = HtmlForm & { attachment: string | null };

export type LinkReport = {
  links: Link[];
  forms: LocatedForm[];
  findings: Finding[];
  /** Who the message was sent to: reports replace their address in links. */
  recipients: string[];
};

export type LinkContext = {
  fromDomain: string | null;
  /** Domains lookalikes are measured against: the organisation's own and well-known brands. */
  references: readonly Reference[];
  /** Who the message was sent to, to spot links that carry their address. */
  recipients?: readonly string[];
};

const CLICKABLE = new Set<LinkOrigin>(["a", "area", "form", "meta-refresh", "text", "file", "qr"]);

/** Links a reader can follow, as opposed to resources the email loads by itself. */
export function isClickable(link: Link): boolean {
  return CLICKABLE.has(link.origin);
}

// Link text that is itself an address: "https://espace-client.example.fr", "www.example.com/x".
const SHOWN_ADDRESS = /^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?$/i;

function shownHost(item: HtmlLink, url: InspectedUrl): string | null {
  if ((item.origin !== "a" && item.origin !== "area") || !item.text || !url.host) return null;
  const match = SHOWN_ADDRESS.exec(item.text);
  if (!match) return null;
  const shown = match[1].toLowerCase();
  return sameOrg(shown, url.host) ? null : shown;
}

function tracking(item: HtmlLink, url: InspectedUrl): Link["tracking"] {
  if (item.origin !== "img" || !url.host) return null;
  if (isKnownTracker(url.host)) return "tracker";
  const tiny = (n: number | null) => n !== null && n <= 2;
  const pixel =
    (tiny(item.width) && (tiny(item.height) || item.height === null)) ||
    (tiny(item.height) && item.width === null) ||
    item.hidden !== null;
  return pixel ? "pixel" : null;
}

export function analyzeLinks(
  email: ParsedEmail,
  doc: Document | null,
  context: LinkContext,
  attachments: readonly AttachmentContent[] = [],
): LinkReport {
  const links: Link[] = [];
  const forms: LocatedForm[] = [];
  let brokenWords: string[] = [];
  let bidiOverrides = 0;

  const fromDocument = (document: Document, attachment: string | null) => {
    const html = extractHtml(document);
    forms.push(...html.forms.map((form) => ({ ...form, attachment })));
    if (attachment === null) {
      brokenWords = html.brokenWords;
      bidiOverrides = html.bidiOverrides;
    }
    for (const item of html.links) {
      if (item.raw.startsWith("#")) continue; // in-page anchors go nowhere
      const url = inspectUrl(item.raw, { base: html.base, references: context.references });
      links.push({
        source: attachment === null ? "html" : "attachment", attachment, origin: item.origin, text: item.text,
        hidden: hiddenText(item.hidden), url, shownHost: shownHost(item, url), tracking: tracking(item, url),
      });
    }
  };
  const plain = (raw: string, origin: LinkOrigin, source: Link["source"], attachment: string | null): Link => ({
    source, attachment, origin, text: null, hidden: null,
    url: inspectUrl(raw, { references: context.references }), shownHost: null, tracking: null,
  });

  if (doc) fromDocument(doc, null);
  if (email.text) for (const raw of findUrlsInText(email.text)) links.push(plain(raw, "text", "text", null));
  for (const attachment of attachments) {
    if (attachment.html) fromDocument(attachment.html, attachment.name);
    for (const raw of attachment.urls) links.push(plain(raw, "file", "attachment", attachment.name));
    // QR codes also carry Wi-Fi settings, contacts or plain text; only web addresses are links.
    for (const raw of attachment.qr.filter((t) => /^(https?:\/\/|www\.)/i.test(t))) {
      links.push(plain(/^www\./i.test(raw) ? `http://${raw}` : raw, "qr", "attachment", attachment.name));
    }
  }
  return { links, forms, findings: linkFindings(links, forms, brokenWords, bidiOverrides, context), recipients: [...(context.recipients ?? [])] };
}

type FlagRule = { flag: UrlFlag; severity: Severity; weight: number; title: Text; explanation: Text };

const FLAG_RULES: FlagRule[] = [
  { flag: "oauth-consent", severity: "high", weight: 15, title: { en: "Link asks to grant an app access to the account", fr: "Le lien demande d’autoriser une application à accéder au compte" },
    explanation: {
      en: "The link opens the genuine Microsoft, Google or GitHub sign-in page, which then asks the reader to let an application into their account. Consenting hands the attacker a token that survives a password change and needs no MFA. Check the application (client_id), what it asks for (scope) and where it sends the reader back (redirect_uri).",
      fr: "Le lien ouvre la vraie page de connexion de Microsoft, Google ou GitHub, qui demande ensuite au lecteur de laisser une application accéder à son compte. Consentir remet à l’attaquant un jeton qui survit à un changement de mot de passe et se passe de l’authentification multifacteur. Vérifiez l’application (client_id), ce qu’elle demande (scope) et où elle renvoie le lecteur (redirect_uri).",
    } },
  { flag: "lookalike", severity: "high", weight: 18, title: { en: "Lookalike domain", fr: "Domaine sosie" },
    explanation: {
      en: "A link goes to a domain built to be mistaken for a known one.",
      fr: "Un lien mène à un domaine conçu pour être pris pour un domaine connu.",
    } },
  { flag: "homoglyph", severity: "high", weight: 15, title: { en: "Domain uses look-alike characters", fr: "Domaine aux caractères trompeurs" },
    explanation: {
      en: "Letters from another alphabet stand in for Latin ones, so the domain reads like a familiar name.",
      fr: "Des lettres d’un autre alphabet remplacent des lettres latines, si bien que le domaine se lit comme un nom familier.",
    } },
  { flag: "javascript-url", severity: "high", weight: 15, title: { en: "Link runs a script", fr: "Le lien exécute un script" },
    explanation: {
      en: "A javascript: link executes code instead of opening a page.",
      fr: "Un lien javascript: exécute du code au lieu d’ouvrir une page.",
    } },
  { flag: "data-url", severity: "high", weight: 12, title: { en: "Link opens embedded content", fr: "Le lien ouvre un contenu intégré" },
    explanation: {
      en: "A data: link carries a whole page inside the email, out of reach of URL filters.",
      fr: "Un lien data: transporte une page entière dans l’e-mail, hors de portée des filtres d’URL.",
    } },
  { flag: "userinfo", severity: "high", weight: 15, title: { en: "Destination hidden behind a user name", fr: "Destination masquée derrière un nom d’utilisateur" },
    explanation: {
      en: "Everything before @ in a link is a user name, not the site: the real destination comes after it.",
      fr: "Tout ce qui précède @ dans un lien est un nom d’utilisateur, pas le site\u00a0: la vraie destination vient après.",
    } },
  { flag: "disguised-domain", severity: "high", weight: 15, title: { en: "Domain disguised as a subdomain", fr: "Domaine déguisé en sous-domaine" },
    explanation: {
      en: "The link starts with a familiar domain, but that is only a subdomain of another one.",
      fr: "Le lien commence par un domaine familier, mais ce n’est qu’un sous-domaine d’un autre domaine.",
    } },
  { flag: "ip-host", severity: "medium", weight: 8, title: { en: "Link to a bare IP address", fr: "Lien vers une adresse IP brute" },
    explanation: {
      en: "Legitimate senders link to named sites; a raw IP address avoids domain reputation checks.",
      fr: "Les expéditeurs légitimes pointent vers des sites nommés\u00a0; une adresse IP brute échappe aux contrôles de réputation des domaines.",
    } },
  { flag: "shortener", severity: "low", weight: 4, title: { en: "Shortened link", fr: "Lien raccourci" },
    explanation: {
      en: "A URL shortener hides the destination until the link is followed.",
      fr: "Un raccourcisseur d’URL cache la destination tant que le lien n’est pas suivi.",
    } },
  { flag: "abused-tld", severity: "low", weight: 3, title: { en: "Top-level domain favoured by abuse", fr: "Domaine de premier niveau prisé des abus" },
    explanation: {
      en: "The domain ends in a TLD that abuse reports single out. A weak signal by itself.",
      fr: "Le domaine se termine par un TLD que les signalements d’abus mettent en avant. Un signal faible en soi.",
    } },
  { flag: "punycode", severity: "info", weight: 0, title: { en: "Internationalised domain", fr: "Domaine internationalisé" },
    explanation: {
      en: "The domain contains non-ASCII letters. Check how it reads.",
      fr: "Le domaine contient des lettres non ASCII. Vérifiez comment il se lit.",
    } },
  { flag: "opaque-wrapper", severity: "info", weight: 0, title: { en: "Link rewritten by a gateway", fr: "Lien réécrit par une passerelle" },
    explanation: {
      en: "A security gateway rewrote the link in a way that cannot be reversed offline; its destination is unknown here.",
      fr: "Une passerelle de sécurité a réécrit le lien d’une façon irréversible hors ligne\u00a0; sa destination est inconnue ici.",
    } },
];

/** First ten distinct lines, compared by their English. */
const unique = (items: Evidence[]) => {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of items) {
    const key = evidenceIn(item, "en");
    if (!seen.has(key)) out.push(item);
    seen.add(key);
  }
  return out.slice(0, 10);
};

/** `pаypal.com (xn--pypal-4ve.com)`: the ASCII form shows what the eye cannot. */
function hostLabel(url: InspectedUrl): string {
  return url.displayHost !== url.host ? `${url.displayHost} (${url.host})` : (url.host ?? url.raw);
}

/** `Microsoft — client_id … — scope Mail.Read Files.ReadWrite.All — redirect_uri https://…` */
function oauthEvidence(request: OAuthRequest): Evidence {
  const scopes = request.risky.length > 0 ? request.risky : request.scopes;
  const parts = (scope: string, admin: string) => [
    request.provider,
    `client_id ${request.clientId ?? "—"}`,
    ...(scopes.length > 0 ? [`${scope} ${scopes.join(" ")}`] : []),
    ...(request.redirect ? [`redirect_uri ${request.redirect}`] : []),
    ...(request.admin ? [admin] : []),
  ].join(" — ");
  return noted(parts("scope", "admin consent, for the whole organisation"), parts("scope", "consentement administrateur, pour toute l’organisation"));
}

function linkFindings(
  links: Link[],
  forms: LocatedForm[],
  brokenWords: string[],
  bidiOverrides: number,
  context: LinkContext,
): Finding[] {
  const findings: Finding[] = [];
  const clickable = links.filter(isClickable);
  const recipients = context.recipients ?? [];
  // Evidence ends up in reports: a recipient's address never appears in it.
  const destination = (link: Link) => redactRecipients(link.url.final ?? link.url.raw, recipients);

  const deceptive = clickable.filter((l) => l.shownHost);
  if (deceptive.length > 0) {
    findings.push({
      id: "link.deceptive", category: "link", severity: "high", title: { en: "Link text shows another destination", fr: "Le texte du lien montre une autre destination" },
      explanation: {
        en: "The text of a link displays one address while the link goes somewhere else. Readers trust what they see.",
        fr: "Le texte d’un lien affiche une adresse alors que le lien mène ailleurs. Les lecteurs se fient à ce qu’ils voient.",
      },
      evidence: unique(deceptive.map((l) => `"${l.text}" → ${destination(l)}`)), weight: 20,
    });
  }

  for (const rule of FLAG_RULES) {
    const hits = clickable.filter((l) => l.url.flags.includes(rule.flag));
    if (hits.length === 0) continue;
    findings.push({
      id: `url.${rule.flag}`, category: "link", severity: rule.severity, title: rule.title, explanation: rule.explanation,
      evidence: unique(hits.map((l) => {
        if (rule.flag === "lookalike") return noted(`${hostLabel(l.url)} imitates ${l.url.lookalikeOf}`, `${hostLabel(l.url)} imite ${l.url.lookalikeOf}`);
        if (rule.flag === "oauth-consent" && l.url.oauth) return oauthEvidence(l.url.oauth);
        return destination(l);
      })),
      weight: rule.weight,
    });
  }

  const personalised = clickable.flatMap((l) => {
    const matches = [l.url.raw, l.url.final].flatMap((u) => (u ? findRecipients(u, recipients) : []));
    if (matches.length === 0) return [];
    const base64 = matches.some((m) => m.encoding === "base64");
    const shown = redactRecipients(l.url.final ?? l.url.raw, recipients);
    return [{ base64, evidence: base64 ? noted(`${shown} (base64)`, `${shown} (en base64)`) : noted(`${shown} (as written)`, `${shown} (en clair)`) }];
  });
  if (personalised.length > 0) {
    const encoded = personalised.some((p) => p.base64);
    findings.push({
      id: "link.recipient-in-url", category: "link", severity: encoded ? "medium" : "low",
      title: { en: "Link carries the recipient's address", fr: "Le lien contient l’adresse du destinataire" },
      explanation: {
        en:
          "Phishing kits put the target's address in the link to fill in the fake sign-in page and record who clicked; base64 keeps it from a quick look. " +
          "Mailing services also write it plainly in unsubscribe links, so a plain address weighs little. " +
          "Indicators, pivots, evidence and the Markdown report show REDACTED in its place, so looking the link up does not hand the address to a third party.",
        fr:
          "Les kits d’hameçonnage placent l’adresse de la cible dans le lien pour préremplir la fausse page de connexion et savoir qui a cliqué\u00a0; le base64 la soustrait à un coup d’œil rapide. " +
          "Les services d’envoi l’écrivent aussi en clair dans les liens de désabonnement, si bien qu’une adresse en clair pèse peu. " +
          "Les indicateurs, les pivots, les preuves et le rapport Markdown affichent REDACTED à sa place, si bien que rechercher le lien ne transmet pas l’adresse à un tiers.",
      },
      evidence: unique(personalised.map((p) => p.evidence)), weight: encoded ? 10 : 4,
    });
  }

  const hidden = clickable.filter((l) => l.hidden !== null);
  if (hidden.length > 0) {
    findings.push({
      id: "link.hidden", category: "link", severity: "medium", title: { en: "Hidden links", fr: "Liens cachés" },
      explanation: {
        en: "Links the reader cannot see are there for filters and crawlers, not for people.",
        fr: "Les liens que le lecteur ne voit pas sont destinés aux filtres et aux robots d’indexation, pas aux personnes.",
      },
      evidence: unique(hidden.map((l) => noted(`${destination(l)} (${l.hidden?.en})`, `${destination(l)} (${l.hidden?.fr})`))), weight: 6,
    });
  }

  const pixels = links.filter(
    (l) => l.tracking === "pixel" && !(context.fromDomain && l.url.host && sameOrg(l.url.host, context.fromDomain)),
  );
  if (pixels.length > 0) {
    findings.push({
      id: "html.tracking-pixel", category: "html", severity: "low", title: { en: "Tracking pixel", fr: "Pixel de suivi" },
      explanation: {
        en: "An invisible image tells its server when the email is opened, confirming the address is read. The safe preview never loads it.",
        fr: "Une image invisible indique à son serveur quand l’e-mail est ouvert, ce qui confirme que l’adresse est lue. L’aperçu sécurisé ne la charge jamais.",
      },
      evidence: unique(pixels.map(destination)), weight: 4,
    });
  }

  const formEvidence = (list: LocatedForm[]) =>
    unique(list.map((f) => noted(
      `${f.method.toUpperCase()} ${f.action || "(no action)"} — ${f.fields.join(", ")}${f.attachment ? ` (in ${f.attachment})` : ""}`,
      `${f.method.toUpperCase()} ${f.action || "(aucune action)"} — ${f.fields.join(", ")}${f.attachment ? ` (dans ${f.attachment})` : ""}`,
    )));
  const passwordForms = forms.filter((f) => f.hasPassword);
  if (passwordForms.length > 0) {
    findings.push({
      id: "html.password-form", category: "html", severity: "high",
      title: passwordForms.every((f) => f.attachment)
        ? { en: "Password form in an attachment", fr: "Formulaire de mot de passe dans une pièce jointe" }
        : { en: "Password form inside the email", fr: "Formulaire de mot de passe dans l’e-mail" },
      explanation: {
        en: "The message asks for a password in a form of its own. No legitimate service collects credentials that way.",
        fr: "Le message demande un mot de passe dans un formulaire qui lui est propre. Aucun service légitime ne collecte des identifiants de cette façon.",
      },
      evidence: formEvidence(passwordForms), weight: 18,
    });
  } else if (forms.length > 0) {
    findings.push({
      id: "html.form", category: "html", severity: "medium",
      title: forms.every((f) => f.attachment)
        ? { en: "Form in an attachment", fr: "Formulaire dans une pièce jointe" }
        : { en: "Form inside the email", fr: "Formulaire dans l’e-mail" },
      explanation: {
        en: "The message contains a form that sends what is typed into it to a server.",
        fr: "Le message contient un formulaire qui envoie à un serveur ce qui y est saisi.",
      },
      evidence: formEvidence(forms), weight: 10,
    });
  }

  if (brokenWords.length >= 2) {
    findings.push({
      id: "html.broken-words", category: "html", severity: "low", title: { en: "Words broken by invisible characters", fr: "Mots coupés par des caractères invisibles" },
      explanation: {
        en: "Invisible characters inside words defeat keyword filters while the text still reads normally.",
        fr: "Des caractères invisibles au milieu des mots déjouent les filtres de mots-clés alors que le texte se lit normalement.",
      },
      evidence: unique(brokenWords), weight: 4,
    });
  }
  if (bidiOverrides > 0) {
    findings.push({
      id: "html.bidi-override", category: "html", severity: "medium", title: { en: "Text direction overrides", fr: "Inversions du sens d’écriture" },
      explanation: {
        en: "Direction-override characters make text display in a different order than it is written, a trick used to disguise names and links.",
        fr: "Des caractères de contrôle du sens d’écriture font s’afficher le texte dans un autre ordre que celui où il est écrit, une astuce pour déguiser des noms et des liens.",
      },
      evidence: [{
        en: `${bidiOverrides} override character${bidiOverrides === 1 ? "" : "s"} in the visible text`,
        fr: `${bidiOverrides} caractère${bidiOverrides === 1 ? "" : "s"} d’inversion du sens d’écriture dans le texte visible`,
      }], weight: 6,
    });
  }
  return findings;
}
