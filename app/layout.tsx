import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'İstanbulum — Şehrin ulaşımı, tek haritada',
  description: "İstanbul'un otobüs, metrobüs, durak ve trafik akışlarını keşfedin.",
  openGraph: {
    title: 'İstanbulum',
    description: 'Şehrin ulaşımı, tek haritada.',
    type: 'website',
    locale: 'tr_TR',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'İstanbulum ulaşım haritası' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'İstanbulum',
    description: 'Şehrin ulaşımı, tek haritada.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
