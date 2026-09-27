import { SiteHeader } from '~/components/marketing/site-header';
import { SiteFooter } from '~/components/marketing/site-footer';
import { CookieBanner } from '~/components/cookie-banner';

/** Enveloppe du site public. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="contenu-principal" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <CookieBanner />
    </div>
  );
}
