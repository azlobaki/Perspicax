import type { Severity } from "@/lib/finding";

const LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", info: "Info" };

// Swiss: a square mark. Console: an inverted or tinted word. Dossier: the
// word is for screen readers only — the red margin weight carries it.
const MARK: Record<Severity, string> = {
  high: "bg-signal",
  medium: "bg-ink",
  low: "border border-ink",
  info: "border border-hairline",
};

const WORD: Record<Severity, string> = {
  high: "console:bg-signal console:px-1 console:font-semibold console:text-on-signal",
  medium: "console:text-signal-fg",
  low: "text-muted",
  info: "text-muted",
};

export default function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap dossier:sr-only">
      <span aria-hidden className={`inline-block size-[9px] shrink-0 console:hidden ${MARK[severity]}`} />
      <span className={`console:uppercase ${WORD[severity]}`}>{LABEL[severity]}</span>
    </span>
  );
}
