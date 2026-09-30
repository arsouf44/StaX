/**
 * Script de mesure d'audience des sites développés hors de Nemasus.
 *
 * Le développeur du site l'ajoute en une ligne :
 *
 *     <script defer src="https://<api>/v1/sites/<clé publique>/mesure.js"></script>
 *
 * Ce qu'il fait, et seulement cela : à chaque page affichée (y compris les
 * changements de page d'une application monopage), il envoie le chemin et
 * l'hôte du référent. Aucun cookie, aucun stockage local, aucun identifiant :
 * rien n'est lu ni écrit dans le terminal du visiteur, la mesure ne relève
 * donc pas du consentement préalable.
 *
 * Il ne mesure jamais :
 *  - une page affichée dans un cadre (l'aperçu de l'éditeur Nemasus) ;
 *  - un navigateur piloté par un robot (`navigator.webdriver`) ;
 *  - un visiteur qui a exprimé un refus (Global Privacy Control).
 *
 * `sendBeacon` avec une chaîne : type `text/plain`, sans requête préalable
 * CORS, et l'envoi survit à la fermeture de l'onglet.
 */
export function audienceScript(endpoint: string): string {
  return `/* Mesure d'audience Nemasus : sans cookie, sans identifiant. */
(function () {
  'use strict';
  var w = window, d = document, n = navigator;
  try { if (w.self !== w.top) return; } catch (e) { return; }
  if (n.webdriver || n.globalPrivacyControl === true || !n.sendBeacon) return;
  var endpoint = ${JSON.stringify(endpoint)};
  var last = null;
  function send() {
    var path = location.pathname;
    if (path === last) return;
    last = path;
    var ref = '';
    try { ref = d.referrer ? new URL(d.referrer).hostname : ''; } catch (e) { ref = ''; }
    try { n.sendBeacon(endpoint, JSON.stringify({ path: path, ref: ref })); } catch (e) {}
  }
  function later() { setTimeout(send, 0); }
  var push = history.pushState, replace = history.replaceState;
  history.pushState = function () { var r = push.apply(this, arguments); later(); return r; };
  history.replaceState = function () { var r = replace.apply(this, arguments); later(); return r; };
  w.addEventListener('popstate', later);
  if (d.readyState === 'complete' || d.readyState === 'interactive') send();
  else d.addEventListener('DOMContentLoaded', send);
})();
`;
}

/** Réponse du script quand la mesure n'est pas activée pour ce site. */
export const AUDIENCE_SCRIPT_DISABLED =
  "/* Mesure d'audience Nemasus : non activée pour ce site (integrations.analytics). */\n";
