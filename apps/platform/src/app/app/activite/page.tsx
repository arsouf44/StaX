import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import {
  EmptyState,
  Icon,
  Panel,
  PermissionDenied,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';

export const metadata: Metadata = { title: 'Journal d’activité' };

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Traduction des actions journalisees.
 *
 * Le journal stocke des identifiants stables (`member.role_changed`) pour rester
 * exploitable dans le temps. Ce qui s'affiche, ce sont des phrases francaises.
 * Une action inconnue reste lisible plutot que d'etre masquee : un journal qui
 * cache ce qu'il ne comprend pas n'est plus un journal.
 */
const ACTION_LABELS: Record<string, string> = {
  'site.published': 'Site publié',
  'site.rolled_back': 'Retour à une version précédente',
  'site.suspended': 'Site suspendu',
  'site.reactivated': 'Site réactivé',
  'member.invited': 'Collaborateur invité',
  'member.joined': 'Collaborateur arrivé',
  'member.role_changed': 'Accès d’un collaborateur modifié',
  'member.removed': 'Accès d’un collaborateur retiré',
  'order.paid': 'Commande payée',
  'order.refunded': 'Commande remboursée',
  'refund.requested': 'Remboursement demandé',
  'subscription.cancel_requested': 'Résiliation demandée',
  'subscription.cancel_reverted': 'Résiliation annulée',
  'domain.attached': 'Nom de domaine rattaché',
  'domain.verified': 'Nom de domaine vérifié',
  'domain.detached': 'Nom de domaine retiré',
  'data.exported': 'Export de données',
  'data.deletion_requested': 'Suppression de données demandée',
  'impersonation.started': 'Accès d’assistance ouvert par l’équipe StaX',
  'impersonation.ended': 'Accès d’assistance refermé',
  'auth.password_changed': 'Mot de passe modifié',
  'auth.mfa_enabled': 'Double authentification activée',
  'auth.mfa_disabled': 'Double authentification désactivée',
};

const ACTOR_LABELS: Record<string, string> = {
  user: 'Vous ou un collaborateur',
  platform_staff: 'Équipe StaX',
  system: 'Automatique',
  webhook: 'Service de paiement',
  anonymous: 'Visiteur',
};

export default async function ActivityPage() {
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('org.manage')) {
    return (
      <PermissionDenied message="Le journal d’activité est réservé aux propriétaires et administrateurs de votre organisation." />
    );
  }

  const rows = unwrapList<{
    id: string;
    action: string;
    actor_type: string;
    actor_email: string | null;
    impersonated_by: string | null;
    created_at: string;
  }>(
    (await db
      .from('audit_logs')
      .select('id, action, actor_type, actor_email, impersonated_by, created_at')
      .eq('organization_id', workspace.organization.id)
      .order('created_at', { ascending: false })
      .limit(200)) as never,
  );

  return (
    <>
      <PageHeader
        title="Journal d’activité"
        description="Ce qui s’est passé sur votre compte : publications, changements d’accès, paiements, interventions de notre équipe."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" size={24} />}
          title="Rien à afficher pour le moment"
          description="Les événements importants de votre compte apparaîtront ici au fur et à mesure."
        />
      ) : (
        <TableWrapper label="Journal d’activité">
          <Table>
            <THead>
              <TR>
                <TH scope="col">Quand</TH>
                <TH scope="col">Quoi</TH>
                <TH scope="col">Par qui</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-[var(--foreground-muted)]">
                    <time dateTime={row.created_at}>
                      {DATE_TIME.format(new Date(row.created_at))}
                    </time>
                  </TD>
                  <TD>{ACTION_LABELS[row.action] ?? row.action}</TD>
                  <TD className="text-[var(--foreground-muted)]">
                    {row.actor_email ?? ACTOR_LABELS[row.actor_type] ?? row.actor_type}
                    {row.impersonated_by ? (
                      <span className="block text-xs text-[var(--warning)]">
                        via un accès d’assistance StaX
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}

      <Panel level={1} padding="lg" className="mt-8">
        <h2 className="text-sm font-medium">Pourquoi ce journal existe</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Pour que vous puissiez vérifier. Si un membre de notre équipe ouvre votre espace pour vous
          aider, cela apparaît ici, avec la date et la personne. Nous ne consultons pas votre espace
          sans laisser de trace, et vous n’avez pas à nous croire sur parole.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          Ce journal ne contient jamais de mot de passe, de jeton ni de donnée bancaire. Les
          adresses IP y sont enregistrées sous forme d’empreinte, jamais en clair.
        </p>
      </Panel>
    </>
  );
}
