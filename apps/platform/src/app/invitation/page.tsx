import type { Metadata } from 'next';
import { createUserClient } from '@stax/database';
import { ButtonLink, Container, Logo, Panel } from '@stax/ui';
import { getSession } from '~/lib/session';
import { invitationTokenHash } from '~/lib/invitations';
import { AcceptInvitationForm } from './accept-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invitation',
  robots: { index: false, follow: false },
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'administrateur',
  editor: 'rédacteur',
  viewer: 'lecture seule',
};

/**
 * Lien reçu par e-mail : « X vous invite à rejoindre son espace StaX ».
 * Sans compte, la page mène à l'inscription, qui ramène ici.
 */
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.jeton === 'string' ? params.jeton.slice(0, 200) : '';
  const here = `/invitation?jeton=${encodeURIComponent(token)}`;
  const session = await getSession();

  let organizationName: string | null = null;
  let role: string | null = null;
  let code: string | null = null;
  if (session.user && token) {
    const db = createUserClient(session.user.accessToken);
    const { data } = await db.rpc('peek_organization_invitation', {
      p_token_hash: await invitationTokenHash(token),
    });
    const peek = (data ?? {}) as { code?: string; organizationName?: string; role?: string };
    organizationName = peek.organizationName ?? null;
    role = peek.role ?? null;
    code = peek.code ?? 'invalid';
  }

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
            <h1 className="text-3xl font-medium tracking-[-0.03em]">
              {organizationName ? `Rejoindre ${organizationName}` : 'Vous êtes invité sur StaX'}
            </h1>
            <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
              Vous pourrez aider à gérer le site de l’entreprise depuis votre propre compte.
              {role ? ` Rôle proposé : ${ROLE_LABELS[role] ?? role}.` : ''}
            </p>

            <Panel level={2} padding="lg" className="mt-8">
              {!token ? (
                <p className="text-sm text-[var(--foreground-muted)]">
                  Ce lien est incomplet. Ouvrez-le à nouveau depuis l’e-mail d’invitation.
                </p>
              ) : !session.user ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Créez votre compte avec l’adresse e-mail qui a reçu l’invitation, ou
                    connectez-vous.
                  </p>
                  <ButtonLink
                    href={`/inscription?suivant=${encodeURIComponent(here)}`}
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
              ) : code === 'valid' ? (
                <AcceptInvitationForm
                  token={token}
                  label={organizationName ? `Rejoindre ${organizationName}` : 'Accepter'}
                />
              ) : (
                <p className="text-sm text-[var(--foreground-muted)]">
                  {code === 'expired'
                    ? 'Cette invitation a expiré. Demandez à la personne qui vous a invité de la renvoyer.'
                    : code === 'already_used'
                      ? 'Cette invitation a déjà été utilisée.'
                      : code === 'revoked'
                        ? 'Cette invitation a été annulée.'
                        : 'Cette invitation n’est pas reconnue.'}
                </p>
              )}
            </Panel>
          </div>
        </Container>
      </main>
    </div>
  );
}
