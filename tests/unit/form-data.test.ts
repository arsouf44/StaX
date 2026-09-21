import { describe, expect, it } from 'vitest';
import { formDataToObject, signUpSchema, signInSchema } from '@stax/validation';

/**
 * Champs injectes par le framework dans une action serveur.
 *
 * Ces noms sont ceux reellement observes dans le FormData d'une action Next.js.
 * Ils ne viennent d'aucun champ de formulaire : le framework les ajoute pour
 * router l'appel. Laisses en place, ils font echouer tous les schemas
 * `.strict()` du produit — c'est-a-dire l'inscription, la connexion, la
 * reinitialisation de mot de passe, l'activation, la double authentification et
 * le tunnel de commande, d'un seul coup.
 */
const FRAMEWORK_FIELDS: Array<[string, string]> = [
  ['$ACTION_ID_7f3c1e9a2b', '1'],
  ['$ACTION_REF_1', ''],
  ['$ACTION_1:0', '{"id":"7f3c","bound":"$@1"}'],
  ['$ACTION_1:1', '[{}]'],
  ['$ACTION_KEY', 'k9182'],
];

function submissionOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  // L'ordre reproduit celui d'une soumission reelle : le framework place ses
  // champs AVANT ceux du formulaire.
  for (const [key, value] of FRAMEWORK_FIELDS) formData.append(key, value);
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

describe('lecture d’un FormData d’action serveur', () => {
  it('ignore les champs internes du framework', () => {
    const parsed = formDataToObject(submissionOf({ email: 'claire@example.fr' }));

    expect(parsed).toEqual({ email: 'claire@example.fr' });
    for (const [key] of FRAMEWORK_FIELDS) {
      expect(Object.hasOwn(parsed, key), `${key} ne doit pas survivre`).toBe(false);
    }
  });

  it('laisse un schema strict valider une inscription reelle', () => {
    const result = signUpSchema.safeParse(
      formDataToObject(
        submissionOf({
          email: 'claire@example.fr',
          password: 'correct-cheval-pile-agrafe',
          firstName: 'Claire',
          lastName: 'Moreau',
          acceptTerms: 'on',
          website: '',
        }),
      ),
    );

    // Avant le correctif, ce test echouait avec « Unrecognized keys:
    // "$ACTION_REF_1"… » et l'inscription etait impossible en production.
    expect(result.success, JSON.stringify(result.error?.issues ?? [], null, 2)).toBe(true);
  });

  it('laisse un schema strict valider une connexion reelle', () => {
    const result = signInSchema.safeParse(
      formDataToObject(
        submissionOf({ email: 'claire@example.fr', password: 'correct-cheval-pile-agrafe' }),
      ),
    );

    expect(result.success, JSON.stringify(result.error?.issues ?? [], null, 2)).toBe(true);
  });

  it('refuse toujours un champ inconnu envoye par le navigateur', () => {
    // Le filtre ne doit PAS devenir une passoire : un champ inattendu qui ne
    // vient pas du framework reste refuse, c'est la protection contre
    // l'affectation de masse.
    const result = signInSchema.safeParse(
      formDataToObject(
        submissionOf({
          email: 'claire@example.fr',
          password: 'correct-cheval-pile-agrafe',
          platform_role: 'platform_owner',
        }),
      ),
    );

    expect(result.success).toBe(false);
  });

  it('conserve les valeurs multiples d’un meme champ', () => {
    const formData = submissionOf({});
    formData.append('allergens', 'gluten');
    formData.append('allergens', 'lait');

    expect(formDataToObject(formData)).toEqual({ allergens: ['gluten', 'lait'] });
  });
});
