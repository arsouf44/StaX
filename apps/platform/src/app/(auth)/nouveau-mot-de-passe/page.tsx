import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, ButtonLink } from '@nemasus/ui';
import { AuthCard } from '~/components/auth/auth-card';
import { inspectPasswordReset } from '~/lib/password-reset';
import { NewPasswordForm } from './new-password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe',
  robots: { index: false, follow: false },
  // Le jeton est dans l'adresse : il ne doit fuiter vers aucun autre site.
  referrer: 'no-referrer',
};

const LINK_PROBLEMS: Record<string, { title: string; text: string }> = {
  invalid: {
    title: 'Lien non valide',
    text: 'Ce lien de réinitialisation n’est pas reconnu. Ouvrez-le à nouveau depuis l’e-mail reçu, ou demandez-en un nouveau.',
  },
  expired: {
    title: 'Lien expiré',
    text: 'Ce lien était valable une heure. Demandez-en un nouveau : il vous parviendra en quelques instants.',
  },
  used: {
    title: 'Lien déjà utilisé',
    text: 'Ce lien a déjà servi à changer votre mot de passe. Connectez-vous, ou demandez un nouveau lien si nécessaire.',
  },
  replaced: {
    title: 'Lien remplacé',
    text: 'Un lien plus récent vous a été envoyé : seul le dernier est valable. Ouvrez le plus récent de vos e-mails.',
  },
  unavailable: {
    title: 'Vérification impossible',
    text: 'Nous ne pouvons pas vérifier ce lien pour le moment. Réessayez dans quelques instants.',
  },
};

/**
 * Lien reçu par e-mail. La page vérifie l'état du lien SANS le consommer : il
 * n'est utilisé qu'à l'envoi du formulaire.
 */
export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.jeton === 'string' ? params.jeton.slice(0, 128) : '';
  const state = token ? await inspectPasswordReset(token) : 'invalid';
  const problem = state === 'ok' ? null : (LINK_PROBLEMS[state] ?? LINK_PROBLEMS['invalid']);

  return (
    <AuthCard
      title="Nouveau mot de passe"
      description="Choisissez un mot de passe que vous n’utilisez nulle part ailleurs. Toutes vos sessions ouvertes seront fermées."
      footer={
        <Link href="/connexion" className="text-[var(--foreground)] underline underline-offset-4">
          Retour à la connexion
        </Link>
      }
    >
      {problem ? (
        <div className="space-y-5">
          <Alert tone="warning" live="status" title={problem.title}>
            {problem.text}
          </Alert>
          <ButtonLink href="/mot-de-passe-oublie" block>
            Demander un nouveau lien
          </ButtonLink>
        </div>
      ) : (
        <NewPasswordForm token={token} />
      )}
    </AuthCard>
  );
}
