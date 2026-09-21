/**
 * Verification des identifiants d'entreprise francais.
 *
 * Un SIREN, un SIRET et un numero de TVA intracommunautaire portent chacun une
 * cle de controle. Une coquille de saisie — deux chiffres intervertis dans un
 * secret de deploiement — produit un identifiant qui a l'air normal mais qui
 * est faux. Il finirait sur les mentions legales, sur chaque facture, et sur
 * chaque site client.
 *
 * Ces fonctions ne disent PAS qu'une entreprise existe : seules les bases de
 * l'INSEE le disent. Elles disent que l'identifiant est bien forme. C'est la
 * seule verification qu'un programme puisse honnetement faire hors ligne, et
 * elle attrape la faute la plus probable.
 */

/** Retire espaces, points et insecables d'un identifiant saisi a la main. */
export function normalizeIdentifier(input: string): string {
  return input.replace(/[\s.\u00a0\u202f-]/g, '');
}

/**
 * Cle de Luhn, dans la variante utilisee par l'INSEE.
 *
 * SIREN (9 chiffres) : on double les rangs pairs en partant de la gauche.
 * SIRET (14 chiffres) : on double les rangs impairs. Les deux reviennent a
 * doubler un chiffre sur deux en partant de la DROITE, ce qui est la forme
 * canonique de l'algorithme.
 */
function luhnSumValid(digits: string): boolean {
  let total = 0;
  let double = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const character = digits[index];
    if (character === undefined) return false;

    let value = character.charCodeAt(0) - 48;
    if (value < 0 || value > 9) return false;

    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }

    total += value;
    double = !double;
  }

  return total % 10 === 0;
}

export function isValidSiren(input: string): boolean {
  const digits = normalizeIdentifier(input);
  if (!/^\d{9}$/.test(digits)) return false;
  return luhnSumValid(digits);
}

/**
 * SIRET : SIREN + NIC de cinq chiffres.
 *
 * Le siege social de La Poste (356000000) echappe a la regle de Luhn : c'est
 * l'unique exception documentee par l'INSEE, et elle est traitee comme telle
 * plutot qu'ignoree en silence.
 */
export function isValidSiret(input: string): boolean {
  const digits = normalizeIdentifier(input);
  if (!/^\d{14}$/.test(digits)) return false;

  if (digits.startsWith('356000000')) {
    const sum = [...digits].reduce((total, character) => total + (character.charCodeAt(0) - 48), 0);
    return sum % 5 === 0;
  }

  return luhnSumValid(digits);
}

/** Le SIRET doit commencer par le SIREN de l'entreprise. */
export function siretBelongsToSiren(siret: string, siren: string): boolean {
  const s = normalizeIdentifier(siret);
  const n = normalizeIdentifier(siren);
  return s.length === 14 && n.length === 9 && s.startsWith(n);
}

/**
 * Numero de TVA intracommunautaire francais, calcule depuis le SIREN.
 *
 * Cle = (12 + 3 x (SIREN mod 97)) mod 97, sur deux chiffres, puis le SIREN.
 * Renvoie `null` si le SIREN n'est pas valide : mieux vaut aucun numero qu'un
 * numero invente.
 */
export function vatNumberForSiren(input: string): string | null {
  const digits = normalizeIdentifier(input);
  if (!isValidSiren(digits)) return null;

  const key = (12 + 3 * (Number.parseInt(digits, 10) % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${digits}`;
}

export function isValidFrenchVatNumber(input: string): boolean {
  const value = normalizeIdentifier(input).toUpperCase();
  if (!/^FR[0-9A-HJ-NP-Z]{2}\d{9}$/.test(value)) return false;

  const siren = value.slice(4);
  if (!isValidSiren(siren)) return false;

  // Les cles alphanumeriques (anciennes attributions) ne se recalculent pas :
  // on se limite alors a la validite du SIREN qu'elles portent.
  const key = value.slice(2, 4);
  if (!/^\d{2}$/.test(key)) return true;

  return vatNumberForSiren(siren) === value;
}

export interface IdentityProblem {
  field: 'LEGAL_SIREN' | 'LEGAL_SIRET' | 'LEGAL_VAT';
  message: string;
}

/**
 * Coherence de l'identite commerciale, verifiee au demarrage.
 *
 * Chaque probleme est decrit en francais, pour qu'une personne qui deploie
 * comprenne quoi corriger sans lire ce fichier.
 */
export function checkLegalIdentity(values: {
  siren?: string | null;
  siret?: string | null;
  vat?: string | null;
}): IdentityProblem[] {
  const problems: IdentityProblem[] = [];
  const siren = values.siren?.trim();
  const siret = values.siret?.trim();
  const vat = values.vat?.trim();

  if (siren && !siren.startsWith('[') && !isValidSiren(siren)) {
    problems.push({
      field: 'LEGAL_SIREN',
      message: `Le SIREN « ${siren} » est invalide : neuf chiffres et une clé de contrôle correcte sont attendus.`,
    });
  }

  if (siret && !siret.startsWith('[')) {
    if (!isValidSiret(siret)) {
      problems.push({
        field: 'LEGAL_SIRET',
        message: `Le SIRET « ${siret} » est invalide : quatorze chiffres et une clé de contrôle correcte sont attendus.`,
      });
    } else if (siren && isValidSiren(siren) && !siretBelongsToSiren(siret, siren)) {
      problems.push({
        field: 'LEGAL_SIRET',
        message: 'Le SIRET ne commence pas par le SIREN déclaré : l’un des deux est erroné.',
      });
    }
  }

  if (vat && !vat.startsWith('[')) {
    if (!isValidFrenchVatNumber(vat)) {
      problems.push({
        field: 'LEGAL_VAT',
        message: `Le numéro de TVA « ${vat} » est invalide.`,
      });
    } else if (siren && isValidSiren(siren)) {
      const expected = vatNumberForSiren(siren);
      const key = normalizeIdentifier(vat).toUpperCase().slice(2, 4);
      if (/^\d{2}$/.test(key) && expected !== normalizeIdentifier(vat).toUpperCase()) {
        problems.push({
          field: 'LEGAL_VAT',
          message: `Le numéro de TVA ne correspond pas au SIREN déclaré. Attendu : ${expected}.`,
        });
      }
    }
  }

  return problems;
}
