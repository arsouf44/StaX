import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '~/components/auth/auth-card';
import { requireSession } from '~/lib/session';
import { FirstPasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choisir mon mot de passe',
  robots: { index: false, follow: false },
};

/**
 * Juste après l'accès par code : le code ne sert qu'une fois, le mot de passe
 * permet de revenir ensuite (et « Mot de passe oublié » de le retrouver).
 */
export default async function FirstPasswordPage() {
  const session = await requireSession();

  return (
    <AuthCard
      title="Choisissez votre mot de passe"
      description={
        <>
          Votre code d’accès est validé. Votre code ne sert qu’une fois : choisissez maintenant le
          mot de passe de votre compte <strong>{session.profile.email}</strong> pour vos prochaines
          connexions.
        </>
      }
      footer={
        <Link href="/app" className="text-[var(--foreground-muted)] underline underline-offset-4">
          Le faire plus tard
        </Link>
      }
    >
      <FirstPasswordForm />
    </AuthCard>
  );
}
