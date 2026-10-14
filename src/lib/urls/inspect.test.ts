import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANDS } from "../data/brands.ts";
import { inspectUrl } from "./inspect.ts";
import type { Reference } from "./lookalike.ts";

const references: Reference[] = BRANDS.flatMap((b) => b.domains.map((domain) => ({ domain, own: false })));
const inspect = (raw: string, base?: string) => inspectUrl(raw, { base, references });

test("flags script and embedded-document links, not inline images", () => {
  assert.deepEqual(inspect("javascript:alert(1)").flags, ["javascript-url"]);
  assert.deepEqual(inspect("data:text/html;base64,PGgxPmhpPC9oMT4=").flags, ["data-url"]);
  assert.deepEqual(inspect("data:image/png;base64,iVBORw0KGgo=").flags, []);
});

test("unwraps, then inspects the real destination", () => {
  const url = inspect(
    "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Frhone-energie.fr.secure-login.click%2Fauth%3Fu%3Dj.martin&data=05%7C02",
  );
  assert.equal(url.final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.equal(url.host, "rhone-energie.fr.secure-login.click");
  assert.equal(url.wrappers.length, 1);
  assert.deepEqual(url.flags, ["disguised-domain", "abused-tld"]);
});

test("flags user-name tricks and bare IP addresses", () => {
  const userinfo = inspect("https://www.paypal.com@evil.example/x");
  assert.deepEqual(userinfo.flags, ["userinfo"]);
  assert.equal(userinfo.host, "evil.example");
  const ip = inspect("http://3232235777/login");
  assert.equal(ip.host, "192.168.1.1");
  assert.deepEqual(ip.flags, ["ip-host"]);
});

test("flags lookalike, homoglyph and plain internationalised domains", () => {
  const idn = inspect("https://xn--pypal-4ve.com/signin");
  assert.equal(idn.displayHost, "pаypal.com");
  assert.equal(idn.lookalikeOf, "paypal.com");
  assert.deepEqual(idn.flags, ["lookalike"]);
  assert.deepEqual(inspect("https://paypa1.com/x").flags, ["lookalike"]);
  assert.deepEqual(inspect("https://\u0435x\u0430mple.net/").flags, ["homoglyph"]);
  assert.deepEqual(inspect("https://xn--mnchen-3ya.de/").flags, ["punycode"]);
});

test("flags Google's link shorteners and redirectors", () => {
  for (const url of [
    "https://share.google/PFv7ZS9hsF1Cw2QYJ",
    "https://g.co/kgs/abc",
    "https://goo.gle/3abc",
    "https://forms.gle/xYz",
    "https://maps.app.goo.gl/xYz",
    "https://evil-app.page.link/xYz",
  ]) {
    assert.deepEqual(inspect(url).flags, ["shortener"], url);
  }
  assert.deepEqual(inspect("https://www.google.com/search?q=x").flags, []);
});

test("flags shorteners and opaque gateway rewrites", () => {
  assert.deepEqual(inspect("https://bit.ly/3xYz").flags, ["shortener"]);
  assert.deepEqual(inspect("https://protect-eu.mimecast.com/s/AbCdEf").flags, ["opaque-wrapper"]);
});

test("resolves relative links against the document base", () => {
  assert.equal(inspect("/path?a=1", "https://x.example/a/").href, "https://x.example/path?a=1");
});

test("reports unreadable links and passes other schemes through", () => {
  assert.deepEqual(inspect("not a url").flags, ["unparseable"]);
  const mail = inspect("mailto:a@b.com");
  assert.equal(mail.scheme, "mailto");
  assert.deepEqual(mail.flags, []);
});
