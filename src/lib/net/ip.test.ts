import assert from "node:assert/strict";
import { test } from "node:test";
import { ipScope, isIPv4, isIPv6 } from "./ip.ts";

test("recognises IPv4 literals", () => {
  for (const ip of ["185.234.72.19", "0.0.0.0", "255.255.255.255"]) assert.ok(isIPv4(ip), ip);
  for (const ip of ["256.1.1.1", "1.2.3", "01.2.3.4", "1.2.3.4.5"]) assert.ok(!isIPv4(ip), ip);
});

test("recognises IPv6 literals", () => {
  for (const ip of ["2603:10a6:20b:4c4::14", "::1", "::", "fe80::1", "::ffff:192.0.2.1", "1:2:3:4:5:6:7:8"]) {
    assert.ok(isIPv6(ip), ip);
  }
  for (const ip of ["1::2::3", "12345::", "1:2:3:4:5:6:7:8:9", "abc", ":1", "1.2.3.4"]) {
    assert.ok(!isIPv6(ip), ip);
  }
});

test("classifies IPv4 scopes", () => {
  assert.equal(ipScope("185.234.72.19"), "public");
  assert.equal(ipScope("10.1.2.3"), "private");
  assert.equal(ipScope("172.16.0.1"), "private");
  assert.equal(ipScope("172.32.0.1"), "public");
  assert.equal(ipScope("192.168.1.1"), "private");
  assert.equal(ipScope("127.0.0.1"), "loopback");
  assert.equal(ipScope("169.254.1.1"), "link-local");
  assert.equal(ipScope("100.64.0.1"), "shared");
  assert.equal(ipScope("192.0.2.1"), "reserved");
  assert.equal(ipScope("224.0.0.1"), "reserved");
});

test("classifies IPv6 scopes", () => {
  assert.equal(ipScope("::1"), "loopback");
  assert.equal(ipScope("fe80::1"), "link-local");
  assert.equal(ipScope("fd12::1"), "private");
  assert.equal(ipScope("2001:db8::1"), "reserved");
  assert.equal(ipScope("2603:10a6:20b:4c4::14"), "public");
  assert.equal(ipScope("::ffff:10.0.0.1"), "private");
});
