import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSessionClient } from '@stax/auth';
import { AuthCard } from '~/components/auth/auth-card';
import { getSession, safeRedirectTarget } from '~/lib/session';
import { MfaChallengeForm } from './mfa-challenge-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vérification en deux étapes',
  robots: { index: false, follow: false },
};

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (!session.user) redirect('/connexion');

  // Deja au niveau aal2 : la verification est faite, inutile de la redemander.
  if (session.user.assuranceLevel === 'aal2') {
    redirect(safeRedirectTarget(typeof params.suivant === 'string' ? params.suivant : null));
  }

  const store = await cookies();
  const client = createSessionClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: () => {
      // Page en lecture seule : aucun cookie n est ecrit ici.
    },
  });

  const { data: factors } = await client.auth.mfa.listFactors();
  const factor = factors?.totp?.find((entry) => entry.status === 'verified');

  // Aucun facteur verifie : il faut d abord en enroler un.
  if (!factor) redirect('/mfa/configuration');

  const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error || !challenge.data) {
    redirect('/connexion?erreur=mfa');
  }

  return (
    <AuthCard
      title="Vérification en deux étapes"
      description="Saisissez le code à six chiffres affiché par votre application d’authentification."
    >
      <MfaChallengeForm
        factorId={factor.id}
        challengeId={challenge.data.id}
        redirectTo={safeRedirectTarget(typeof params.suivant === 'string' ? params.suivant : null)}
      />
    </AuthCard>
  );
}
