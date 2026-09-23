import type { Metadata } from 'next';
import { mediaPublicUrl, unwrapList, unwrapMaybe } from '@stax/database';
import { PROJECT_STATUS_LABELS, PROJECT_TIMELINE } from '@stax/payments';
import { Alert, ButtonLink, EmptyState, Icon, Panel, StatusPill, cn } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { ProjectConversation } from './project-conversation';
import { ProjectFiles, type ProjectFileView } from './project-files';
import { ProjectReview } from './project-review';

export const metadata: Metadata = { title: 'Mon projet' };

/**
 * Suivi de projet.
 *
 * Deux exigences :
 *  - le vocabulaire reste celui du client (« Votre validation », jamais
 *    « client_review ») ;
 *  - l etape affichee correspond a un ETAT REEL en base, pas a une barre de
 *    progression decorative qui avancerait toute seule.
 */
export default async function ProjectPage() {
  const { workspace, db } = await getWorkspace();

  const project = unwrapMaybe<{
    id: string;
    reference: string;
    status: string;
    title: string;
    summary: string | null;
    due_at: string | null;
    go_live_at: string | null;
    created_at: string;
  }>(
    (await db
      .from('projects')
      .select('id, reference, status, title, summary, due_at, go_live_at, created_at')
      .eq('organization_id', workspace.organization.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as never,
  );

  if (!project) {
    return (
      <>
        <PageHeader title="Mon projet" />
        <EmptyState
          icon={<Icon name="route" size={24} />}
          title="Aucun projet en cours"
          description="Votre projet s’ouvrira automatiquement dès votre commande. Vous pourrez alors suivre chaque étape depuis cette page."
          action={<ButtonLink href="/commander">Commander mon site</ButtonLink>}
        />
      </>
    );
  }

  const [messages, events, fileRows] = await Promise.all([
    db
      .from('project_messages')
      .select('id, author_side, body, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })
      .limit(100),
    db
      .from('project_events')
      .select('id, kind, title, description, created_at')
      .eq('project_id', project.id)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(30),
    db
      .from('project_files')
      .select('id, file_name, kind, direction, created_at, storage_bucket, storage_path')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const files: ProjectFileView[] = unwrapList<{
    id: string;
    file_name: string;
    kind: string;
    direction: 'inbound' | 'outbound';
    created_at: string;
    storage_bucket: string;
    storage_path: string;
  }>(fileRows as never).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    kind: row.kind,
    direction: row.direction,
    createdAt: row.created_at,
    // Seuls les fichiers de la mediatheque (publique) ont une adresse directe.
    url:
      row.storage_bucket === 'site-media'
        ? mediaPublicUrl(row.storage_bucket, row.storage_path)
        : null,
  }));

  const currentIndex = PROJECT_TIMELINE.findIndex((step) =>
    (step.statuses as readonly string[]).includes(project.status),
  );

  const conversation = unwrapList<{
    id: string;
    author_side: string;
    body: string;
    created_at: string;
  }>(messages as never);

  const history = unwrapList<{
    id: string;
    kind: string;
    title: string;
    description: string | null;
    created_at: string;
  }>(events as never);

  return (
    <>
      <PageHeader
        title="Mon projet"
        description={`Référence ${project.reference}. Chaque étape ci-dessous correspond à un état réel de votre dossier.`}
        actions={
          <StatusPill tone="accent">
            {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] ??
              project.status}
          </StatusPill>
        }
      />

      {project.status === 'client_review' ? (
        <ProjectReview
          projectId={project.id}
          request={
            history.find(
              (event) => event.kind === 'phase' && event.title === 'Votre validation est attendue',
            )?.description ?? null
          }
        />
      ) : null}

      {project.status === 'questionnaire_pending' || project.status === 'assets_pending' ? (
        <Alert tone="warning" className="mb-6" live="status" title="Il nous manque des éléments">
          Nous avons besoin de quelques informations ou visuels pour avancer. Le détail est dans la
          conversation ci-dessous.
        </Alert>
      ) : null}

      <section aria-labelledby="etapes" className="mb-8">
        <h2 id="etapes" className="mb-4 text-sm font-medium">
          Où en est votre site
        </h2>
        <ol className="space-y-0">
          {PROJECT_TIMELINE.map((step, index) => {
            const done = currentIndex > index;
            const active = currentIndex === index;
            return (
              <li key={step.key} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border text-2xs',
                      done &&
                        'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]',
                      active &&
                        'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]',
                      !done && !active && 'border-[var(--border)] text-[var(--muted)]',
                    )}
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  {index < PROJECT_TIMELINE.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'w-px flex-1',
                        done ? 'bg-[var(--success)]/40' : 'bg-[var(--border)]',
                      )}
                    />
                  ) : null}
                </div>
                <div className="pb-7">
                  <p
                    className={cn(
                      'text-sm',
                      active
                        ? 'font-medium text-[var(--foreground)]'
                        : 'text-[var(--foreground-muted)]',
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <ProjectConversation projectId={project.id} messages={conversation} />

        <aside className="space-y-4">
          <ProjectFiles
            projectId={project.id}
            files={files}
            canUpload={workspace.capabilities.includes('media.manage')}
          />
          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Historique</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Les étapes franchies apparaîtront ici.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {history.map((event) => (
                  <li key={event.id}>
                    <p className="text-sm">{event.title}</p>
                    {event.description ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--foreground-muted)]">
                        {event.description}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-2xs text-[var(--muted)]">
                      <time dateTime={event.created_at}>
                        {new Intl.DateTimeFormat('fr-FR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(event.created_at))}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {project.go_live_at ? (
            <Panel level={1} padding="md">
              <h2 className="text-sm font-medium">Mise en ligne</h2>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Votre site est en ligne depuis le{' '}
                <time dateTime={project.go_live_at}>
                  {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                    new Date(project.go_live_at),
                  )}
                </time>
                .
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                C’est cette date qui fait courir votre garantie commerciale de remboursement.
              </p>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}
