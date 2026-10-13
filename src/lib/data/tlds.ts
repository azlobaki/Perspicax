/**
 * Top-level domains that abuse reports keep pointing at: cheap or free to
 * register, rarely used by the organisations people deal with. A weak
 * signal on its own.
 */
const ABUSED_TLDS = new Set([
  "zip", "mov", "click", "top", "xyz", "cfd", "sbs", "rest", "quest", "cyou", "icu", "tk", "ml", "ga",
  "cf", "gq", "lol", "buzz", "monster", "cam", "beauty", "hair", "skin", "makeup", "bond", "autos",
  "boats", "yachts", "mom", "loan", "work", "fit", "gdn", "bid", "win", "review", "country", "kim",
  "stream", "download", "racing", "accountant", "date", "faith", "party", "science", "trade",
  "webcam", "men", "su",
]);

export function isAbusedTld(host: string): boolean {
  const tld = host.toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
  return ABUSED_TLDS.has(tld);
}
