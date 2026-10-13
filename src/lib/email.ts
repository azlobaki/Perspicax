/** One header line, unfolded. `value` is raw: RFC 2047 words are not decoded. */
export type HeaderField = { name: string; value: string };

export type MimePart = {
  headers: HeaderField[];
  /** Lowercased `type/subtype`; `text/plain` when absent, per RFC 2045. */
  contentType: string;
  /** Content-Type parameters, lowercased keys, values decoded. */
  params: Record<string, string>;
  disposition: "inline" | "attachment" | null;
  filename: string | null;
  contentId: string | null;
  /** Body with the transfer encoding removed. Empty for multiparts. */
  body: Uint8Array;
  children: MimePart[];
};

export type Attachment = {
  filename: string;
  contentType: string;
  contentId: string | null;
  /** Inline parts (images referenced by `cid:`, say) are listed too: they can carry payloads. */
  inline: boolean;
  data: Uint8Array;
};

/** The normalised email every parser produces (`mime/` now, `msg/` in milestone 4). */
export type ParsedEmail = {
  source: "eml" | "msg" | "headers";
  /** Top-level headers, in file order (newest Received first). */
  headers: HeaderField[];
  text: string | null;
  html: string | null;
  attachments: Attachment[];
  /** Human-readable source for the Raw tab. */
  raw: string;
  warnings: string[];
};
