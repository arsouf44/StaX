import { unwrapList, unwrapMaybe, type Db } from '@stax/database';
import { formatMaintenance, formatMoney } from '@stax/payments';
import { Alert, ButtonLink, Icon, Panel, StatusPill } from '@stax/ui';
import { ProjectConversation } from '../projet/project-conversation';
import { ProposalPayForm } from './pay-form';

/**
 * Tableau de bord d'un prospect qui a récupéré le site qu'on lui propose.
 *
 * Une seule question à laquelle répondre : « qu'est-ce que je fais
 * maintenant ? ». Regarder son site, lire le prix, payer — ou demander une
 * retouche à l'équipe. Aucun écran de gestion tant que le site n'est pas payé :
 * la base refuse de toute façon toute modification avant la livraison.
 */

export interface ClientProposal {
  id: string;
  reference: string;
  status: 'claimed' | 'paid' | 'delivered';
  expired: boolean;
  expiresAt: string;
  planName: string;
  setupPriceCents: number;
  maintenancePriceCents: number;
  billingInterval: string;
  vatCents: number;
  totalCents: number;
  currency: string;
  companyName: string;
  message: string | null;
  siteUrl: string | null;
  inclusions: Array<{ label: string; category?: string }>;
  orderId: string | null;
  orderStatus: string | null;
  deliveryPending: boolean;
}

export async function loadClientProposal(db: Db, siteId: string): Promise<ClientProposal | null> {
  const { data, error } = await db.rpc('site_proposal_for_site', { p_site: siteId });
  if (error || !data) return null;
  return data as ClientProposal;
}

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

export async function ProposalDashboard({
  db,
  siteId,
  firstName,
  proposal,
  paymentCancelled,
  justClaimed,
}: {
  db: Db;
  siteId: string;
  firstName: string;
  proposal: ClientProposal;
  paymentCancelled: boolean;
  justClaimed: boolean;
}) {
  const project = unwrapMaybe<{ id: string }>(
    (await db
      .from('projects')
      .select('id')
      .eq('site_id', siteId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()) as never,
  );
  const messages = project
    ? unwrapList<{ id: string; author_side: string; body: string; created_at: string }>(
        (await db
          .from('project_messages')
          .select('id, author_side, body, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: true })
          .limit(200)) as never,
      )
    : [];
  if (project) await db.rpc('mark_conversation_read', { p_project: project.id });

  const currency = (proposal.currency || 'EUR') as 'EUR';
  const ht = formatMoney(proposal.setupPriceCents, currency, { hideDecimalsWhenRound: true });
  const ttc = formatMoney(proposal.totalCents, currency, { hideDecimalsWhenRound: true });
  const maintenance =
    proposal.maintenancePriceCents > 0
      ? formatMaintenance(
          proposal.maintenancePriceCents,
          currency,
          proposal.billingInterval === 'year' ? 'year' : 'month',
        )
      : null;

  const hello = firstName ? `Bonjour ${firstName}` : 'Bonjour';

  return (
    <div className="space-y-8" data-testid="proposal-dashboard">
      <div>
        <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
          {proposal.companyName}
        </p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
          {proposal.deliveryPending
            ? 'Merci ! Votre site est en cours de remise'
            : `${hello}, voici votre site`}
        </h1>
        {proposal.message && !proposal.deliveryPending ? (
          <p className="mt-3 max-w-2xl text-[var(--foreground-muted)] italic">
            « {proposal.message} »
          </p>
        ) : null}
      </div>

      {justClaimed && !proposal.deliveryPending ? (
        <Alert tone="success" live="status" title="C’est fait : votre site est dans votre espace">
          Prenez le temps de le parcourir. Une retouche à demander ? Écrivez-nous en bas de page.
          Quand il vous convient, réglez-le : il est à vous aussitôt.
        </Alert>
      ) : null}

      {paymentCancelled && !proposal.deliveryPending ? (
        <Alert tone="info" live="status" title="Paiement interrompu">
          Rien n’a été débité. Vous pouvez reprendre le paiement quand vous le souhaitez.
        </Alert>
      ) : null}

      {proposal.deliveryPending ? (
        <Panel level={2} padding="lg">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--success)]/12 text-[var(--success)]"
            >
              <Icon name="circle-check" size={20} />
            </span>
            <div>
              <StatusPill tone="success">Paiement reçu</StatusPill>
              <h2 className="mt-2 text-lg font-medium">Nous finalisons la remise de votre site</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
                Votre règlement est bien arrivé. Nous faisons une dernière vérification de votre
                site en ligne, puis il vous est confié : cela prend en général quelques minutes, au
                plus un jour ouvré. Vous recevrez un e-mail, et cette page vous montrera alors
                comment modifier votre site.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <Panel level={2} padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Icon name="eye" size={16} />
              Votre site, tel qu’il est en ligne
            </p>
            {proposal.siteUrl ? (
              <a
                href={proposal.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
              >
                Ouvrir en grand
                <Icon name="external-link" size={14} />
              </a>
            ) : null}
          </div>
          {proposal.siteUrl ? (
            <iframe
              src={proposal.siteUrl}
              title={`Site de ${proposal.companyName}`}
              className="block h-[32rem] w-full bg-white sm:h-[40rem]"
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <p className="p-6 text-sm text-[var(--foreground-muted)]">
              L’adresse de votre site vous a été envoyée par e-mail.
            </p>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel level={2} padding="lg">
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Offre {proposal.planName}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[var(--foreground-muted)]">Création du site, payée une fois</dt>
                <dd className="mt-0.5 text-2xl font-medium tabular-nums">
                  {ttc} <span className="text-sm font-normal text-[var(--muted)]">TTC</span>
                </dd>
                <dd className="text-xs text-[var(--muted)]">soit {ht} HT</dd>
              </div>
              {maintenance ? (
                <div>
                  <dt className="text-[var(--foreground-muted)]">Puis maintenance</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{maintenance} HT</dd>
                  <dd className="text-xs text-[var(--muted)]">
                    Hébergement, sécurité, sauvegardes et assistance. Sans engagement, résiliable en
                    ligne à tout moment.
                  </dd>
                </div>
              ) : null}
            </dl>

            {proposal.status === 'claimed' && !proposal.expired ? (
              <div className="mt-6 border-t border-[var(--border)] pt-5">
                <ProposalPayForm
                  proposalId={proposal.id}
                  label={`Payer ${ttc} et récupérer mon site`}
                />
                <p className="mt-3 text-center text-xs text-[var(--muted)]">
                  Proposition valable jusqu’au {DATE.format(new Date(proposal.expiresAt))}.
                </p>
              </div>
            ) : null}

            {proposal.status === 'claimed' && proposal.expired ? (
              <Alert tone="warning" className="mt-6" title="Proposition expirée">
                Elle était valable jusqu’au {DATE.format(new Date(proposal.expiresAt))}.
                Écrivez-nous ci-dessous : nous la prolongeons volontiers.
              </Alert>
            ) : null}
          </Panel>

          {proposal.inclusions.length > 0 ? (
            <Panel level={1} padding="lg">
              <h2 className="text-sm font-medium">Ce que comprend votre offre</h2>
              <ul className="mt-3 space-y-2 text-sm text-[var(--foreground-muted)]">
                {proposal.inclusions.slice(0, 10).map((inclusion) => (
                  <li key={inclusion.label} className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-[var(--success)]" />
                    <span>{inclusion.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">Et après le paiement ?</h2>
            <ol className="mt-3 space-y-2 text-sm text-[var(--foreground-muted)]">
              <li>1. Votre site vous est confié, en général en quelques minutes.</li>
              <li>2. Vous changez vous-même textes, photos et horaires, sans rien installer.</li>
              <li>3. Votre propre nom de domaine ? Demandez-le-nous ici, on s’occupe de tout.</li>
            </ol>
          </Panel>
        </div>
      </div>

      {project ? (
        <div id="discussion">
          <ProjectConversation
            projectId={project.id}
            messages={messages}
            title="Une question ou une petite retouche ? Écrivez-nous"
            intro="L’équipe qui a créé votre site vous répond ici, en général sous un jour ouvré. Vous recevez aussi la réponse par e-mail."
            placeholder="Par exemple : pouvez-vous changer la photo d’accueil, ou corriger nos horaires du samedi ?"
          />
        </div>
      ) : (
        <ButtonLink href="/app/support" variant="secondary">
          Écrire à l’équipe
        </ButtonLink>
      )}
    </div>
  );
}
