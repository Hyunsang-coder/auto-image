// Runs in <head>, before paint: an explicit pick from the language menu wins,
// then the first of ko/en in the browser's language list, otherwise English.
// Crawlers are left on the page they asked for — a language redirect would hide
// the other version from the index, and hreflang already maps the pair.
(function () {
  var page = document.documentElement.lang;
  var wanted = null;
  try { wanted = localStorage.getItem('site-lang'); } catch (e) {}
  if (!wanted) {
    if (/bot|crawl|spider|slurp|yeti|daum|google|lighthouse/i.test(navigator.userAgent)) return;
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    wanted = 'en';
    for (var i = 0; i < langs.length; i++) {
      var code = String(langs[i]).toLowerCase();
      if (code.indexOf('ko') === 0) { wanted = 'ko'; break; }
      if (code.indexOf('en') === 0) break;
    }
  }
  if (wanted === page) return;
  var alt = document.querySelector('link[rel="alternate"][hreflang="' + wanted + '"]');
  if (!alt) return;
  var path = new URL(alt.href).pathname;
  if (path !== location.pathname) location.replace(path + location.search + location.hash);
})();
