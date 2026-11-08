import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Bingo",
  applicationName: "Bingo",
  // Explicit + base-path-prefixed: metadata icon URLs are not prefixed automatically, and setting
  // `icons` replaces the app/favicon.ico link, so it is listed here too.
  icons: {
    icon: [{ url: `${BASE}/favicon.ico`, sizes: "48x48", type: "image/x-icon" }],
    apple: [{ url: `${BASE}/pwa-icons/apple-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Bingo", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
  description: "Bingo multiplayer între prieteni, cu matrice N×N personalizabilă.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iOS fix (feedback #5): without a max scale Safari keeps a stale zoom after landscape -> portrait.
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
