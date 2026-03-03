import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Nav } from "@/components/nav";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const midnightSans = localFont({
  src: "../fonts/midnight-sans-st-48-heavy-pro.woff2",
  variable: "--font-midnight",
  weight: "900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CB Forge",
  description: "Internal creative asset platform for CB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${geistMono.variable} ${midnightSans.variable} antialiased`}
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}
