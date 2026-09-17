import type { Metadata } from 'next';
import { AuthCard } from '~/components/auth/auth-card';
import { NewPasswordForm } from './new-password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe',
  robots: { index: false, follow: false },
};

export default function NewPasswordPage() {
  return (
    <AuthCard
      title="Nouveau mot de passe"
      description="Choisissez un mot de passe que vous n’utilisez nulle part ailleurs. Vos autres sessions seront fermées."
    >
      <NewPasswordForm />
    </AuthCard>
  );
}
