import Link from 'next/link';
import { legalStatus, legalValue, isProduction } from '@stax/config';
import { Wordmark } from '@stax/ui';
import { COMPANY_LINKS, FEATURE_LINKS, LEGAL_LINKS, RESOURCE_LINKS } from '~/lib/navigation';

/**
 * Pied de page.
 *
 * Un plan du site sur un trait de 1 px, puis la ligne de signature en petites
 * capitales. Les mentions legales proviennent de la configuration, jamais du
 * code. Tant qu une valeur n est pas renseignee, un marqueur explicite
 * s affiche hors production — il vaut mieux un texte visiblement a completer
 * qu un numero de SIREN invente.
 */
export function SiteFooter({ sectors }: { sectors?: Array<{ slug: string; label: string }> }) {
  const status = legalStatus();
  const company = legalValue('LEGAL_COMPANY_NAME');
  const support = legalValue('SUPPORT_EMAIL');
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto w-[min(1370px,calc(100%-56px))] pt-24 pb-7 max-[800px]:w-[min(calc(100%-32px),620px)] max-[800px]:pt-16">
      <div className="grid gap-12 border-t border-[var(--line)] pt-12 lg:grid-cols-[1.25fr_3fr]">
        <div>
          <Wordmark size={30} />
          <p className="mt-5 max-w-[22rem] text-sm leading-relaxed text-[var(--foreground-muted)]">
            StaX conçoit, héberge et maintient le site professionnel de votre entreprise. Vous
            gardez la main sur vos contenus, vos messages et vos paiements.
          </p>
          <Link
            href="/status"
            className="mt-6 inline-flex items-center gap-2.5 text-[11px] font-bold tracking-[0.08em] text-[var(--foreground-muted)] uppercase transition-colors hover:text-[var(--ink)]"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-[#83ad9b] shadow-[0_0_0_5px_rgb(131_173_155/0.14)]"
            />
            État des services
          </Link>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn
            title="Fonctionnalités"
            links={FEATURE_LINKS.slice(0, 7).map((l) => ({ label: l.label, href: l.href }))}
            extra={{ label: 'Toutes les fonctionnalités', href: '/fonctionnalites' }}
          />
          <FooterColumn
            title="Métiers"
            links={(sectors ?? []).slice(0, 7).map((s) => ({
              label: s.label,
              href: `/metiers/${s.slug}`,
            }))}
            extra={{ label: 'Tous les métiers', href: '/metiers' }}
          />
          <FooterColumn
            title="Ressources"
            links={[
              ...RESOURCE_LINKS.map((l) => ({ label: l.label, href: l.href })),
              { label: 'Tarifs', href: '/tarifs' },
              { label: 'Projet sur mesure', href: '/sur-mesure' },
              { label: 'Demander un devis', href: '/devis' },
            ]}
          />
          <FooterColumn
            title="Entreprise"
            links={COMPANY_LINKS.map((l) => ({ label: l.label, href: l.href }))}
          />
        </div>
      </div>

      <div className="mt-14 border-t border-[var(--line)] pt-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            {/* Fonction de resiliation accessible depuis toutes les pages
                (article L215-1-1 du Code de la consommation). */}
            <Link
              href="/app/abonnement"
              className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              Résilier votre contrat
            </Link>
          </li>
        </ul>

        {!status.configured && !isProduction() ? (
          <p className="mt-6 border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning)]">
            Informations légales incomplètes ({status.missingRequired.join(', ')}). Renseignez-les
            avant toute ouverture commerciale — voir docs/legal-configuration.md.
          </p>
        ) : null}
      </div>

      {/* Ligne de signature */}
      <div className="mt-10 flex flex-col gap-3 text-[11px] leading-[1.35] font-[650] tracking-[0.05em] text-[#53717e] uppercase sm:flex-row sm:justify-between">
        <p>
          {company} © {year}
        </p>
        <p>
          <a href={`mailto:${support}`} className="transition-colors hover:text-[var(--ink)]">
            {support}
          </a>
        </p>
        <p>Conçu avec intention</p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
  extra,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
  extra?: { label: string; href: string };
}) {
  return (
    <div>
      <h2 className="side-note">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--ink)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
        {extra ? (
          <li>
            <Link
              href={extra.href}
              className="text-sm font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
            >
              {extra.label} →
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
