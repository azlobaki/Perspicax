/**
 * Defence in depth for the no-network promise: the browser itself refuses
 * every connection the page might attempt, and the safe-preview frame
 * inherits this policy. Set as a <meta> in the built page (not in `next dev`,
 * which needs eval and a websocket) and as an HTTP header by the host.
 */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** The header adds what a <meta> policy cannot carry: no framing by other sites. */
export const HEADER_CSP = `${PAGE_CSP}; frame-ancestors 'none'`;
