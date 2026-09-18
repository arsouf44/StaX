import type { Metadata } from 'next';
import { unwrapMaybe } from '@stax/database';
import { Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { SettingsForm, type SettingsGroup } from '~/components/app/settings-form';
import { getWorkspace } from '~/lib/workspace';
import { saveThemeAction } from '../actions';

export const metadata: Metadata = { title: 'Apparence' };

const FONT_OPTIONS = [
  { value: 'geist', label: 'Geist — neutre et moderne' },
  { value: 'inter', label: 'Inter — très lisible à petite taille' },
  { value: 'sora', label: 'Sora — géométrique et affirmée' },
  { value: 'fraunces', label: 'Fraunces — élégante, à empattements' },
  { value: 'instrument-serif', label: 'Instrument Serif — éditoriale' },
  { value: 'ibm-plex-sans', label: 'IBM Plex Sans — technique et sobre' },
];

const GROUPS: SettingsGroup[] = [
  {
    id: 'ambiance',
    title: 'Ambiance générale',
    description:
      'Un préréglage choisit un ensemble cohérent de couleurs et de contrastes. Vous pouvez ensuite ajuster ce qui compte pour vous.',
    fields: [
      {
        name: 'preset',
        label: 'Préréglage',
        kind: 'select',
        required: true,
        options: [
          { value: 'graphite', label: 'Graphite — noir profond, très contrasté' },
          { value: 'slate', label: 'Ardoise — gris froid, sobre' },
          { value: 'nocturne', label: 'Nocturne — bleu nuit' },
          { value: 'ember', label: 'Braise — chaleureux, terracotta' },
          { value: 'lumen', label: 'Lumen — clair, lumineux' },
          { value: 'forest', label: 'Forêt — vert profond' },
        ],
        wide: true,
      },
      {
        name: 'accent',
        label: 'Couleur principale',
        kind: 'text',
        maxLength: 7,
        placeholder: '#1A1A1A',
        hint: 'Code hexadécimal. Laissez vide pour garder celle du préréglage.',
      },
      {
        name: 'background',
        label: 'Couleur de fond',
        kind: 'text',
        maxLength: 7,
        placeholder: '#0A0A0A',
      },
    ],
  },
  {
    id: 'typographie',
    title: 'Typographie',
    description:
      'Deux polices suffisent. Les polices proposées sont hébergées avec votre site : aucune requête vers un service tiers, aucun suivi de vos visiteurs.',
    fields: [
      {
        name: 'fontHeading',
        label: 'Police des titres',
        kind: 'select',
        required: true,
        options: FONT_OPTIONS,
      },
      {
        name: 'fontBody',
        label: 'Police du texte',
        kind: 'select',
        required: true,
        options: FONT_OPTIONS,
      },
      {
        name: 'headingScale',
        label: 'Impact des titres',
        kind: 'select',
        options: [
          { value: 'subtle', label: 'Discret' },
          { value: 'balanced', label: 'Équilibré' },
          { value: 'dramatic', label: 'Spectaculaire' },
        ],
      },
    ],
  },
  {
    id: 'formes',
    title: 'Formes et espacements',
    fields: [
      {
        name: 'radius',
        label: 'Arrondi des angles',
        kind: 'select',
        options: [
          { value: 'none', label: 'Angles droits' },
          { value: 'sm', label: 'Légèrement arrondis' },
          { value: 'md', label: 'Arrondis' },
          { value: 'lg', label: 'Très arrondis' },
          { value: 'full', label: 'Complètement arrondis' },
        ],
      },
      {
        name: 'density',
        label: 'Densité',
        kind: 'select',
        options: [
          { value: 'compact', label: 'Compacte' },
          { value: 'comfortable', label: 'Confortable' },
          { value: 'spacious', label: 'Aérée' },
        ],
      },
      {
        name: 'buttonStyle',
        label: 'Style des boutons',
        kind: 'select',
        options: [
          { value: 'solid', label: 'Plein' },
          { value: 'outline', label: 'Contour' },
          { value: 'soft', label: 'Teinté' },
          { value: 'pill', label: 'Pilule' },
        ],
      },
    ],
  },
];

export default async function AppearancePage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canEdit = workspace.capabilities.includes('content.edit');

  const theme = site
    ? unwrapMaybe<{
        preset: string;
        font_heading: string;
        font_body: string;
        tokens: Record<string, unknown> | null;
      }>(
        (await db
          .from('site_themes')
          .select('preset, font_heading, font_body, tokens')
          .eq('site_id', site.id)
          .maybeSingle()) as never,
      )
    : null;

  const tokens = theme?.tokens ?? {};
  const token = (key: string) => (typeof tokens[key] === 'string' ? (tokens[key] as string) : '');

  return (
    <>
      <PageHeader
        title="Apparence"
        description="Les couleurs, les polices et les formes de votre site. Chaque combinaison possible ici respecte les contrastes nécessaires à la lisibilité."
      />

      {site ? (
        <SettingsForm
          action={saveThemeAction}
          groups={GROUPS}
          values={{
            preset: theme?.preset ?? 'graphite',
            fontHeading: theme?.font_heading ?? 'geist',
            fontBody: theme?.font_body ?? 'geist',
            accent: token('accent'),
            background: token('background'),
            radius: token('radius'),
            density: token('density'),
            buttonStyle: token('buttonStyle'),
            headingScale: token('headingScale'),
          }}
          readOnly={!canEdit}
          footnote="Les changements s’appliquent à votre brouillon. Publiez votre site pour les rendre visibles."
        />
      ) : (
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé.
          </p>
        </Panel>
      )}

      <Panel level={1} padding="lg" className="mt-8">
        <h2 className="text-sm font-medium">Pourquoi si peu de réglages ?</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Parce qu’un site professionnel ne se règle pas pixel par pixel. Ce qui est proposé ici a
          été vérifié : contrastes suffisants pour les personnes malvoyantes, tailles lisibles sur
          téléphone, polices qui se chargent vite. Un réglage libre permettrait de casser tout cela
          en trois clics.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          Besoin d’une identité visuelle sur mesure — logo, palette propre, mise en page
          particulière ? C’est le champ d’un projet sur devis.
        </p>
      </Panel>
    </>
  );
}
