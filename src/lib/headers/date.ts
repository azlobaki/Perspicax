import type { Finding } from "../finding.ts";
import type { Hop } from "./received.ts";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Obsolete zone names allowed by RFC 5322 §4.3, in minutes east of UTC. */
const ZONES: Record<string, number> = {
  UT: 0, UTC: 0, GMT: 0, Z: 0,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
};

const RFC5322 =
  /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([+-]\d{4}|[A-Za-z]{1,5})?/;
const ISO = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?/;

const HOUR = 3_600_000;

/**
 * Leniently parses the date formats found in Date and Received headers:
 * RFC 5322 (optional weekday, 2- or 4-digit year, optional seconds, numeric
 * or named zone, trailing comments) and the ISO-like stamps some relays
 * write. Returns null rather than guessing.
 */
export function parseMailDate(value: string): Date | null {
  const rfc = RFC5322.exec(value);
  if (rfc) {
    const month = MONTHS[rfc[2].toLowerCase()];
    if (month === undefined) return null;
    let year = Number(rfc[3]);
    if (rfc[3].length === 2) year += year < 50 ? 2000 : 1900;
    return build(year, month, Number(rfc[1]), Number(rfc[4]), Number(rfc[5]), Number(rfc[6] ?? 0), zoneOffset(rfc[7]));
  }
  const iso = ISO.exec(value);
  if (iso) {
    return build(
      Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
      Number(iso[4]), Number(iso[5]), Number(iso[6]), zoneOffset(iso[7]),
    );
  }
  return null;
}

function zoneOffset(zone: string | undefined): number {
  if (!zone) return 0;
  const numeric = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
  if (numeric) return (numeric[1] === "-" ? -1 : 1) * (Number(numeric[2]) * 60 + Number(numeric[3]));
  // Unknown names are treated as UTC, as RFC 5322 says for "-0000".
  return ZONES[zone.toUpperCase()] ?? 0;
}

function build(year: number, month: number, day: number, h: number, m: number, s: number, offset: number): Date | null {
  if (day < 1 || day > 31 || h > 23 || m > 59 || s > 60) return null;
  const date = new Date(Date.UTC(year, month, day, h, m, s) - offset * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date header anomalies, judged against the relay timestamps. */
export function dateFindings(raw: string | null, hops: readonly Hop[]): Finding[] {
  if (raw === null) {
    return [{
      id: "route.date-missing", category: "route", severity: "low", title: "No Date header",
      explanation: "Every mail client sets a Date header. Its absence points to a script or a hand-made message.",
      evidence: [], weight: 2,
    }];
  }
  const date = parseMailDate(raw);
  if (date === null) {
    return [{
      id: "route.date-unreadable", category: "route", severity: "low", title: "Unreadable Date header",
      explanation: "The Date header is not in any format mail clients write.",
      evidence: [`Date: ${raw}`], weight: 2,
    }];
  }
  const stamps = hops.flatMap((h) => (h.date ? [h.date.getTime()] : []));
  if (stamps.length === 0) return [];
  const first = stamps[0];
  const last = stamps[stamps.length - 1];
  if (date.getTime() > last + 2 * HOUR) {
    return [{
      id: "route.date-future", category: "route", severity: "low", title: "Dated after it was delivered",
      explanation: "The Date header is later than the time the last server received the message. Senders forge dates to keep a message at the top of the inbox.",
      evidence: [`Date: ${raw}`, `Last relay: ${new Date(last).toISOString()}`], weight: 3,
    }];
  }
  if (date.getTime() < first - 7 * 24 * HOUR) {
    return [{
      id: "route.date-old", category: "route", severity: "low", title: "Written long before it was sent",
      explanation: "The Date header is more than a week older than the first relay. Replayed or resent messages look like this.",
      evidence: [`Date: ${raw}`, `First relay: ${new Date(first).toISOString()}`], weight: 2,
    }];
  }
  return [];
}
