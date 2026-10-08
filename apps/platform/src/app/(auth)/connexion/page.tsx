import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readEnv } from '@nemasus/config';
import { AuthCard } from '~/components/auth/auth-card';
import { getSession, safeRedirectTarget } from '~/lib/session';
import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connexion',
  description:
    'Accédez à votre espace Nemasus pour gérer votre site, vos messages et vos contenus.',
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();

  // Deja connecte : inutile de proposer un formulaire de connexion.
  if (session.user) {
    redirect(safeRedirectTarget(typeof params.suivant === 'string' ? params.suivant : null));
  }

  const redirectTo = safeRedirectTarget(typeof params.suivant === 'string' ? params.suivant : null);

  const notice =
    params.reinitialise === '1'
      ? 'Votre mot de passe a été modifié. Connectez-vous avec le nouveau.'
      : params.active === '1'
        ? 'Votre compte est activé. Connectez-vous pour accéder à votre espace.'
        : params.deconnecte === '1'
          ? 'Vous êtes déconnecté.'
          : params.confirme === '1'
            ? 'Votre adresse e-mail est confirmée. Connectez-vous pour continuer.'
            : undefined;

  return (
    <AuthCard
      title="Connexion"
      description="Accédez à votre espace pour suivre votre projet, modifier votre site et lire vos messages."
      footer={
        <>
          Première connexion ?{' '}
          <Link href="/acces" className="text-[var(--foreground)] underline underline-offset-4">
            J’ai reçu un code d’accès
          </Link>
        </>
      }
    >
      <SignInForm
        redirectTo={redirectTo}
        turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
        {...(notice ? { notice } : {})}
      />
    </AuthCard>
  );
}
