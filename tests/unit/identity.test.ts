import { describe, expect, it } from 'vitest';
import {
  checkLegalIdentity,
  isValidFrenchVatNumber,
  isValidSiren,
  isValidSiret,
  siretBelongsToSiren,
  vatNumberForSiren,
} from '@stax/config/identity';

/**
 * Identifiants de l'editeur.
 *
 * Ces valeurs sont publiques : elles figurent obligatoirement dans les mentions
 * legales de tout site commercial francais.
 */
const SIREN = '814648663';
const SIRET = '81464866300031';

describe('identifiants d’entreprise francais', () => {
  it('valide le SIREN de LallianSe', () => {
    expect(isValidSiren(SIREN)).toBe(true);
    expect(isValidSiren('814 648 663')).toBe(true);
  });

  it('rejette un SIREN dont la cle est fausse', () => {
    expect(isValidSiren('814648664')).toBe(false);
    expect(isValidSiren('81464866')).toBe(false);
    expect(isValidSiren('81464866A')).toBe(false);
  });

  it('valide le SIRET de l’etablissement', () => {
    expect(isValidSiret(SIRET)).toBe(true);
    expect(isValidSiret('814 648 663 00031')).toBe(true);
  });

  it('rejette un SIRET dont la cle est fausse', () => {
    expect(isValidSiret('81464866300032')).toBe(false);
    expect(isValidSiret('8146486630003')).toBe(false);
  });

  it('accepte l’exception documentee de La Poste', () => {
    // 356000000 : seul SIREN francais dont les SIRET echappent a Luhn. La
    // regle devient « somme des quatorze chiffres multiple de cinq ».
    expect(isValidSiret('35600000009075')).toBe(true);
    expect(isValidSiret('35600000000048')).toBe(false);
  });

  it('verifie qu’un SIRET appartient bien a son SIREN', () => {
    expect(siretBelongsToSiren(SIRET, SIREN)).toBe(true);
    expect(siretBelongsToSiren(SIRET, '552081317')).toBe(false);
  });

  it('calcule le numero de TVA intracommunautaire depuis le SIREN', () => {
    expect(vatNumberForSiren(SIREN)).toBe('FR58814648663');
    expect(vatNumberForSiren('invalide')).toBeNull();
  });

  it('valide un numero de TVA francais', () => {
    expect(isValidFrenchVatNumber('FR58814648663')).toBe(true);
    expect(isValidFrenchVatNumber('FR 58 814648663')).toBe(true);
    // Cle numerique fausse : rejetee.
    expect(isValidFrenchVatNumber('FR59814648663')).toBe(false);
    // SIREN faux : rejete quelle que soit la cle.
    expect(isValidFrenchVatNumber('FR58814648664')).toBe(false);
  });

  it('ne signale aucun probleme sur une identite coherente', () => {
    expect(checkLegalIdentity({ siren: SIREN, siret: SIRET, vat: 'FR58814648663' })).toEqual([]);
  });

  it('signale un SIRET qui n’appartient pas au SIREN declare', () => {
    const problems = checkLegalIdentity({ siren: SIREN, siret: '55208131766522' });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.field).toBe('LEGAL_SIRET');
  });

  it('signale une TVA incoherente avec le SIREN', () => {
    const problems = checkLegalIdentity({ siren: SIREN, vat: 'FR40552081317' });
    expect(problems.some((problem) => problem.field === 'LEGAL_VAT')).toBe(true);
  });

  it('laisse passer les valeurs de substitution non configurees', () => {
    // Un placeholder n'est pas une erreur de saisie : c'est une valeur absente,
    // deja signalee par `legalStatus()`.
    expect(checkLegalIdentity({ siren: '[A CONFIGURER — SIREN]' })).toEqual([]);
  });
});
