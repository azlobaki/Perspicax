// Builds the synthetic Outlook messages in fixtures/:
// - docusign.msg: a DocuSign lookalike received through Exchange Online, with
//   an HTML body and a PDF attachment that both point to a domain disguised as
//   docusign.net;
// - exchange-rtf.msg: a password-expiry lure stored the way on-premises
//   Exchange does, its HTML body only inside compressed RTF, behind a
//   Hornetsecurity gateway that left an ARC copy but no Authentication-Results.
// Run `node scripts/make-msg-fixture.mjs`; the output is reproducible byte for byte.
import { writeFileSync } from "node:fs";
import * as CFB from "cfb";
import { compressRtf } from "../src/lib/testing/rtf.ts";

const utf16 = (text) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out[2 * i] = text.charCodeAt(i) & 0xff;
    out[2 * i + 1] = text.charCodeAt(i) >> 8;
  }
  return out;
};
const utf8 = (text) => new TextEncoder().encode(text);

const LINK = "https://docusign.net.review-envelope.xyz/e/4471";
const HEADERS = [
  "Received: from AM9PR04MB8456.eurprd04.prod.outlook.com (2603:10a6:20b:40f::7)",
  " by DB9PR04MB8301.eurprd04.prod.outlook.com with HTTPS; Wed, 14 Oct 2026",
  " 08:21:07 +0000",
  "Authentication-Results: spf=pass (sender IP is 193.37.255.61)",
  " smtp.mailfrom=envelope-notice.xyz; dkim=none (message not signed)",
  " header.d=none;dmarc=none action=none header.from=envelope-notice.xyz;compauth=fail",
  " reason=601",
  "Received: from mta.envelope-notice.xyz (193.37.255.61) by",
  " AM9PR04MB8456.mail.protection.outlook.com (10.167.242.18) with Microsoft SMTP",
  " Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.8093.1 via",
  " Frontend Transport; Wed, 14 Oct 2026 08:21:06 +0000",
  "From: DocuSign <dse@envelope-notice.xyz>",
  "To: <j.martin@rhone-energie.fr>",
  "Subject: Contrat 4471 : document en attente de signature",
  "Date: Wed, 14 Oct 2026 08:21:05 +0000",
  "Message-ID: <4471.envelope@envelope-notice.xyz>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="_docusign_4471_"',
  "",
  "",
].join("\r\n");
const TEXT = `Vous avez reçu un document à signer : Contrat 4471.\r\nConsulter le document : ${LINK}\r\n`;
const HTML = `<html><head><meta charset="utf-8"></head><body><p>Vous avez reçu un document à signer : Contrat 4471.</p><p><a href="${LINK}">Consulter le document</a></p></body></html>`;
const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /URI /URI (https://docusign.net.review-envelope.xyz/pdf/4471) >> >>\nendobj\n%%EOF\n";

const msg = CFB.utils.cfb_new();
const add = (path, data) => CFB.utils.cfb_add(msg, path, data);
add("/__properties_version1.0", new Uint8Array(32));
add("/__substg1.0_007D001F", utf16(HEADERS));
add("/__substg1.0_0037001F", utf16("Contrat 4471 : document en attente de signature"));
add("/__substg1.0_0C1A001F", utf16("DocuSign"));
add("/__substg1.0_0C1F001F", utf16("dse@envelope-notice.xyz"));
add("/__substg1.0_1000001F", utf16(TEXT));
add("/__substg1.0_10130102", utf8(HTML));
add("/__attach_version1.0_#00000000/__properties_version1.0", new Uint8Array(16));
add("/__attach_version1.0_#00000000/__substg1.0_3707001F", utf16("Contrat_4471.pdf"));
add("/__attach_version1.0_#00000000/__substg1.0_370E001F", utf16("application/pdf"));
add("/__attach_version1.0_#00000000/__substg1.0_37010102", utf8(PDF));

writeFileSync(new URL("../fixtures/docusign.msg", import.meta.url), CFB.write(msg, { type: "buffer" }));

const RTF_HEADERS = [
  "Received: from EXCH02.corp.rhone-energie.fr (10.20.1.12) by",
  " EXCH01.corp.rhone-energie.fr (10.20.1.11) with Microsoft SMTP Server id",
  " 15.2.1544.11; Wed, 14 Oct 2026 09:12:44 +0200",
  "Received: from mx-gate12-hz1.hornetsecurity.com (94.100.132.12) by",
  " EXCH02.corp.rhone-energie.fr (10.20.1.12) with Microsoft SMTP Server id",
  " 15.2.1544.11; Wed, 14 Oct 2026 09:12:43 +0200",
  "ARC-Authentication-Results: i=1; mx-gate12-hz1.hornetsecurity.com;",
  " spf=fail smtp.mailfrom=m365-account-alert.top;",
  " dkim=none;",
  " dmarc=fail (p=reject) header.from=m365-account-alert.top",
  "X-antispameurope-Spamstatus: SPAM",
  "X-antispameurope-REASON: Score-b:12.4",
  "X-antispameurope-Virusscan: CLEAN",
  "From: Microsoft 365 <no-reply@m365-account-alert.top>",
  "To: <j.martin@rhone-energie.fr>",
  "Subject: Votre mot de passe expire aujourd'hui",
  "Date: Wed, 14 Oct 2026 09:12:40 +0200",
  "Message-ID: <reset.4471@m365-account-alert.top>",
  "MIME-Version: 1.0",
  "",
  "",
].join("\r\n");
const RESET = "https://m365-account-alert.top/reset/4471";
const SHOWN = "https://portal.office.com/password";
// How Exchange wraps an HTML body in RTF ([MS-OXRTFEX]): HTML tags in
// \htmltag groups, RTF-only formatting behind \htmlrtf.
const RTF = [
  "{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 \\deff0{\\fonttbl{\\f0\\fswiss Arial;}}",
  "{\\*\\htmltag19 <html>}{\\*\\htmltag50 <body>}\\htmlrtf {\\htmlrtf0 ",
  "{\\*\\htmltag64 <p>}\\htmlrtf {\\htmlrtf0 Votre mot de passe expire aujourd\\rquote hui. Conservez-le en cliquant ci-dessous\\~:\\htmlrtf \\par }\\htmlrtf0 {\\*\\htmltag72 </p>}",
  `{\\*\\htmltag64 <p>}{\\*\\htmltag84 <a href="${RESET}">}\\htmlrtf {\\field{\\*\\fldinst{HYPERLINK "${RESET}"}}{\\fldrslt\\ul \\htmlrtf0 ${SHOWN}\\htmlrtf }}\\htmlrtf0 {\\*\\htmltag92 </a>}{\\*\\htmltag72 </p>}`,
  "\\htmlrtf }\\htmlrtf0 {\\*\\htmltag58 </body>}{\\*\\htmltag27 </html>}}",
].join("\r\n");

const exchange = CFB.utils.cfb_new();
const put = (path, data) => CFB.utils.cfb_add(exchange, path, data);
put("/__properties_version1.0", new Uint8Array(32));
put("/__substg1.0_007D001F", utf16(RTF_HEADERS));
put("/__substg1.0_0037001F", utf16("Votre mot de passe expire aujourd'hui"));
put("/__substg1.0_0C1A001F", utf16("Microsoft 365"));
put("/__substg1.0_0C1F001F", utf16("no-reply@m365-account-alert.top"));
put("/__substg1.0_1000001F", utf16(`Votre mot de passe expire aujourd'hui. Conservez-le en cliquant ci-dessous :\r\n${SHOWN} <${RESET}>\r\n`));
put("/__substg1.0_10090102", compressRtf(RTF));

writeFileSync(new URL("../fixtures/exchange-rtf.msg", import.meta.url), CFB.write(exchange, { type: "buffer" }));
