import type { Metadata } from 'next';
import Link from 'next/link';
import { featureAccess, loadFeatureSnapshot, unwrapList } from '@stax/database';
import { domainProvider } from '@stax/infrastructure';
import { ButtonLink, Icon, Panel } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { DomainManager, type DomainView } from './domain-manager';

export const metadata: Metadata = { title: 'Nom de domaine' };

const STATUS_VIEW: Record<string, { label: string; tone: StatusTone; help: string }> = {
  pending: {
    label: 'En attente',
    tone: 'warning',
    help: 'Les enregistrements DNS n’ont pas encore été ajoutés, ou ne sont pas encore visibles.',
  },
  verifying: {
    label: 'Vérification en cours',
    tone: 'info',
    help: 'Vos enregistrements sont détectés. Le certificat HTTPS est en cours d’émission.',
  },
  active: {
    label: 'Actif',
    tone: 'success',
    help: 'Votre site répond à cette adresse, en HTTPS.',
  },
  failed: {
    label: 'Échec',
    tone: 'danger',
    help: 'Le rattachement n’a pas abouti. Vérifiez les enregistrements DNS ci-dessous.',
  },
  expired: {
    label: 'Expiré',
    tone: 'danger',
    help: 'Ce domaine a expiré chez son registrar. Renouvelez-le pour le réactiver.',
  },
  detached: {
    label: 'Retiré',
    tone: 'neutral',
    help: 'Ce domaine n’est plus rattaché à votre site.',
  },
};

const SSL_LABELS: Record<string, string> = {
  none: 'pas encore demandé',
  pending: 'en cours d’émission',
  active: 'actif',
  failed: 'échec — contactez-nous',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default async function DomainPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canManage = workspace.capabilities.includes('domain.manage');

  if (!site) {
    return (
      <>
        <PageHeader
          title="Nom de domaine"
          description="L’adresse à laquelle vos clients trouvent votre site."
        />
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé. Vous pourrez rattacher votre domaine dès sa mise en
            place.
          </p>
          <ButtonLink href="/app/projet" variant="secondary" className="mt-4">
            Suivre mon projet
          </ButtonLink>
        </Panel>
      </>
    );
  }

  const access = featureAccess(await loadFeatureSnapshot(db, workspace.organization.id));
  const included = access.has('custom_domain');

  const rows = unwrapList<{
    id: string;
    hostname: string;
    kind: string;
    status: string;
    is_primary: boolean;
    ssl_status: string;
    verification_token: string;
    last_error: string | null;
    last_checked_at: string | null;
  }>(
    (await db
      .from('site_domains')
      .select(
        'id, hostname, kind, status, is_primary, ssl_status, verification_token, last_error, last_checked_at',
      )
      .eq('site_id', site.id)
      .neq('status', 'detached')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })) as never,
  );

  const provider = domainProvider();

  const domains: DomainView[] = rows.map((row) => {
    const view = STATUS_VIEW[row.status] ?? {
      label: row.status,
      tone: 'neutral' as StatusTone,
      help: '',
    };
    const isPlatform = row.kind === 'platform_subdomain';

    return {
      id: row.id,
      hostname: row.hostname,
      statusLabel: isPlatform ? 'Fournie par StaX' : view.label,
      statusTone: isPlatform ? 'info' : view.tone,
      statusHelp: isPlatform
        ? 'Adresse technique toujours active. Elle sert de secours : votre site reste joignable même si votre domaine pose problème.'
        : view.help,
      isPrimary: row.is_primary,
      isPlatform,
      isActive: row.status === 'active',
      httpsLabel: SSL_LABELS[row.ssl_status] ?? row.ssl_status,
      lastError: row.last_error,
      lastCheckedLabel: row.last_checked_at
        ? DATE_TIME.format(new Date(row.last_checked_at))
        : null,
      // Le jeton de verification n'est pas un secret : il doit etre PUBLIE dans
      // le DNS du client. C'est sa presence a cet endroit precis qui prouve la
      // possession du domaine.
      records: isPlatform
        ? []
        : provider.instructions(row.hostname, row.verification_token).map((instruction) => ({
            type: instruction.type,
            name: instruction.name,
            value: instruction.value,
            purpose: instruction.purpose,
          })),
    };
  });

  return (
    <>
      <PageHeader
        title="Nom de domaine"
        description="L’adresse à laquelle vos clients trouvent votre site. Le certificat HTTPS est installé et renouvelé automatiquement."
      />

      {!included ? (
        <Panel level={2} padding="lg">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 text-[var(--accent)]" aria-hidden="true">
              <Icon name="lock" size={20} />
            </span>
            <div>
              <h2 className="text-sm font-medium">
                Le domaine personnalisé n’est pas inclus dans votre offre
              </h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
                Votre site est en ligne à son adresse StaX
                {domains[0] ? ` (${domains[0].hostname})` : ''} et fonctionne parfaitement. Un nom
                de domaine à votre nom renforce la confiance de vos visiteurs.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href="/app/support" variant="secondary">
                  Demander l’activation
                </ButtonLink>
                <Link
                  href="/tarifs"
                  className="self-center text-sm text-[var(--accent)] underline underline-offset-4"
                >
                  Comparer les offres
                </Link>
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <DomainManager
          domains={domains}
          canManage={canManage}
          providerAvailable={provider.available}
        />
      )}
    </>
  );
}
