// Exemple de site Nemasus : la page d'accueil d'Atelier Voltaire, seule.
// Le menu s'ouvre sur mobile ; les liens défilent dans la page et ne mènent
// nulle part ailleurs ; la lettre d'information ne collecte rien.
(function () {
  var menu = document.getElementById('menu');
  var nav = document.getElementById('nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      nav.classList.toggle('open');
      menu.textContent = nav.classList.contains('open') ? 'FERMER' : 'MENU';
    });
  }

  document.addEventListener('click', function (event) {
    var link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    event.preventDefault();
    if (nav && menu) {
      nav.classList.remove('open');
      menu.textContent = 'MENU';
    }
    if (href.charAt(0) !== '#') return;
    var target = href.length > 1 ? document.getElementById(href.slice(1)) : null;
    (target || document.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  var form = document.getElementById('newsletter');
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var message = document.getElementById('formmsg');
      if (message)
        message.textContent = 'Exemple de démonstration : aucune adresse n’est enregistrée.';
      form.reset();
    });
  }
})();
