import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectUrl } from "./inspect.ts";
import { referencesFor } from "./lookalike.ts";

const references = referencesFor(["rhone-energie.fr"]);
const inspect = (url: string) => inspectUrl(url, { references });

test("flags a brand's name inside someone else's domain", () => {
  for (const [url, brand] of [
    ["https://microsoft-login-verify.com/", "Microsoft"],
    ["https://office365-sharepoint.com/s", "Microsoft"],
    ["https://paypal-secure.com/", "PayPal"],
    ["https://paypal1-account.net/", "PayPal"],
    ["https://login.microsoft.secure-auth.top/", "Microsoft"],
    ["https://docusign.workers.dev/envelope", "DocuSign"],
    ["https://paypal-login.s3.amazonaws.com/index.html", "PayPal"],
    ["https://colis-laposte.top/suivi", "La Poste"],
    ["https://dhl-express-tracking.com/", "DHL"],
  ]) {
    const result = inspect(url);
    assert.ok(result.flags.includes("brand-in-domain"), url);
    assert.equal(result.brandIn, brand, url);
  }
});

test("leaves the brands' own domains and unrelated words alone", () => {
  for (const url of [
    "https://contoso.sharepoint.com/sites/x",
    "https://outlook.office365.com/mail",
    "https://login.microsoftonline.com/common",
    "https://www.paypal-communication.com/",
    "https://www.amazon.com.br/",
    "https://outlookindia.com/",
    "https://pineapple-shop.com/",
    "https://mydhl.express.dhl/",
    "https://appleid.apple.com/",
    "https://paypal.top/",
  ]) {
    assert.ok(!inspect(url).flags.includes("brand-in-domain"), url);
  }
  // A lookalike already says it.
  assert.deepEqual(inspect("https://paypa1-secure.com/").flags.filter((f) => f === "brand-in-domain"), []);
});

test("flags free and anonymous web hosting", () => {
  for (const url of [
    "https://docusign.workers.dev/",
    "https://pub-1234.r2.dev/login.html",
    "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/",
    "https://bafybeigdyrzt.ipfs.dweb.link/",
    "https://storage.googleapis.com/bucket-x/index.html",
    "https://acct.blob.core.windows.net/web/login.html",
    "https://script.google.com/macros/s/AKfycbx/exec",
    "https://random-words.trycloudflare.com/",
    "https://bucket.s3.eu-west-1.amazonaws.com/a.html",
    "https://abc123.ngrok-free.app/",
  ]) {
    assert.ok(inspect(url).flags.includes("free-hosting"), url);
  }
  for (const url of ["https://www.google.com/", "https://docs.google.com/document/d/x", "https://user.github.io/project/", "https://www.rhone-energie.fr/"]) {
    assert.ok(!inspect(url).flags.includes("free-hosting"), url);
  }
});

test("says a disguised domain once", () => {
  const flags = inspect("https://docusign.net.review-envelope.xyz/e/4471").flags;
  assert.ok(flags.includes("disguised-domain"));
  assert.ok(!flags.includes("brand-in-domain"));
});
