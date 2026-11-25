import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail } from "../mime/parse.ts";
import { originHop, parseReceived, relayChain, routeFindings } from "./received.ts";

const POSTFIX =
  "from mail.rhone-energie.fr (unknown [185.234.72.19])\tby mx01.mta-relay.click (Postfix) with ESMTP id 4F2A71C0042\tfor <j.martin@rhone-energie.fr>; Tue, 13 Oct 2026 09:14:02 +0200 (CEST)";
const GMAIL =
  "from o1.em.librairie-exemple.fr (o1.em.librairie-exemple.fr. [149.72.120.130]) by mx.google.com with ESMTPS id 5b1f17b1804b1-46f0c2a1d3esi998877f8f.412.2026.10.12.23.02.10 for <claire.dupont@gmail.com> (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128); Mon, 12 Oct 2026 23:02:11 -0700 (PDT)";
const EXCHANGE =
  "from mx01.mta-relay.click (185.234.72.19) by AM4PEPF00027A6C.mail.protection.outlook.com (10.167.16.73) with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.8093.1 via Frontend Transport; Tue, 13 Oct 2026 07:14:03 +0000";
const EXIM =
  "from [203.0.113.9] (helo=WIN-8K2) by mail.example.net with esmtpa (Exim 4.96) (envelope-from <a@b.c>) id 1qXyZ-000abc-12; Tue, 13 Oct 2026 07:14:02 +0000";

test("parses a Postfix hop with no reverse DNS", () => {
  const hop = parseReceived(POSTFIX);
  assert.equal(hop.helo, "mail.rhone-energie.fr");
  assert.equal(hop.rdns, null);
  assert.equal(hop.ip, "185.234.72.19");
  assert.equal(hop.ipScope, "public");
  assert.equal(hop.by, "mx01.mta-relay.click");
  assert.equal(hop.protocol, "ESMTP");
  assert.equal(hop.tls, false);
  assert.equal(hop.date?.toISOString(), "2026-10-13T07:14:02.000Z");
  assert.equal(hop.heloMismatch, true);
});

test("parses a Gmail hop whose HELO matches its reverse DNS", () => {
  const hop = parseReceived(GMAIL);
  assert.equal(hop.helo, "o1.em.librairie-exemple.fr");
  assert.equal(hop.rdns, "o1.em.librairie-exemple.fr");
  assert.equal(hop.ip, "149.72.120.130");
  assert.equal(hop.protocol, "ESMTPS");
  assert.equal(hop.tls, true);
  assert.equal(hop.date?.toISOString(), "2026-10-13T06:02:11.000Z");
  assert.equal(hop.heloMismatch, false);
});

test("parses an Exchange Online hop", () => {
  const hop = parseReceived(EXCHANGE);
  assert.equal(hop.helo, "mx01.mta-relay.click");
  assert.equal(hop.ip, "185.234.72.19");
  assert.equal(hop.rdns, null);
  assert.equal(hop.by, "AM4PEPF00027A6C.mail.protection.outlook.com");
  assert.equal(hop.protocol, "Microsoft SMTP Server");
  assert.equal(hop.tls, true);
  assert.equal(hop.heloMismatch, false);
});

test("reads the HELO name from an Exim comment", () => {
  const hop = parseReceived(EXIM);
  assert.equal(hop.helo, "WIN-8K2");
  assert.equal(hop.ip, "203.0.113.9");
  assert.equal(hop.ipScope, "reserved");
});

test("accepts a hop with no from clause", () => {
  const hop = parseReceived("by 2002:a05:7010:4b8e:b0:3d1:5c2a:6b1f with SMTP id f14csp112233mdb; Mon, 12 Oct 2026 23:02:11 -0700 (PDT)");
  assert.equal(hop.helo, null);
  assert.equal(hop.ip, null);
  assert.equal(hop.by, "2002:a05:7010:4b8e:b0:3d1:5c2a:6b1f");
});

test("orders the fixture's chain oldest first with delays", () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const hops = relayChain(email.headers);
  assert.deepEqual(hops.map((h) => h.index), [1, 2, 3, 4]);
  assert.deepEqual(hops.map((h) => h.delay), [null, 1, 0, 1]);
  assert.equal(hops[0].helo, "mail.rhone-energie.fr");
  assert.equal(hops[3].protocol, "HTTPS");
  // The bottom hop was written by the sender's own relay: Microsoft took the message from mx01.
  assert.deepEqual(hops.map((h) => [h.origin, h.claimed]), [[false, true], [true, false], [false, false], [false, false]]);
  assert.equal(originHop(hops)?.helo, "mx01.mta-relay.click");
  assert.deepEqual(routeFindings(hops), []);
});

test("reports a missing chain and backwards clocks", () => {
  assert.deepEqual(routeFindings([]).map((f) => f.id), ["route.no-received"]);
  const hops = relayChain([
    { name: "Received", value: "from b.example by c.example; Tue, 13 Oct 2026 07:00:00 +0000" },
    { name: "Received", value: "from a.example by b.example; Tue, 13 Oct 2026 08:00:00 +0000" },
  ]);
  assert.equal(hops[1].delay, -3600);
  assert.deepEqual(routeFindings(hops).map((f) => f.id), ["route.clock-skew"]);
});

const chain = (...received: string[]) => relayChain(received.map((value) => ({ name: "Received", value })), ["rhone-energie.fr"]);

test("a hop forged below the receiving server is claimed, never the origin", () => {
  const hops = chain(
    "from mx01.mta-relay.click (mx01.mta-relay.click [185.234.72.20]) by mx.rhone-energie.fr with ESMTPS; Tue, 13 Oct 2026 07:14:03 +0000",
    "from mail.microsoft.com (mail.microsoft.com [40.92.0.1]) by mx01.mta-relay.click with ESMTP; Tue, 13 Oct 2026 07:14:01 +0000",
  );
  assert.equal(originHop(hops)?.ip, "185.234.72.20");
  assert.deepEqual(hops.map((h) => h.claimed), [true, false]);
});

test("walks through the organisation's gateway to the hop it took from the internet", () => {
  const hops = chain(
    "from exch01.rhone-energie.fr (10.0.0.5) by exch02.rhone-energie.fr; Tue, 13 Oct 2026 07:14:05 +0000",
    "from mx0a-001.pphosted.com (mx0a-001.pphosted.com [148.163.1.1]) by exch01.rhone-energie.fr; Tue, 13 Oct 2026 07:14:04 +0000",
    "from smtp.sender.example (smtp.sender.example [91.121.10.7]) by mx0a-001.pphosted.com; Tue, 13 Oct 2026 07:14:03 +0000",
    "from laptop (unknown [192.168.1.20]) by smtp.sender.example; Tue, 13 Oct 2026 07:14:01 +0000",
  );
  assert.equal(originHop(hops)?.ip, "91.121.10.7");
  assert.deepEqual(hops.map((h) => h.claimed), [true, false, false, false]);
});

test("names a misnamed sender on the hop the receiving server wrote", () => {
  const hops = chain(
    "from mail.rhone-energie.fr (unknown [185.234.72.19]) by mx.rhone-energie.fr with ESMTP; Tue, 13 Oct 2026 07:14:03 +0000",
  );
  assert.deepEqual(routeFindings(hops).map((f) => f.id), ["route.helo-mismatch"]);
});

test("falls back to the oldest public hop when no edge stands out", () => {
  const hops = relayChain([
    { name: "Received", value: "from a.prod.outlook.com (2603:10a6:20b:3f8::10) by b.prod.outlook.com with HTTPS; Tue, 13 Oct 2026 07:14:04 +0000" },
    { name: "Received", value: "from c.outbound.protection.outlook.com (52.100.1.1) by d.protection.outlook.com; Tue, 13 Oct 2026 07:14:03 +0000" },
  ]);
  assert.equal(originHop(hops)?.ip, "52.100.1.1");
  assert.deepEqual(hops.map((h) => h.claimed), [false, false]);
});
