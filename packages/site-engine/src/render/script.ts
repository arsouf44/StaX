/**
 * Script d amelioration progressive des sites clients.
 *
 * Contraintes tenues :
 *  - tout ce qu il fait est FACULTATIF : sans lui, la navigation, les
 *    formulaires, la carte et les onglets restent utilisables ;
 *  - aucune dependance, aucun appel reseau tiers, moins de 5 ko ;
 *  - il est injecte en ligne avec le nonce CSP du document, ce qui evite une
 *    requete supplementaire et interdit tout script non prevu.
 *
 * Il est ecrit en JavaScript ES2020 volontairement conservateur : ce code part
 * tel quel vers le navigateur, sans etape de compilation.
 */
export const SITE_SCRIPT = String.raw`
(function () {
  'use strict';
  var d = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- En-tete : etat au defilement ------------------------------------- */
  var header = d.querySelector('[data-stax-header]');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('hdr-solid', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- Menu mobile ------------------------------------------------------- */
  var toggle = d.querySelector('[data-stax-nav-toggle]');
  var mobile = d.getElementById('nav-mobile');
  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      var open = mobile.getAttribute('data-open') === 'true';
      mobile.setAttribute('data-open', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    mobile.addEventListener('click', function (event) {
      if (event.target && event.target.tagName === 'A') {
        mobile.setAttribute('data-open', 'false');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    d.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (mobile.getAttribute('data-open') !== 'true') return;
      mobile.setAttribute('data-open', 'false');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
  }

  /* --- Apparition au defilement ------------------------------------------ */
  var revealables = d.querySelectorAll('[data-reveal="true"]');
  if (reduced || !('IntersectionObserver' in window)) {
    for (var i = 0; i < revealables.length; i += 1) revealables[i].setAttribute('data-in', 'true');
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute('data-in', 'true');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
    );
    for (var j = 0; j < revealables.length; j += 1) observer.observe(revealables[j]);
  }

  /* --- Contenus integres : charges seulement a la demande ---------------- */
  var embedButtons = d.querySelectorAll('[data-stax-embed-load]');
  for (var e = 0; e < embedButtons.length; e += 1) {
    embedButtons[e].addEventListener('click', function (event) {
      var box = event.currentTarget.closest('[data-stax-embed]');
      if (!box) return;
      var frame = d.createElement('iframe');
      frame.src = box.getAttribute('data-stax-embed');
      frame.title = box.getAttribute('data-stax-embed-title') || 'Contenu intégré';
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms');
      frame.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen');
      box.innerHTML = '';
      box.classList.remove('embed-gated');
      box.appendChild(frame);
      frame.focus();
    });
  }

  /* --- Onglets (carte de restaurant) ------------------------------------- */
  d.querySelectorAll('[data-stax-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var select = function (tab) {
      tabs.forEach(function (other) {
        var selected = other === tab;
        other.setAttribute('aria-selected', selected ? 'true' : 'false');
        other.setAttribute('tabindex', selected ? '0' : '-1');
        var panel = d.getElementById(other.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
    };
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        select(next);
        next.focus();
      });
    });
  });

  /* --- Envoi asynchrone des formulaires ---------------------------------- */
  var setStatus = function (form, tone, message) {
    var box = form.querySelector('[data-stax-status]');
    if (!box) return;
    box.textContent = message;
    box.setAttribute('data-tone', tone);
    box.hidden = false;
  };

  var submitJson = function (form, url, payload, onSuccess) {
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    })
      .then(function (response) {
        return response.json().then(function (body) { return { ok: response.ok, body: body }; });
      })
      .then(function (result) {
        if (result.ok && result.body && result.body.ok) {
          onSuccess(result.body);
          return;
        }
        setStatus(
          form,
          'err',
          (result.body && result.body.message) ||
            'Votre envoi n’a pas abouti. Merci de réessayer dans quelques instants.',
        );
      })
      .catch(function () {
        setStatus(form, 'err', 'Connexion interrompue. Merci de réessayer.');
      })
      .finally(function () {
        if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
      });
  };

  var serialize = function (form) {
    var data = new FormData(form);
    var payload = {};
    data.forEach(function (value, key) {
      if (payload[key] === undefined) { payload[key] = value; return; }
      if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
      payload[key].push(value);
    });
    return payload;
  };

  d.querySelectorAll('form[data-stax-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!form.checkValidity()) return; /* Le navigateur affiche ses messages. */
      event.preventDefault();
      submitJson(form, form.getAttribute('action'), serialize(form), function (body) {
        form.reset();
        setStatus(form, 'ok', body.message || 'Merci, votre message a bien été envoyé.');
      });
    });
  });

  /* --- Reservation : creneaux reels demandes au serveur ------------------- */
  d.querySelectorAll('form[data-stax-booking]').forEach(function (form) {
    var date = form.querySelector('input[name="date"]');
    var slots = form.querySelector('[data-stax-slots]');
    var service = form.querySelector('[name="bookingServiceId"]');

    var load = function () {
      if (!date || !slots || !date.value) return;
      slots.innerHTML = '<option value="">Recherche des disponibilités…</option>';
      var params =
        '?date=' + encodeURIComponent(date.value) +
        '&service=' + encodeURIComponent(service ? service.value : '');
      fetch('/api/bookings/slots' + params, { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          slots.innerHTML = '';
          var list = (body && body.slots) || [];
          if (list.length === 0) {
            slots.innerHTML = '<option value="">Aucune disponibilité ce jour-là</option>';
            return;
          }
          list.forEach(function (slot) {
            var option = d.createElement('option');
            option.value = slot.value;
            option.textContent = slot.label;
            slots.appendChild(option);
          });
        })
        .catch(function () {
          slots.innerHTML = '<option value="">Disponibilités indisponibles</option>';
        });
    };

    if (date) date.addEventListener('change', load);
    if (service) service.addEventListener('change', load);

    form.addEventListener('submit', function (event) {
      if (!form.checkValidity()) return;
      event.preventDefault();
      submitJson(form, '/api/bookings', serialize(form), function (body) {
        form.reset();
        setStatus(form, 'ok', body.message || 'Votre demande de réservation a bien été transmise.');
      });
    });
  });

  /* --- Panier et commande ------------------------------------------------- */
  /*
   * Le jeton anti-CSRF est lu sur le document : l ajout au panier n est pas un
   * formulaire, il n a donc pas de champ cache ou le trouver. Sans ce jeton le
   * serveur refuse l ecriture, et le bouton resterait sans effet.
   */
  var siteToken = (d.body && d.body.getAttribute('data-stax-token')) || '';
  var cart = d.querySelector('[data-stax-cart]');
  var checkout = cart ? cart.querySelector('form[data-stax-checkout]') : null;

  var renderCart = function (state) {
    if (!cart) return;
    var empty = cart.querySelector('[data-stax-cart-empty]');
    var bodyEl = cart.querySelector('[data-stax-cart-body]');
    if (!bodyEl || !empty) return;
    if (!state || !state.items || state.items.length === 0) {
      empty.hidden = false;
      bodyEl.hidden = true;
      if (checkout) checkout.hidden = true;
      return;
    }
    empty.hidden = true;
    bodyEl.hidden = false;
    if (checkout) checkout.hidden = false;
    var rows = state.items
      .map(function (item) {
        return (
          '<div class="price-row"><div><p><strong>' + item.name + '</strong></p>' +
          '<p class="price-meta">Quantité : ' + item.quantity + '</p></div>' +
          '<span class="dots"></span><span class="price-amt">' + item.lineTotal + '</span></div>'
        );
      })
      .join('');
    bodyEl.innerHTML =
      '<div class="price-list">' + rows + '</div>' +
      '<p class="price-row"><strong>Total</strong><span class="dots"></span>' +
      '<span class="price-amt">' + state.total + '</span></p>';
  };

  var refreshCart = function () {
    if (!cart) return;
    fetch('/api/cart', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(renderCart)
      .catch(function () { /* Le panier reste affiche vide. */ });
  };
  refreshCart();

  d.querySelectorAll('[data-stax-add-to-cart]').forEach(function (button) {
    var label = button.textContent;
    button.addEventListener('click', function () {
      button.disabled = true;
      fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          productId: button.getAttribute('data-stax-add-to-cart'),
          quantity: 1,
          _token: siteToken,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (state) {
          if (!state || state.ok === false) { button.textContent = 'Réessayer'; return; }
          renderCart(state);
          button.textContent = 'Ajouté au panier';
          window.setTimeout(function () { button.textContent = label; }, 2200);
        })
        .catch(function () { button.textContent = 'Réessayer'; })
        .finally(function () { button.disabled = false; });
    });
  });

  if (checkout) {
    /* L adresse n est demandee que si elle sert : personne ne remplit un champ
       inutile de bonne grace, et un champ obligatoire hors sujet fait renoncer. */
    var addressBox = checkout.querySelector('[data-stax-checkout-address]');
    var addressLine = checkout.querySelector('[name="addressLine1"]');
    var syncAddress = function () {
      var choice = checkout.querySelector('[name="fulfillment"]:checked');
      var needed = !!choice && (choice.value === 'shipping' || choice.value === 'delivery');
      if (addressBox) addressBox.hidden = !needed;
      if (addressLine) {
        if (needed) addressLine.setAttribute('required', 'required');
        else addressLine.removeAttribute('required');
      }
    };
    checkout.querySelectorAll('[name="fulfillment"]').forEach(function (input) {
      input.addEventListener('change', syncAddress);
    });
    syncAddress();

    checkout.addEventListener('submit', function (event) {
      if (!checkout.checkValidity()) return;
      event.preventDefault();
      submitJson(checkout, '/api/checkout', serialize(checkout), function (body) {
        /* La commande existe deja en base. On emmene la personne vers le
           paiement, ou vers sa confirmation si le reglement se fait sur place. */
        if (body && body.url) { window.location.href = body.url; return; }
        setStatus(checkout, 'ok', (body && body.message) || 'Votre commande est enregistrée.');
      });
    });
  }

  /* --- Espace client du site ---------------------------------------------- */
  d.querySelectorAll('form[data-stax-customer-login]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!form.checkValidity()) return;
      event.preventDefault();
      submitJson(form, '/api/compte/connexion', serialize(form), function (body) {
        form.reset();
        /* La reponse est volontairement la meme dans tous les cas : elle ne
           dit jamais si l adresse correspond a un compte. */
        setStatus(form, 'ok', body.message || 'Si un compte existe, un lien vient d’être envoyé.');
      });
    });
  });

  d.querySelectorAll('form[data-stax-customer-logout]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitJson(form, '/api/compte/deconnexion', serialize(form), function (body) {
        window.location.href = (body && body.url) || '/';
      });
    });
  });

  /* --- Mesure d audience sans cookie -------------------------------------- */
  /* Jamais dans un apercu : le client qui relit son site n est pas un
     visiteur, et l apercu n est pas servi par le moteur des sites. */
  if (navigator.sendBeacon && !d.documentElement.hasAttribute('data-stax-preview')) {
    try {
      navigator.sendBeacon(
        '/api/collect',
        new Blob(
          [JSON.stringify({ path: location.pathname, ref: d.referrer ? new URL(d.referrer).hostname : '' })],
          { type: 'application/json' },
        ),
      );
    } catch (error) { /* La mesure d audience n est jamais bloquante. */ }
  }
})();
`;
