import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceCodeFindings } from "./devicecode.ts";

const check = (text: string, urls: string[] = [], fromDomain = "it-support.top", orgDomains: string[] = []) =>
  deviceCodeFindings({ texts: [text], urls, fromDomain, orgDomains });

test("flags a device sign-in page with a code to enter, even written without a link", () => {
  const [finding] = check("Open microsoft.com/devicelogin and enter the code B7HVQXKZ2 to keep access to your mailbox.");
  assert.deepEqual([finding.id, finding.severity, finding.weight], ["content.device-code", "high", 18]);
  assert.deepEqual(finding.evidence, ["microsoft.com/devicelogin", "B7HVQXKZ2"]);
  assert.equal(check("Rendez-vous sur https://aka.ms/devicelogin, code : GQVQ-JKEC").length, 1);
  assert.equal(check("Visit github.com/login/device and type WDJB-MJHT").length, 1);
});

test("finds the page in a link too, and weighs less without a code", () => {
  const [finding] = check("Click below to verify your device.", ["https://login.microsoftonline.com/common/oauth2/deviceauth"]);
  assert.deepEqual([finding.severity, finding.weight], ["medium", 10]);
});

test("ignores words that only look like codes and the organisation's own IT", () => {
  assert.deepEqual(check("IMPORTANT: no device page here, see MICROSOFT docs."), []);
  const internal = check("Open microsoft.com/devicelogin and enter ABCD1234E.", [], "rhone-energie.fr", ["rhone-energie.fr"]);
  assert.deepEqual(internal.map((f) => [f.severity, f.weight]), [["low", 4]]);
});
