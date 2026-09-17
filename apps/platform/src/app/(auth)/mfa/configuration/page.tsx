import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '~/components/auth/auth-card';
import { getSession } from '~/lib/session';
import { MfaEnrollment } from './mfa-enrollment';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Activer la double authentification',
  robots: { index: false, follow: false },
};

export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (!session.user) redirect('/connexion');

  const mandatory = params.raison === 'obligatoire' || session.profile?.mfa_enforced === true;

  return (
    <AuthCard
      title="Double authentification"
      description={
        mandatory
          ? 'Ce compte dispose d’un accès d’administration : la double authentification est obligatoire pour continuer.'
          : 'Ajoutez une seconde vérification à votre connexion. Un mot de passe volé ne suffira plus à accéder à votre compte.'
      }
    >
      <MfaEnrollment mandatory={mandatory} />
    </AuthCard>
  );
}
