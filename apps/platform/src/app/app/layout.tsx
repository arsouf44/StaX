import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { buildDashboardNavigation } from '@stax/business';
import { featureAccess, loadFeatureSnapshot } from '@stax/database';
import { AppHeader } from '~/components/app/app-header';
import { AppShell } from '~/components/app/app-shell';
import { SiteUnderConstruction } from '~/components/app/site-under-construction';
import { SupportBanner } from '~/components/app/support-banner';
import { activeSupportSession } from '~/app/admin/assistance/actions';
import { loadClientProposal } from '~/app/app/proposition/proposal-dashboard';
import { getWorkspace, isAccountPath, isSiteUnderConstruction } from '~/lib/workspace';

/**
 * L espace client n est JAMAIS mis en cache et n est jamais indexe : il
 * contient les donnees d une entreprise identifiee.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Mon espace', template: '%s — Mon espace StaX' },
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { workspace, db } = await getWorkspace();

  // La navigation depend de trois choses, toutes lues cote serveur : les
  // modules actifs du metier, les fonctionnalites incluses dans l offre, et
  // les capacites du role. Masquer une entree n est pas une protection : chaque
  // page revalide ses droits, et la base refuserait de toute facon l ecriture.
  const snapshot = await loadFeatureSnapshot(db, workspace.organization.id);
  const access = featureAccess(snapshot);

  // Une session d'assistance ouverte doit se voir AVANT tout le reste.
  const support = await activeSupportSession();
  const supportActive = support?.organizationId === workspace.organization.id;

  // Site en construction chez StaX : le client suit son projet, il n a pas
  // encore la main sur le site. La base le refuserait de toute facon
  // (`app.site_can`) ; l interface ne propose donc pas ces ecrans.
  const underConstruction = isSiteUnderConstruction(workspace);
  const pathname = (await headers()).get('x-stax-pathname') ?? '/app';
  const hideContent = underConstruction && !isAccountPath(pathname);
  // Site proposé et récupéré, en attente de règlement : il est prêt, le
  // message ne doit pas dire « en création ».
  const proposal =
    hideContent && workspace.currentSite
      ? await loadClientProposal(db, workspace.currentSite.id)
      : null;

  // Réponses de l'équipe pas encore lues : pastille sur « Écrire à l'équipe ».
  const { count: unreadReplies } = await db
    .from('project_messages')
    .select('id, projects!inner ( organization_id )', { count: 'exact', head: true })
    .eq('author_side', 'stax')
    .is('read_by_client_at', null)
    .eq('projects.organization_id', workspace.organization.id);

  const groups = buildDashboardNavigation({
    enabledModules: workspace.currentSite?.enabledModules ?? [],
    hasFeature: (key) => access.has(key),
    can: (capability) => workspace.capabilities.includes(capability),
    siteDelivered: !underConstruction,
    architecture: workspace.currentSite?.architecture,
  });

  return (
    <>
      {supportActive && support ? (
        <SupportBanner
          organizationName={workspace.organization.name}
          reason={support.reason}
          expiresAtLabel={new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(
            new Date(support.expiresAt),
          )}
        />
      ) : null}
      <AppShell
        groups={groups}
        header={<AppHeader workspace={workspace} />}
        badges={{ '/app/discussion': unreadReplies ?? 0 }}
      >
        {hideContent && workspace.currentSite ? (
          <SiteUnderConstruction
            siteName={workspace.currentSite.name}
            awaitingPayment={proposal?.status === 'claimed'}
          />
        ) : (
          children
        )}
      </AppShell>
    </>
  );
}
