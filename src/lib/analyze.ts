import { analyzeAttachments, attachmentFindings, type AttachmentReport, type ImageDecoder } from "./attachments/analyze.ts";
import { BRANDS } from "./data/brands.ts";
import type { ParsedEmail } from "./email.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { analyzeHeaders, type HeaderReport } from "./headers/analyze.ts";
import { collectIocs, type Ioc } from "./ioc/collect.ts";
import { analyzeLinks, type LinkReport } from "./links/analyze.ts";
import type { Reference } from "./urls/lookalike.ts";

export type EmailReport = {
  headers: HeaderReport;
  links: LinkReport;
  attachments: AttachmentReport[];
  iocs: Ioc[];
  /** Every finding, most severe first. */
  findings: Finding[];
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
  const references = [...options.orgDomains.map((domain) => ({ domain, own: true })), ...BRAND_REFERENCES];
  const links = analyzeLinks(
    email,
    email.html ? options.parseHtml(email.html) : null,
    { fromDomain: headers.sender.from?.domain ?? null, references },
    attachments.map((a) => ({ name: a.visibleName, html: a.html ? options.parseHtml(a.html) : null, urls: a.urls, qr: a.qr })),
  );
  return {
    headers,
    links,
    attachments,
    iocs: collectIocs({ email, headers, links: links.links, attachments }),
    findings: sortFindings([...headers.findings, ...links.findings, ...attachmentFindings(attachments)]),
  };
}
