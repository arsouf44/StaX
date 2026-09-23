import type { Metadata } from 'next';
import {
  coreConfigurationProblems,
  legalStatus,
  missingCapabilities,
  type CapabilityKey,
} from '@stax/config';
import { unwrapList } from '@stax/database';
import {
  Alert,
  Icon,
  Panel,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getAdminContext } from '~/lib/admin';

export const metadata: Metadata = { title: 'État des services' };

/**
 * Etat reel des services.
 *
 * Cet ecran ne doit JAMAIS afficher « tout va bien » par defaut. Une sonde qui
 * n'a jamais tourne vaut « inconnu », pas « operationnel » : un tableau de bord
 * qui ment sur la sante d'un systeme est pire que pas de tableau de bord.
 */

const HEALTH_VIEW: Record<string, { label: string; tone: StatusTone }> = {
  healthy: { label: 'Opérationnel', tone: 'success' },
  degraded: { label: 'Dégradé', tone: 'warning' },
  failing: { label: 'En panne', tone: 'danger' },
  not_configured: { label: 'Non configuré', tone: 'neutral' },
  unknown: { label: 'Inconnu', tone: 'neutral' },
};

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  stripe: 'Paiements Stripe (clé secrète et secret de webhook)',
  stripe_connect: 'Stripe Connect (encaissement sur les sites clients)',
  cloudflare_domains: 'Rattachement automatique des domaines (API Cloudflare)',
  turnstile: 'Vérification anti-robot Turnstile',
  email: 'Envoi d’e-mails transactionnels',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default async function AdminHealthPage() {
  const { db } = await getAdminContext();

  const probes = unwrapList<{
    key: string;
    label: string;
    status: string;
    detail: string | null;
    observed_at: string | null;
  }>(
    (await db
      .from('system_health')
      .select('key, label, status, detail, observed_at')
      .order('key', { ascending: true })) as never,
  );

  const missing = missingCapabilities();
  const legal = legalStatus();
  const configuration = coreConfigurationProblems();

  const recentWebhooks = unwrapList<{ status: string }>(
    (await db
      .from('webhook_events')
      .select('status')
      .order('received_at', { ascending: false })
      .limit(100)) as never,
  );
  const failedWebhooks = recentWebhooks.filter((row) => row.status === 'failed').length;

  return (
    <>
      <PageHeader
        title="État des services"
        description="Ce que la plateforme sait réellement de son propre fonctionnement. Une sonde qui n’a jamais tourné affiche « inconnu », jamais « opérationnel »."
      />

      <div className="space-y-8">
        {configuration.length > 0 ? (
          <Alert tone="danger" live="alert" title="Configuration du déploiement incomplète">
            <p>
              Ces variables se renseignent dans les réglages du déploiement (variables
              d’environnement), puis un redéploiement les prend en compte.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {configuration.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {!legal.configured ? (
          <Alert tone="danger" live="alert" title="Informations légales incomplètes">
            {legal.missingRequired.length > 0 ? (
              <p>
                Manquantes : {legal.missingRequired.join(', ')}. La production refusera de démarrer
                tant qu’elles ne sont pas renseignées.
              </p>
            ) : null}
            {legal.identityProblems.map((problem) => (
              <p key={problem.field}>{problem.message}</p>
            ))}
          </Alert>
        ) : (
          <Alert tone="success" live="status" title="Identité commerciale vérifiée">
            SIREN, SIRET et numéro de TVA sont renseignés et leurs clés de contrôle sont correctes.
            Les textes juridiques restent à faire valider par un professionnel du droit.
          </Alert>
        )}

        <section aria-labelledby="capacites" className="space-y-3">
          <h2 id="capacites" className="text-base font-medium">
            Services externes configurés
          </h2>
          {missing.length === 0 ? (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Tous les services externes sont configurés.
              </p>
            </Panel>
          ) : (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Ces services ne sont pas configurés. Les fonctionnalités correspondantes se
                dégradent proprement plutôt que d’échouer, mais elles ne sont pas disponibles.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {missing.map((capability) => (
                  <li key={capability} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[var(--warning)]" aria-hidden="true">
                      <Icon name="alert-triangle" size={16} />
                    </span>
                    <span className="text-[var(--foreground-muted)]">
                      {CAPABILITY_LABELS[capability] ?? capability}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>

        <section aria-labelledby="sondes" className="space-y-3">
          <h2 id="sondes" className="text-base font-medium">
            Sondes internes
          </h2>
          <TableWrapper label="Sondes internes">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Service</TH>
                  <TH scope="col">État</TH>
                  <TH scope="col">Dernière observation</TH>
                  <TH scope="col">Détail</TH>
                </TR>
              </THead>
              <TBody>
                {probes.map((probe) => {
                  const view = HEALTH_VIEW[probe.status] ?? HEALTH_VIEW.unknown;
                  return (
                    <TR key={probe.key}>
                      <TD>{probe.label}</TD>
                      <TD>
                        <StatusPill tone={view?.tone ?? 'neutral'}>
                          {view?.label ?? probe.status}
                        </StatusPill>
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        {probe.observed_at ? (
                          <time dateTime={probe.observed_at}>
                            {DATE_TIME.format(new Date(probe.observed_at))}
                          </time>
                        ) : (
                          'jamais'
                        )}
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">{probe.detail ?? '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        </section>

        <section aria-labelledby="webhooks" className="space-y-3">
          <h2 id="webhooks" className="text-base font-medium">
            Webhooks Stripe
          </h2>
          <Panel level={failedWebhooks > 0 ? 2 : 1} padding="lg">
            {recentWebhooks.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                Aucun événement reçu pour le moment. C’est normal avant la première vente.
              </p>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">
                {failedWebhooks === 0
                  ? `Les ${recentWebhooks.length} derniers événements ont été traités sans erreur.`
                  : `${failedWebhooks} événement${failedWebhooks > 1 ? 's' : ''} en échec sur les ${recentWebhooks.length} derniers. Un paiement peut ne pas avoir été appliqué.`}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              La vérité d’un paiement vient de ces événements signés, jamais d’un retour de
              navigateur. Un webhook en échec doit être rejoué depuis le tableau de bord Stripe.
            </p>
          </Panel>
        </section>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Sauvegardes</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            Les sauvegardes PostgreSQL sont assurées par Supabase selon le plan du projet. StaX
            n’affiche pas d’état de sauvegarde tant qu’une sonde ne le remonte pas réellement :
            annoncer une sauvegarde inexistante serait la pire erreur possible sur cet écran.
          </p>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Procédure de restauration : <code>docs/backup-recovery.md</code>.
          </p>
        </Panel>
      </div>
    </>
  );
}
