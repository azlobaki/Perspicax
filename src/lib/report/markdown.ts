import type { EmailReport } from "../analyze.ts";
import type { ParsedEmail } from "../email.ts";
import { formatDelay, formatSize, formatTime, formatUtc } from "../format.ts";
import { entryDetails } from "../headers/auth.ts";
import { defang, defangText } from "../ioc/defang.ts";
import { IOC_TYPES, type IocType } from "../ioc/types.ts";
import { isClickable } from "../links/analyze.ts";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader } from "../mime/headers.ts";
import { BAND_LABEL } from "../score/score.ts";

export type ReportInput = {
  email: ParsedEmail;
  report: EmailReport;
  file: { name: string; size: number };
  generatedAt: Date;
  /** Defang URLs, addresses, IPs and domains (default: yes, so the ticket holds no live link). */
  defang: boolean;
};

const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low", info: "Info" } as const;
const IOC_HEADING: Record<IocType, string> = {
  url: "URLs", domain: "Domains", ip: "IP addresses", email: "Email addresses", sha256: "SHA-256", sha1: "SHA-1", md5: "MD5",
};
const MAX_LINKS = 30;

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = (text: string) => (text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``);

/** A ticket-ready Markdown report of the analysis. */
export function reportMarkdown(input: ReportInput): string {
  const { email, report, file, generatedAt } = input;
  const safe = (text: string) => (input.defang ? defangText(text) : text);
  const headers = report.headers;
  const from = headers.sender.from;
  const out: string[] = [];

  out.push(`# Email analysis — ${headers.subject || "(no subject)"}`, "");
  out.push(`**Verdict:** ${BAND_LABEL[report.score.band]} — score ${report.score.score}/100`);
  out.push(`**Analysed:** ${formatUtc(generatedAt)} with Perspicax, offline`);
  out.push(`**File:** ${file.name} (${formatSize(file.size)})`, "");
  out.push("| Field | Value |", "|---|---|");
  out.push(`| From | ${cell(safe(from ? `${from.name ? `${from.name} ` : ""}<${from.address}>` : "—"))} |`);
  out.push(`| To | ${cell(safe(decodeEncodedWords(getHeader(email.headers, "to") ?? "—")))} |`);
  out.push(`| Date | ${headers.date ? formatUtc(headers.date) : "—"} |`);
  out.push(`| Subject | ${cell(headers.subject || "—")} |`, "");

  out.push(`## Findings (${report.findings.length})`, "");
  if (report.findings.length === 0) out.push("No finding.");
  report.findings.forEach((finding, i) => {
    out.push(`${i + 1}. **${finding.title}** — ${SEVERITY_LABEL[finding.severity]}, +${finding.weight}`);
    out.push(`   ${finding.explanation}`);
    for (const line of finding.evidence) out.push(`   - ${code(safe(line))}`);
  });
  out.push("");
  if (report.score.categories.length > 0) {
    out.push(`Score by category: ${report.score.categories.map((c) => `${c.category} ${c.points}/${c.cap}`).join(", ")}.`, "");
  }

  out.push("## Authentication", "");
  if (headers.auth.entries.length === 0) {
    out.push("No authentication results.");
  } else {
    out.push(`Recorded by ${code(safe(headers.auth.recordedBy ?? "unknown"))}.`, "");
    out.push("| Method | Result | Details |", "|---|---|---|");
    for (const entry of headers.auth.entries) out.push(`| ${entry.method} | ${entry.result} | ${cell(safe(entryDetails(entry)))} |`);
  }
  for (const check of report.dkim) {
    const verdict = check.result === "match" ? "matches the body" : check.result === "mismatch" ? "does not match: the body changed after signing" : "not checked (unsupported algorithm)";
    out.push("", `DKIM body hash for d=${safe(check.signature.domain)}: ${verdict}.`);
  }
  out.push("");

  out.push("## Relay chain (oldest first)", "");
  if (headers.hops.length === 0) {
    out.push("No Received headers.");
  } else {
    out.push("| # | Time (UTC) | Δ | From | IP | By |", "|---|---|---|---|---|---|");
    for (const hop of headers.hops) {
      out.push(
        `| ${hop.index} | ${hop.date ? formatTime(hop.date) : "—"} | ${formatDelay(hop.delay)} | ${cell(safe(hop.helo ?? hop.rdns ?? "—"))} | ${cell(safe(hop.ip ?? "—"))} | ${cell(safe(hop.by ?? "—"))} |`,
      );
    }
  }
  out.push("");

  const clickable = report.links.links.filter(isClickable);
  const flagged = clickable.filter((l) => l.url.flags.length > 0 || l.shownHost || l.hidden);
  out.push(`## Links (${clickable.length}, ${flagged.length} flagged)`, "");
  if (flagged.length === 0) out.push("No flagged link.");
  for (const link of flagged.slice(0, MAX_LINKS)) {
    const notes = [
      link.shownHost ? `shows ${safe(link.shownHost)}` : null,
      ...link.url.flags.map((f) => (f === "lookalike" ? `lookalike of ${safe(link.url.lookalikeOf ?? "")}` : f)),
      link.hidden ? `hidden (${link.hidden})` : null,
      link.attachment ? `in ${link.attachment}` : null,
    ].filter(Boolean);
    out.push(`- ${code(safe(link.url.final ?? link.url.raw))} — ${notes.join(", ")}`);
  }
  out.push("");

  if (report.attachments.length > 0) {
    out.push("## Attachments", "", "| Name | Detected type | Size | SHA-256 | Flags |", "|---|---|---|---|---|");
    for (const a of report.attachments) {
      out.push(`| ${cell(a.visibleName)} | ${a.detected.label} | ${formatSize(a.size)} | ${code(a.hashes.sha256)} | ${a.flags.join(", ") || "—"} |`);
    }
    out.push("");
  }

  out.push(`## Indicators (${report.iocs.length})`, "");
  for (const type of IOC_TYPES) {
    const list = report.iocs.filter((ioc) => ioc.type === type);
    if (list.length === 0) continue;
    out.push(`### ${IOC_HEADING[type]}`, "");
    for (const ioc of list) out.push(`- ${code(input.defang ? defang(ioc.type, ioc.value) : ioc.value)} — ${ioc.sources.join(", ")}`);
    out.push("");
  }

  out.push("---", "", `Generated by Perspicax. Indicators are ${input.defang ? "" : "not "}defanged.`);
  return out.join("\n");
}
