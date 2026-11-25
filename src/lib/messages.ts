import type { Attachment, ParsedEmail } from "./email.ts";
import { parseEmail } from "./mime/parse.ts";
import { parseMsg } from "./msg/parse.ts";

/** A message carried by the current one, read only when the analyst opens it. */
export type CarriedMessage = { name: string; size: number; open: () => ParsedEmail };

// OLE compound files (.msg) start with this signature, whatever their name.
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function isOle(data: Uint8Array): boolean {
  return OLE_SIGNATURE.every((byte, i) => data[i] === byte);
}

/** An attached email: a message/rfc822 part, an .eml file, or an Outlook .msg. */
export function isMessageAttachment(attachment: Attachment): boolean {
  if (attachment.contentType === "message/rfc822" || /\.eml$/i.test(attachment.filename)) return true;
  return (/\.msg$/i.test(attachment.filename) || attachment.contentType === "application/vnd.ms-outlook") && isOle(attachment.data);
}

/**
 * The emails this one carries: forwarded as attachments, or reported through
 * a phishing button that wraps the suspect message. The verdict on the
 * carrier says nothing about them; each can be opened and analysed on its own.
 */
export function carriedMessages(email: ParsedEmail): CarriedMessage[] {
  const carried: CarriedMessage[] = email.attachments.filter(isMessageAttachment).map((attachment) => ({
    name: attachment.filename,
    size: attachment.data.length,
    open: () => (isOle(attachment.data) ? parseMsg(attachment.data) : parseEmail(attachment.data)),
  }));
  for (const embedded of email.embedded ?? []) {
    carried.push({ name: embedded.name, size: 0, open: () => embedded.email });
  }
  return carried;
}
