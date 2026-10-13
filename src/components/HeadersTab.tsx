import type { DkimCheck } from "@/lib/dkim/bodyhash";
import type { HeaderField } from "@/lib/email";
import { formatDelay, formatTime } from "@/lib/format";
import type { HeaderReport } from "@/lib/headers/analyze";
import { entryDetails, isFailing, type AuthSummary } from "@/lib/headers/auth";
import type { Hop } from "@/lib/headers/received";
import type { SenderInfo, SenderRow } from "@/lib/headers/sender";
import type { VendorVerdict } from "@/lib/headers/vendors";
import Breakable from "./Breakable";
import { DATA, FLAG, LABEL, SECTION_TITLE } from "./ui";

const METHOD_LABEL: Record<string, string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  compauth: "Compauth",
  arc: "ARC",
  bimi: "BIMI",
};

const VERDICT_LABEL: Record<NonNullable<VendorVerdict["verdict"]>, string> = {
  phishing: "Phishing",
  malware: "Malware",
  spam: "Spam",
  bulk: "Bulk",
  clean: "Clean",
};

export default function HeadersTab({ report, headers, dkim }: { report: HeaderReport; headers: HeaderField[]; dkim: DkimCheck[] }) {
  return (
    <div className="grid gap-x-8 gap-y-8 lg:grid-cols-12 console:gap-y-4 dossier:gap-y-6 dossier:lg:grid-cols-2">
      <Authentication auth={report.auth} dkim={dkim} />
      <Sender sender={report.sender} />
      <Route hops={report.hops} />
      <Vendors vendors={report.vendors} />
      <AllHeaders headers={headers} />
    </div>
  );
}

function Authentication({ auth, dkim }: { auth: AuthSummary; dkim: DkimCheck[] }) {
  return (
    <section
      aria-labelledby="auth-title"
      className="lg:col-span-5 console:lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-1 dossier:lg:row-start-1"
    >
      <h2 id="auth-title" className={SECTION_TITLE}>
        Authentication
        {auth.recordedBy && (
          <span className="normal-case tracking-normal dossier:[font-variant:normal]">
            {" "}
            · recorded by <span className={DATA}>{auth.recordedBy}</span>
          </span>
        )}
      </h2>
      {auth.entries.length === 0 ? (
        <p className="text-muted">No authentication results in these headers.</p>
      ) : (
        <dl className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {auth.entries.map((entry, i) => (
            <div
              key={i}
              className="grid grid-cols-[6.5rem_4.5rem_minmax(0,1fr)] items-baseline gap-x-2 border-b border-hairline py-1.5 console:grid-cols-[10ch_7ch_minmax(0,1fr)] console:border-b-0 console:py-0 dossier:grid-cols-[6rem_5.5rem_minmax(0,1fr)] dossier:py-1"
            >
              <dt className="text-[15px] font-bold console:text-xs console:font-normal console:lowercase dossier:text-sm dossier:font-normal dossier:tracking-[0.05em] dossier:text-muted dossier:[font-variant:small-caps]">
                {METHOD_LABEL[entry.method] ?? entry.method}
              </dt>
              <dd className="text-[15px] font-bold console:text-xs dossier:font-data dossier:text-sm dossier:font-normal">
                <span
                  className={
                    isFailing(entry)
                      ? "text-signal-fg suisse:capitalize dossier:inline-block dossier:-rotate-3 dossier:rounded-[50%] dossier:border-[1.5px] dossier:border-signal dossier:px-1.5"
                      : "suisse:capitalize console:font-normal"
                  }
                >
                  {entry.result}
                </span>
              </dd>
              <dd className={`${DATA} break-all text-muted`}>{entryDetails(entry) || entry.comment || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {dkim.length > 0 && (
        <ul className="mt-3 grid gap-0.5 text-sm console:text-xs">
          {dkim.map((check, i) => (
            <li key={i}>
              <span className={LABEL}>DKIM body hash</span>{" "}
              <span className={DATA}>
                d={check.signature.domain} s={check.signature.selector}
              </span>{" "}
              —{" "}
              <span className={check.result === "mismatch" ? FLAG : "text-muted"}>
                {check.result === "match" ? "matches the body" : check.result === "mismatch" ? "body changed after signing" : "algorithm not supported"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describeRow(row: SenderRow): { text: string; flagged: boolean } | null {
  const notes: string[] = [];
  if (row.matchesFrom === false) notes.push("≠ From");
  if (row.freeMail) notes.push("free mail");
  if (row.header === "Return-Path" && row.domain === null) notes.push("null sender");
  return notes.length > 0 ? { text: notes.join(" · "), flagged: row.matchesFrom === false } : null;
}

function SenderLine({ label, value, note, data = true }: {
  label: string;
  value: string;
  note: { text: string; flagged: boolean } | null;
  data?: boolean;
}) {
  return (
    <tr className="border-b border-hairline console:border-b-0">
      <th scope="row" className={`${LABEL} w-28 py-1.5 pr-3 text-left align-baseline console:w-[15ch] console:py-0`}>
        {label}
      </th>
      <td className={`${data ? DATA : ""} break-all py-1.5 align-baseline console:py-0`}>{value}</td>
      <td className={`whitespace-nowrap py-1.5 pl-3 text-right align-baseline console:py-0 console:text-left ${note?.flagged ? FLAG : "text-muted"}`}>
        {note?.text}
      </td>
    </tr>
  );
}

function Sender({ sender }: { sender: SenderInfo }) {
  return (
    <section
      aria-labelledby="sender-title"
      className="lg:col-span-7 console:lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-2 dossier:lg:row-start-2"
    >
      <h2 id="sender-title" className={SECTION_TITLE}>
        Sender consistency
      </h2>
      <table className="w-full border-collapse border-t border-rule text-sm console:border-t-0 console:text-xs dossier:border-t-0">
        <tbody>
          {sender.from?.name && <SenderLine label="Display name" value={sender.from.name} note={null} data={false} />}
          {sender.rows.map((row, i) => (
            <SenderLine key={i} label={row.header} value={row.value} note={describeRow(row)} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function hopFlags(hop: Hop): string[] {
  const flags: string[] = [];
  if (hop.heloMismatch) flags.push(hop.rdns ? "HELO ≠ rDNS" : "HELO, no rDNS");
  if (hop.ipScope && hop.ipScope !== "public") flags.push(hop.ipScope);
  if (hop.delay !== null && hop.delay < -300) flags.push("clock skew");
  return flags;
}

function Route({ hops }: { hops: Hop[] }) {
  return (
    <section
      aria-labelledby="route-title"
      className="lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-2 dossier:lg:row-start-1"
    >
      <h2 id="route-title" className={SECTION_TITLE}>
        Received chain · {hops.length} {hops.length === 1 ? "hop" : "hops"}, oldest first
      </h2>
      {hops.length === 0 ? (
        <p className="text-muted">No Received headers.</p>
      ) : (
        <>
          <div
            aria-hidden
            className="hidden grid-cols-[3ch_10ch_7ch_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-2 border-b border-hairline text-xs text-muted console:sm:grid"
          >
            <span>#</span>
            <span>time</span>
            <span>Δ</span>
            <span>from</span>
            <span>by</span>
            <span>flags</span>
          </div>
          <ol className="grid border-t border-rule [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))] console:block console:border-t-0 dossier:block dossier:border-t-0">
            {hops.map((hop) => (
              <HopItem key={hop.index} hop={hop} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function HopItem({ hop }: { hop: Hop }) {
  const flags = hopFlags(hop);
  const host = hop.helo ?? hop.rdns ?? hop.ip ?? "unknown";
  const transport = [hop.protocol, hop.tls ? "TLS" : null].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] content-start gap-x-2 border-r border-hairline px-3 pt-2 pb-3 first:pl-0 last:border-r-0 console:sm:grid-cols-[3ch_10ch_7ch_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] console:border-r-0 console:p-0 console:text-xs dossier:grid-cols-[5.5rem_1.75rem_minmax(0,1fr)] dossier:border-r-0 dossier:border-b dossier:px-0 dossier:py-1.5">
      <span className="font-display text-4xl leading-none font-extrabold tracking-tight [font-stretch:88%] console:text-xs console:font-normal console:tracking-normal console:text-muted dossier:col-start-2 dossier:row-start-1 dossier:text-sm dossier:font-semibold dossier:tracking-normal dossier:after:content-['.']">
        {hop.index}
      </span>
      <span className="text-right text-xs font-bold tabular-nums console:text-left console:font-normal dossier:col-start-1 dossier:row-start-1 dossier:text-left dossier:font-data dossier:font-normal dossier:text-muted">
        {hop.date ? formatTime(hop.date) : "—"}
      </span>
      <span className="text-right text-xs tabular-nums text-muted console:text-left dossier:col-start-1 dossier:row-start-2 dossier:text-left dossier:font-data">
        {formatDelay(hop.delay)}
      </span>
      <span className="col-span-3 mt-2 [overflow-wrap:anywhere] console:sm:col-span-1 console:sm:mt-0 dossier:col-span-1 dossier:col-start-3 dossier:row-start-1 dossier:mt-0">
        <span className={DATA}>
          <Breakable text={host} />
        </span>
        {hop.ip && hop.ip !== host && (
          <span className={`${DATA} block console:ml-1 console:inline ${hop.heloMismatch ? FLAG : "text-muted"}`}>
            [<Breakable text={hop.ip} />]
          </span>
        )}
      </span>
      <span className="col-span-3 text-muted [overflow-wrap:anywhere] console:sm:col-span-1 dossier:col-span-1 dossier:col-start-3 dossier:row-start-2">
        <span className="console:hidden">by </span>
        <span className={DATA}>{hop.by ? <Breakable text={hop.by} /> : "—"}</span>
      </span>
      <span className="col-span-3 text-xs console:sm:col-span-1 dossier:col-span-1 dossier:col-start-3 dossier:row-start-3 dossier:text-sm dossier:italic">
        {flags.length > 0 && <span className={`${FLAG} mr-2`}>{flags.join(" · ")}</span>}
        {transport && <span className="text-muted dossier:not-italic">{transport}</span>}
      </span>
    </li>
  );
}

function Vendors({ vendors }: { vendors: VendorVerdict[] }) {
  return (
    <section
      aria-labelledby="vendors-title"
      className="lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-1 dossier:lg:row-start-2"
    >
      <h2 id="vendors-title" className={SECTION_TITLE}>
        Gateway verdicts
      </h2>
      {vendors.length === 0 ? (
        <p className="text-muted">No mail-filter verdict in these headers.</p>
      ) : (
        vendors.map((vendor) => (
          <div key={vendor.vendor} className="mb-4 last:mb-0">
            <p className="mb-1 flex items-baseline gap-3 font-bold console:font-normal dossier:font-semibold">
              {vendor.vendor}
              {vendor.verdict && (
                <span className={vendor.verdict === "clean" || vendor.verdict === "bulk" ? "font-normal text-muted" : FLAG}>
                  {VERDICT_LABEL[vendor.verdict]}
                </span>
              )}
            </p>
            <dl className="grid border-t border-hairline [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))] console:border-t-0">
              {vendor.fields.map((field) => (
                <div key={field.key} className="border-b border-hairline py-1.5 pr-3 console:border-b-0 console:py-0">
                  <dt className={`${DATA} ${field.flagged ? FLAG : ""}`}>
                    {field.key}: {field.value}
                  </dt>
                  {field.meaning && <dd className="text-xs text-muted">{field.meaning}</dd>}
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </section>
  );
}

function AllHeaders({ headers }: { headers: HeaderField[] }) {
  return (
    <details className="lg:col-span-12 dossier:lg:col-span-2">
      <summary className={`${SECTION_TITLE} cursor-pointer select-none`}>All headers · {headers.length}</summary>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {headers.map((header, i) => (
            <tr key={i} className="border-b border-hairline align-baseline">
              <th scope="row" className={`${DATA} w-56 py-1 pr-3 text-left font-semibold`}>
                {header.name}
              </th>
              <td className={`${DATA} whitespace-pre-wrap break-all py-1`}>{header.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
