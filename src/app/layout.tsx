import type { Metadata, Viewport } from 'next';
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

const SITE_URL = 'https://s1-studio.miniasp.com/';
const OG_IMAGE_URL = 'https://s1-studio.miniasp.com/images/og-image.png';
const SITE_TITLE = 'S1 Studio — Vendor-Neutral /v1/systemone Decision Sandbox';
const SITE_DESCRIPTION =
  '開源的 /v1/systemone 結構化決策模型 Web UI 測試沙盒，支援 TypeSafe Jev、Ollama clef / clef-flash、Cloudflare Workers AI 與自建端點的 Choice / Score / Noul 視覺化機率診斷、A/B 端點對比與 SDK 匯出。';
const OG_IMAGE_ALT =
  'S1 Studio — /v1/systemone Structured Decision Primitives Workbench showing Choice, Score, and Noul probability telemetry cards';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0e' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://s1-studio.miniasp.com'),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: 'S1 Studio',
  authors: [{ name: 'Will 保哥', url: 'https://blog.miniasp.com/' }],
  creator: 'Will 保哥',
  publisher: 'Will 保哥',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: SITE_URL,
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'S1 Studio',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'zh_TW',
    images: [
      {
        url: OG_IMAGE_URL,
        type: 'image/png',
        width: 1200,
        height: 630,
        alt: OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_URL,
        alt: OG_IMAGE_ALT,
      },
    ],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'S1 Studio',
  alternateName: 'S1 Studio — Vendor-Neutral /v1/systemone Decision Sandbox',
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  image: OG_IMAGE_URL,
  inLanguage: 'zh-Hant',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  isAccessibleForFree: true,
  license: 'https://opensource.org/licenses/MIT',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  author: {
    '@type': 'Person',
    name: 'Will 保哥',
    alternateName: 'Will Huang',
    url: 'https://blog.miniasp.com/',
    sameAs: ['https://blog.miniasp.com/', 'https://github.com/doggy8088'],
  },
  codeRepository: 'https://github.com/doggy8088/s1-studio',
};

const themeInitScript = `(function(){try{var s=localStorage.getItem('s1_studio_theme_v1');var t=(s==='light'||s==='dark')?s:'dark';var d=document.documentElement;d.setAttribute('data-theme',t);if(t==='light'){d.classList.remove('dark');d.classList.add('light');}else{d.classList.remove('light');d.classList.add('dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-Hant"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#0b0c0e] text-zinc-100 selection:bg-amber-500/25 selection:text-amber-100">
        {children}
      </body>
    </html>
  );
}
