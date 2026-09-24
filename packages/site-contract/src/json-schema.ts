import { z } from 'zod';
import { MANIFEST_SCHEMA_URL } from './constants';
import { manifestSchema } from './manifest';

/**
 * Schema JSON du manifeste, publie par StaX (`/schemas/stax.manifest.v1.json`)
 * pour l'autocompletion et la validation dans l'editeur du developpeur.
 * Les regles transverses (identifiants uniques, langue par defaut declaree…)
 * ne s'expriment pas en JSON Schema : StaX les verifie a l'import.
 */
export function manifestJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(manifestSchema, { unrepresentable: 'any', io: 'input' }) as Record<
    string,
    unknown
  >;
  return {
    ...schema,
    $id: MANIFEST_SCHEMA_URL,
    title: 'Contrat d’édition StaX (stax.manifest.json)',
    description:
      'Zones d’un site que son propriétaire peut modifier depuis StaX après la livraison. Le design et le code du site restent ceux développés pour lui.',
  };
}
