import { hasFeature, type WorkspaceSite } from '@stax/database';
import { Alert, ButtonLink } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { ContractEditor } from './contract-editor';
import { loadContractEditor } from './data';

/**
 * Editeur d'un site independant : charge le contrat, le brouillon et l'etat
 * des publications, avec le jeton de la personne.
 */
export async function ContractEditorPage({ site }: { site: WorkspaceSite }) {
  const { workspace, db } = await getWorkspace();
  const scheduling = await hasFeature(db, workspace.organization.id, 'scheduled_publishing');
  const data = await loadContractEditor(db, site, workspace.capabilities, scheduling);

  if ('problem' in data) {
    return (
      <>
        <PageHeader title="Modifier mon site" />
        <Alert tone="info" live="status" title="L’édition de votre site se prépare">
          {data.problem === 'no_manifest'
            ? 'L’équipe StaX finalise les zones modifiables de votre site. Elles apparaîtront ici dès la livraison.'
            : 'Le contenu de votre site est en cours de reprise par l’équipe StaX. Revenez dans quelques instants.'}
          <span className="mt-3 block">
            <ButtonLink href="/app/projet" size="sm" variant="secondary">
              Suivre mon projet
            </ButtonLink>
          </span>
        </Alert>
      </>
    );
  }

  return <ContractEditor data={data} />;
}
