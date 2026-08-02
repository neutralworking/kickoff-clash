import type { Metadata, Viewport } from "next";
import { Archivo_Black, DM_Sans, Playfair_Display, Silkscreen } from "next/font/google";
import "./globals.css";

// Silkscreen is the CANONICAL display face (Sensible-Soccer pixel look). It is
// bound to BOTH --font-pixel and --font-display so every existing heading that
// already uses var(--font-display) inherits the pixel system automatically.
const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

// Archivo Black is kept as a heavy non-pixel fallback display face for very
// large hero type where pixel letterforms get too wide to fit a phone.
const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heavy",
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${silkscreen.variable} ${archivoBlack.variable} ${dmSans.variable} ${playfairDisplay.variable}`}>
      <body className="min-h-screen antialiased" style={{ background: 'var(--felt)', color: 'var(--cream)', fontFamily: 'var(--font-body)' }}>
        {children}
      </body>
    </html>
  );
}
