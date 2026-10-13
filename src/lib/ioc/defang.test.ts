import assert from "node:assert/strict";
import { test } from "node:test";
import { defang, refang } from "./defang.ts";

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
