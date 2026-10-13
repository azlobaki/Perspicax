import type { Metadata } from "next";
import { Archivo, Courier_Prime, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/settings";
import "./globals.css";

// Self-hosted by next/font: downloaded once at build time, never at runtime.
// Only the default theme's faces are preloaded.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  preload: false,
});

const courierPrime = Courier_Prime({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-courier-prime",
  preload: false,
});

/**
 * Defence in depth for the no-network promise: in the built site the browser
 * itself refuses every connection, and the preview frame inherits this
 * policy. Not applied to `next dev`, which needs eval and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export const metadata: Metadata = {
  title: "Perspicax — phishing email analyser",
  description:
    "Drop an email, get a scored verdict with every finding explained. Everything runs in your browser: the email is never sent anywhere or stored.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fonts = [archivo, plexMono, sourceSerif, courierPrime].map((f) => f.variable).join(" ");
  return (
    // The boot script may change data-theme before React hydrates.
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning className={`${fonts} h-full antialiased`}>
      <head>
        {process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper font-ui text-ink">{children}</body>
    </html>
  );
}
