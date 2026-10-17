import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'S1 Studio — Vendor-Neutral /v1/systemone Decision Sandbox',
  description:
    'Open-source Web UI sandbox for /v1/systemone structured decision models (TypeSafe Jev, Ollama clef / clef-flash, and custom endpoints).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0b0c0e] text-zinc-100 selection:bg-amber-500/25 selection:text-amber-100">
        {children}
      </body>
    </html>
  );
}
