import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readEnv } from '@nemasus/config';
import { createUserClient, listMemberships } from '@nemasus/database';
import { AuthCard } from '~/components/auth/auth-card';
import { getSession } from '~/lib/session';
import { normalizeAccessCode } from '~/lib/site-orders';
import { AccessForm } from './access-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Accès client',
  description:
    'Saisissez le code d’accès personnel reçu après votre paiement pour ouvrir votre espace Nemasus et retrouver votre site.',
  alternates: { canonical: '/acces' },
  robots: { index: false, follow: true },
};

/**
 * Accès client par code.
 *
 * Le code est envoyé par e-mail une fois le virement reçu. Une personne déjà
 * connectée, rattachée à un espace, qui ouvre la page sans code est renvoyée
 * vers son espace ; avec un code (nouveau site, par exemple), le formulaire
 * reste proposé.
 */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.code === 'string' ? params.code.slice(0, 40) : '';
  const code = raw ? normalizeAccessCode(raw) : '';

  // Déjà connecté et rattaché à un espace, sans nouveau code : direction
  // l'espace. Un compte sans espace garde le formulaire (sinon /app le
  // renverrait ici, en boucle).
  const session = await getSession();
  if (session.user && !code) {
    const memberships = await listMemberships(
      createUserClient(session.user.accessToken),
      session.user.id,
    ).catch(() => []);
    if (memberships.length > 0) redirect('/app');
  }

  return (
    <AuthCard
      title="Entrez votre code d’accès"
      description="Votre code personnel vous a été envoyé par e-mail dès réception de votre paiement. Il ouvre votre espace et votre site."
      footer={
        <>
          Pas encore de code ?{' '}
          <Link
            href="/commander"
            className="whitespace-nowrap text-[var(--foreground)] underline underline-offset-4"
          >
            Commander mon site
          </Link>{' '}
          ·{' '}
          <Link
            href="/contact"
            className="whitespace-nowrap text-[var(--foreground)] underline underline-offset-4"
          >
            Code perdu ou expiré
          </Link>
        </>
      }
    >
      <AccessForm
        defaultCode={code}
        turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
      />
    </AuthCard>
  );
}
