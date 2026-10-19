import { serializeJsonLd } from '@nemasus/security';
import type { SchemaNode } from './schema';

/*
 * Les constructeurs vivent dans `schema.ts`, qui ne rend rien : seule la
 * balise a besoin de JSX. Ils sont re-exportes ici pour que les pages
 * continuent de tout importer depuis un seul module.
 */
export * from './schema';

/** Un graphe JSON-LD, sérialisé sans risque d'injection (`</script>` neutralisé). */
export function JsonLd({ graph }: { graph: readonly SchemaNode[] }) {
  return (
    <script
      type="application/ld+json"
      // Sérialisation qui échappe `<`, `>` et `&` : un texte ne peut pas fermer la balise.
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph }),
      }}
    />
  );
}
