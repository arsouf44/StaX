import type { Metadata } from 'next';
import Link from 'next/link';
import { IMPERSONATION_FORBIDDEN_ACTIONS, IMPERSONATION_MAX_MINUTES } from '@stax/auth';
import { unwrapList } from '@stax/database';
import { Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { requireAdminRole } from '~/lib/admin';
import { StartSupportForm, type OrganizationChoice } from './start-form';

export const metadata: Metadata = { title: 'Assistance client' };

const FORBIDDEN_LABELS: Record<string, string> = {
  'billing.change_payment_method': 'Changer un moyen de paiement',
  'billing.view_stripe_secrets': 'Voir les secrets Stripe du client',
  'subscription.cancel': 'Résilier un abonnement',
  'subscription.change_plan': 'Changer d’offre',
  'refund.request': 'Demander un remboursement',
  'refund.approve': 'Approuver un remboursement',
  'organization.delete': 'Supprimer une organisation',
  'member.invite': 'Inviter un collaborateur',
  'member.role_change': 'Changer les accès d’un collaborateur',
  'domain.delete': 'Retirer un nom de domaine',
  'data.export_full': 'Exporter l’intégralité des données',
  'activation_code.create': 'Créer un code d’activation',
  'mfa.disable': 'Désactiver la double authentification',
  'password.change': 'Changer un mot de passe',
};

export default async function SupportSessionPage() {
  const { db } = await requireAdminRole('support');

  const organizations = unwrapList<{ id: string; name: string; slug: string }>(
    (await db
      .from('organizations')
      .select('id, name, slug')
      .order('name', { ascending: true })
      .limit(500)) as never,
  );

  const choices: OrganizationChoice[] = organizations.map((organization) => ({
    id: organization.id,
    label: `${organization.name} (${organization.slug})`,
  }));

  return (
    <>
      <PageHeader
        title="Assistance client"
        description="Ouvrir une session « voir comme ce client » pour dépanner, sous conditions strictes."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StartSupportForm organizations={choices} maxMinutes={IMPERSONATION_MAX_MINUTES} />

        <div className="space-y-6">
          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">Comment cela fonctionne</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              Nous n’empruntons jamais l’identité du client. Vous restez connecté sous votre propre
              compte ; l’interface vous présente ses données, auxquelles votre rôle vous donne déjà
              accès en lecture.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
              Chaque action reste donc attribuée à vous dans le journal, et fermer la session est
              immédiat : il n’y a aucun jeton client à révoquer, puisqu’il n’en a jamais été créé.
            </p>
          </Panel>

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">Ce qui reste interdit</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              Ces opérations sont bloquées pendant toute session d’assistance, sans exception ni
              contournement possible :
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground-muted)]">
              {IMPERSONATION_FORBIDDEN_ACTIONS.map((action) => (
                <li key={action}>· {FORBIDDEN_LABELS[action] ?? action}</li>
              ))}
            </ul>
          </Panel>

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">Le client le voit</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              L’ouverture et la fermeture sont inscrites dans le journal d’activité du client, avec
              votre nom, la date et le motif que vous saisissez. Rédigez-le comme s’il allait le
              lire — parce qu’il le peut.
            </p>
            <p className="mt-3 text-sm">
              <Link
                href="/admin/activite?filtre=assistance"
                className="text-[var(--accent)] underline underline-offset-4"
              >
                Voir les sessions d’assistance passées
              </Link>
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
