import type { Metadata } from 'next';
import Link from 'next/link';
import { readEnv } from '@stax/config';
import { AuthCard } from '~/components/auth/auth-card';
import { ActivationForm } from './activation-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Activer mon accès',
  description: 'Saisissez le code reçu par e-mail pour activer l’accès à votre espace StaX.',
  robots: { index: false, follow: false },
};

export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Le code peut arriver par le lien de l e-mail : on prerremplit le champ,
  // mais rien n est consomme avant une validation explicite.
  const code = typeof params.code === 'string' ? params.code.slice(0, 20) : '';
  const email = typeof params.email === 'string' ? params.email.slice(0, 200) : '';

  return (
    <AuthCard
      title="Activer mon accès"
      description="Saisissez le code à 12 caractères que nous vous avons envoyé par e-mail, ainsi que l’adresse à laquelle vous l’avez reçu."
      footer={
        <>
          Vous avez déjà activé votre accès ?{' '}
          <Link href="/connexion" className="text-[var(--foreground)] underline underline-offset-4">
            Se connecter
          </Link>
        </>
      }
    >
      <ActivationForm
        initialCode={code}
        initialEmail={email}
        turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
      />
    </AuthCard>
  );
}
