/**
 * Applique le theme avant le premier rendu.
 *
 * Injecte en ligne et execute de maniere synchrone : c est le seul moyen
 * d eviter le flash de theme clair sur une interface concue en sombre. Le
 * script ne lit qu une valeur locale, n envoie rien et ne depend d aucune
 * bibliotheque.
 */
const SCRIPT = `(function(){try{
var s=localStorage.getItem('stax-theme');
var m=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
document.documentElement.setAttribute('data-theme', s==='light'||s==='dark'?s:(s==='system'?m:'dark'));
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

export const THEME_STORAGE_KEY = 'stax-theme';
