import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Container, Logo, Panel } from '@stax/ui';
import { normalizeProposalCode } from '~/lib/proposals';
import { getSession } from '~/lib/session';
import { ClaimForm } from './claim-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Récupérer mon site',
  robots: { index: false, follow: false },
};

/**
 * Arrivée du prospect depuis le bouton « Récupérer mon site » de l'e-mail.
 *
 * Le code et l'adresse arrivent dans le lien : ils évitent une recopie, ils
 * n'autorisent rien à eux seuls. Sans compte, la page explique les trois
 * étapes et mène à l'inscription, qui ramène ici une fois l'adresse
 * confirmée. Avec un compte, un seul bouton.
 */
export default async function ClaimSitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawCode = typeof params.code === 'string' ? params.code.slice(0, 32) : '';
  const code = rawCode ? normalizeProposalCode(rawCode) : '';
  const email = typeof params.email === 'string' ? params.email.slice(0, 200).toLowerCase() : '';

  const here = `/recuperer?${new URLSearchParams({
    ...(code ? { code } : {}),
    ...(email ? { email } : {}),
  }).toString()}`;

  const session = await getSession();
  const signedInEmail = session.user?.email?.toLowerCase() ?? null;
  const otherAccount = Boolean(signedInEmail && email && signedInEmail !== email);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="py-8">
        <Container size="default">
          <Logo />
        </Container>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-start pb-16">
        <Container size="default">
          <div className="max-w-xl">
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Votre site est prêt
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em]">
              Récupérez votre site en quelques minutes
            </h1>

            <ol className="mt-6 space-y-3">
              {[
                ['Créer votre compte', 'Avec l’adresse e-mail qui a reçu la proposition.'],
                ['Saisir votre code', 'Il est déjà rempli si vous venez du bouton de l’e-mail.'],
                [
                  'Voir votre site et le régler',
                  'Paiement sécurisé par carte. Votre site est à vous aussitôt, et vous pouvez le modifier vous-même.',
                ],
              ].map(([title, text], index) => (
                <li key={title} className="flex gap-3">
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)]/12 text-sm font-medium text-[var(--accent)]"
                  >
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-sm text-[var(--foreground-muted)]">{text}</span>
                  </span>
                </li>
              ))}
            </ol>

            <Panel level={2} padding="lg" className="mt-8">
              {!session.user ? (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                    Première visite ? Créez votre compte : vous recevrez un e-mail de confirmation
                    qui vous ramènera directement ici.
                  </p>
                  <ButtonLink
                    href={`/inscription?${new URLSearchParams({
                      suivant: here,
                      ...(email ? { email } : {}),
                    }).toString()}`}
                    size="lg"
                    block
                  >
                    Créer mon compte
                  </ButtonLink>
                  <ButtonLink
                    href={`/connexion?suivant=${encodeURIComponent(here)}`}
                    variant="secondary"
                    size="lg"
                    block
                  >
                    J’ai déjà un compte
                  </ButtonLink>
                </div>
              ) : (
                <div className="space-y-5">
                  {otherAccount ? (
                    <p className="rounded-[var(--radius-md)] border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm">
                      Vous êtes connecté avec <strong>{signedInEmail}</strong>, mais la proposition
                      a été envoyée à <strong>{email}</strong>. Le code ne fonctionnera qu’avec
                      cette dernière adresse.
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Connecté avec <strong>{signedInEmail}</strong>.
                    </p>
                  )}
                  <ClaimForm defaultCode={code} />
                </div>
              )}
            </Panel>

            <p className="mt-8 text-sm text-[var(--muted)]">
              Une question ? Répondez simplement à l’e-mail reçu, ou{' '}
              <Link href="/contact" className="underline underline-offset-4">
                écrivez-nous
              </Link>
              .
            </p>
          </div>
        </Container>
      </main>
    </div>
  );
}
