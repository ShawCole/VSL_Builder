import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VSL Builder \u2014 3-Day Velocity",
  description: "Internal review tool for Elysian Voice VSL content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative`}
      >
        {/* Ambient background orbs */}
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-1/2 -left-1/4 w-[800px] h-[800px] rounded-full bg-blue-500/[0.03] blur-[120px]" />
          <div className="absolute -bottom-1/3 -right-1/4 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.03] blur-[120px]" />
          <div className="absolute top-1/3 left-1/2 w-[400px] h-[400px] rounded-full bg-amber-500/[0.02] blur-[100px]" />
        </div>
        {children}
      </body>
    </html>
  );
}
