export type IpScope = "public" | "private" | "loopback" | "link-local" | "shared" | "reserved";

const OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`);

export function isIPv4(value: string): boolean {
  return IPV4.test(value);
}

export function isIPv6(value: string): boolean {
  if (!value.includes(":") || !/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const lastColon = value.lastIndexOf(":");
  const embedsV4 = value.slice(lastColon + 1).includes(".");
  if (embedsV4 && !isIPv4(value.slice(lastColon + 1))) return false;
  const groupsOf = (part: string) => (part === "" ? [] : part.split(":"));
  let groups = [...groupsOf(halves[0]), ...(halves.length === 2 ? groupsOf(halves[1]) : [])];
  if (embedsV4) groups = groups.slice(0, -1);
  if (!groups.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  const count = groups.length + (embedsV4 ? 2 : 0);
  return halves.length === 2 ? count < 8 : count === 8;
}

export function isIp(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

/** Where an address lives. Only `public` addresses identify a sender on the internet. */
export function ipScope(ip: string): IpScope {
  if (isIPv4(ip)) return ipv4Scope(ip.split(".").map(Number));
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return ipv4Scope(mapped[1].split(".").map(Number));
  const lower = ip.toLowerCase();
  if (lower === "::1") return "loopback";
  if (lower === "::") return "reserved";
  const groups = lower.split(":");
  const first = parseInt(groups[0] || "0", 16);
  const second = parseInt(groups[1] || "0", 16);
  if ((first & 0xffc0) === 0xfe80) return "link-local";
  if ((first & 0xfe00) === 0xfc00) return "private";
  if ((first & 0xff00) === 0xff00) return "reserved";
  if (first === 0x2001 && second === 0x0db8) return "reserved";
  return "public";
}

function ipv4Scope([a, b, c]: number[]): IpScope {
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link-local";
  if (a === 100 && b >= 64 && b <= 127) return "shared";
  if (
    a === 0 ||
    a >= 224 ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return "reserved";
  }
  return "public";
}
