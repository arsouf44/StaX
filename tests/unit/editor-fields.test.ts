import { describe, expect, it } from 'vitest';
import { BLOCK_DEFINITIONS, editorFieldsFor } from '@stax/site-engine';

/**
 * Champs de l editeur.
 *
 * Ils sont DERIVES du schema de chaque bloc. Ces assertions verifient que la
 * derivation reste correcte : sans elles, ajouter une propriete a un bloc
 * pourrait la rendre invisible dans l editeur, ou pire, afficher un champ que
 * le schema refuserait a l enregistrement.
 */
describe('champs derives des schemas de blocs', () => {
  it('chaque bloc expose au moins un champ editable ou est explicitement vide', () => {
    for (const definition of BLOCK_DEFINITIONS) {
      const fields = editorFieldsFor(definition.type);
      expect(Array.isArray(fields), `${definition.type} doit produire une liste`).toBe(true);
    }
  });

  it('aucun libellé ne laisse fuiter un nom technique brut', () => {
    for (const definition of BLOCK_DEFINITIONS) {
      for (const field of editorFieldsFor(definition.type)) {
        // Un libelle en camelCase signifie qu il manque une traduction.
        expect(
          /[a-z][A-Z]/.test(field.label),
          `${definition.type}.${field.name} : libellé « ${field.label} » non traduit`,
        ).toBe(false);
        expect(field.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('reconnaît les types courants du bloc « banniere »', () => {
    const fields = editorFieldsFor('hero');
    const byName = new Map(fields.map((field) => [field.name, field]));

    expect(byName.get('title')?.kind).toBe('text');
    expect(byName.get('subtitle')?.kind).toBe('textarea');
    expect(byName.get('media')?.kind).toBe('media');
    expect(byName.get('actions')?.kind).toBe('list');
    expect(byName.get('layout')?.kind).toBe('select');
    expect(byName.get('layout')?.options?.map((option) => option.value)).toEqual([
      'centered',
      'split',
      'overlay',
      'minimal',
    ]);
  });

  it('présente un nombre borné de colonnes comme un choix', () => {
    const fields = editorFieldsFor('features');
    const columns = fields.find((field) => field.name === 'columns');
    expect(columns?.kind).toBe('select');
    expect(columns?.options?.map((option) => option.value)).toEqual(['2', '3', '4']);
  });

  it('décrit les champs de chaque élément d’une liste', () => {
    const fields = editorFieldsFor('faq');
    const items = fields.find((field) => field.name === 'items');
    expect(items?.kind).toBe('list');
    expect(items?.itemFields?.map((field) => field.name)).toEqual(['question', 'answer']);
  });

  it('remonte la longueur maximale imposée par le schéma', () => {
    const title = editorFieldsFor('hero').find((field) => field.name === 'title');
    // Le schema borne le titre a 160 caracteres : l editeur doit le savoir
    // pour empecher une saisie que l enregistrement refuserait.
    expect(title?.maxLength).toBe(160);
  });

  it('retourne une liste vide pour un type inconnu', () => {
    expect(editorFieldsFor('bloc-qui-n-existe-pas')).toEqual([]);
  });
});
