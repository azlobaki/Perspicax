"use client";

import { useState } from "react";
import type { EmailReport } from "@/lib/analyze";
import type { ParsedEmail } from "@/lib/email";
import { formatUtc } from "@/lib/format";
import { isClickable } from "@/lib/links/analyze";
import { decodeEncodedWords } from "@/lib/mime/encoded-words";
import { getHeader } from "@/lib/mime/headers";
import AttachmentsTab from "./AttachmentsTab";
import FindingsPanel from "./FindingsPanel";
import HeadersTab from "./HeadersTab";
import IocsTab from "./IocsTab";
import LinksTab from "./LinksTab";
import PreviewTab from "./PreviewTab";
import RawTab from "./RawTab";
import Tabs from "./Tabs";
import { DATA, LABEL } from "./ui";

type TabId = "headers" | "links" | "attachments" | "iocs" | "preview" | "raw";

export default function ReportView({ email, report }: { email: ParsedEmail; report: EmailReport }) {
  const [tab, setTab] = useState<TabId>("headers");
  const headers = report.headers;
  const from = headers.sender.from;
  const to = getHeader(email.headers, "to");

  return (
    <main className="flex-1 px-4 pb-12 sm:px-6">
      <div className="grid gap-x-8 gap-y-6 border-b-[3px] border-rule py-6 lg:grid-cols-12 console:border-b console:border-hairline console:py-3 dossier:border-b-0 dossier:py-8">
        <div className="lg:col-span-5 console:lg:col-span-12 dossier:lg:col-span-12">
          <p className={LABEL}>Subject</p>
          <h1 className="mt-1 font-display text-2xl leading-tight font-bold tracking-tight console:text-sm console:font-medium console:tracking-normal dossier:text-[1.6rem] dossier:font-semibold dossier:before:content-['«_'] dossier:after:content-['_»']">
            {headers.subject || "(no subject)"}
          </h1>
          <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-y-1 text-sm console:mt-2 console:grid-cols-[9ch_minmax(0,1fr)] console:gap-y-0 console:text-xs dossier:gap-y-0 dossier:border-t dossier:border-hairline dossier:*:border-b dossier:*:border-hairline dossier:*:py-1">
            <dt className={LABEL}>From</dt>
            <dd className="break-all">
              {from ? (
                <>
                  {from.name && <span>{from.name} </span>}
                  <span className={DATA}>&lt;{from.address}&gt;</span>
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt className={LABEL}>To</dt>
            <dd className={`${DATA} break-all`}>{to ? decodeEncodedWords(to) : "—"}</dd>
            <dt className={LABEL}>Date</dt>
            <dd className="tabular-nums">{headers.date ? formatUtc(headers.date) : "—"}</dd>
          </dl>
          {email.warnings.length > 0 && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer">
                {email.warnings.length} parsing {email.warnings.length === 1 ? "warning" : "warnings"}
              </summary>
              <ul className="mt-1 list-inside list-disc">
                {email.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="lg:col-span-7 console:lg:col-span-12 dossier:lg:col-span-12">
          <FindingsPanel findings={report.findings} />
        </div>
      </div>

      <Tabs
        label="Report sections"
        tabs={[
          { id: "headers", label: "Headers" },
          { id: "links", label: "Links", count: report.links.links.filter(isClickable).length },
          { id: "attachments", label: "Attachments", count: report.attachments.length },
          { id: "iocs", label: "IOCs", count: report.iocs.length },
          { id: "preview", label: "Safe preview" },
          { id: "raw", label: "Raw source" },
        ]}
        active={tab}
        onChange={setTab}
      >
        {tab === "headers" && <HeadersTab report={headers} headers={email.headers} />}
        {tab === "links" && <LinksTab links={report.links.links} />}
        {tab === "attachments" && <AttachmentsTab attachments={report.attachments} />}
        {tab === "iocs" && <IocsTab iocs={report.iocs} />}
        {tab === "preview" && <PreviewTab email={email} />}
        {tab === "raw" && <RawTab raw={email.raw} />}
      </Tabs>
    </main>
  );
}
