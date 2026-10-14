// Where an embedded file comes from…
const PAYLOAD: [RegExp, string][] = [
  [/\batob\s*\(/, "atob() decodes an embedded payload"],
  [/data:application\/(?:octet-stream|x-msdownload|zip|x-zip-compressed|x-iso9660-image)[^"'\s]*;base64,/i, "embeds a file as a data: URL"],
  [/[A-Za-z0-9+/]{4000,}={0,2}/, "carries a long base64 blob"],
];

// …and how it reaches the disk.
const DELIVERY: [RegExp, string][] = [
  [/new\s+Blob\s*\(/, "builds a file in the browser (Blob)"],
  [/createObjectURL\s*\(/, "gives the file a local URL"],
  [/msSaveOrOpenBlob|msSaveBlob/, "saves it without a download prompt"],
  [/\.download\s*=|\sdownload\s*=\s*["']/, "triggers a download"],
  [/\.click\s*\(\s*\)/, "clicks a link by script"],
];

/** Every phrase `smugglingIndicators` can report. */
export const SMUGGLING_PHRASES: readonly string[] = [...PAYLOAD, ...DELIVERY].map(([, label]) => label);

export type SmugglingIndicators = { payload: string[]; delivery: string[] };

export function smugglingIndicators(text: string): SmugglingIndicators {
  const matching = (rules: [RegExp, string][]) => rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return { payload: matching(PAYLOAD), delivery: matching(DELIVERY) };
}

/**
 * HTML smuggling: a page that carries a file and writes it to disk itself,
 * so the file never crosses the mail filter as an attachment.
 */
export function isSmuggling(found: SmugglingIndicators): boolean {
  return found.payload.length > 0 && found.delivery.length > 0;
}
