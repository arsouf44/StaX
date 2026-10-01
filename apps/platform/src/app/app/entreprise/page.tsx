import type { Metadata } from 'next';
import { unwrapMaybe } from '@nemasus/database';
import { ButtonLink, Icon, Panel } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { SettingsForm, type SettingsGroup } from '~/components/app/settings-form';
import { getWorkspace } from '~/lib/workspace';
import { parseLegalIdentity } from '@nemasus/site-engine';
import {
  saveBusinessIdentityAction,
  saveLegalIdentityAction,
  saveSiteAlertsAction,
} from '../site/actions';

export const metadata: Metadata = { title: 'Mon entreprise' };

const GROUPS: SettingsGroup[] = [
  {
    id: 'identite',
    title: 'Ce que voient vos visiteurs',
    description:
      'Ces informations apparaissent sur votre site et dans les résultats de recherche locale. Une adresse et un téléphone exacts valent plus que n’importe quelle optimisation.',
    fields: [
      {
        name: 'businessName',
        label: 'Nom affiché',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Boulangerie Saint-Martin',
      },
      {
        name: 'tagline',
        label: 'Phrase d’accroche',
        kind: 'text',
        maxLength: 160,
        hint: 'Une ligne qui dit ce que vous faites et pour qui.',
      },
      {
        name: 'description',
        label: 'Présentation',
        kind: 'textarea',
        maxLength: 600,
        rows: 4,
        wide: true,
      },
    ],
  },
  {
    id: 'contact',
    title: 'Comment vous joindre',
    fields: [
      { name: 'email', label: 'E-mail public', kind: 'email', maxLength: 180 },
      { name: 'phone', label: 'Téléphone', kind: 'tel', maxLength: 30 },
      { name: 'addressLine1', label: 'Adresse', kind: 'text', maxLength: 120, wide: true },
      {
        name: 'addressLine2',
        label: 'Complément d’adresse',
        kind: 'text',
        maxLength: 120,
        wide: true,
      },
      { name: 'postalCode', label: 'Code postal', kind: 'text', maxLength: 12 },
      { name: 'city', label: 'Ville', kind: 'text', maxLength: 80 },
    ],
  },
  {
    id: 'reseaux',
    title: 'Vos réseaux sociaux',
    description:
      'Laissez vide ce que vous n’utilisez pas : un lien mort dessert votre crédibilité.',
    fields: [
      {
        name: 'facebook',
        label: 'Facebook',
        kind: 'text',
        maxLength: 300,
        placeholder: 'https://',
      },
      {
        name: 'instagram',
        label: 'Instagram',
        kind: 'text',
        maxLength: 300,
        placeholder: 'https://',
      },
      {
        name: 'linkedin',
        label: 'LinkedIn',
        kind: 'text',
        maxLength: 300,
        placeholder: 'https://',
      },
      { name: 'x', label: 'X', kind: 'text', maxLength: 300, placeholder: 'https://' },
      { name: 'youtube', label: 'YouTube', kind: 'text', maxLength: 300, placeholder: 'https://' },
      { name: 'tiktok', label: 'TikTok', kind: 'text', maxLength: 300, placeholder: 'https://' },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications et confidentialité',
    fields: [
      {
        name: 'notificationEmails',
        label: 'Prévenir ces adresses',
        kind: 'textarea',
        rows: 2,
        wide: true,
        hint: 'Une adresse par ligne, cinq au maximum. Elles reçoivent les messages, réservations et commandes.',
      },
      {
        name: 'cookieBannerEnabled',
        label: 'Afficher le bandeau cookies',
        kind: 'boolean',
        hint: 'Obligatoire dès qu’un traceur non essentiel est déposé. Ne le désactivez qu’en connaissance de cause.',
      },
      {
        name: 'analyticsEnabled',
        label: 'Mesurer la fréquentation',
        kind: 'boolean',
        hint: 'Mesure sans cookie ni profilage : pas d’identifiant publicitaire, pas de revente.',
      },
    ],
  },
];

/**
 * Site livré via son propre dépôt : ses textes (coordonnées, présentation,
 * mentions légales) font partie de son code et se modifient dans l'éditeur.
 * Seuls ces deux réglages s'appliquent à lui.
 */
const EXTERNAL_GROUPS: SettingsGroup[] = [
  {
    id: 'alertes',
    title: 'Être prévenu',
    description:
      'Quand un visiteur vous écrit, réserve ou commande sur votre site, vous recevez aussitôt un e-mail. Sans adresse ici, il part aux propriétaires et administrateurs de votre espace.',
    fields: [
      {
        name: 'notificationEmails',
        label: 'Prévenir ces adresses',
        kind: 'textarea',
        rows: 2,
        wide: true,
        hint: 'Une adresse par ligne, cinq au maximum.',
      },
      {
        name: 'analyticsEnabled',
        label: 'Mesurer la fréquentation',
        kind: 'boolean',
        hint: 'Mesure sans cookie ni profilage : pas d’identifiant publicitaire, pas de revente. Vos chiffres s’affichent dans « Statistiques ».',
      },
    ],
  },
];

const LEGAL_GROUPS: SettingsGroup[] = [
  {
    id: 'mentions',
    title: 'Mentions légales',
    description:
      'En tant qu’éditeur de votre site, la loi vous impose de vous identifier. Saisissez ces informations une fois : les pages « Mentions légales », « Confidentialité » et, si vous vendez en ligne, « Conditions générales de vente » les reprennent automatiquement. Les champs marqués d’un astérisque sont exigés avant la mise en ligne.',
    fields: [
      {
        name: 'legalName',
        label: 'Raison sociale ou nom',
        kind: 'text',
        required: true,
        maxLength: 160,
        hint: 'Tel qu’il figure au registre. Entrepreneur individuel : vos nom et prénom.',
      },
      {
        name: 'legalForm',
        label: 'Forme juridique',
        kind: 'text',
        required: true,
        maxLength: 80,
        placeholder: 'SAS, SARL, EI, micro-entreprise, association…',
      },
      {
        name: 'capital',
        label: 'Capital social',
        kind: 'text',
        maxLength: 40,
        hint: 'Pour une société uniquement. Exemple : 1 000 €.',
      },
      {
        name: 'registration',
        label: 'Immatriculation',
        kind: 'text',
        required: true,
        maxLength: 160,
        placeholder: 'RCS Paris 123 456 789',
        hint: 'SIREN avec la ville du RCS, ou RNE pour un artisan, ou RNA pour une association.',
      },
      {
        name: 'vatNumber',
        label: 'Numéro de TVA intracommunautaire',
        kind: 'text',
        maxLength: 40,
      },
      {
        name: 'address',
        label: 'Adresse du siège',
        kind: 'text',
        required: true,
        maxLength: 240,
        wide: true,
      },
      {
        name: 'publicationDirector',
        label: 'Directeur de la publication',
        kind: 'text',
        required: true,
        maxLength: 120,
        hint: 'La personne responsable des contenus du site : en général, le dirigeant.',
      },
      {
        name: 'privacyContact',
        label: 'Contact pour les données personnelles',
        kind: 'email',
        maxLength: 180,
        hint: 'Facultatif : à défaut, votre e-mail public est indiqué.',
      },
      {
        name: 'mediator',
        label: 'Médiateur de la consommation',
        kind: 'text',
        maxLength: 300,
        wide: true,
        hint: 'Obligatoire si vous vendez à des particuliers : nom et site internet du médiateur auquel vous adhérez.',
      },
      {
        name: 'regulatedProfession',
        label: 'Profession réglementée',
        kind: 'textarea',
        rows: 3,
        maxLength: 400,
        wide: true,
        hint: 'Seulement si votre activité est réglementée : ordre ou organisme d’inscription, titre professionnel et pays où il a été obtenu, règles professionnelles applicables.',
      },
    ],
  },
];

export default async function BusinessSettingsPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canEdit = workspace.capabilities.includes('content.edit');

  const settings = site
    ? unwrapMaybe<{
        business_name: string | null;
        tagline: string | null;
        description: string | null;
        email: string | null;
        phone: string | null;
        address_line1: string | null;
        address_line2: string | null;
        postal_code: string | null;
        city: string | null;
        social_links: Record<string, unknown> | null;
        notification_emails: string[] | null;
        cookie_banner_enabled: boolean;
        analytics_enabled: boolean;
        legal_identity: unknown;
      }>(
        (await db
          .from('site_settings')
          .select(
            'business_name, tagline, description, email, phone, address_line1, address_line2, postal_code, city, social_links, notification_emails, cookie_banner_enabled, analytics_enabled, legal_identity',
          )
          .eq('site_id', site.id)
          .maybeSingle()) as never,
      )
    : null;

  const social = settings?.social_links ?? {};
  const socialValue = (key: string) =>
    typeof social[key] === 'string' ? (social[key] as string) : '';

  const values = {
    businessName: settings?.business_name ?? workspace.organization.name,
    tagline: settings?.tagline ?? '',
    description: settings?.description ?? '',
    email: settings?.email ?? '',
    phone: settings?.phone ?? '',
    addressLine1: settings?.address_line1 ?? '',
    addressLine2: settings?.address_line2 ?? '',
    postalCode: settings?.postal_code ?? '',
    city: settings?.city ?? '',
    facebook: socialValue('facebook'),
    instagram: socialValue('instagram'),
    linkedin: socialValue('linkedin'),
    x: socialValue('x'),
    youtube: socialValue('youtube'),
    tiktok: socialValue('tiktok'),
    notificationEmails: (settings?.notification_emails ?? []).join('\n'),
    cookieBannerEnabled: settings?.cookie_banner_enabled ?? true,
    analyticsEnabled: settings?.analytics_enabled ?? true,
  };

  const identity = parseLegalIdentity(settings?.legal_identity);
  const legalValues = { ...identity };

  if (site?.architecture === 'external_repository') {
    return (
      <>
        <PageHeader
          title="Mon entreprise"
          description={`Les réglages de ${site.name} : qui est prévenu de ce qui arrive par votre site, et la mesure de sa fréquentation.`}
        />
        <Panel level={1} padding="lg" className="mb-8" data-testid="external-site-texts">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl min-w-0">
              <h2 className="text-sm font-medium">Les textes de votre site</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Coordonnées, horaires, présentation, photos : tout ce que vos visiteurs lisent se
                modifie dans « Modifier mon site », zone par zone, puis « Publier ». Vos mentions
                légales font partie de votre site : pour les changer, écrivez-nous, c’est compris
                dans la maintenance.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/app/editeur" size="sm">
                <Icon name="pencil" size={14} aria-hidden="true" />
                Modifier mon site
              </ButtonLink>
              <ButtonLink href="/app/discussion" size="sm" variant="secondary">
                Écrire à l’équipe
              </ButtonLink>
            </div>
          </div>
        </Panel>
        <SettingsForm
          action={saveSiteAlertsAction}
          groups={EXTERNAL_GROUPS}
          values={{
            notificationEmails: values.notificationEmails,
            analyticsEnabled: values.analyticsEnabled,
          }}
          readOnly={!canEdit}
          footnote="Ces réglages s’appliquent dès l’enregistrement, sans publication."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Mon entreprise"
        description="Les informations affichées sur votre site. Modifiez-les ici plutôt que page par page : elles sont reprises partout."
      />

      {site ? (
        <SettingsForm
          action={saveBusinessIdentityAction}
          groups={GROUPS}
          values={values}
          readOnly={!canEdit}
          footnote="Ces informations sont visibles dès l’enregistrement sur votre brouillon, et en ligne à la prochaine publication."
        />
      ) : (
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé. Ces réglages s’ouvriront dès sa mise en place.
          </p>
        </Panel>
      )}

      {site ? (
        <div className="mt-12" data-testid="legal-identity">
          <SettingsForm
            action={saveLegalIdentityAction}
            groups={LEGAL_GROUPS}
            values={legalValues}
            readOnly={!canEdit}
            submitLabel="Enregistrer mes mentions légales"
            footnote="Nous ne complétons jamais ces informations à votre place : elles engagent votre responsabilité d’éditeur."
          />
        </div>
      ) : null}
    </>
  );
}
