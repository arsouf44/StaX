/**
 * Références clients : témoignages et études de cas.
 *
 * VIDE AUJOURD'HUI, ET C'EST VOULU. Aucune entrée n'est inventée : ni nom, ni
 * phrase, ni chiffre de résultat. Tant que ce tableau est vide, la section
 * ne s'affiche pas du tout — une page sans preuve sociale vaut mieux qu'une
 * page avec une preuve fabriquée, qu'un prospect peut vérifier d'un appel.
 *
 * POUR AJOUTER UN CLIENT, il faut quatre choses :
 *
 *  1. Son accord écrit, pour son nom comme pour la citation. Publier le nom
 *     d'un client sans son accord est une faute contractuelle, et sa
 *     photographie ou son logo relèvent en plus du droit à l'image et du
 *     droit des marques.
 *  2. La citation telle qu'il l'a écrite. On ne « lisse » pas un témoignage :
 *     un avis retouché est un faux avis au sens de l'article L.121-4 du Code
 *     de la consommation, et la loi impose de pouvoir prouver l'authenticité.
 *  3. Un chiffre seulement s'il est mesuré et que le client accepte sa
 *     publication. « Plus de demandes » suffit ; « +82 % de demandes » exige
 *     une mesure et une source.
 *  4. `url` uniquement si le site est en ligne et public.
 *
 * Une entrée suffit pour que la section apparaisse.
 */

export interface ClientReference {
  /** Nom de l'entreprise, tel que le client accepte de le voir publié. */
  name: string;
  /** Activité et ville : « Architecture intérieure · Paris ». */
  activity: string;
  /** La citation, dans les mots du client, sans retouche. */
  quote: string;
  /** Qui parle : « Claire Vasseur, fondatrice ». */
  author: string;
  /** Adresse du site livré, si elle est publique. */
  url?: string;
  /** Ce que le projet demandait de particulier, en une phrase. */
  highlight?: string;
}

export const CLIENT_REFERENCES: readonly ClientReference[] = [];
