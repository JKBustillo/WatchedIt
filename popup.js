// Lee/escribe las preferencias en chrome.storage.sync. El script puente
// (bridge.js) reacciona a los cambios y los propaga a la página de YouTube.

const DEFAULTS = {
  markWatchedEnabled: true,
  hideShorts: false,
  hideMostRelevant: false,
  hideLive: false,
};

function render(settings) {
  for (const key of Object.keys(DEFAULTS)) {
    const input = document.getElementById(key);
    if (input) input.checked = !!settings[key];
  }
}

chrome.storage.sync.get(DEFAULTS, render);

document.addEventListener('change', (e) => {
  const input = e.target;
  if (input.matches('input[type="checkbox"][data-setting]')) {
    chrome.storage.sync.set({ [input.id]: input.checked });
  }
});
