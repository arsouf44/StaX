import type { Metadata } from 'next';
import Link from 'next/link';
import { readEnv } from '@stax/config';
import { AuthCard } from '~/components/auth/auth-card';
import { ResetRequestForm } from './reset-request-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
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
      <ResetRequestForm turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null} />
    </AuthCard>
  );
}
