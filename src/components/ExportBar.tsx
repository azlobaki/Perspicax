"use client";

import { useLocale, useT } from "@/i18n/LocaleContext";
import type { EmailReport } from "@/lib/analyze";
import type { ParsedEmail } from "@/lib/email";
import { reportJson } from "@/lib/report/json";
import { reportMarkdown } from "@/lib/report/markdown";
import CopyButton from "./CopyButton";
import { LABEL, SMALL_BUTTON } from "./ui";

/** Saves text through a local Blob URL: nothing is uploaded, nothing fetched. */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportBar({ email, report, file, defang }: {
  email: ParsedEmail;
  report: EmailReport;
  file: { name: string; size: number };
  defang: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const markdown = () => reportMarkdown({ email, report, file, generatedAt: new Date(), defang, locale });
  const base = file.name.replace(/\.[^.]+$/, "") || "email";
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <span className={LABEL}>{t.exportBar.report}</span>
      <CopyButton text={markdown} label={t.exportBar.copyMarkdown} />
      <button type="button" className={SMALL_BUTTON} onClick={() => download(`${base}.perspicax.md`, markdown(), "text/markdown")}>
        {t.exportBar.downloadMd}
      </button>
      <button
        type="button"
        className={SMALL_BUTTON}
        onClick={() => download(`${base}.perspicax.json`, reportJson({ email, report, file, generatedAt: new Date() }), "application/json")}
      >
        {t.exportBar.downloadJson}
      </button>
    </div>
  );
}
