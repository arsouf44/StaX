'use server';

import { revalidatePath } from 'next/cache';
import { unwrapList } from '@stax/database';
import {
  fieldErrors,
  navigationSchema,
  pageSchema,
  seoSettingsSchema,
  siteSettingsSchema,
  siteThemeSchema,
  uuidSchema,
} from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace, type WorkspaceContext } from '~/lib/workspace';

/**
 * Reglages du site.
 *
 * Tous ces ecrans ecrivent dans `site_settings`, `site_themes` ou `site_pages`,
 * qui sont protegees par la meme regle : `app.site_can(site_id, 'content.edit')`.
 * L'identifiant du site vient de la session, jamais du formulaire — un
 * navigateur ne choisit pas le site qu'il modifie.
 *
 * Aucun de ces champs n'accepte de HTML ni de CSS libre. Les couleurs sont des
 * codes hexadecimaux valides, les polices viennent d'une liste fermee, les
 * liens de navigation sont des chemins internes. C'est ce qui empeche un compte
 * client d'injecter du script dans son propre site — et, par ricochet, d'en
 * faire une page de hameconnage hebergee sur notre infrastructure.
 */

interface SiteContext extends WorkspaceContext {
  siteId: string;
}

type SiteGate = { ok: true; value: SiteContext } | { ok: false; state: ActionState };

async function requireSiteEditor(): Promise<SiteGate> {
  const context = await getWorkspace();

  if (!context.workspace.capabilities.includes('content.edit')) {
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'Votre rôle ne permet pas de modifier les réglages du site. Demandez à un propriétaire de votre organisation de vous l’ouvrir.',
      },
    };
  }

  const site = context.workspace.currentSite;
  if (!site) {
    return {
      ok: false,
      state: { status: 'error', message: 'Aucun site n’est encore rattaché à votre compte.' },
    };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { ok: false, state: { status: 'error', message: guard.message } };

  return { ok: true, value: { ...context, siteId: site.id } };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optional(formData: FormData, key: string): string | undefined {
  const value = text(formData, key);
  return value === '' ? undefined : value;
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

/** Liste saisie librement : une entree par ligne ou separee par des virgules. */
function lines(formData: FormData, key: string, max: number): string[] {
  const value = formData.get(key);
  if (typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split(/[\n,;]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ].slice(0, max);
}

const SAVED: ActionState = { status: 'success', message: 'Modifications enregistrées.' };

function failure(message = 'L’enregistrement a échoué. Réessayez dans un instant.'): ActionState {
  return { status: 'error', message };
}

/* --- Identite de l'entreprise -------------------------------------------- */

export async function saveBusinessIdentityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const parsed = siteSettingsSchema.safeParse({
    businessName: text(formData, 'businessName'),
    tagline: optional(formData, 'tagline'),
    description: optional(formData, 'description'),
    email: text(formData, 'email'),
    phone: optional(formData, 'phone'),
    addressLine1: optional(formData, 'addressLine1'),
    addressLine2: optional(formData, 'addressLine2'),
    postalCode: optional(formData, 'postalCode'),
    city: optional(formData, 'city'),
    country: text(formData, 'country') || 'FR',
    socialLinks: {
      facebook: text(formData, 'facebook'),
      instagram: text(formData, 'instagram'),
      linkedin: text(formData, 'linkedin'),
      x: text(formData, 'x'),
      youtube: text(formData, 'youtube'),
      tiktok: text(formData, 'tiktok'),
    },
    notificationEmails: lines(formData, 'notificationEmails', 5).map((entry) =>
      entry.toLowerCase(),
    ),
    cookieBannerEnabled: checkbox(formData, 'cookieBannerEnabled'),
    analyticsEnabled: checkbox(formData, 'analyticsEnabled'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certaines informations doivent être corrigées.',
      errors: fieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const { error } = await gate.value.db.from('site_settings').upsert(
    {
      site_id: gate.value.siteId,
      business_name: data.businessName,
      tagline: data.tagline ?? null,
      description: data.description ?? null,
      email: data.email || null,
      phone: data.phone ?? null,
      address_line1: data.addressLine1 ?? null,
      address_line2: data.addressLine2 ?? null,
      postal_code: data.postalCode ?? null,
      city: data.city ?? null,
      country: data.country,
      social_links: Object.fromEntries(
        Object.entries(data.socialLinks).filter(([, value]) => Boolean(value)),
      ),
      notification_emails: data.notificationEmails,
      cookie_banner_enabled: data.cookieBannerEnabled,
      analytics_enabled: data.analyticsEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'site_id' },
  );

  if (error) return failure();

  revalidatePath('/app/entreprise');
  return SAVED;
}

/* --- Referencement -------------------------------------------------------- */

export async function saveSeoSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const parsed = seoSettingsSchema.safeParse({
    seoTitle: optional(formData, 'seoTitle'),
    seoDescription: optional(formData, 'seoDescription'),
    seoKeywords: lines(formData, 'seoKeywords', 12),
    robotsIndexable: checkbox(formData, 'robotsIndexable'),
    googleSiteVerification: text(formData, 'googleSiteVerification'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certaines informations doivent être corrigées.',
      errors: fieldErrors(parsed.error),
    };
  }

  const { error } = await gate.value.db.from('site_settings').upsert(
    {
      site_id: gate.value.siteId,
      seo_title: parsed.data.seoTitle ?? null,
      seo_description: parsed.data.seoDescription ?? null,
      seo_keywords: parsed.data.seoKeywords,
      robots_indexable: parsed.data.robotsIndexable,
      google_site_verification: parsed.data.googleSiteVerification || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'site_id' },
  );

  if (error) return failure();

  revalidatePath('/app/site/referencement');
  return parsed.data.robotsIndexable
    ? SAVED
    : {
        status: 'success',
        message:
          'Enregistré. Attention : votre site demande maintenant aux moteurs de recherche de ne pas l’indexer.',
      };
}

/* --- Apparence ------------------------------------------------------------ */

export async function saveThemeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const tokens: Record<string, string> = {};
  for (const key of ['accent', 'background', 'foreground', 'surface'] as const) {
    const value = text(formData, key);
    if (value) tokens[key] = value;
  }
  for (const key of ['radius', 'density', 'buttonStyle', 'headingScale'] as const) {
    const value = text(formData, key);
    if (value) tokens[key] = value;
  }

  const parsed = siteThemeSchema.safeParse({
    preset: text(formData, 'preset'),
    fontHeading: text(formData, 'fontHeading'),
    fontBody: text(formData, 'fontBody'),
    tokens,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Vérifiez les couleurs saisies : elles doivent être au format #1A1A1A.',
      errors: fieldErrors(parsed.error),
    };
  }

  const { error } = await gate.value.db.from('site_themes').upsert(
    {
      site_id: gate.value.siteId,
      preset: parsed.data.preset,
      font_heading: parsed.data.fontHeading,
      font_body: parsed.data.fontBody,
      tokens: parsed.data.tokens,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'site_id' },
  );

  if (error) return failure();

  revalidatePath('/app/site/apparence');
  return {
    status: 'success',
    message: 'Apparence enregistrée. Publiez votre site pour que vos visiteurs la voient.',
  };
}

/* --- Navigation ----------------------------------------------------------- */

/** Menu saisi ligne par ligne : « Libellé | /chemin ». */
function readMenu(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  if (typeof value !== 'string') return [];

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, max)
    .map((line) => {
      const separator = line.lastIndexOf('|');
      if (separator < 0) return { label: line, path: '/' };
      return {
        label: line.slice(0, separator).trim(),
        path: line.slice(separator + 1).trim(),
      };
    });
}

export async function saveNavigationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const parsed = navigationSchema.safeParse({
    primary: readMenu(formData, 'primary', 10),
    footer: readMenu(formData, 'footer', 20),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Chaque ligne doit s’écrire « Libellé | /chemin », et le chemin doit commencer par une barre oblique.',
      errors: fieldErrors(parsed.error),
    };
  }

  const { error } = await gate.value.db.from('site_settings').upsert(
    {
      site_id: gate.value.siteId,
      navigation: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'site_id' },
  );

  if (error) return failure();

  revalidatePath('/app/site/navigation');
  return SAVED;
}

/* --- Pages ---------------------------------------------------------------- */

export async function savePageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const parsed = pageSchema.safeParse({
    title: text(formData, 'title'),
    path: text(formData, 'path'),
    kind: text(formData, 'kind') || 'standard',
    seoTitle: optional(formData, 'seoTitle'),
    seoDescription: optional(formData, 'seoDescription'),
    robotsIndexable: checkbox(formData, 'robotsIndexable'),
    showInNav: checkbox(formData, 'showInNav'),
    isPublished: checkbox(formData, 'isPublished'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Vérifiez le titre et l’adresse de la page. Une adresse s’écrit « /contact » : minuscules, sans accent ni espace.',
      errors: fieldErrors(parsed.error),
    };
  }

  const row = {
    title: parsed.data.title,
    path: parsed.data.path,
    seo_title: parsed.data.seoTitle ?? null,
    seo_description: parsed.data.seoDescription ?? null,
    robots_indexable: parsed.data.robotsIndexable,
    is_visible_in_nav: parsed.data.showInNav,
    is_published: parsed.data.isPublished,
    updated_at: new Date().toISOString(),
  };

  const rawId = formData.get('pageId');
  const pageId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;

  const siblings = unwrapList<{ id: string; path: string; sort_order: number; kind: string }>(
    (await gate.value.db
      .from('site_pages')
      .select('id, path, sort_order, kind')
      .eq('site_id', gate.value.siteId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })) as never,
  );

  const clash = siblings.find((page) => page.path === parsed.data.path && page.id !== pageId);
  if (clash) {
    return {
      status: 'error',
      message: 'Une autre page utilise déjà cette adresse. Choisissez-en une autre.',
      errors: { path: ['Adresse déjà utilisée.'] },
    };
  }

  if (pageId) {
    if (!uuidSchema.safeParse(pageId).success) return failure('Cette page est introuvable.');

    const existing = siblings.find((page) => page.id === pageId);
    if (!existing) return failure('Cette page est introuvable.');

    // La page d'accueil reste a la racine : la deplacer casserait toutes les
    // adresses partagees et le referencement du site.
    if (existing.kind === 'home' && parsed.data.path !== '/') {
      return {
        status: 'error',
        message: 'La page d’accueil doit rester à l’adresse « / ».',
        errors: { path: ['La page d’accueil ne peut pas être déplacée.'] },
      };
    }

    if (existing.kind === 'home' && !parsed.data.isPublished) {
      return {
        status: 'error',
        message: 'La page d’accueil ne peut pas être dépubliée : votre site n’aurait plus de page.',
      };
    }

    const { error } = await gate.value.db
      .from('site_pages')
      .update(row)
      .eq('id', pageId)
      .eq('site_id', gate.value.siteId);

    if (error) return failure();

    revalidatePath('/app/site/pages');
    return SAVED;
  }

  if (siblings.length >= 100) {
    return failure('Votre site a atteint le nombre maximum de pages.');
  }

  const { error } = await gate.value.db.from('site_pages').insert({
    ...row,
    site_id: gate.value.siteId,
    kind: parsed.data.kind === 'home' ? 'standard' : parsed.data.kind,
    locale: parsed.data.locale,
    sort_order: (siblings.at(-1)?.sort_order ?? 0) + 10,
  });

  if (error) return failure('Cette page n’a pas pu être créée.');

  revalidatePath('/app/site/pages');
  return { status: 'success', message: 'Page créée. Ajoutez-y du contenu depuis l’éditeur.' };
}

/**
 * « Supprimer une page » la place dans la corbeille : son contenu est
 * conserve, elle se restaure d un clic. La page d accueil ne peut pas partir.
 */
export async function deletePageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const pageId = formData.get('pageId');
  if (typeof pageId !== 'string' || !uuidSchema.safeParse(pageId).success) {
    return failure('Cette page est introuvable.');
  }

  const { error } = await gate.value.db.rpc('trash_page', { p_page: pageId });
  if (error) {
    return failure(
      error.message.includes('accueil')
        ? 'La page d’accueil ne peut pas être supprimée.'
        : 'Cette page n’a pas pu être supprimée.',
    );
  }

  revalidatePath('/app/site/pages');
  revalidatePath('/app/editeur');
  return {
    status: 'success',
    message:
      'Page placée dans la corbeille. Votre site en ligne ne change qu’à la prochaine publication, et vous pouvez la restaurer à tout moment.',
  };
}

export async function restorePageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireSiteEditor();
  if (!gate.ok) return gate.state;

  const pageId = formData.get('pageId');
  if (typeof pageId !== 'string' || !uuidSchema.safeParse(pageId).success) {
    return failure('Cette page est introuvable.');
  }

  const { data, error } = await gate.value.db.rpc('restore_page', { p_page: pageId });
  if (error) {
    return failure(
      error.message.includes('Limite')
        ? 'Votre offre a atteint son nombre de pages. Supprimez-en une autre avant de restaurer celle-ci.'
        : 'Cette page n’a pas pu être restaurée.',
    );
  }

  const result = (data ?? {}) as { renamed?: boolean; path?: string };
  revalidatePath('/app/site/pages');
  revalidatePath('/app/editeur');
  return {
    status: 'success',
    message: result.renamed
      ? `Page restaurée à l’adresse ${result.path ?? ''} (l’ancienne était déjà prise).`
      : 'Page restaurée.',
  };
}
