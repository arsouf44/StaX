import type { Metadata } from 'next';
import { buildDashboardNavigation } from '@stax/business';
import { featureAccess, loadFeatureSnapshot } from '@stax/database';
import { AppHeader } from '~/components/app/app-header';
import { AppShell } from '~/components/app/app-shell';
import { getWorkspace } from '~/lib/workspace';

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

  const groups = buildDashboardNavigation({
    enabledModules: workspace.currentSite?.enabledModules ?? [],
    hasFeature: (key) => access.has(key),
    can: (capability) => workspace.capabilities.includes(capability),
  });

  return (
    <AppShell groups={groups} header={<AppHeader workspace={workspace} />}>
      {children}
    </AppShell>
  );
}
