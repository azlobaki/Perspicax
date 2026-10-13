import type { ReportInput } from "./markdown.ts";
import { BAND_LABEL } from "../score/score.ts";

/** The full analysis as JSON, raw (not defanged), without attachment contents. */
export function reportJson(input: Omit<ReportInput, "defang">): string {
  const { email, report, file, generatedAt } = input;
  return JSON.stringify(
    {
      generator: "Perspicax",
      generatedAt: generatedAt.toISOString(),
      file,
      source: email.source,
      subject: report.headers.subject,
      from: report.headers.sender.from,
      date: report.headers.date,
      verdict: {
        score: report.score.score,
        band: report.score.band,
        label: BAND_LABEL[report.score.band],
        categories: report.score.categories,
      },
      findings: report.findings,
      authentication: report.headers.auth,
      dkim: report.dkim.map((check) => ({ ...check.signature, result: check.result })),
      relayChain: report.headers.hops,
      sender: report.headers.sender.rows,
      vendors: report.headers.vendors,
      links: report.links.links.map((link) => ({
        source: link.source,
        attachment: link.attachment,
        origin: link.origin,
        text: link.text,
        hidden: link.hidden,
        shownHost: link.shownHost,
        tracking: link.tracking,
        ...link.url,
      })),
      forms: report.links.forms,
      attachments: report.attachments.map((a) => ({
        filename: a.filename,
        visibleName: a.visibleName,
        declaredType: a.declaredType,
        inline: a.inline,
        size: a.size,
        detected: a.detected,
        hashes: a.hashes,
        flags: a.flags,
        details: a.details,
        entries: a.entries,
        urls: a.urls,
        qr: a.qr,
      })),
      iocs: report.iocs,
      warnings: email.warnings,
    },
    null,
    2,
  );
}
