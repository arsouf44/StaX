import type { Metadata, Viewport } from 'next';
import { platformUrl, publicEnv } from '@nemasus/config';
import { BRAND } from '@nemasus/ui/brand';
import { ToastProvider } from '@nemasus/ui';
import './globals.css';

/*
 * Typographie : EB Garamond et Inter Tight, servies par la plateforme
 * (paquets @fontsource), jamais par un tiers. Voir `--font-serif` et
 * `--font-sans` dans packages/ui/src/styles/globals.css.
 */

export const metadata: Metadata = {
  metadataBase: new URL(platformUrl()),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description:
    'Studio français de sites web professionnels : nous concevons et mettons en ligne le site ' +
    'de votre entreprise, puis vous le gérez depuis un éditeur simple.',
  applicationName: BRAND.name,
  authors: [{ name: BRAND.name }],
  generator: null,
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: BRAND.name,
    url: platformUrl(),
  },
  twitter: { card: 'summary_large_image', title: `${BRAND.name} — ${BRAND.tagline}` },
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
  themeColor: '#f1f2f3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = publicEnv().NEXT_PUBLIC_DEFAULT_LOCALE;

  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        {/* La lumiere derriere toutes les pages : gris perle et reflets de mer. */}
        <div className="atmosphere" aria-hidden="true" />
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
