"use client";

import { useMemo } from "react";
import { useLocale, useT } from "@/i18n/LocaleContext";
import type { ParsedEmail } from "@/lib/email";
import { buildPreview } from "@/lib/html/preview";
import { parseHtml } from "./parseHtml";
import { DATA } from "./ui";

export default function PreviewTab({ email }: { email: ParsedEmail }) {
  const locale = useLocale();
  const t = useT();
  const srcDoc = useMemo(
    () => (email.html ? buildPreview(email.html, parseHtml, email.attachments, locale) : null),
    [email, locale],
  );

  if (srcDoc) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted console:text-xs">
          {t.preview.note}
        </p>
        {/* The email's own canvas: mail is designed on white whatever the theme. */}
        <iframe
          title={t.preview.iframeTitle}
          sandbox=""
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          className="block h-[75vh] w-full border border-rule bg-[#ffffff]"
        />
      </div>
    );
  }
  if (email.text) return <pre className={`${DATA} whitespace-pre-wrap break-words`}>{email.text}</pre>;
  return <p className="text-muted">{t.preview.noBody}</p>;
}
