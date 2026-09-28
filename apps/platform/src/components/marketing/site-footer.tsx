import Link from 'next/link';
import { legalStatus, legalValue, isProduction } from '@nemasus/config';
import { Wordmark } from '@nemasus/ui';
import { COMPANY_LINKS, FEATURE_LINKS, LEGAL_LINKS, RESOURCE_LINKS } from '~/lib/navigation';

/**
 * Pied de page.
 *
 * Le plan du site sur un trait de 1 px, puis la ligne de signature : le
 * studio, l adresse de contact, l annee. Les mentions legales proviennent de
 * la configuration, jamais du code. Tant qu une valeur n est pas renseignee,
 * un marqueur explicite s affiche hors production : il vaut mieux un texte
 * visiblement a completer qu un numero de SIREN invente.
 */
export function SiteFooter() {
  const status = legalStatus();
  const company = legalValue('LEGAL_COMPANY_NAME');
  const support = legalValue('SUPPORT_EMAIL');
  const year = new Date().getFullYear();

  return (
    <footer className="shell pt-24 pb-10 max-[800px]:pt-16">
      <div className="grid gap-12 border-t border-[var(--border)] pt-12 lg:grid-cols-[1.2fr_3fr]">
        <div>
          <Wordmark size={30} />
          <p className="mt-5 max-w-[22rem] text-sm leading-relaxed text-[var(--foreground-muted)]">
            Studio de conception et de développement de sites web. Nous créons votre site, vous le
            gérez ensuite.
          </p>
          <Link
            href="/status"
            className="mt-6 inline-flex items-center gap-2.5 text-[12.5px] tracking-[0.02em] text-[var(--foreground-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[#4f9a7a] shadow-[0_0_0_4px_rgb(79_154_122/0.14)]"
            />
            État des services
          </Link>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn
            title="Offres"
            links={[
              { label: 'Toutes les offres', href: '/tarifs' },
              { label: 'Projet sur mesure', href: '/sur-mesure' },
              { label: 'Demander un devis', href: '/devis' },
              { label: 'Commander mon site', href: '/commander' },
            ]}
          />
          <FooterColumn
            title="Fonctionnalités"
            links={FEATURE_LINKS.slice(0, 6).map((l) => ({ label: l.label, href: l.href }))}
            extra={{ label: 'Tout voir', href: '/fonctionnalites' }}
          />
          <FooterColumn
            title="Ressources"
            links={RESOURCE_LINKS.map((l) => ({ label: l.label, href: l.href }))}
          />
          <FooterColumn
            title="Le studio"
            links={COMPANY_LINKS.map((l) => ({ label: l.label, href: l.href }))}
          />
        </div>
      </div>

      <div className="mt-14 border-t border-[var(--border)] pt-6">
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
          <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning)]">
            Informations légales incomplètes ({status.missingRequired.join(', ')}). Renseignez-les
            avant toute ouverture commerciale : voir docs/legal-configuration.md.
          </p>
        ) : null}
      </div>

      {/* Ligne de signature */}
      <div className="mt-8 flex flex-col gap-2.5 border-t border-[var(--border)] pt-7 text-[13.5px] text-[var(--foreground-muted)] sm:flex-row sm:items-baseline sm:justify-between">
        <p>Nemasus. Studio de conception et de développement de sites web.</p>
        <p>
          <a href={`mailto:${support}`} className="transition-colors hover:text-[var(--ink)]">
            {support}
          </a>
        </p>
        <p>
          © {year} {company}
        </p>
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
      <h2 className="font-serif text-[1.2rem] leading-tight text-[var(--foreground)]">{title}</h2>
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
              className="text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
            >
              {extra.label} →
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
