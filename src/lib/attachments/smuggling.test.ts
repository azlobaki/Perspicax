import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail } from "../mime/parse.ts";
import { isSmuggling, smugglingIndicators } from "./smuggling.ts";

test("recognises the spoofed invoice's smuggling page", () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const found = smugglingIndicators(new TextDecoder().decode(email.attachments[0].data));
  assert.deepEqual(found.payload, ["atob() decodes an embedded payload"]);
  assert.deepEqual(found.delivery, [
    "builds a file in the browser (Blob)",
    "gives the file a local URL",
    "saves it without a download prompt",
    "triggers a download",
    "clicks a link by script",
  ]);
  assert.ok(isSmuggling(found));
});

test("needs both a payload and a way to deliver it", () => {
  assert.ok(!isSmuggling(smugglingIndicators("<script>var x = atob('aGk=');</script>")));
  assert.ok(!isSmuggling(smugglingIndicators('<a href="report.pdf" download="report.pdf">Download</a>')));
  assert.ok(isSmuggling(smugglingIndicators(`<a href="data:application/octet-stream;base64,TVqQ" download="x.iso">x</a>`)));
});
