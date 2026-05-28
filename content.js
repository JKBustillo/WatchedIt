(() => {
  const CLICKED = new Set();

  function extractId(href) {
    if (!href) return null;
    const m = href.match(/[?&]v=([^&]+)/);
    if (m) return m[1];
    const s = href.match(/\/shorts\/([^/?]+)/);
    return s ? s[1] : null;
  }

  function findVideoId(startEl) {
    let el = startEl;
    for (let i = 0; i < 12 && el && el !== document.body; i++, el = el.parentElement) {
      const a = el.querySelector?.('a[href*="watch?v="], a[href*="/shorts/"]');
      if (a) return extractId(a.getAttribute('href'));
    }
    return null;
  }

  // ── YouTube API ─────────────────────────────────────────────

  function getApiKey() {
    try { return ytcfg.get('INNERTUBE_API_KEY'); } catch {}
    return null;
  }

  function getContext() {
    try { return ytcfg.get('INNERTUBE_CONTEXT'); } catch {}
    return { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } };
  }

  function getCookie(name) {
    const m = document.cookie.match(
      new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
    );
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function sha1Hex(str) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sapisidHeader() {
    const sapisid = getCookie('SAPISID') || getCookie('__Secure-3PAPISID');
    if (!sapisid) return null;
    const t = Math.floor(Date.now() / 1000);
    return `SAPISIDHASH ${t}_${await sha1Hex(`${t} ${sapisid} https://www.youtube.com`)}`;
  }

  function randomCpn() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * 64)]).join('');
  }

  async function markWatchedInYouTube(videoId) {
    const apiKey = getApiKey();
    if (!apiKey) return;
    const resp = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId, context: getContext() }),
      }
    ).catch(() => null);
    if (!resp) return;

    const data = await resp.json().catch(() => null);
    if (!data) return;

    console.log('[WatchedIt] playbackTracking:', data?.playbackTracking);

    const duration = Math.floor(parseFloat(data?.videoDetails?.lengthSeconds));
    if (!duration) return;

    const tracking = data?.playbackTracking;
    const auth = await sapisidHeader();
    const headers = auth ? { Authorization: auth } : {};
    const cpn = randomCpn();

    const playbackUrl = tracking?.videostatsPlaybackUrl?.baseUrl;
    if (playbackUrl) {
      await fetch(`${playbackUrl}&cpn=${cpn}`, { headers, credentials: 'include' }).catch(() => {});
    }

    const watchtimeUrl = tracking?.videostatsWatchtimeUrl?.baseUrl;
    if (watchtimeUrl) {
      await fetch(
        `${watchtimeUrl}&cpn=${cpn}&cmt=${duration}&len=${duration}&of=${duration}&final=1&state=7`,
        { headers, credentials: 'include' }
      ).catch(() => {});
    }
  }

  // ── UI ──────────────────────────────────────────────────────

  function addButtonToOverlay(overlayEl) {
    if (overlayEl.dataset.wi) return;
    const id = findVideoId(overlayEl);
    if (!id) return;
    overlayEl.dataset.wi = id;

    const btn = document.createElement('button');
    btn.className = 'wi-btn';
    btn.title = 'Marcar como visto';
    btn.appendChild(createEyeSvg());
    btn.style.setProperty('pointer-events', 'auto', 'important');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!CLICKED.has(id)) {
        CLICKED.add(id);
        markWatchedInYouTube(id);
      }
    }, true);

    overlayEl.appendChild(btn);
  }

  function createEyeSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
    svg.appendChild(path);

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '3');
    svg.appendChild(circle);

    return svg;
  }

  document.querySelectorAll('yt-thumbnail-hover-overlay-toggle-actions-view-model')
    .forEach(addButtonToOverlay);

  new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('yt-thumbnail-hover-overlay-toggle-actions-view-model')) {
          addButtonToOverlay(node);
        } else {
          node.querySelectorAll('yt-thumbnail-hover-overlay-toggle-actions-view-model')
            .forEach(addButtonToOverlay);
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
