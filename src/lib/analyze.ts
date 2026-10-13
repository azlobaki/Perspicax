import { analyzeAttachments, attachmentFindings, type AttachmentReport, type ImageDecoder } from "./attachments/analyze.ts";
import { BRANDS } from "./data/brands.ts";
import { dkimChecks, dkimFindings, type DkimCheck } from "./dkim/bodyhash.ts";
import type { ParsedEmail } from "./email.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { analyzeHeaders, type HeaderReport } from "./headers/analyze.ts";
import { collectIocs, type Ioc } from "./ioc/collect.ts";
import { analyzeLinks, type LinkReport } from "./links/analyze.ts";
import { scoreFindings, type Score } from "./score/score.ts";
import type { Reference } from "./urls/lookalike.ts";

export type EmailReport = {
  headers: HeaderReport;
  links: LinkReport;
  attachments: AttachmentReport[];
  iocs: Ioc[];
  /** Body-hash check of each DKIM signature. */
  dkim: DkimCheck[];
  /** Every finding, most severe first. */
  findings: Finding[];
  score: Score;
};

export type AnalyzeOptions = {
  orgDomains: string[];
  /** Builds an inert Document: the browser's DOMParser in the app, linkedom in tests. */
  parseHtml: (html: string) => Document;
  /** Decodes images for QR codes; without it, images are not scanned. */
  decodeImage?: ImageDecoder;
};

const BRAND_REFERENCES: Reference[] = BRANDS.flatMap((brand) => brand.domains.map((domain) => ({ domain, own: false })));

/** Asynchronous because hashing (WebCrypto) and image decoding are. */
export async function analyzeEmail(email: ParsedEmail, options: AnalyzeOptions): Promise<EmailReport> {
  const headers = analyzeHeaders(email, { orgDomains: options.orgDomains });
  const attachments = await analyzeAttachments(email.attachments, { decodeImage: options.decodeImage });
  const dkim = await dkimChecks(email);
  const references = [...options.orgDomains.map((domain) => ({ domain, own: true })), ...BRAND_REFERENCES];
  const links = analyzeLinks(
    email,
    email.html ? options.parseHtml(email.html) : null,
    { fromDomain: headers.sender.from?.domain ?? null, references },
    attachments.map((a) => ({ name: a.visibleName, html: a.html ? options.parseHtml(a.html) : null, urls: a.urls, qr: a.qr })),
  );
  const findings = sortFindings([...headers.findings, ...dkimFindings(dkim), ...links.findings, ...attachmentFindings(attachments)]);
  return {
    headers,
    links,
    attachments,
    iocs: collectIocs({ email, headers, links: links.links, attachments }),
    dkim,
    findings,
    score: scoreFindings(findings),
  };
}
