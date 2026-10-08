import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Panel } from '@nemasus/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Commande envoyée',
  robots: { index: false, follow: false },
};

const REFERENCE = /^CMD-\d{4}-\d{5}$/;

/**
 * Confirmation de commande. La référence vient du lien de redirection : elle
 * n'autorise rien et n'est affichée que si elle a la forme d'une référence.
 */
export default async function OrderThanksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.reference === 'string' ? params.reference : '';
  const reference = REFERENCE.test(raw) ? raw : null;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="kicker">Commande envoyée</p>
      <h1 className="title-page mt-2">Merci, nous avons bien reçu votre commande.</h1>
      {reference ? (
        <p className="mt-4 text-[var(--foreground-muted)]">
          Sa référence : <strong className="font-mono text-[var(--foreground)]">{reference}</strong>
          . Un e-mail de confirmation vient de vous être envoyé.
        </p>
      ) : (
        <p className="mt-4 text-[var(--foreground-muted)]">
          Un e-mail de confirmation vient de vous être envoyé.
        </p>
      )}

      <Panel level={2} padding="lg" className="mt-8">
        <h2 className="text-sm font-medium">La suite</h2>
        <ol className="mt-4 space-y-4 text-sm text-[var(--foreground-muted)]">
          {[
            [
              'Modalités de paiement',
              'Nous vous envoyons par e-mail le montant convenu, nos coordonnées bancaires et la référence à indiquer dans le libellé du virement.',
            ],
            [
              'Votre virement',
              'Vous effectuez le virement depuis votre banque. Selon les établissements, il nous parvient en quelques heures à deux jours ouvrés.',
            ],
            [
              'Votre code d’accès',
              'Dès réception, nous vous envoyons votre code personnel. Vous le saisissez sur la page « Accès client » : votre espace et votre site s’ouvrent.',
            ],
          ].map(([title, text], index) => (
            <li key={title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)]/12 text-sm font-medium text-[var(--accent)]"
              >
                {index + 1}
              </span>
              <span>
                <span className="block font-medium text-[var(--foreground)]">{title}</span>
                <span className="mt-0.5 block leading-relaxed">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <p className="mt-6 text-sm text-[var(--muted)]">
        Vous ne trouvez pas notre e-mail ? Vérifiez vos courriers indésirables, ou{' '}
        <Link href="/contact" className="underline underline-offset-4">
          écrivez-nous
        </Link>
        {reference ? ` en rappelant la référence ${reference}` : ''}.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/" variant="secondary">
          Retour à l’accueil
        </ButtonLink>
        <ButtonLink href="/acces" variant="ghost">
          J’ai déjà mon code d’accès
        </ButtonLink>
      </div>
    </div>
  );
}
