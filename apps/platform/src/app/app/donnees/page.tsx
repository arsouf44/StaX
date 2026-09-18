import type { Metadata } from 'next';
import Link from 'next/link';
import { maintenancePolicyConfig } from '@stax/config';
import { Panel, PermissionDenied } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { ExportPanel } from './export-panel';

export const metadata: Metadata = { title: 'Mes données' };

/**
 * Donnees du client.
 *
 * L export est en LIBRE-SERVICE, sans demande prealable et sans frais. C est
 * une obligation reglementaire (portabilite), et c est surtout la preuve qu on
 * ne retient personne : un service qu on ne peut pas quitter n est pas un
 * service.
 */
export default async function DataPage() {
  const { workspace } = await getWorkspace();
  const maintenance = maintenancePolicyConfig();

  if (!workspace.capabilities.includes('data.export')) {
    return (
      <PermissionDenied message="Votre rôle ne permet pas d’exporter les données. Demandez à un propriétaire de votre organisation." />
    );
  }

  const modules = workspace.currentSite?.enabledModules ?? [];

  return (
    <>
      <PageHeader
        title="Mes données"
        description="Vos contenus, vos messages et vos contacts vous appartiennent. Vous pouvez les récupérer à tout moment, sans nous le demander."
      />

      <div className="space-y-6">
        <ExportPanel
          available={{
            messages: true,
            contacts: true,
            reservations: modules.includes('booking'),
            commandes: modules.includes('orders'),
          }}
        />

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Combien de temps gardons-nous vos données ?</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--foreground-muted)]">
            <li>
              <strong className="text-[var(--foreground)]">Pendant votre abonnement :</strong> tout
              est conservé et accessible.
            </li>
            <li>
              <strong className="text-[var(--foreground)]">Si vous arrêtez la maintenance :</strong>{' '}
              votre site reste en ligne {maintenance.gracePeriodDays} jours, puis il est suspendu —
              ni supprimé, ni effacé — pendant {maintenance.suspensionRetentionDays} jours, puis
              archivé {maintenance.archiveRetentionDays} jours. L’export reste possible pendant
              toute cette durée.
            </li>
            <li>
              <strong className="text-[var(--foreground)]">
                Après suppression de votre compte :
              </strong>{' '}
              vos contenus et vos contacts sont effacés. Les factures sont conservées{' '}
              {maintenance.financialRetentionYears} ans, parce que le code de commerce l’impose.
            </li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            Le détail complet figure dans notre page{' '}
            <Link href="/donnees-personnelles" className="underline underline-offset-4">
              données personnelles
            </Link>
            .
          </p>
        </Panel>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Supprimer votre compte</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
            La suppression est définitive. Nous vous demandons de nous écrire depuis votre espace
            plutôt que de proposer un bouton : cela nous permet de vérifier qu’il s’agit bien de
            vous, de vous rappeler d’exporter vos données au préalable, et de vous confirmer par
            écrit ce qui sera effacé et ce que la loi nous oblige à conserver.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/app/support" className="text-[var(--accent)] underline underline-offset-4">
              Nous écrire depuis mon espace
            </Link>
          </p>
        </Panel>
      </div>
    </>
  );
}
