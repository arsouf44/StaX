import { describe, expect, it } from 'vitest';
import {
  contactFormSchema,
  optionalFromForm,
  phoneSchema,
  profileSchema,
  quoteBriefSchema,
  signUpSchema,
} from '@stax/validation';

/**
 * Les champs facultatifs d'un formulaire HTML.
 *
 * Un `<input>` ou un `<select>` laisse vide n'envoie pas « rien » : il envoie
 * une chaine vide. `.optional()` ne s'applique donc jamais, et le schema
 * sous-jacent rejette `''`.
 *
 * Ce defaut a bloque la creation de compte : le champ telephone etait marque
 * « facultatif », et le laisser vide — ce que fait la majorite des gens —
 * renvoyait « Numero de telephone trop court ». Le formulaire de devis avait
 * le meme defaut sur ses deux listes deroulantes, dont le choix PAR DEFAUT
 * envoie `''`.
 *
 * Ces tests soumettent chaque formulaire comme le ferait un navigateur : tous
 * les champs facultatifs presents, et vides.
 */

describe('optionalFromForm', () => {
  const schema = optionalFromForm(phoneSchema);

  it('traite la chaine vide comme un champ absent', () => {
    expect(schema.parse('')).toBeUndefined();
  });

  it('traite une chaine d espaces comme un champ absent', () => {
    expect(schema.parse('   ')).toBeUndefined();
  });

  it('valide normalement une valeur reellement saisie', () => {
    expect(schema.parse('06 12 34 56 78')).toBe('06 12 34 56 78');
  });

  it('refuse toujours une valeur saisie mais invalide', () => {
    expect(schema.safeParse('123').success).toBe(false);
  });

  it('accepte un champ reellement absent', () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });
});

describe('inscription — telephone laisse vide', () => {
  const base = {
    firstName: 'Camille',
    lastName: 'Martin',
    email: 'camille.martin@exemple.fr',
    password: 'phrase-de-passe-solide-2026',
    acceptTerms: 'on',
    marketingOptIn: '',
    website: '',
  };

  it('accepte le formulaire tel que le navigateur l envoie, telephone vide', () => {
    const parsed = signUpSchema.safeParse({ ...base, phone: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBeUndefined();
  });

  it('accepte un telephone reellement saisi', () => {
    const parsed = signUpSchema.safeParse({ ...base, phone: '06 12 34 56 78' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBe('06 12 34 56 78');
  });

  it('refuse toujours un telephone saisi mais invalide', () => {
    const parsed = signUpSchema.safeParse({ ...base, phone: '123' });
    expect(parsed.success).toBe(false);
  });
});

describe('devis — les listes deroulantes laissees sur leur choix par defaut', () => {
  const base = {
    contactName: 'Camille Martin',
    contactEmail: 'camille.martin@exemple.fr',
    contactPhone: '',
    companyName: '',
    objective: 'Nous voulons un site qui presente notre activite et recoive des demandes.',
    pageCountRange: '6-15',
    features: [],
    integrations: '',
    hasContent: 'partial',
    hasDomain: 'no',
    deadline: '3months',
    budgetRange: '1k_3k',
    comments: '',
    acceptPrivacy: true,
    website: '',
  };

  it('accepte « Je prefere l expliquer plus bas » sur les deux listes', () => {
    const parsed = quoteBriefSchema.safeParse({
      ...base,
      sectorSlug: '',
      businessTypeSlug: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sectorSlug).toBeUndefined();
      expect(parsed.data.businessTypeSlug).toBeUndefined();
    }
  });

  it('accepte un secteur reellement choisi', () => {
    const parsed = quoteBriefSchema.safeParse({
      ...base,
      sectorSlug: 'restauration',
      businessTypeSlug: 'restaurant',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sectorSlug).toBe('restauration');
  });
});

describe('les autres formulaires publics acceptent leurs champs facultatifs vides', () => {
  it('profil : telephone vide', () => {
    const parsed = profileSchema.safeParse({
      firstName: 'Camille',
      lastName: 'Martin',
      phone: '',
      locale: 'fr',
      timezone: 'Europe/Paris',
      marketingOptIn: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('contact : tous les champs facultatifs vides', () => {
    const parsed = contactFormSchema.safeParse({
      name: 'Camille Martin',
      email: 'camille.martin@exemple.fr',
      phone: '',
      company: '',
      subject: 'sales',
      message: 'Bonjour, je souhaite comprendre ce que comprend la maintenance annuelle.',
      acceptPrivacy: true,
      website: '',
      elapsedMs: '',
    });
    expect(parsed.success).toBe(true);
  });
});
