import type { Metadata } from 'next';
import { unwrapMaybe } from '@stax/database';
import { Alert, Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { SettingsForm, type SettingsGroup } from '~/components/app/settings-form';
import { getWorkspace } from '~/lib/workspace';
import { saveSeoSettingsAction } from '../actions';

export const metadata: Metadata = { title: 'Référencement' };

const GROUPS: SettingsGroup[] = [
  {
    id: 'recherche',
    title: 'Ce que Google affiche',
    description:
      'Le titre et la description apparaissent dans les résultats de recherche. Écrivez-les pour un humain : c’est ce qui décide du clic.',
    fields: [
      {
        name: 'seoTitle',
        label: 'Titre dans les résultats',
        kind: 'text',
        maxLength: 70,
        hint: 'Environ 60 caractères. Au-delà, la fin est coupée.',
        wide: true,
      },
      {
        name: 'seoDescription',
        label: 'Description dans les résultats',
        kind: 'textarea',
        maxLength: 170,
        rows: 3,
        hint: 'Environ 155 caractères. Dites ce que vous faites et où.',
        wide: true,
      },
      {
        name: 'seoKeywords',
        label: 'Mots-clés de votre activité',
        kind: 'textarea',
        rows: 2,
        wide: true,
        hint: 'Un par ligne. Ils ne sont plus utilisés par Google pour le classement, mais nous servent à structurer votre site.',
      },
    ],
  },
  {
    id: 'indexation',
    title: 'Visibilité dans les moteurs',
    fields: [
      {
        name: 'robotsIndexable',
        label: 'Autoriser l’indexation de mon site',
        kind: 'boolean',
        hint: 'Décochez uniquement si votre site ne doit pas apparaître dans les résultats de recherche.',
        wide: true,
      },
      {
        name: 'googleSiteVerification',
        label: 'Code de vérification Google Search Console',
        kind: 'text',
        maxLength: 120,
        wide: true,
        hint: 'Facultatif. Le code fourni par Google pour prouver que ce site est le vôtre.',
      },
    ],
  },
];

export default async function SeoPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canEdit = workspace.capabilities.includes('content.edit');

  const settings = site
    ? unwrapMaybe<{
        seo_title: string | null;
        seo_description: string | null;
        seo_keywords: string[] | null;
        robots_indexable: boolean;
        google_site_verification: string | null;
      }>(
        (await db
          .from('site_settings')
          .select(
            'seo_title, seo_description, seo_keywords, robots_indexable, google_site_verification',
          )
          .eq('site_id', site.id)
          .maybeSingle()) as never,
      )
    : null;

  const indexable = settings?.robots_indexable ?? true;

  return (
    <>
      <PageHeader
        title="Référencement"
        description="Comment votre site apparaît dans les moteurs de recherche. Le plan du site et les données structurées sont générés automatiquement."
      />

      {!indexable ? (
        <Alert tone="warning" className="mb-6" live="status" title="Votre site n’est pas indexable">
          Il demande actuellement aux moteurs de recherche de l’ignorer. Il reste accessible à qui
          connaît son adresse, mais n’apparaîtra dans aucun résultat.
        </Alert>
      ) : null}

      {site ? (
        <SettingsForm
          action={saveSeoSettingsAction}
          groups={GROUPS}
          values={{
            seoTitle: settings?.seo_title ?? '',
            seoDescription: settings?.seo_description ?? '',
            seoKeywords: (settings?.seo_keywords ?? []).join('\n'),
            robotsIndexable: indexable,
            googleSiteVerification: settings?.google_site_verification ?? '',
          }}
          readOnly={!canEdit}
        />
      ) : (
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé.
          </p>
        </Panel>
      )}

      <Panel level={1} padding="lg" className="mt-8">
        <h2 className="text-sm font-medium">Ce qui est fait automatiquement</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          <li>Plan du site (sitemap.xml) régénéré à chaque publication.</li>
          <li>Fichier robots.txt cohérent avec le réglage ci-dessus.</li>
          <li>
            Données structurées de votre activité, construites à partir de votre métier et de vos
            informations d’entreprise.
          </li>
          <li>Adresses canoniques, pour qu’une même page ne soit jamais comptée deux fois.</li>
          <li>Redirections conservées quand une page change d’adresse.</li>
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          Aucun prestataire sérieux ne peut garantir une position dans les résultats de recherche.
          Ce qui se construit ici, ce sont les fondations techniques : le reste dépend de votre
          contenu, de votre activité et du temps.
        </p>
      </Panel>
    </>
  );
}
