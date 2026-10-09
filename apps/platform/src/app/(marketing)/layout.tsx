import { MobileCtaBar } from '~/components/marketing/mobile-cta';
import { SiteHeader } from '~/components/marketing/site-header';
import { SiteFooter } from '~/components/marketing/site-footer';
import { supportContact } from '~/lib/contact';

/**
 * Enveloppe du site public.
 *
 * Aucun bandeau de consentement : le site ne depose que des traceurs
 * strictement necessaires (session, commande en cours, protection des
 * formulaires), exemptes de consentement. Le jour ou un traceur soumis a
 * consentement serait ajoute, un bandeau devrait l'etre dans le meme temps.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const contact = supportContact();
  return (
    <div className="relative flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="contenu-principal" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MobileCtaBar phone={contact.phone} phoneHref={contact.phoneHref} />
    </div>
  );
}
