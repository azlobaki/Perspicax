import type { ParsedEmail } from "../email.ts";
import { sortFindings, type Finding } from "../finding.ts";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader } from "../mime/headers.ts";
import { authFindings, authSummary, type AuthSummary } from "./auth.ts";
import { dateFindings, parseMailDate } from "./date.ts";
import { relayChain, routeFindings, type Hop } from "./received.ts";
import { senderFindings, senderInfo, type SenderInfo } from "./sender.ts";
import { vendorFindings, vendorVerdicts, type VendorVerdict } from "./vendors.ts";

export type AnalysisOptions = {
  /** The analyst's own domains (settings, milestone 4): spoofing them weighs more. */
  orgDomains: string[];
  /** Names a fraudster would borrow; on an outside address they are flagged. */
  vipNames?: string[];
};

export type HeaderReport = {
  subject: string | null;
  date: Date | null;
  hops: Hop[];
  auth: AuthSummary;
  sender: SenderInfo;
  vendors: VendorVerdict[];
  findings: Finding[];
};

export function analyzeHeaders(email: ParsedEmail, options: AnalysisOptions): HeaderReport {
  const headers = email.headers;
  const hops = relayChain(headers);
  const auth = authSummary(headers, hops);
  const sender = senderInfo(headers);
  const vendors = vendorVerdicts(headers);
  const subject = getHeader(headers, "subject");
  const rawDate = getHeader(headers, "date");
  return {
    subject: subject === null ? null : decodeEncodedWords(subject),
    date: rawDate === null ? null : parseMailDate(rawDate),
    hops,
    auth,
    sender,
    vendors,
    findings: sortFindings([
      ...authFindings(auth, sender.from?.domain ?? null, options.orgDomains),
      ...senderFindings(sender, options.orgDomains, options.vipNames),
      ...routeFindings(hops),
      ...dateFindings(rawDate, hops),
      ...vendorFindings(vendors),
    ]),
  };
}
