/**
 * Pont d'apercu : relie l'apercu REEL du site (son build Cloudflare, affiche
 * dans l'editeur Nemasus) aux champs du contrat d'edition.
 *
 * Le code du site marque les elements modifiables avec l'adresse de leur
 * champ :
 *
 *     <h1 data-nemasus="pages.accueil.hero.titre">…</h1>
 *
 * et, dans ses builds d'apercu seulement (quand le bundle porte
 * `nemasus.preview`), charge le script du pont :
 *
 *     <script src="https://app.nemasus.fr/bridge/v1.js" defer></script>
 *
 * Dans l'editeur, un clic sur un element ouvre le champ correspondant ; une
 * saisie de texte s'affiche aussitot dans l'apercu, en attendant le build.
 *
 * Poignee de main : l'apercu peut finir de charger avant que l'editeur ecoute
 * (page rendue cote serveur, hydratation plus lente). Le pont annonce donc
 * `ready` a plusieurs reprises jusqu'au premier message de l'editeur, et
 * repond a tout `hello` de l'editeur par un nouveau `ready`.
 *
 * Securite : le pont n'ecoute que l'origine de l'editeur Nemasus (inscrite dans
 * le script au moment ou Nemasus le sert), n'execute jamais de code recu, et ne
 * fait que remplacer du texte ou des attributs d'image et de lien.
 */

export const BRIDGE_VERSION = 1 as const;
export const BRIDGE_ATTRIBUTE = 'data-nemasus';

export type BridgeMessage =
  | { source: 'nemasus-bridge'; version: 1; type: 'ready'; path: string; fields: string[] }
  | { source: 'nemasus-bridge'; version: 1; type: 'select'; address: string };

export type EditorMessage =
  | { source: 'nemasus-editor'; version: 1; type: 'hello' }
  | { source: 'nemasus-editor'; version: 1; type: 'mode'; editing: boolean }
  | { source: 'nemasus-editor'; version: 1; type: 'highlight'; address: string | null }
  | {
      source: 'nemasus-editor';
      version: 1;
      type: 'patch';
      address: string;
      kind: 'text' | 'image' | 'link';
      value: { text?: string; src?: string; alt?: string; href?: string };
    };

const ADDRESS = /^[A-Za-z0-9_.-]{1,300}$/;
const PATH = /^\/[^\s]{0,500}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Message recu d'un apercu : strictement valide, sinon ignore. */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (
    !isRecord(data) ||
    data['source'] !== 'nemasus-bridge' ||
    data['version'] !== BRIDGE_VERSION
  ) {
    return null;
  }
  if (data['type'] === 'ready') {
    const path = typeof data['path'] === 'string' && PATH.test(data['path']) ? data['path'] : '/';
    const fields = Array.isArray(data['fields'])
      ? data['fields']
          .filter((field): field is string => typeof field === 'string' && ADDRESS.test(field))
          .slice(0, 2000)
      : [];
    return { source: 'nemasus-bridge', version: 1, type: 'ready', path, fields };
  }
  if (
    data['type'] === 'select' &&
    typeof data['address'] === 'string' &&
    ADDRESS.test(data['address'])
  ) {
    return { source: 'nemasus-bridge', version: 1, type: 'select', address: data['address'] };
  }
  return null;
}

export function editorMessage<T extends EditorMessage['type']>(
  type: T,
  payload: Omit<Extract<EditorMessage, { type: T }>, 'source' | 'version' | 'type'>,
): EditorMessage {
  return {
    source: 'nemasus-editor',
    version: BRIDGE_VERSION,
    type,
    ...payload,
  } as unknown as EditorMessage;
}

/**
 * Source du script du pont, servie par Nemasus a `/bridge/v1.js`.
 * `editorOrigin` : origine exacte de l'editeur (https://app.nemasus.fr).
 */
export function bridgeScript(editorOrigin: string): string {
  const origin = JSON.stringify(new URL(editorOrigin).origin);
  return `/* Nemasus — pont d'apercu v${BRIDGE_VERSION}. Actif uniquement dans l'editeur Nemasus. */
(function () {
  'use strict';
  if (window.parent === window) return;
  var ORIGIN = ${origin};
  var ATTR = ${JSON.stringify(BRIDGE_ATTRIBUTE)};
  var editing = true;
  var selected = null;
  var heard = false;

  function post(message) {
    message.source = 'nemasus-bridge';
    message.version = ${BRIDGE_VERSION};
    try { window.parent.postMessage(message, ORIGIN); } catch (e) { /* editeur ferme */ }
  }

  function addresses() {
    var seen = {};
    var out = [];
    var nodes = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < nodes.length && out.length < 2000; i++) {
      var value = nodes[i].getAttribute(ATTR);
      if (value && !seen[value]) { seen[value] = true; out.push(value); }
    }
    return out;
  }

  function nodesFor(address) {
    var out = [];
    var nodes = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute(ATTR) === address) out.push(nodes[i]);
    }
    return out;
  }

  var box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #2563eb;' +
    'border-radius:6px;background:rgba(37,99,235,.08);transition:all .12s ease;display:none';
  var focus = box.cloneNode();
  focus.style.borderStyle = 'solid';
  focus.style.background = 'rgba(37,99,235,.14)';

  function place(target, element) {
    if (!element) { target.style.display = 'none'; return; }
    var rect = element.getBoundingClientRect();
    target.style.display = 'block';
    target.style.top = (rect.top - 4) + 'px';
    target.style.left = (rect.left - 4) + 'px';
    target.style.width = (rect.width + 8) + 'px';
    target.style.height = (rect.height + 8) + 'px';
  }

  function editable(node) {
    while (node && node !== document.documentElement) {
      if (node.nodeType === 1 && node.hasAttribute(ATTR)) return node;
      node = node.parentNode;
    }
    return null;
  }

  document.addEventListener('mouseover', function (event) {
    if (!editing) return;
    place(box, editable(event.target));
  }, true);

  function choose(element) {
    selected = element.getAttribute(ATTR);
    place(focus, element);
    post({ type: 'select', address: selected });
  }

  document.addEventListener('click', function (event) {
    if (!editing) return;
    var element = editable(event.target);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    choose(element);
  }, true);

  // Telephones : un toucher bref (sans glisser) choisit l'element, meme quand
  // le navigateur n'en fait pas un clic (iOS ne le fait pas pour un texte
  // ordinaire ecoute depuis le document). Glisser fait defiler, rien d'autre.
  var touch = null;
  document.addEventListener('touchstart', function (event) {
    touch = editing && event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() }
      : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (event) {
    if (!touch || !event.touches.length) return;
    var t = event.touches[0];
    if (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10) touch = null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', function (event) {
    var start = touch;
    touch = null;
    if (!editing || !start || Date.now() - start.at > 600) return;
    var element = editable(event.target);
    if (!element) return;
    event.preventDefault();
    choose(element);
  }, { capture: true, passive: false });

  // Elements modifiables signales comme cliquables tant que l'edition est active.
  var hint = document.createElement('style');
  hint.textContent = '[' + ATTR + ']{cursor:pointer}';

  function refresh() {
    place(box, null);
    if (selected) place(focus, nodesFor(selected)[0] || null);
  }
  window.addEventListener('scroll', refresh, { passive: true });
  window.addEventListener('resize', refresh);

  function safeHref(value) {
    if (typeof value !== 'string') return false;
    var v = value.trim();
    return /^\\/(?!\\/)/.test(v) || /^#[A-Za-z0-9_-]+$/.test(v) || /^https?:\\/\\//i.test(v) ||
      /^mailto:[^\\s]+$/i.test(v) || /^tel:\\+?[0-9]+$/.test(v);
  }
  function safeSrc(value) {
    if (typeof value !== 'string') return false;
    var v = value.trim();
    return /^\\/(?!\\/)/.test(v) || /^https:\\/\\//i.test(v);
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN || event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.source !== 'nemasus-editor' || data.version !== ${BRIDGE_VERSION}) return;
    heard = true;
    if (data.type === 'hello') { announce(); return; }
    if (data.type === 'mode') {
      editing = data.editing === true;
      hint.media = editing ? 'all' : 'not all';
      if (!editing) { place(box, null); place(focus, null); }
      return;
    }
    if (data.type === 'highlight') {
      selected = typeof data.address === 'string' ? data.address : null;
      var target = selected ? nodesFor(selected)[0] : null;
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(function () { place(focus, target || null); }, 250);
      return;
    }
    if (data.type === 'patch' && typeof data.address === 'string' && data.value) {
      var nodes = nodesFor(data.address);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (data.kind === 'text' && typeof data.value.text === 'string') {
          node.textContent = data.value.text;
        } else if (data.kind === 'image' && node.tagName === 'IMG') {
          if (safeSrc(data.value.src)) { node.removeAttribute('srcset'); node.setAttribute('src', data.value.src); }
          if (typeof data.value.alt === 'string') node.setAttribute('alt', data.value.alt);
        } else if (data.kind === 'link') {
          if (typeof data.value.text === 'string') node.textContent = data.value.text;
          if (node.tagName === 'A' && safeHref(data.value.href)) node.setAttribute('href', data.value.href);
        }
      }
      refresh();
    }
  });

  function announce() {
    post({ type: 'ready', path: location.pathname, fields: addresses() });
  }

  // L'editeur peut ne pas encore ecouter : on repete l'annonce jusqu'a sa
  // premiere reponse (vite au debut, puis chaque seconde, une minute au plus).
  function ready() {
    document.body.appendChild(box);
    document.body.appendChild(focus);
    document.body.appendChild(hint);
    var tries = 0;
    (function again() {
      if (heard || tries >= 60) return;
      tries += 1;
      announce();
      setTimeout(again, tries < 8 ? 250 : 1000);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
`;
}
