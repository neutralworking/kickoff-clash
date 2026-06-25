import type { Metadata } from "next";
import { Archivo_Black, DM_Sans, Playfair_Display, Silkscreen } from "next/font/google";
import "./globals.css";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Chunky pixel display face for the refreshed Sensible-Soccer look.
const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-flavour",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kickoff Clash",
  description: "A football season deckbuilder roguelike.",
  metadataBase: new URL("https://neutralworking.github.io/kickoff-clash/"),
  openGraph: {
    title: "Kickoff Clash",
    description: "Build your squad. Play your cards. Win the season.",
    url: "https://neutralworking.github.io/kickoff-clash/",
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
  return (
    <html lang="en" className={`dark ${archivoBlack.variable} ${dmSans.variable} ${playfairDisplay.variable} ${silkscreen.variable}`}>
      <body className="min-h-screen antialiased" style={{ background: 'var(--felt)', color: 'var(--cream)', fontFamily: 'var(--font-body)' }}>
        {children}
      </body>
    </html>
  );
}
