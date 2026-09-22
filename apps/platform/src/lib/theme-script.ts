/**
 * Script d application du theme, et son empreinte.
 *
 * Isole dans un module sans JSX pour une raison precise : `next.config.ts` doit
 * pouvoir l importer afin de poser la meme empreinte dans la CSP des pages
 * publiques. Une valeur recopiee a deux endroits finit toujours par diverger.
 */

/** Cle de stockage du choix de theme. Partagee avec le selecteur. */
export const THEME_STORAGE_KEY = 'stax-theme';

/**
 * Applique le theme AVANT le premier rendu.
 *
 * Execute de maniere synchrone : c est le seul moyen d eviter le flash de
 * theme clair sur une interface concue en sombre. Il ne lit qu une valeur
 * locale, n envoie rien, et ne depend d aucune bibliotheque.
 *
 * Il doit lire EXACTEMENT la cle ecrite par le selecteur et poser EXACTEMENT
 * l attribut que la feuille de style observe (`[data-theme='…']`). Une seule
 * lettre d ecart et le script s execute sans le moindre effet, sans qu aucune
 * exception ne le signale.
 */
export const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('${THEME_STORAGE_KEY}');
var m=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
document.documentElement.setAttribute('data-theme', s==='light'||s==='dark'?s:(s==='system'?m:'dark'));
}catch(e){}})();`;

/**
 * Empreinte SHA-256 du script, au format attendu par `script-src`.
 *
 * Le script est autorise par son EMPREINTE et non par un nonce : un nonce
 * change a chaque requete et rendrait dynamiques toutes les pages prerendues.
 * `tests/unit/theme-script.test.ts` echoue si le script change sans elle.
 */
export const THEME_SCRIPT_CSP_HASH = "'sha256-bwglSaya41Wsv3crAzzm3BAr5fN8GL5MpXrSkkxP7RI='";
