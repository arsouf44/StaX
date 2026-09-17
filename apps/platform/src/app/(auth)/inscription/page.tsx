import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readEnv } from '@stax/config';
import { AuthCard } from '~/components/auth/auth-card';
import { getSession } from '~/lib/session';
import { SignUpForm } from './sign-up-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description:
    'Créez votre compte StaX pour suivre votre projet, gérer votre site et vos messages.',
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  const session = await getSession();
  if (session.user) redirect('/app');

  return (
    <AuthCard
      title="Créer un compte"
      description="Quelques informations suffisent. Vous pourrez commander un site ensuite, ou activer un accès reçu par e-mail."
      footer={
        <>
          Vous avez déjà un compte ?{' '}
          <Link href="/connexion" className="text-[var(--foreground)] underline underline-offset-4">
            Se connecter
          </Link>
        </>
      }
    >
      <SignUpForm turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null} />
    </AuthCard>
  );
}
