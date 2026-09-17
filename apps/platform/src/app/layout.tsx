import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { platformUrl, publicEnv } from '@stax/config';
import { BRAND, faviconDataUri } from '@stax/ui/brand';
import { ToastProvider } from '@stax/ui';
import { ThemeScript } from '~/components/theme-script';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
  // Ajuste la police de secours pour eviter tout decalage a l affichage.
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(platformUrl()),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description:
    'StaX conçoit, héberge et maintient le site professionnel de votre entreprise. ' +
    'Vous choisissez votre métier, nous construisons le site, vous gardez la main sur vos contenus, ' +
    'vos messages et vos paiements.',
  applicationName: BRAND.name,
  authors: [{ name: BRAND.name }],
  generator: null,
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    icon: [{ url: faviconDataUri(), type: 'image/svg+xml' }],
    apple: [{ url: faviconDataUri() }],
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: BRAND.name,
    url: platformUrl(),
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#060608' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = publicEnv().NEXT_PUBLIC_DEFAULT_LOCALE;

  return (
    <html
      lang={locale}
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <ThemeScript />
        {/* Lien d evitement : premiere cible au clavier, sur chaque page. */}
        <a
          href="#contenu-principal"
          className="sr-only rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
        >
          Aller au contenu principal
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
