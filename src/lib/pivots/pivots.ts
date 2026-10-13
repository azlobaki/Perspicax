import type { Ioc, IocType } from "../ioc/types.ts";
import { bytesToBinary } from "../mime/bytes.ts";

/**
 * A lookup service. `template` holds `{value}` (URL-encoded), `{raw}` (as
 * is) or `{base64url}` (VirusTotal's URL identifiers). Editable in settings
 * (milestone 4). Nothing is requested until the analyst clicks.
 */
export type PivotService = { id: string; name: string; types: IocType[]; template: string };

export const DEFAULT_PIVOTS: PivotService[] = [
  { id: "virustotal-file", name: "VirusTotal", types: ["sha256", "sha1", "md5"], template: "https://www.virustotal.com/gui/file/{value}" },
  { id: "virustotal-url", name: "VirusTotal", types: ["url"], template: "https://www.virustotal.com/gui/url/{base64url}" },
  { id: "virustotal-domain", name: "VirusTotal", types: ["domain"], template: "https://www.virustotal.com/gui/domain/{value}" },
  { id: "virustotal-ip", name: "VirusTotal", types: ["ip"], template: "https://www.virustotal.com/gui/ip-address/{value}" },
  { id: "urlscan-domain", name: "urlscan", types: ["domain"], template: "https://urlscan.io/domain/{value}" },
  { id: "urlscan-ip", name: "urlscan", types: ["ip"], template: "https://urlscan.io/ip/{value}" },
  { id: "urlhaus", name: "URLhaus", types: ["url", "domain", "ip"], template: "https://urlhaus.abuse.ch/browse.php?search={value}" },
  { id: "whois-domain", name: "WHOIS", types: ["domain"], template: "https://who.is/whois/{value}" },
  { id: "whois-ip", name: "WHOIS", types: ["ip"], template: "https://who.is/whois-ip/ip-address/{value}" },
  { id: "mxtoolbox-domain", name: "MXToolbox", types: ["domain"], template: "https://mxtoolbox.com/SuperTool.aspx?action=mx%3a{value}&run=toolpage" },
  { id: "mxtoolbox-ip", name: "MXToolbox", types: ["ip"], template: "https://mxtoolbox.com/SuperTool.aspx?action=blacklist%3a{value}&run=toolpage" },
  { id: "abuseipdb", name: "AbuseIPDB", types: ["ip"], template: "https://www.abuseipdb.com/check/{value}" },
  { id: "talos", name: "Talos", types: ["ip", "domain"], template: "https://talosintelligence.com/reputation_center/lookup?search={value}" },
  { id: "shodan", name: "Shodan", types: ["ip"], template: "https://www.shodan.io/host/{value}" },
];

function base64url(text: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pivotUrl(template: string, value: string): string {
  return template.replace(/\{(value|raw|base64url)\}/g, (_m, key: string) =>
    key === "raw" ? value : key === "base64url" ? base64url(value) : encodeURIComponent(value),
  );
}

export function pivotsFor(ioc: Ioc, services: readonly PivotService[]): { id: string; name: string; url: string }[] {
  return services
    .filter((service) => service.types.includes(ioc.type))
    .map((service) => ({ id: service.id, name: service.name, url: pivotUrl(service.template, ioc.value) }));
}
