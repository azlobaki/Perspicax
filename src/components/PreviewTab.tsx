"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/LocaleContext";
import type { ParsedEmail } from "@/lib/email";
import { buildPreview } from "@/lib/html/preview";
import { parseHtml } from "./parseHtml";
import { DATA } from "./ui";

export default function PreviewTab({ email }: { email: ParsedEmail }) {
  const locale = useLocale();
  const srcDoc = useMemo(
    () => (email.html ? buildPreview(email.html, parseHtml, email.attachments, locale) : null),
    [email, locale],
  );

  if (srcDoc) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted console:text-xs">
          Scripts, links and forms are disabled and remote images are replaced by placeholders: nothing in this preview
          can reach the network. Hover a link to see where it goes.
        </p>
        {/* The email's own canvas: mail is designed on white whatever the theme. */}
        <iframe
          title="Safe preview of the email"
          sandbox=""
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          className="block h-[75vh] w-full border border-rule bg-[#ffffff]"
        />
      </div>
    );
  }
  if (email.text) return <pre className={`${DATA} whitespace-pre-wrap break-words`}>{email.text}</pre>;
  return <p className="text-muted">This email has no body to preview.</p>;
}
