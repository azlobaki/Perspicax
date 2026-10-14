import { usePick } from "@/i18n/LocaleContext";
import { BAND_FLOORS, BAND_LABEL, type Band, type Score } from "@/lib/score/score";
import { LABEL } from "./ui";

const TONE: Record<Band, string> = {
  clean: "text-muted",
  suspicious: "text-ink console:text-signal-fg",
  "likely-phishing": "text-signal-fg",
  malicious: "text-signal-fg",
};

const strong = (band: Band) => band === "likely-phishing" || band === "malicious";

/**
 * Swiss: a very large numeral over a 0–100 scale marked at the band
 * floors. Console: the numeral in the signal colour, an inverted band
 * label and a segmented gauge. Hidden in the dossier theme, which shows
 * the stamp instead.
 */
export function VerdictBlock({ score }: { score: Score }) {
  const pick = usePick();
  const label = pick(BAND_LABEL[score.band]);
  return (
    <section aria-label={`Verdict: ${label}, risk score ${score.score} out of 100`} className="dossier:hidden">
      <p className={`${LABEL} console:hidden`}>Risk score</p>
      <p className="mt-1 flex items-baseline gap-2 console:mt-0">
        <span className="font-display text-[7.5rem] leading-[0.82] font-extrabold tracking-[-0.045em] tabular-nums [font-stretch:88%] console:text-6xl console:leading-none console:font-medium console:tracking-tight console:text-signal-fg">
          {score.score}
        </span>
        <span className="text-sm text-muted">/100</span>
      </p>
      <p
        className={`mt-2 inline-block text-xl font-bold tracking-tight ${TONE[score.band]} console:text-sm console:font-semibold console:tracking-normal ${
          strong(score.band) ? "console:bg-signal console:px-1.5 console:text-on-signal" : ""
        }`}
      >
        {label}
      </p>
      <div aria-hidden className="relative mt-3 h-6 max-w-sm border-t border-rule console:hidden">
        {[...BAND_FLOORS.map((f) => f.from), 100].map((from) => (
          <span key={from} className="absolute top-0 h-1.5 border-l border-rule" style={{ left: from === 100 ? "calc(100% - 1px)" : `${from}%` }}>
            <span className={`absolute top-2 text-[9.5px] text-muted ${from === 100 ? "-translate-x-full" : "-translate-x-1/2"}`}>{from}</span>
          </span>
        ))}
        <span className="absolute -top-[5px] h-[13px] w-[3px] bg-signal" style={{ left: `calc(${score.score}% - 1px)` }} />
      </div>
      <div
        aria-hidden
        className="relative mt-3 hidden h-2 max-w-[11rem] bg-[repeating-linear-gradient(90deg,var(--px-hairline)_0_4px,transparent_4px_6px)] console:block"
      >
        <div
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,var(--px-signal)_0_4px,transparent_4px_6px)]"
          style={{ width: `${score.score}%` }}
        />
      </div>
    </section>
  );
}

/** Dossier only: the verdict as a rubber stamp on the report. */
export function VerdictStamp({ score }: { score: Score }) {
  const pick = usePick();
  const red = score.band !== "clean";
  return (
    <div
      className={`pointer-events-none hidden -rotate-[5deg] justify-self-start dossier:sm:absolute dossier:sm:top-6 dossier:sm:right-0 border-[3px] border-double px-3 pt-1.5 pb-1 text-center font-data font-bold mix-blend-multiply dossier:inline-block ${
        red ? "border-signal text-signal-fg" : "border-ink text-ink"
      }`}
    >
      <span className="block text-xl leading-tight tracking-[0.12em] uppercase">{pick(BAND_LABEL[score.band])}</span>
      <span className="text-xs tracking-[0.08em]">score {score.score} / 100</span>
    </div>
  );
}
