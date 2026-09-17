import { SiteHeader } from '~/components/marketing/site-header';
import { SiteFooter } from '~/components/marketing/site-footer';
import { CookieBanner } from '~/components/cookie-banner';
import { listSectorsSafe } from '~/lib/catalog';

/**
 * Enveloppe du site public.
 *
 * Les secteurs affiches dans le pied de page proviennent de la base : si un
 * metier est ajoute au catalogue, il apparait sans toucher au code.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const sectors = await listSectorsSafe();

  return (
    <div className="relative flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="contenu-principal" className="flex-1 pt-16">
        {children}
      </main>
      <SiteFooter sectors={sectors} />
      <CookieBanner />
    </div>
  );
}
