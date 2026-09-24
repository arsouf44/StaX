import type { SiteManifest } from './manifest';

/**
 * Formulaires et modules declares par le contrat, traduits dans la forme que
 * la base attend (`public.sync_site_integrations`). A l'activation d'un
 * manifeste, StaX cree ou met a jour les formulaires du site : la messagerie
 * du client connait les champs attendus, et l'API des sites n'accepte que
 * ceux-la.
 */

export interface FormSyncField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string | null;
  help: string | null;
  options: Array<{ value: string; label: string }>;
}

export interface FormSync {
  slug: string;
  name: string;
  kind: string;
  successMessage: string | null;
  fields: FormSyncField[];
}

export interface IntegrationSync {
  forms: FormSync[];
  modules: string[];
  integration: Record<string, unknown>;
}

export function integrationsFromManifest(manifest: SiteManifest): IntegrationSync {
  const forms: FormSync[] = (manifest.forms ?? []).map((form) => ({
    slug: form.slug,
    name: form.label,
    kind: form.kind ?? 'contact',
    successMessage: form.successMessage ?? null,
    fields: form.fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      placeholder: field.placeholder ?? null,
      help: field.help ?? null,
      options: field.options ?? [],
    })),
  }));

  const modules = [...new Set(manifest.modules ?? [])].sort();
  const integration: Record<string, unknown> = {
    analytics: manifest.integrations?.analytics ?? false,
  };
  if (manifest.integrations?.customerAccounts) {
    integration['customerAccountsLoginPath'] = manifest.integrations.customerAccounts.loginPath;
  }
  if (manifest.integrations?.orderStatusPath) {
    integration['orderStatusPath'] = manifest.integrations.orderStatusPath;
  }
  return { forms, modules, integration };
}
