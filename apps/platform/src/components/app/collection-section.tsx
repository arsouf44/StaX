import { formatMoney } from '@stax/payments';
import { featureAccess, loadFeatureSnapshot, unwrapList } from '@stax/database';
import { toFormValues } from '~/lib/collection-io';
import { getCollection, type CollectionDescriptor, type CollectionId } from '~/lib/collections';
import { getWorkspace } from '~/lib/workspace';
import { CollectionManager, type CollectionRow } from './collection-manager';
import type { ClientField } from './form-fields';

/**
 * Chargement serveur d'une collection.
 *
 * La lecture passe par le client Supabase porteur du JWT : la RLS decide seule
 * de ce qui remonte. Aucun filtre applicatif n'est la pour « proteger » quoi
 * que ce soit — ils ne servent qu'a ne pas rapatrier des lignes inutiles.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR');

function selectColumns(descriptor: CollectionDescriptor): string {
  const columns = new Set<string>(['id']);
  for (const field of descriptor.fields) {
    columns.add(
      field.column.includes('.') ? (field.column.split('.')[0] ?? 'attributes') : field.column,
    );
  }
  if (descriptor.sortColumn) columns.add(descriptor.sortColumn);
  if (descriptor.visibilityColumn) columns.add(descriptor.visibilityColumn);
  return [...columns].join(', ');
}

function toClientFields(descriptor: CollectionDescriptor): ClientField[] {
  return descriptor.fields.map((field) => ({
    name: field.name,
    label: field.label,
    kind: field.kind,
    hint: field.hint,
    placeholder: field.placeholder,
    required: field.required,
    min: field.min,
    max: field.max,
    step: field.step,
    maxLength: field.maxLength,
    rows: field.rows,
    inList: field.inList,
    wide: field.wide,
    options: field.options ? field.options.map((entry) => ({ ...entry })) : undefined,
  }));
}

export async function CollectionSection({ collection }: { collection: CollectionId }) {
  const descriptor = getCollection(collection);
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  if (!site) return null;

  const canWrite = workspace.capabilities.includes(descriptor.writeCapability);

  let query = db.from(descriptor.table).select(selectColumns(descriptor));
  if (descriptor.scope === 'org') {
    query = query.eq('organization_id', workspace.organization.id);
  } else {
    query = query.eq('site_id', site.id);
    if (descriptor.scope === 'site+org') {
      query = query.eq('organization_id', workspace.organization.id);
    }
  }
  for (const [column, value] of Object.entries(descriptor.fixed ?? {})) {
    query = query.eq(column, value);
  }
  for (const rule of descriptor.order) {
    query = query.order(rule.column, { ascending: rule.ascending });
  }

  const rows = unwrapList<Record<string, unknown>>((await query.limit(500)) as never);

  // Listes deroulantes alimentees par les tables liees (rayons, sections,
  // prestations reservables…). Elles sont lues avec le meme jeton : une option
  // affichee est forcement une ligne que la personne a le droit de voir.
  const fields = toClientFields(descriptor);
  const referenceLabels = new Map<string, Map<string, string>>();

  await Promise.all(
    descriptor.fields
      .filter((field) => field.kind === 'reference' && field.reference)
      .map(async (field) => {
        const reference = field.reference;
        if (!reference) return;

        let lookup = db
          .from(reference.table)
          .select(`id, ${reference.labelColumn}`)
          .eq('site_id', site.id);
        if (reference.orderColumn) {
          lookup = lookup.order(reference.orderColumn, { ascending: true });
        }

        const options = unwrapList<Record<string, string>>((await lookup.limit(300)) as never);
        const labels = new Map<string, string>();
        const clientField = fields.find((entry) => entry.name === field.name);
        if (clientField) clientField.options = [];

        for (const row of options) {
          const id = String(row.id);
          const label = String(row[reference.labelColumn] ?? '—');
          labels.set(id, label);
          clientField?.options?.push({ value: id, label });
        }

        referenceLabels.set(field.name, labels);
      }),
  );

  const managerRows: CollectionRow[] = rows.map((row) => {
    const form = toFormValues(descriptor, row);
    const display: Record<string, string> = {};

    for (const field of descriptor.fields) {
      if (!field.inList) continue;
      const value = form[field.name];

      if (field.kind === 'boolean') {
        display[field.name] = value === true ? 'Oui' : 'Non';
        continue;
      }

      if (Array.isArray(value)) {
        const labels = field.options ?? [];
        display[field.name] = value
          .map((entry) => labels.find((choice) => choice.value === entry)?.label ?? entry)
          .join(', ');
        continue;
      }

      const text = typeof value === 'string' ? value : '';
      if (text === '') {
        display[field.name] = '';
        continue;
      }

      if (field.kind === 'money') {
        const cents = row[field.column];
        display[field.name] =
          typeof cents === 'number'
            ? formatMoney(cents, 'EUR', { hideDecimalsWhenRound: true })
            : '';
        continue;
      }

      if (field.kind === 'reference') {
        display[field.name] = referenceLabels.get(field.name)?.get(text) ?? '—';
        continue;
      }

      if (field.kind === 'select') {
        display[field.name] = field.options?.find((choice) => choice.value === text)?.label ?? text;
        continue;
      }

      if (field.kind === 'date') {
        display[field.name] = DATE_FORMAT.format(new Date(`${text}T12:00:00Z`));
        continue;
      }

      if (field.kind === 'number') {
        const parsed = Number(text);
        display[field.name] = Number.isFinite(parsed) ? NUMBER_FORMAT.format(parsed) : text;
        continue;
      }

      display[field.name] = text;
    }

    return {
      id: String(row.id),
      display,
      form,
      visible: descriptor.visibilityColumn ? row[descriptor.visibilityColumn] === true : null,
    };
  });

  // Quota d'offre : on annonce la limite AVANT que la personne ne remplisse un
  // formulaire pour rien.
  let quotaNotice: string | null = null;
  let addBlockedReason: string | null = null;

  if (descriptor.limitKey) {
    const access = featureAccess(await loadFeatureSnapshot(db, workspace.organization.id));
    const limit = access.limit(descriptor.limitKey);
    if (limit !== null) {
      const used = rows.length;
      if (used >= limit) {
        addBlockedReason = `Votre offre inclut ${limit} ${descriptor.title.toLowerCase()} au maximum. Changez d’offre pour en ajouter davantage.`;
        quotaNotice = addBlockedReason;
      } else if (used >= limit - 2) {
        quotaNotice = `${used} sur ${limit} utilisés dans votre offre.`;
      }
    }
  }

  // Un plat sans section n'a nulle part ou aller : on le dit plutot que de
  // laisser la personne buter sur une liste deroulante vide.
  for (const field of descriptor.fields) {
    if (field.kind !== 'reference' || !field.required) continue;
    const options = fields.find((entry) => entry.name === field.name)?.options ?? [];
    if (options.length === 0) {
      addBlockedReason = `Créez d’abord au moins une entrée dans « ${field.label} ».`;
    }
  }

  return (
    <CollectionManager
      collection={descriptor.id}
      title={descriptor.title}
      description={descriptor.description}
      icon={descriptor.icon}
      singular={descriptor.singular}
      addLabel={descriptor.addLabel}
      emptyTitle={descriptor.emptyTitle}
      emptyDescription={descriptor.emptyDescription}
      fields={fields}
      rows={managerRows}
      canWrite={canWrite}
      sortable={Boolean(descriptor.sortColumn) && canWrite}
      hasVisibility={Boolean(descriptor.visibilityColumn)}
      quotaNotice={quotaNotice}
      addBlockedReason={addBlockedReason}
    />
  );
}
