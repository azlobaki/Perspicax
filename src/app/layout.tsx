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
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper font-ui text-ink">{children}</body>
    </html>
  );
}
