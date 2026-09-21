import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createUserClient, listMemberships, unwrapMaybe } from '@stax/database';
import { deliveryPolicyConfig } from '@stax/config';
import { Container, Logo, Panel } from '@stax/ui';
import { getSession } from '~/lib/session';
import { InvoiceForm } from './invoice-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rattacher ma facture',
  robots: { index: false, follow: false },
};

/**
 * Rattachement d'une commande conclue par telephone.
 *
 * Le client a vu une demonstration, dit oui, et recu une facture. Il arrive ici
 * avec un numero et rien d'autre : la page ne lui demande donc rien de plus que
 * ce numero et le nom de son entreprise.
 */
export default async function InvoicePage() {
  const session = await getSession();
  if (!session.user) redirect('/connexion?suivant=%2Ffacture');

  const db = createUserClient(session.user.accessToken);
  const memberships = await listMemberships(db, session.user.id);
  const first = memberships[0];

  const profile = unwrapMaybe<{ first_name: string | null; email: string }>(
    (await db
      .from('profiles')
      .select('first_name, email')
      .eq('id', session.user.id)
      .maybeSingle()) as never,
  );

  const delivery = deliveryPolicyConfig();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="py-8">
        <Container size="default">
          <Logo />
        </Container>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-start pb-16">
        <Container size="default">
          <div className="max-w-xl">
            <h1 className="text-3xl font-medium tracking-[-0.03em]">
              {profile?.first_name ? `Bonjour ${profile.first_name}, ` : ''}rattachez votre facture
            </h1>
            <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
              Saisissez le numéro qui figure sur la facture que nous vous avons envoyée. Votre
              commande apparaîtra aussitôt dans votre espace, et nous démarrons la création de votre
              site.
            </p>

            <div className="mt-8">
              <InvoiceForm
                defaultOrganizationName={first?.name ?? ''}
                hasOrganization={memberships.length > 0}
              />
            </div>

            <Panel level={1} padding="lg" className="mt-6">
              <h2 className="text-sm font-medium">Ce qui se passe ensuite</h2>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                <li>
                  <span className="text-[var(--foreground)]">1.</span> Nous vous demandons les
                  informations nécessaires : textes, photos, logo, horaires.
                </li>
                <li>
                  <span className="text-[var(--foreground)]">2.</span> Nous réalisons votre site.
                  Comptez {delivery.label} à partir de la réception de vos éléments.
                </li>
                <li>
                  <span className="text-[var(--foreground)]">3.</span> Vous relisez une version
                  privée et demandez vos corrections.
                </li>
                <li>
                  <span className="text-[var(--foreground)]">4.</span> Nous publions après votre
                  validation. Vous pouvez ensuite tout modifier vous-même.
                </li>
              </ol>
            </Panel>

            <p className="mt-8 text-sm text-[var(--muted)]">
              Vous n’avez pas de facture ?{' '}
              <Link href="/commander" className="underline underline-offset-4">
                Commander directement en ligne
              </Link>{' '}
              ou{' '}
              <Link href="/activation" className="underline underline-offset-4">
                saisir un code d’activation
              </Link>
              .
            </p>
          </div>
        </Container>
      </main>
    </div>
  );
}
