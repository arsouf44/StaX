import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ButtonLink, Container, Logo, Panel } from '@stax/ui';
import { hasPlatformRole } from '@stax/auth';
import { ExitBar } from './exit-bar';
import { getSession } from '~/lib/session';
import { createUserClient, listMemberships } from '@stax/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bienvenue',
  robots: { index: false, follow: false },
};

/**
 * Compte sans organisation.
 *
 * Plutot qu un tableau de bord vide qui donnerait l impression que quelque
 * chose a echoue, on explique la situation et on propose les deux seules
 * suites possibles : commander, ou activer un acces recu par e-mail.
 */
export default async function WelcomePage() {
  const session = await getSession();
  if (!session.user) redirect('/connexion?suivant=%2Fbienvenue');

  // Si une organisation est apparue entre-temps (activation d un code dans un
  // autre onglet, invitation acceptee), on ne laisse pas la personne bloquee.
  const memberships = await listMemberships(
    createUserClient(session.user.accessToken),
    session.user.id,
  );
  if (memberships.length > 0) redirect('/app');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="py-8">
        <Container size="default">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <ExitBar canReachAdmin={hasPlatformRole(session.profile, 'support')} />
          </div>
        </Container>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-center">
        <Container size="default">
          <div className="max-w-xl">
            <h1 className="text-3xl font-medium tracking-[-0.03em]">Votre compte est prêt</h1>
            <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
              Il ne lui manque qu’un site. Trois possibilités, selon votre situation.
            </p>

            <div className="mt-8 space-y-4">
              <Panel level={2} padding="lg">
                <h2 className="text-base font-medium">Je veux commander un site</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  Choisissez votre offre et votre métier. Comptez cinq minutes, et vous pourrez tout
                  modifier ensuite.
                </p>
                <ButtonLink href="/commander" className="mt-4">
                  Commander mon site
                </ButtonLink>
              </Panel>

              <Panel level={1} padding="lg">
                <h2 className="text-base font-medium">J’ai reçu une facture</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  Si nous avons convenu de votre site par téléphone, vous avez reçu une facture par
                  e-mail. Son numéro suffit à retrouver votre commande.
                </p>
                <ButtonLink href="/facture" variant="secondary" className="mt-4">
                  Saisir mon numéro de facture
                </ButtonLink>
              </Panel>

              <Panel level={1} padding="lg">
                <h2 className="text-base font-medium">J’ai reçu un code d’activation</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  Si quelqu’un a commandé un site pour vous, ou vous a invité sur le sien, un code
                  vous a été envoyé par e-mail.
                </p>
                <ButtonLink href="/activation" variant="secondary" className="mt-4">
                  Saisir mon code
                </ButtonLink>
              </Panel>
            </div>

            <p className="mt-8 text-sm text-[var(--muted)]">
              Une question ?{' '}
              <a href="/contact" className="underline underline-offset-4">
                Écrivez-nous
              </a>
              , nous répondons sous un jour ouvré.
            </p>
          </div>
        </Container>
      </main>
    </div>
  );
}
