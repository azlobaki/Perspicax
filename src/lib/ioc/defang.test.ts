import assert from "node:assert/strict";
import { test } from "node:test";
import { defang, defangText, refang } from "./defang.ts";

test("defangs each kind of indicator", () => {
  assert.equal(defang("url", "https://rhone-energie.fr.secure-login.click/auth?u=j.martin"), "hxxps://rhone-energie[.]fr[.]secure-login[.]click/auth?u=j.martin");
  assert.equal(defang("url", "HTTP://evil.example/a.b"), "hxxp://evil[.]example/a.b");
  assert.equal(defang("domain", "mta-relay.click"), "mta-relay[.]click");
  assert.equal(defang("ip", "185.234.72.19"), "185[.]234[.]72[.]19");
  assert.equal(defang("email", "bounce-7f3a@mta-relay.click"), "bounce-7f3a[@]mta-relay[.]click");
  assert.equal(defang("sha256", "ab12"), "ab12");
});

test("refangs the usual notations", () => {
  assert.equal(refang("hxxps://rhone-energie[.]fr[.]secure-login[.]click/auth"), "https://rhone-energie.fr.secure-login.click/auth");
  assert.equal(refang("bounce[@]mta-relay(.)click, 1.2.3[.]4, evil[dot]example, hxxp[://]x[.]y"), "bounce@mta-relay.click, 1.2.3.4, evil.example, http://x.y");
});

test("round-trips", () => {
  for (const [type, value] of [["url", "https://a.example/x?y=1"], ["domain", "a.b.example"], ["ip", "10.0.0.1"], ["email", "x@y.example"]] as const) {
    assert.equal(refang(defang(type, value)), value);
  }
});

test("defangs URLs, addresses, IPs and domains inside prose", () => {
  assert.equal(
    defangText('"https://espace-client.rhone-energie.fr" → https://rhone-energie.fr.secure-login.click/auth?u=j.martin'),
    '"hxxps://espace-client[.]rhone-energie[.]fr" → hxxps://rhone-energie[.]fr[.]secure-login[.]click/auth?u=j.martin',
  );
  assert.equal(defangText("Reply-To: rhone.energie.paiement@outlook.fr"), "Reply-To: rhone.energie.paiement[@]outlook[.]fr");
  assert.equal(defangText("from 185.234.72.19 (no reverse DNS)"), "from 185[.]234[.]72[.]19 (no reverse DNS)");
  assert.equal(defangText("dmarc=fail header.from=rhone-energie.fr"), "dmarc=fail header.from=rhone-energie[.]fr");
  assert.equal(defangText("Facture_RE-4471.pdf.html — word/vbaProject.bin, id 15.20.8093.1"), "Facture_RE-4471.pdf.html — word/vbaProject.bin, id 15.20.8093.1");
});
