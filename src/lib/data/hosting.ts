import { isSubdomainOf, normaliseHost } from "../net/domain.ts";

/**
 * Platforms where anyone publishes a page in minutes, under the platform's
 * reputation and without a domain of their own: serverless and static
 * hosting, tunnels, object storage, IPFS gateways, site builders.
 * Collaboration suites (SharePoint, Google Docs, Dropbox…) are left out:
 * legitimate mail links there every day.
 */
const FREE_HOSTING = [
  "workers.dev", "pages.dev", "r2.dev", "trycloudflare.com",
  "web.app", "firebaseapp.com", "appspot.com", "firebasestorage.googleapis.com", "storage.googleapis.com",
  "script.googleusercontent.com",
  "glitch.me", "repl.co", "replit.app", "replit.dev", "ngrok.io", "ngrok.app", "ngrok-free.app", "ngrok-free.dev",
  "loca.lt", "serveo.net", "herokuapp.com", "onrender.com", "fly.dev", "vercel.app", "netlify.app", "surge.sh",
  "azurewebsites.net", "blob.core.windows.net", "web.core.windows.net", "azurestaticapps.net", "amplifyapp.com",
  "000webhostapp.com", "weebly.com", "wixsite.com", "square.site", "godaddysites.com", "webflow.io",
  "framer.app", "framer.website", "carrd.co", "mystrikingly.com", "jimdosite.com", "sites.google.com",
  "ipfs.io", "dweb.link", "w3s.link", "nftstorage.link", "cf-ipfs.com", "4everland.io", "fleek.co", "pinata.cloud",
];

/** Free or anonymous hosting, from the host and, for a few shared hosts, the path. */
export function isFreeHosting(host: string, path = "/"): boolean {
  const h = normaliseHost(host);
  if (FREE_HOSTING.some((domain) => isSubdomainOf(h, domain))) return true;
  // S3 buckets: bucket.s3.amazonaws.com, bucket.s3.eu-west-1.amazonaws.com, s3.amazonaws.com/bucket.
  if (/(^|\.)s3([.-][a-z0-9-]+)?\.amazonaws\.com$/.test(h)) return true;
  // Apps Script web apps and any gateway serving an IPFS path.
  if (h === "script.google.com" && path.startsWith("/macros/")) return true;
  return /^\/ip[fn]s\//.test(path);
}
