import { Fragment } from "react";
import type { AttachmentReport } from "@/lib/attachments/analyze";
import { useLocale, usePick, useT } from "@/i18n/LocaleContext";
import { formatSize } from "@/lib/format";
import Breakable from "./Breakable";
import CopyButton from "./CopyButton";
import { DATA, FLAG, LABEL } from "./ui";

const HASHES = [
  ["sha256", "SHA-256"],
  ["sha1", "SHA-1"],
  ["md5", "MD5"],
] as const;

export default function AttachmentsTab({ attachments }: { attachments: AttachmentReport[] }) {
  const t = useT();
  if (attachments.length === 0) return <p className="text-muted">{t.attachments.none}</p>;
  return (
    <ol className="grid gap-8 console:gap-4">
      {attachments.map((report, i) => (
        <AttachmentItem key={i} n={i + 1} report={report} />
      ))}
    </ol>
  );
}

function AttachmentItem({ n, report }: { n: number; report: AttachmentReport }) {
  const pick = usePick();
  const t = useT();
  const locale = useLocale();
  return (
    <li className="border-t-[3px] border-rule pt-3 console:border-t console:border-hairline console:pt-2 dossier:border-t">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-display text-3xl leading-none font-extrabold tabular-nums console:text-xs console:font-normal console:text-muted dossier:text-base dossier:font-semibold dossier:after:content-['.']">
          {n}
        </span>
        <h3 className={`${DATA} text-base font-semibold [overflow-wrap:anywhere] console:text-sm`}>
          <Breakable text={report.visibleName} />
        </h3>
        {report.inline && <span className={LABEL}>{t.attachments.inline}</span>}
      </div>

      {report.flags.length > 0 && (
        <ul className="mt-2 grid gap-0.5 text-sm console:text-xs">
          {report.flags.map((flag) => (
            <li key={flag}>
              <span className={`${FLAG} dossier:italic`}>{t.attachments.flags[flag]}</span>
              {report.details[flag] && (
                <span className={`${DATA} text-muted [overflow-wrap:anywhere]`}> — {pick(report.details[flag]!)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-y-1 text-sm console:grid-cols-[14ch_minmax(0,1fr)] console:gap-y-0 console:text-xs dossier:gap-y-0 dossier:*:border-b dossier:*:border-hairline dossier:*:py-1">
        <dt className={LABEL}>{t.attachments.declared}</dt>
        <dd className={DATA}>{report.declaredType}</dd>
        <dt className={LABEL}>{t.attachments.detected}</dt>
        <dd className={report.flags.includes("type-mismatch") ? FLAG : ""}>{pick(report.detected.label)}</dd>
        <dt className={LABEL}>{t.attachments.size}</dt>
        <dd className="tabular-nums">{formatSize(report.size, locale)}</dd>
        {HASHES.map(([key, label]) => (
          <Fragment key={key}>
            <dt className={LABEL}>{label}</dt>
            <dd className="flex items-baseline gap-3">
              <span className={`${DATA} break-all`}>{report.hashes[key]}</span>
              <CopyButton text={report.hashes[key]} />
            </dd>
          </Fragment>
        ))}
      </dl>

      {report.entries && (
        <details open className="mt-3">
          <summary className={`${LABEL} cursor-pointer`}>{t.attachments.archiveContents(report.entries.length)}</summary>
          <ul className="mt-1">
            {report.entries.map((entry, i) => (
              <li key={i} className={`${DATA} ${entry.flagged ? FLAG : ""}`}>
                {entry.name} <span className="text-muted">{formatSize(entry.size, locale)}</span>
                {entry.encrypted && <span className="text-muted">{t.attachments.encrypted}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {report.urls.length + report.qr.length > 0 && (
        <p className="mt-2 text-sm text-muted console:text-xs">
          {t.attachments.addressesFound(report.urls.length + report.qr.length)}
        </p>
      )}
    </li>
  );
}
