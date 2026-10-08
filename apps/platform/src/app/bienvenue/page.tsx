import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ButtonLink, Container, Logo, Panel } from '@nemasus/ui';
import { hasPlatformRole } from '@nemasus/auth';
import { ExitBar } from './exit-bar';
import { getSession } from '~/lib/session';
import { createUserClient, listMemberships } from '@nemasus/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bienvenue',
  robots: { index: false, follow: false },
};

/**
 * Compte sans organisation.
 *
 * Plutot qu un tableau de bord vide qui donnerait l impression que quelque
 * chose a echoue, on explique la situation et on propose les suites
 * possibles : saisir le code d acces recu apres le virement, ou commander.
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

  // Affichage seulement : c est la base qui refuse une commande sans paiement
  // a un compte qui n est pas interne.
  const internal =
    session.profile?.account_type === 'internal' && session.profile.billing_exempt === true;

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
            <h1 className="display-panel">Votre compte est prêt</h1>
            <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
              Il ne lui manque qu’un site. Choisissez votre situation.
            </p>

            <div className="mt-8 space-y-4">
              {internal ? null : (
                <Panel level={2} padding="lg">
                  <h2 className="text-base font-medium">J’ai reçu mon code d’accès</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    Après votre virement, vous avez reçu un e-mail « Votre code d’accès Nemasus »
                    avec un code à 12 caractères. Saisissez-le pour ouvrir l’espace de votre
                    entreprise.
                  </p>
                  <ButtonLink href="/acces" className="mt-4">
                    Saisir mon code d’accès
                  </ButtonLink>
                </Panel>
              )}

              <Panel level={2} padding="lg">
                <h2 className="text-base font-medium">
                  {internal ? 'Passer une commande interne' : 'Je veux commander un site'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {internal
                    ? 'Compte interne Nemasus : choisissez n’importe quel métier. Aucun paiement ne vous sera demandé. Le site est ensuite construit par l’équipe Nemasus, puis confié à ce compte depuis l’administration.'
                    : 'Décrivez votre activité et votre projet : nous vous envoyons ensuite les modalités de paiement par virement, puis votre code d’accès.'}
                </p>
                <ButtonLink href="/commander" className="mt-4">
                  {internal ? 'Commander sans paiement' : 'Commander mon site'}
                </ButtonLink>
              </Panel>

              <Panel level={1} padding="lg">
                <h2 className="text-base font-medium">On m’a invité à collaborer</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  Si une entreprise vous a invité sur son espace, ouvrez le lien de l’e-mail
                  d’invitation : il vous rattache directement à son site.
                </p>
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
