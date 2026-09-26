import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { ProjectConversation } from '../projet/project-conversation';

export const metadata: Metadata = { title: 'Écrire à l’équipe' };

/**
 * La discussion avec l'équipe StaX : un seul fil par site, avant comme après
 * la livraison. Le client n'a pas à choisir entre « ticket », « projet » ou
 * « support » : il écrit, l'équipe répond ici et par e-mail.
 */
export default async function DiscussionPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  let query = db
    .from('projects')
    .select('id')
    .eq('organization_id', workspace.organization.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (site) query = query.eq('site_id', site.id);
  const project = unwrapMaybe<{ id: string }>((await query.maybeSingle()) as never);

  const messages = project
    ? unwrapList<{ id: string; author_side: string; body: string; created_at: string }>(
        (await db
          .from('project_messages')
          .select('id, author_side, body, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: true })
          .limit(300)) as never,
      )
    : [];
  if (project) await db.rpc('mark_conversation_read', { p_project: project.id });

  return (
    <>
      <PageHeader
        title="Écrire à l’équipe"
        description="Une question, une modification que vous ne savez pas faire, un nouveau besoin : écrivez-nous ici. Nous répondons en général sous un jour ouvré, et vous recevez la réponse aussi par e-mail."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
        {project ? (
          <ProjectConversation
            projectId={project.id}
            messages={messages}
            title="Votre discussion avec StaX"
            intro="Tout l’historique de vos échanges est conservé ici."
            placeholder="Écrivez votre message comme vous le diriez au téléphone. Exemple : « Pouvez-vous ajouter nos congés d’août sur la page d’accueil ? »"
          />
        ) : (
          <Panel level={2} padding="lg">
            <p className="text-sm text-[var(--foreground-muted)]">
              La discussion s’ouvrira avec votre premier site. En attendant, utilisez{' '}
              <Link href="/app/support" className="underline underline-offset-4">
                Aide & support
              </Link>
              .
            </p>
          </Panel>
        )}

        <aside className="space-y-4">
          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Ce que vous pouvez nous demander</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--foreground-muted)]">
              <li>Changer un texte ou une photo à votre place.</li>
              <li>Brancher votre propre nom de domaine.</li>
              <li>Ajouter une page ou une fonctionnalité (devis).</li>
              <li>Comprendre une facture ou votre maintenance.</li>
            </ul>
          </Panel>
          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Site inaccessible ?</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Écrivez-nous ici en commençant par « URGENT » : nous traitons ces demandes en
              priorité.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
