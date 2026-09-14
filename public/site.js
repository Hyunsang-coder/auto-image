(function () {
  var menus = Array.prototype.slice.call(document.querySelectorAll('details.lang-menu, details.menu-toggle'));

  menus.forEach(function (menu) {
    menu.addEventListener('toggle', function () {
      if (menu.open) menus.forEach(function (other) { if (other !== menu) other.open = false; });
      if (menu.classList.contains('menu-toggle')) document.documentElement.classList.toggle('menu-open', menu.open);
    });
  });

  document.addEventListener('click', function (e) {
    menus.forEach(function (menu) {
      if (!menu.open) return;
      var followedLink = e.target.closest && e.target.closest('.menu-panel a');
      if (!menu.contains(e.target) || followedLink) menu.open = false;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    menus.forEach(function (menu) {
      if (!menu.open) return;
      menu.open = false;
      menu.querySelector('summary').focus();
    });
  });

  document.querySelectorAll('.lang-menu__list a[hreflang], .menu-lang a[hreflang]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('site-lang', link.getAttribute('hreflang')); } catch (e) {}
    });
  });

  var deck = document.querySelector('.deck');
  if (!deck) return;
  var buttons = Array.prototype.slice.call(deck.querySelectorAll('[data-deck-locale]'));
  var images = Array.prototype.slice.call(deck.querySelectorAll('img[data-locale]'));
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var locale = button.getAttribute('data-deck-locale');
      deck.setAttribute('data-show', locale);
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      images.forEach(function (img) {
        if (img.getAttribute('data-locale') === locale) img.removeAttribute('aria-hidden');
        else img.setAttribute('aria-hidden', 'true');
      });
    });
  });
})();
