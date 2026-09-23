import type { Metadata, Viewport } from 'next';
import { platformUrl, publicEnv } from '@stax/config';
import { BRAND, faviconDataUri } from '@stax/ui/brand';
import { ToastProvider } from '@stax/ui';
import { ThemeScript } from '~/components/theme-script';
import './globals.css';

/*
 * Typographie systeme (SF Pro sur Apple, Helvetica ou Arial ailleurs) : aucune
 * police a telecharger, donc aucun decalage a l affichage et aucune requete de
 * plus. Voir `--font-sans` dans packages/ui/src/styles/globals.css.
 */

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
    { media: '(prefers-color-scheme: dark)', color: '#05070b' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = publicEnv().NEXT_PUBLIC_DEFAULT_LOCALE;

  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
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
