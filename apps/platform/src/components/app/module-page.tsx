import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModule } from '@stax/business';
import type { ModuleId } from '@stax/business';
import type { FeatureKey } from '@stax/types';
import { hasFeature } from '@stax/database';
import { ButtonLink, Icon, Panel } from '@stax/ui';
import { getWorkspace } from '~/lib/workspace';
import { PageHeader } from './page-header';

/**
 * Cadre commun aux pages de module metier.
 *
 * Trois verifications, toutes cote serveur :
 *  - le site a-t-il ce module ? sinon la page n'existe pas (404) ;
 *  - l'offre inclut-elle la fonctionnalite ? sinon on explique, sans mentir ;
 *  - la personne a-t-elle la capacite de consultation ? sinon la RLS ne
 *    renverrait de toute facon aucune ligne, et l'ecran le dit clairement.
 *
 * Une page de module n'affiche JAMAIS une interface qui ne fonctionne pas.
 */

export interface ModulePageProps {
  /** Un module, ou plusieurs quand la page sert a l'un OU l'autre. */
  module: ModuleId | readonly ModuleId[];
  feature?: FeatureKey | null;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export async function ModulePage({
  module,
  feature = null,
  title,
  description,
  actions,
  children,
}: ModulePageProps) {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  // Sans site, il n'y a rien a gerer : on renvoie vers le suivi de projet
  // plutot que d'afficher une page vide.
  if (!site) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé. Vous pourrez gérer cette rubrique dès que nous
            l’aurons mis en place.
          </p>
          <ButtonLink href="/app/projet" variant="secondary" className="mt-4">
            Suivre l’avancement de mon projet
          </ButtonLink>
        </Panel>
      </>
    );
  }

  const candidates = Array.isArray(module) ? module : [module as ModuleId];
  const active = candidates.find((id) => site.enabledModules.includes(id));
  if (!active) notFound();

  if (feature) {
    const included = await hasFeature(db, workspace.organization.id, feature);
    if (!included) {
      const definition = getModule(active);
      return (
        <>
          <PageHeader title={title} description={description} />
          <Panel level={2} padding="lg">
            <div className="flex items-start gap-4">
              <span className="mt-0.5 text-[var(--accent)]" aria-hidden="true">
                <Icon name="lock" size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-medium">
                  Cette rubrique n’est pas incluse dans votre offre
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {definition?.description ??
                    'Cette fonctionnalité fait partie d’une offre supérieure.'}{' '}
                  Nous pouvons l’activer sur votre site : elle est facturée dans le cadre d’une
                  évolution de votre offre, sans refaire votre site.
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
        </>
      );
    }
  }

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </>
  );
}
