import { bankChangeFindings } from "./content/bank.ts";
import { analyzeAttachments, attachmentFindings, type AttachmentReport, type ImageDecoder } from "./attachments/analyze.ts";
import { dkimChecks, dkimFindings, type DkimCheck } from "./dkim/bodyhash.ts";
import type { ParsedEmail } from "./email.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { analyzeHeaders, type HeaderReport } from "./headers/analyze.ts";
import { collectIocs, type Ioc } from "./ioc/collect.ts";
import { analyzeLinks, type LinkReport } from "./links/analyze.ts";
import { recipientAddresses } from "./links/recipient.ts";
import { carriedMessages } from "./messages.ts";
import { scoreFindings, type Score } from "./score/score.ts";
import { referencesFor } from "./urls/lookalike.ts";

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
  /** Protected people's names (Settings). */
  vipNames?: string[];
  /** Builds an inert Document: the browser's DOMParser in the app, linkedom in tests. */
  parseHtml: (html: string) => Document;
  /** Decodes images for QR codes; without it, images are not scanned. */
  decodeImage?: ImageDecoder;
};

/** Asynchronous because hashing (WebCrypto) and image decoding are. */
export async function analyzeEmail(email: ParsedEmail, options: AnalyzeOptions): Promise<EmailReport> {
  const headers = analyzeHeaders(email, { orgDomains: options.orgDomains, vipNames: options.vipNames });
  const attachments = await analyzeAttachments(email.attachments, { decodeImage: options.decodeImage });
  const dkim = await dkimChecks(email);
  const references = referencesFor(options.orgDomains);
  const doc = email.html ? options.parseHtml(email.html) : null;
  const links = analyzeLinks(
    email,
    doc,
    { fromDomain: headers.sender.from?.domain ?? null, references, recipients: recipientAddresses(email.headers) },
    attachments.map((a) => ({ name: a.visibleName, html: a.html ? options.parseHtml(a.html) : null, urls: a.urls, qr: a.qr })),
  );
  const content = bankChangeFindings({
    texts: [headers.subject, email.text, doc?.body?.textContent ?? null],
    fromDomain: headers.sender.from?.domain ?? null,
    orgDomains: options.orgDomains,
  });
  const carried = carriedMessages(email);
  const notices: Finding[] = carried.length === 0 ? [] : [{
    id: "attachment.message", category: "attachment", severity: "info",
    title: { en: "Another email is attached", fr: "Un autre e-mail est joint" },
    explanation: {
      en: "This email carries another one, forwarded as an attachment or reported through a phishing button. The verdict describes the email that carries it; open the attached one to analyse the suspect itself.",
      fr: "Cet e-mail en transporte un autre, transféré en pièce jointe ou signalé par un bouton d’hameçonnage. Le verdict décrit l’e-mail qui le transporte\u00a0; ouvrez l’e-mail joint pour analyser le suspect lui-même.",
    },
    evidence: carried.map((m) => m.name), weight: 0,
  }];
  const findings = sortFindings([
    ...notices,
    ...headers.findings,
    ...dkimFindings(dkim),
    ...links.findings,
    ...attachmentFindings(attachments),
    ...content,
  ]);
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
