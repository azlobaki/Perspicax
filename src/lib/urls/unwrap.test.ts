import assert from "node:assert/strict";
import { test } from "node:test";
import { unwrapUrl } from "./unwrap.ts";

const finalOf = (href: string) => unwrapUrl(href).final;

test("unwraps Microsoft Safe Links", () => {
  const href =
    "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Frhone-energie.fr.secure-login.click%2Fauth%3Fu%3Dj.martin&data=05%7C02&reserved=0";
  const { final, wrappers, opaque } = unwrapUrl(href);
  assert.equal(final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.deepEqual(wrappers, [{ service: "Microsoft Safe Links", url: href }]);
  assert.equal(opaque, null);
});

test("unwraps Proofpoint URL Defense v2 and v3", () => {
  assert.equal(
    finalOf("https://urldefense.proofpoint.com/v2/url?u=https-3A__xn-2D-2Dpypal-2D4ve.com_signin&d=DwMF&c=abc"),
    "https://xn--pypal-4ve.com/signin",
  );
  assert.equal(
    finalOf("https://urldefense.com/v3/__https://paypa1.com/resolution?case=4471*ref=mail__;Jg!!ORG!a1b2$"),
    "https://paypa1.com/resolution?case=4471&ref=mail",
  );
  assert.equal(finalOf("https://urldefense.com/v3/__https://e.com/a**Bb__;JiYm!!x"), "https://e.com/a&&&b");
});

test("unwraps Google, Barracuda, Cisco and Sophos redirects", () => {
  assert.equal(finalOf("https://www.google.com/url?q=https://example.com/x&sa=D"), "https://example.com/x");
  assert.equal(finalOf("https://linkprotect.cudasvc.com/url?a=https%3a%2f%2fevil.example%2f&c=E,1,abc&typo=1"), "https://evil.example/");
  assert.equal(finalOf("https://secure-web.cisco.com/1AbCdEf/https%3A%2F%2Fevil.example%2Flogin"), "https://evil.example/login");
  assert.equal(
    finalOf("https://eu-central-1.protection.sophos.com?d=example.com&u=aHR0cHM6Ly9ldmlsLmV4YW1wbGUvbG9naW4=&i=x"),
    "https://evil.example/login",
  );
});

test("follows generic redirect parameters and nested wrappers", () => {
  assert.equal(finalOf("https://click.example.net/track?id=1&url=https%3A%2F%2Fevil.example%2F"), "https://evil.example/");
  const nested = unwrapUrl(
    "https://eur01.safelinks.protection.outlook.com/?url=" +
      encodeURIComponent("https://www.google.com/url?q=https://evil.example/x"),
  );
  assert.equal(nested.final, "https://evil.example/x");
  assert.deepEqual(nested.wrappers.map((w) => w.service), ["Microsoft Safe Links", "Google redirect"]);
});

test("names gateways whose destination cannot be recovered offline", () => {
  const { final, wrappers, opaque } = unwrapUrl("https://protect-eu.mimecast.com/s/AbCdEf?domain=example.com");
  assert.equal(final, "https://protect-eu.mimecast.com/s/AbCdEf?domain=example.com");
  assert.deepEqual(wrappers, []);
  assert.equal(opaque, "Mimecast URL Protect");
});

test("leaves ordinary links alone", () => {
  assert.deepEqual(unwrapUrl("https://example.com/?u=notaurl"), { final: "https://example.com/?u=notaurl", wrappers: [], opaque: null });
  assert.deepEqual(unwrapUrl("not a url"), { final: "not a url", wrappers: [], opaque: null });
});
