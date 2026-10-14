import type { Finding, FindingCategory } from "../finding.ts";

export type Band = "clean" | "suspicious" | "likely-phishing" | "malicious";

export const BAND_LABEL: Record<Band, string> = {
  clean: "Clean",
  suspicious: "Suspicious",
  "likely-phishing": "Likely phishing",
  malicious: "Malicious indicators",
};

/** Lower bound of each band on the 0–100 scale. */
export const BAND_FLOORS: { band: Band; from: number }[] = [
  { band: "clean", from: 0 },
  { band: "suspicious", from: 15 },
  { band: "likely-phishing", from: 40 },
  { band: "malicious", from: 70 },
];

/**
 * Most points a category can contribute, so a pile of related signals —
 * ten flagged links, say — cannot outweigh everything else.
 */
export const CATEGORY_CAPS: Record<FindingCategory, number> = {
  auth: 30,
  sender: 25,
  route: 10,
  vendor: 25,
  link: 40,
  html: 30,
  attachment: 45,
  // What the text asks for: a bank-details change, so far.
  content: 25,
};

// Artefacts that are malicious in themselves, not merely suspicious.
const DECISIVE = new Set([
  "attachment.html-smuggling",
  "attachment.program",
  "attachment.script",
  "attachment.shortcut",
  "attachment.macros",
  "attachment.archive-hides-program",
  "attachment.disk-image",
  "attachment.remote-template",
]);

export type CategoryScore = { category: FindingCategory; points: number; cap: number };

export type Score = {
  /** 0–100. */
  score: number;
  band: Band;
  /** Points per category after capping, for the categories that scored. */
  categories: CategoryScore[];
  /** Ids of the findings that forced the "malicious indicators" band. */
  decisive: string[];
};

export function scoreFindings(findings: readonly Finding[]): Score {
  const totals = new Map<FindingCategory, number>();
  for (const f of findings) totals.set(f.category, (totals.get(f.category) ?? 0) + f.weight);
  const categories = (Object.keys(CATEGORY_CAPS) as FindingCategory[])
    .filter((category) => (totals.get(category) ?? 0) > 0)
    .map((category) => ({ category, points: Math.min(CATEGORY_CAPS[category], totals.get(category) ?? 0), cap: CATEGORY_CAPS[category] }));
  const score = Math.min(100, categories.reduce((sum, c) => sum + c.points, 0));
  const decisive = findings.filter((f) => DECISIVE.has(f.id)).map((f) => f.id);
  let band: Band = "clean";
  for (const floor of BAND_FLOORS) if (score >= floor.from) band = floor.band;
  return { score, band: decisive.length > 0 ? "malicious" : band, categories, decisive };
}
