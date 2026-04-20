import type { Metadata } from "next";
import {
  Bebas_Neue,
  Anton,
  Bungee,
  Oswald,
  JetBrains_Mono,
  Caveat,
  Permanent_Marker,
} from "next/font/google";
import "./globals.css";

// Display — wordmark, big numbers, all-caps headings
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Stat-block numerals
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-stat",
  display: "swap",
});

// Arcade — score pops, CHIPS × MULT
const bungee = Bungee({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-arcade",
  display: "swap",
});

// Body — UI labels, microcopy
const oswald = Oswald({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Mono — debug / cash readouts
const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-mono-tech",
  display: "swap",
});

// Flavour — handwritten quotes
const caveat = Caveat({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-flavour",
  display: "swap",
});

// Marker — bold scribble
const permanentMarker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marker-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kickoff Clash",
  description: "A football season deckbuilder at kickoff.neutralworking.com",
  metadataBase: new URL("https://kickoff.neutralworking.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Kickoff Clash",
    description: "Build your squad. Play your cards. Win the season.",
    url: "https://kickoff.neutralworking.com",
    siteName: "Kickoff Clash",
    type: "website",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontVars = [
    bebasNeue.variable,
    anton.variable,
    bungee.variable,
    oswald.variable,
    jetbrainsMono.variable,
    caveat.variable,
    permanentMarker.variable,
  ].join(" ");

  return (
    <html lang="en" className={`dark ${fontVars}`} data-vibe="dugout">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
