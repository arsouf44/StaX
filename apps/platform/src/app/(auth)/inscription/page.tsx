import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readEnv } from '@stax/config';
import { AuthCard } from '~/components/auth/auth-card';
import { getSession, safeRedirectTarget } from '~/lib/session';
import { SignUpForm } from './sign-up-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description:
    'Créez votre compte StaX pour suivre votre projet, gérer votre site et vos messages.',
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const suivant = typeof params.suivant === 'string' ? params.suivant : null;
  const redirectTo = safeRedirectTarget(suivant);
  const email = typeof params.email === 'string' ? params.email.slice(0, 200) : '';

  const session = await getSession();
  if (session.user) redirect(redirectTo);

  const claiming = redirectTo.startsWith('/recuperer');

  return (
    <AuthCard
      title={claiming ? 'Créez votre compte pour récupérer votre site' : 'Créer un compte'}
      description={
        claiming
          ? 'Une minute suffit. Utilisez l’adresse e-mail à laquelle vous avez reçu votre proposition.'
          : 'Quelques informations suffisent. Vous pourrez commander un site ensuite, ou activer un accès reçu par e-mail.'
      }
      footer={
        <>
          Vous avez déjà un compte ?{' '}
          <Link
            href={suivant ? `/connexion?suivant=${encodeURIComponent(redirectTo)}` : '/connexion'}
            className="text-[var(--foreground)] underline underline-offset-4"
          >
            Se connecter
          </Link>
        </>
      }
    >
      <SignUpForm
        turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
        redirectTo={suivant ? redirectTo : undefined}
        defaultEmail={email}
      />
    </AuthCard>
  );
}
