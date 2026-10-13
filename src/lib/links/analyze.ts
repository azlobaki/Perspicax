import { isKnownTracker } from "../data/trackers.ts";
import type { ParsedEmail } from "../email.ts";
import type { Finding, Severity } from "../finding.ts";
import { extractHtml, type HtmlForm, type HtmlLink, type HtmlOrigin } from "../html/extract.ts";
import { sameOrg } from "../net/domain.ts";
import { inspectUrl, type InspectedUrl, type UrlFlag } from "../urls/inspect.ts";
import type { Reference } from "../urls/lookalike.ts";
import { findUrlsInText } from "../urls/text.ts";

export type LinkOrigin = HtmlOrigin | "text";

export type Link = {
  source: "html" | "text";
  origin: LinkOrigin;
  text: string | null;
  hidden: string | null;
  url: InspectedUrl;
  /** Domain the link text displays, when it is not where the link goes. */
  shownHost: string | null;
  tracking: "pixel" | "tracker" | null;
};

export type LinkReport = { links: Link[]; forms: HtmlForm[]; findings: Finding[] };

export type LinkContext = {
  fromDomain: string | null;
  /** Domains lookalikes are measured against: the organisation's own and well-known brands. */
  references: readonly Reference[];
};

const CLICKABLE = new Set<LinkOrigin>(["a", "area", "form", "meta-refresh", "text"]);

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

export function analyzeLinks(email: ParsedEmail, doc: Document | null, context: LinkContext): LinkReport {
  const links: Link[] = [];
  let forms: HtmlForm[] = [];
  let brokenWords: string[] = [];
  let bidiOverrides = 0;

  if (doc) {
    const html = extractHtml(doc);
    forms = html.forms;
    brokenWords = html.brokenWords;
    bidiOverrides = html.bidiOverrides;
    for (const item of html.links) {
      if (item.raw.startsWith("#")) continue; // in-page anchors go nowhere
      const url = inspectUrl(item.raw, { base: html.base, references: context.references });
      links.push({
        source: "html", origin: item.origin, text: item.text, hidden: item.hidden, url,
        shownHost: shownHost(item, url), tracking: tracking(item, url),
      });
    }
  }
  if (email.text) {
    for (const raw of findUrlsInText(email.text)) {
      links.push({
        source: "text", origin: "text", text: null, hidden: null,
        url: inspectUrl(raw, { references: context.references }), shownHost: null, tracking: null,
      });
    }
  }
  return { links, forms, findings: linkFindings(links, forms, brokenWords, bidiOverrides, context) };
}

type FlagRule = { flag: UrlFlag; severity: Severity; weight: number; title: string; explanation: string };

const FLAG_RULES: FlagRule[] = [
  { flag: "lookalike", severity: "high", weight: 18, title: "Lookalike domain",
    explanation: "A link goes to a domain built to be mistaken for a known one." },
  { flag: "homoglyph", severity: "high", weight: 15, title: "Domain uses look-alike characters",
    explanation: "Letters from another alphabet stand in for Latin ones, so the domain reads like a familiar name." },
  { flag: "javascript-url", severity: "high", weight: 15, title: "Link runs a script",
    explanation: "A javascript: link executes code instead of opening a page." },
  { flag: "data-url", severity: "high", weight: 12, title: "Link opens embedded content",
    explanation: "A data: link carries a whole page inside the email, out of reach of URL filters." },
  { flag: "userinfo", severity: "high", weight: 15, title: "Destination hidden behind a user name",
    explanation: "Everything before @ in a link is a user name, not the site: the real destination comes after it." },
  { flag: "disguised-domain", severity: "high", weight: 15, title: "Domain disguised as a subdomain",
    explanation: "The link starts with a familiar domain, but that is only a subdomain of another one." },
  { flag: "ip-host", severity: "medium", weight: 8, title: "Link to a bare IP address",
    explanation: "Legitimate senders link to named sites; a raw IP address avoids domain reputation checks." },
  { flag: "shortener", severity: "low", weight: 4, title: "Shortened link",
    explanation: "A URL shortener hides the destination until the link is followed." },
  { flag: "abused-tld", severity: "low", weight: 3, title: "Top-level domain favoured by abuse",
    explanation: "The domain ends in a TLD that abuse reports single out. A weak signal by itself." },
  { flag: "punycode", severity: "info", weight: 0, title: "Internationalised domain",
    explanation: "The domain contains non-ASCII letters. Check how it reads." },
  { flag: "opaque-wrapper", severity: "info", weight: 0, title: "Link rewritten by a gateway",
    explanation: "A security gateway rewrote the link in a way that cannot be reversed offline; its destination is unknown here." },
];

const unique = (items: string[]) => [...new Set(items)].slice(0, 10);
const destination = (link: Link) => link.url.final ?? link.url.raw;

/** `pаypal.com (xn--pypal-4ve.com)`: the ASCII form shows what the eye cannot. */
function hostLabel(url: InspectedUrl): string {
  return url.displayHost !== url.host ? `${url.displayHost} (${url.host})` : (url.host ?? url.raw);
}

function linkFindings(
  links: Link[],
  forms: HtmlForm[],
  brokenWords: string[],
  bidiOverrides: number,
  context: LinkContext,
): Finding[] {
  const findings: Finding[] = [];
  const clickable = links.filter(isClickable);

  const deceptive = clickable.filter((l) => l.shownHost);
  if (deceptive.length > 0) {
    findings.push({
      id: "link.deceptive", category: "link", severity: "high", title: "Link text shows another destination",
      explanation: "The text of a link displays one address while the link goes somewhere else. Readers trust what they see.",
      evidence: unique(deceptive.map((l) => `"${l.text}" → ${destination(l)}`)), weight: 20,
    });
  }

  for (const rule of FLAG_RULES) {
    const hits = clickable.filter((l) => l.url.flags.includes(rule.flag));
    if (hits.length === 0) continue;
    findings.push({
      id: `url.${rule.flag}`, category: "link", severity: rule.severity, title: rule.title, explanation: rule.explanation,
      evidence: unique(hits.map((l) => (rule.flag === "lookalike" ? `${hostLabel(l.url)} imitates ${l.url.lookalikeOf}` : destination(l)))),
      weight: rule.weight,
    });
  }

  const hidden = clickable.filter((l) => l.hidden !== null);
  if (hidden.length > 0) {
    findings.push({
      id: "link.hidden", category: "link", severity: "medium", title: "Hidden links",
      explanation: "Links the reader cannot see are there for filters and crawlers, not for people.",
      evidence: unique(hidden.map((l) => `${destination(l)} (${l.hidden})`)), weight: 6,
    });
  }

  const pixels = links.filter(
    (l) => l.tracking === "pixel" && !(context.fromDomain && l.url.host && sameOrg(l.url.host, context.fromDomain)),
  );
  if (pixels.length > 0) {
    findings.push({
      id: "html.tracking-pixel", category: "html", severity: "low", title: "Tracking pixel",
      explanation: "An invisible image tells its server when the email is opened, confirming the address is read. The safe preview never loads it.",
      evidence: unique(pixels.map(destination)), weight: 4,
    });
  }

  const formEvidence = (list: HtmlForm[]) => unique(list.map((f) => `${f.method.toUpperCase()} ${f.action || "(no action)"} — ${f.fields.join(", ")}`));
  const passwordForms = forms.filter((f) => f.hasPassword);
  if (passwordForms.length > 0) {
    findings.push({
      id: "html.password-form", category: "html", severity: "high", title: "Password form inside the email",
      explanation: "The email itself asks for a password. No legitimate service collects credentials that way.",
      evidence: formEvidence(passwordForms), weight: 18,
    });
  } else if (forms.length > 0) {
    findings.push({
      id: "html.form", category: "html", severity: "medium", title: "Form inside the email",
      explanation: "The email contains a form that sends what is typed into it to a server.",
      evidence: formEvidence(forms), weight: 10,
    });
  }

  if (brokenWords.length >= 2) {
    findings.push({
      id: "html.broken-words", category: "html", severity: "low", title: "Words broken by invisible characters",
      explanation: "Invisible characters inside words defeat keyword filters while the text still reads normally.",
      evidence: unique(brokenWords), weight: 4,
    });
  }
  if (bidiOverrides > 0) {
    findings.push({
      id: "html.bidi-override", category: "html", severity: "medium", title: "Text direction overrides",
      explanation: "Direction-override characters make text display in a different order than it is written, a trick used to disguise names and links.",
      evidence: [`${bidiOverrides} override character${bidiOverrides === 1 ? "" : "s"} in the visible text`], weight: 6,
    });
  }
  return findings;
}
