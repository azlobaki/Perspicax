/** What an OAuth authorisation link asks for, read from its parameters. */
export type OAuthRequest = {
  provider: "Microsoft" | "Google" | "GitHub";
  clientId: string | null;
  /** Where the provider sends the reader, and the code or token, afterwards. */
  redirect: string | null;
  scopes: string[];
  /** Scopes that reach mail, files or the directory. */
  risky: string[];
  /** Admin consent: one click grants the app access for the whole tenant. */
  admin: boolean;
};

const ENDPOINTS: { provider: OAuthRequest["provider"]; host: RegExp; path: RegExp }[] = [
  {
    provider: "Microsoft",
    host: /^(login\.microsoftonline\.(com|us)|login\.microsoft\.com|login\.windows\.net|login\.live\.com)$/,
    path: /\/(oauth2\/(v2\.0\/)?authorize|adminconsent|v2\.0\/adminconsent|oauth20_authorize\.srf)\/?$/i,
  },
  { provider: "Google", host: /^accounts\.google\.com$/, path: /^\/(o\/oauth2\/(v2\/)?auth|signin\/oauth(\/v2)?\/?[\w/]*)$/i },
  { provider: "GitHub", host: /^github\.com$/, path: /^\/login\/oauth\/authorize\/?$/i },
];

// Matched against the scope's last segment: `https://graph.microsoft.com/Mail.Read` → `Mail.Read`.
const RISKY =
  /^(mail\.|mailboxsettings\.|files\.[\w.]*all|sites\.[\w.]*all|notes\.[\w.]*all|directory\.|user\.readwrite\.all|application\.readwrite|full_access_as_user|ews\.accessasuser|imap\.|pop\.|smtp\.send|gmail\.|mail\.google\.com|drive(\.|$)|repo$|admin:|delete_repo|write:org)/i;

function scopeName(scope: string): string {
  const bare = scope.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
  return bare.includes("/") ? bare.slice(bare.lastIndexOf("/") + 1) : bare;
}

export function isOAuthAuthorize(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return ENDPOINTS.some((e) => e.host.test(host) && e.path.test(url.pathname));
}

/**
 * Consent phishing sends the reader to the provider's real sign-in page,
 * which then asks to let an application read their mail or files; the
 * token the attacker receives survives a password change and needs no MFA.
 */
export function oauthRequest(url: URL): OAuthRequest | null {
  const host = url.hostname.toLowerCase();
  const endpoint = ENDPOINTS.find((e) => e.host.test(host) && e.path.test(url.pathname));
  if (!endpoint) return null;
  const param = (key: string) => url.searchParams.get(key);
  const scopes = (param("scope") ?? "").split(/[\s+,]+/).map((s) => s.trim()).filter(Boolean);
  return {
    provider: endpoint.provider,
    clientId: param("client_id"),
    redirect: param("redirect_uri"),
    scopes,
    risky: scopes.filter((s) => RISKY.test(scopeName(s))),
    admin: /adminconsent/i.test(url.pathname) || param("prompt") === "admin_consent",
  };
}
