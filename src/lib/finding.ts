import type { Locale, Text } from "./i18n/text.ts";

export type Severity = "info" | "low" | "medium" | "high";

export type FindingCategory = "auth" | "sender" | "route" | "vendor" | "link" | "html" | "attachment" | "content";

export type Finding = {
  /** Stable machine id, e.g. `auth.dmarc-fail`. */
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: Text;
  /** Why this matters, in plain words, in every language. Every theme shows it. */
  explanation: Text;
  /**
   * What triggered the finding: quotes from the email (raw strings, never
   * translated) and our own notations around them (`Text`).
   */
  evidence: Evidence[];
  /** Contribution to the risk score (aggregated in `score/`, milestone 4). */
  weight: number;
};

export type Evidence = string | Text;

/** An evidence line that carries a notation of ours; a plain quote when both languages read the same. */
export function noted(en: string, fr: string): Evidence {
  return en === fr ? en : { en, fr };
}

export function evidenceIn(line: Evidence, locale: Locale): string {
  return typeof line === "string" ? line : line[locale];
}

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

/** Most severe first, then heaviest first. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.weight - a.weight,
  );
}
