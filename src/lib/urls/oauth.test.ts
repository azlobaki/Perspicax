import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectUrl } from "./inspect.ts";
import { oauthRequest } from "./oauth.ts";

const CONSENT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=4f2b8c1e-0000-4000-8000-000000000001&response_type=code&redirect_uri=https%3A%2F%2Fdocs-review.top%2Fcallback&scope=offline_access%20https%3A%2F%2Fgraph.microsoft.com%2FMail.Read%20Files.ReadWrite.All%20User.Read&prompt=consent";

test("reads what a Microsoft consent link asks for", () => {
  const request = oauthRequest(new URL(CONSENT));
  assert.equal(request?.provider, "Microsoft");
  assert.equal(request?.clientId, "4f2b8c1e-0000-4000-8000-000000000001");
  assert.equal(request?.redirect, "https://docs-review.top/callback");
  assert.deepEqual(request?.risky, ["https://graph.microsoft.com/Mail.Read", "Files.ReadWrite.All"]);
  assert.equal(request?.admin, false);
  assert.equal(oauthRequest(new URL("https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=x"))?.admin, true);
  const google = oauthRequest(new URL("https://accounts.google.com/o/oauth2/v2/auth?client_id=1.apps.googleusercontent.com&redirect_uri=https://evil.top/&scope=https://mail.google.com/%20openid"));
  assert.deepEqual(google?.risky, ["https://mail.google.com/"]);
});

test("keeps the consent page as the destination instead of unwrapping redirect_uri", () => {
  const url = inspectUrl(CONSENT, { references: [] });
  assert.equal(new URL(url.final ?? "").hostname, "login.microsoftonline.com");
  assert.deepEqual(url.wrappers, []);
  assert.ok(url.flags.includes("oauth-consent"));
  assert.equal(url.oauth?.clientId, "4f2b8c1e-0000-4000-8000-000000000001");
});

test("ignores ordinary sign-in links", () => {
  assert.equal(oauthRequest(new URL("https://login.microsoftonline.com/")), null);
  assert.equal(oauthRequest(new URL("https://accounts.google.com/ServiceLogin")), null);
  assert.deepEqual(inspectUrl("https://example.com/go?redirect_uri=https://evil.top/", { references: [] }).wrappers.length, 1);
});
