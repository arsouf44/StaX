import type { Metadata } from 'next';
import Link from 'next/link';
import { readEnv } from '@stax/config';
import { Alert } from '@stax/ui';
import { AuthCard } from '~/components/auth/auth-card';
import { ResetRequestForm } from './reset-request-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AuthCard
      title="Mot de passe oublié"
      description="Indiquez l’adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe."
      footer={
        <Link href="/connexion" className="text-[var(--foreground)] underline underline-offset-4">
          Retour à la connexion
        </Link>
      }
    >
      {params.lien === 'expire' ? (
        <Alert tone="warning" live="status" className="mb-5">
          Ce lien a expiré ou a déjà servi. Demandez-en un nouveau ci-dessous : il est valable une
          heure.
        </Alert>
      ) : null}
      <ResetRequestForm turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null} />
    </AuthCard>
  );
}
