'use server';

import type { ActionState } from '~/lib/form-state';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getBusiness, listBusinessesBySector } from '@stax/business';
import { formDataToObject, hostnameSchema, slugSchema } from '@stax/validation';
import { writeOrderDraft } from '~/lib/order-draft';

/**
 * Etapes du parcours d achat.
 *
 * Aucune de ces actions n ecrit en base et aucune ne manipule de prix : elles
 * enregistrent des CHOIX dans un brouillon signe. Le prix est calcule par la
 * base au moment de creer la commande, a partir du catalogue — jamais a partir
 * de ce que le navigateur a envoye.
 */

export type StepState = ActionState;

const planSchema = z.object({ planSlug: slugSchema }).strict();

export async function choosePlanAction(
  _previous: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = planSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { status: 'error', message: 'Choisissez une offre pour continuer.' };
  }
  await writeOrderDraft({ planSlug: parsed.data.planSlug });
  redirect('/commander/metier');
}

const businessSchema = z
  .object({ sectorSlug: slugSchema, businessTypeSlug: slugSchema })
  .strict()
  .refine(
    (data) => {
      const business = getBusiness(data.businessTypeSlug);
      // Le metier doit reellement appartenir au secteur annonce : sans ce
      // controle, un formulaire modifie pourrait activer des modules d un
      // autre secteur.
      return business !== undefined && business.sector === data.sectorSlug;
    },
    { message: 'Ce métier ne correspond pas au secteur choisi.', path: ['businessTypeSlug'] },
  );

export async function chooseBusinessAction(
  _previous: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = businessSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Choisissez votre secteur puis votre métier.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  await writeOrderDraft({
    sectorSlug: parsed.data.sectorSlug,
    businessTypeSlug: parsed.data.businessTypeSlug,
  });
  redirect('/commander/informations');
}

const informationSchema = z
  .object({
    organizationName: z.string().trim().min(2, 'Indiquez le nom de votre entreprise.').max(120),
    contactEmail: z.string().trim().email('Adresse e-mail invalide.').max(200),
    contactPhone: z.string().trim().max(40).optional().or(z.literal('')),
    city: z.string().trim().max(120).optional().or(z.literal('')),
    customerNotes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .passthrough();

export async function saveInformationAction(
  _previous: StepState,
  formData: FormData,
): Promise<StepState> {
  const raw = formDataToObject(formData);
  const parsed = informationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Les reponses du questionnaire metier sont prefixees `q_` dans le
  // formulaire : on les extrait sans jamais accepter de cle inattendue.
  const answers: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('q_')) continue;
    const id = key.slice(2);
    if (id.length === 0 || id.length > 60) continue;
    if (typeof value === 'string') answers[id] = value.slice(0, 2000);
  }

  await writeOrderDraft({
    organizationName: parsed.data.organizationName,
    contactEmail: parsed.data.contactEmail,
    contactPhone: parsed.data.contactPhone || undefined,
    city: parsed.data.city || undefined,
    customerNotes: parsed.data.customerNotes || undefined,
    answers,
  });
  redirect('/commander/adresse');
}

const domainSchema = z
  .object({
    domainHandling: z.enum(['customer_owned', 'stax_purchase', 'subdomain_only']),
    domainHostname: z.string().trim().max(253).optional().or(z.literal('')),
    subdomain: z.string().trim().max(63).optional().or(z.literal('')),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.domainHandling === 'subdomain_only') {
      const parsed = slugSchema.safeParse(data.subdomain ?? '');
      if (!parsed.success) {
        context.addIssue({
          code: 'custom',
          path: ['subdomain'],
          message: 'Choisissez l’adresse de votre site (lettres, chiffres et tirets).',
        });
      }
      return;
    }
    const parsed = hostnameSchema.safeParse(data.domainHostname ?? '');
    if (!parsed.success) {
      context.addIssue({
        code: 'custom',
        path: ['domainHostname'],
        message: 'Indiquez un nom de domaine valide, par exemple mon-entreprise.fr',
      });
    }
  });

export async function saveDomainAction(
  _previous: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = domainSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Vérifiez l’adresse souhaitée.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  await writeOrderDraft({
    domainHandling: parsed.data.domainHandling,
    domainHostname: parsed.data.domainHostname || undefined,
    subdomain: parsed.data.subdomain || undefined,
  });
  redirect('/commander/recapitulatif');
}

/** Metiers d un secteur, pour le second niveau de choix. */
export async function businessesForSector(sectorSlug: string) {
  return listBusinessesBySector(sectorSlug).map((business) => ({
    id: business.id,
    name: business.name,
    icon: business.icon,
  }));
}
