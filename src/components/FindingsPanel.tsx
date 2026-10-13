import type { Finding } from "@/lib/finding";
import SeverityTag from "./SeverityTag";
import { DATA, SECTION_TITLE } from "./ui";

export default function FindingsPanel({ findings }: { findings: Finding[] }) {
  return (
    <section aria-labelledby="findings-title">
      <h2 id="findings-title" className={SECTION_TITLE}>
        Findings · {findings.length}
      </h2>
      {findings.length === 0 ? (
        <p className="text-muted">No finding in the headers.</p>
      ) : (
        <ol className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {findings.map((finding, i) => (
            <li
              key={finding.id}
              className="grid grid-cols-[2.5rem_5.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-hairline py-2 console:grid-cols-[4ch_8ch_minmax(0,1fr)] console:gap-x-2 console:border-b-0 console:py-0.5 dossier:grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] dossier:border-dotted dossier:py-2"
            >
              <span className="hidden text-muted dossier:inline">{i + 1}.</span>
              <span className="text-right font-bold tabular-nums console:text-left console:font-normal console:text-signal-fg dossier:order-last dossier:text-[15px] dossier:font-semibold dossier:italic dossier:text-signal-fg">
                +{finding.weight}
              </span>
              <SeverityTag severity={finding.severity} />
              <div className="min-w-0">
                <p className="font-bold console:font-normal dossier:font-semibold">{finding.title}</p>
                <p className="text-muted console:text-xs">{finding.explanation}</p>
                {finding.evidence.length > 0 && (
                  <ul className="mt-1">
                    {finding.evidence.map((line) => (
                      <li
                        key={line}
                        className={`${DATA} break-all ${
                          finding.severity === "high"
                            ? "dossier:underline dossier:decoration-signal dossier:decoration-wavy dossier:underline-offset-[3px]"
                            : ""
                        }`}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
