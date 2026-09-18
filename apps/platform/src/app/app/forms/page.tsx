import type { Metadata } from 'next';
import Link from 'next/link';
import { FORM_KIND_LABELS } from '@stax/business';
import { unwrapList } from '@stax/database';
import { Panel } from '@stax/ui';
import { ModulePage } from '~/components/app/module-page';
import { getWorkspace } from '~/lib/workspace';
import { FormManager, type FormView } from './form-manager';

export const metadata: Metadata = { title: 'Mes formulaires' };

const TYPE_LABELS: Record<string, string> = {
  text: 'Texte court',
  textarea: 'Texte long',
  email: 'Adresse e-mail',
  tel: 'Téléphone',
  number: 'Nombre',
  date: 'Date',
  time: 'Heure',
  datetime: 'Date et heure',
  select: 'Liste déroulante',
  multiselect: 'Choix multiples',
  radio: 'Choix unique',
  checkbox: 'Case à cocher',
  file: 'Fichier',
  hidden: 'Champ caché',
  consent: 'Case de consentement',
};

interface OptionShape {
  label?: unknown;
  value?: unknown;
}

function readOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'object' && entry !== null) {
        const option = entry as OptionShape;
        if (typeof option.label === 'string') return option.label;
        if (typeof option.value === 'string') return option.value;
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
}

export default async function FormsPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canWrite = workspace.capabilities.includes('content.edit');

  const rows = site
    ? unwrapList<{
        id: string;
        name: string;
        slug: string;
        kind: string;
        description: string | null;
        success_message: string;
        notify_emails: string[] | null;
        require_captcha: boolean;
        is_active: boolean;
        rate_limit_per_hour: number;
        form_fields: Array<{
          id: string;
          name: string;
          label: string;
          type: string;
          placeholder: string | null;
          help_text: string | null;
          is_required: boolean;
          options: unknown;
          sort_order: number;
        }> | null;
        form_submissions: Array<{ count: number }> | null;
      }>(
        (await db
          .from('forms')
          .select(
            'id, name, slug, kind, description, success_message, notify_emails, require_captcha, is_active, rate_limit_per_hour, form_fields ( id, name, label, type, placeholder, help_text, is_required, options, sort_order ), form_submissions ( count )',
          )
          .eq('site_id', site.id)
          .eq('organization_id', workspace.organization.id)
          .order('created_at', { ascending: true })
          .limit(50)) as never,
      )
    : [];

  const forms: FormView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    kindLabel: FORM_KIND_LABELS[row.kind] ?? row.kind,
    description: row.description ?? '',
    successMessage: row.success_message,
    notifyEmails: row.notify_emails ?? [],
    requireCaptcha: row.require_captcha,
    isActive: row.is_active,
    rateLimitPerHour: row.rate_limit_per_hour,
    submissionCount: row.form_submissions?.[0]?.count ?? 0,
    fields: [...(row.form_fields ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((field) => ({
        id: field.id,
        label: field.label,
        name: field.name,
        type: field.type,
        typeLabel: TYPE_LABELS[field.type] ?? field.type,
        required: field.is_required,
        placeholder: field.placeholder ?? '',
        helpText: field.help_text ?? '',
        options: readOptions(field.options),
      })),
  }));

  return (
    <ModulePage
      module="contact"
      title="Mes formulaires"
      description="Ce que vous demandez à vos visiteurs. Chaque réponse arrive dans vos messages et crée un contact."
    >
      <div className="space-y-8">
        <FormManager forms={forms} canWrite={canWrite} />

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Ce que vous demandez vous engage</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            Ne collectez que ce dont vous avez réellement besoin : chaque champ supplémentaire fait
            abandonner des visiteurs et augmente vos obligations. Pour une demande de rappel, un
            prénom et un téléphone suffisent.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Les réponses sont conservées dans votre espace et exportables à tout moment. Voir{' '}
            <Link href="/app/donnees" className="underline underline-offset-4">
              mes données
            </Link>
            .
          </p>
        </Panel>
      </div>
    </ModulePage>
  );
}
