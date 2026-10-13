export type Severity = "info" | "low" | "medium" | "high";

export type FindingCategory = "auth" | "sender" | "route" | "vendor" | "link" | "html" | "attachment";

export type Finding = {
  /** Stable machine id, e.g. `auth.dmarc-fail`. */
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  /** Why this matters, in plain words. Every theme shows it. */
  explanation: string;
  /** The exact header values that triggered the finding. */
  evidence: string[];
  /** Contribution to the risk score (aggregated in `score/`, milestone 4). */
  weight: number;
};

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

/** Most severe first, then heaviest first. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.weight - a.weight,
  );
}
