import { BRANDS } from "./data/brands.ts";
import type { ParsedEmail } from "./email.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { analyzeHeaders, type HeaderReport } from "./headers/analyze.ts";
import { analyzeLinks, type LinkReport } from "./links/analyze.ts";
import type { Reference } from "./urls/lookalike.ts";

export type EmailReport = {
  headers: HeaderReport;
  links: LinkReport;
  /** Every finding, most severe first. */
  findings: Finding[];
};

export type AnalyzeOptions = {
  orgDomains: string[];
  /** Builds an inert Document: the browser's DOMParser in the app, linkedom in tests. */
  parseHtml: (html: string) => Document;
};

const BRAND_REFERENCES: Reference[] = BRANDS.flatMap((brand) => brand.domains.map((domain) => ({ domain, own: false })));

export function analyzeEmail(email: ParsedEmail, options: AnalyzeOptions): EmailReport {
  const headers = analyzeHeaders(email, { orgDomains: options.orgDomains });
  const references = [...options.orgDomains.map((domain) => ({ domain, own: true })), ...BRAND_REFERENCES];
  const links = analyzeLinks(email, email.html ? options.parseHtml(email.html) : null, {
    fromDomain: headers.sender.from?.domain ?? null,
    references,
  });
  return { headers, links, findings: sortFindings([...headers.findings, ...links.findings]) };
}
