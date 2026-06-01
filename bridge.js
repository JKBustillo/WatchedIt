// Puente ISOLATED ↔ MAIN.
// content.js corre en MAIN world (necesita ytcfg) y por tanto NO tiene acceso a
// chrome.storage. Este script vive en el world ISOLATED por defecto: lee las
// preferencias, las refleja como clases en <html> (para lo que se oculta por CSS)
// y relaya el resto al MAIN mediante un CustomEvent.

(() => {
  const DEFAULTS = {
    markWatchedEnabled: true,
    hideShorts: false,
    hideMostRelevant: false,
    hideLive: false,
  };

  function apply(settings) {
    const root = document.documentElement;
    root.classList.toggle('wi-hide-shorts', !!settings.hideShorts);
    root.classList.toggle('wi-hide-most-relevant', !!settings.hideMostRelevant);
    root.classList.toggle('wi-hide-live', !!settings.hideLive);

    // El detail se serializa para que cruce la frontera ISOLATED→MAIN sin
    // problemas de clonación.
    document.dispatchEvent(
      new CustomEvent('wi-settings', { detail: JSON.stringify(settings) })
    );
  }

  function load() {
    chrome.storage.sync.get(DEFAULTS, apply);
  }

  // content.js (MAIN) puede cargar antes o después que este script; cuando
  // termina de inicializarse pide los settings y respondemos con load().
  document.addEventListener('wi-request-settings', load);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') load();
  });

  load();
})();
