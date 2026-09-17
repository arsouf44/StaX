import Link from 'next/link';
import { legalStatus, legalValue, isProduction } from '@stax/config';
import { Beam, Container, Logo } from '@stax/ui';
import { COMPANY_LINKS, FEATURE_LINKS, LEGAL_LINKS, RESOURCE_LINKS } from '~/lib/navigation';
import { ThemeToggle } from '~/components/theme-toggle';

/**
 * Pied de page.
 *
 * Les mentions legales proviennent de la configuration, jamais du code. Tant
 * qu une valeur n est pas renseignee, un marqueur explicite s affiche hors
 * production — il vaut mieux un texte visiblement a completer qu un numero
 * de SIREN invente.
 */
export function SiteFooter({ sectors }: { sectors?: Array<{ slug: string; label: string }> }) {
  const status = legalStatus();
  const company = legalValue('LEGAL_COMPANY_NAME');
  const support = legalValue('SUPPORT_EMAIL');
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24 border-t border-[var(--border)]">
      <Beam className="absolute inset-x-0 top-0 opacity-40" />
      <Container size="wide" className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Logo size={28} />
            <p className="measure-tight mt-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
              StaX conçoit, héberge et maintient le site professionnel de votre entreprise. Vous
              gardez la main sur vos contenus, vos messages et vos paiements.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ThemeToggle />
              <Link
                href="/status"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-strong)]"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--success)]" />
                État des services
              </Link>
            </div>
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

        <div className="mt-14 border-t border-[var(--border)] pt-8">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground-muted)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-3 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {year} {company}. Tous droits réservés.
            </p>
            <p>
              Une question ?{' '}
              <a
                href={`mailto:${support}`}
                className="text-[var(--foreground-muted)] underline underline-offset-4"
              >
                {support}
              </a>
            </p>
          </div>

          {!status.configured && !isProduction() ? (
            <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning)]">
              Informations légales incomplètes ({status.missingRequired.join(', ')}). Renseignez-les
              avant toute ouverture commerciale — voir docs/legal-configuration.md.
            </p>
          ) : null}
        </div>
      </Container>
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
      <h2 className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
        {title}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
        {extra ? (
          <li>
            <Link
              href={extra.href}
              className="text-sm font-medium text-[var(--foreground)] transition-colors hover:text-[var(--accent)]"
            >
              {extra.label} →
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
