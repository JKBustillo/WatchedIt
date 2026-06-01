(() => {
  const CLICKED = new Set();

  // ── Settings ────────────────────────────────────────────────
  // content.js vive en MAIN world (sin acceso a chrome.storage); bridge.js
  // (ISOLATED) lee las preferencias y las relaya por este CustomEvent.
  let settings = {
    markWatchedEnabled: true,
    hideShorts: false,
    hideMostRelevant: false,
    hideLive: false,
  };

  function applySettings() {
    document.documentElement.classList.toggle('wi-mark-off', !settings.markWatchedEnabled);
  }

  document.addEventListener('wi-settings', (e) => {
    try { settings = JSON.parse(e.detail); } catch { return; }
    applySettings();
  });

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

  function ytcfgGet(key) {
    try { return ytcfg.get(key); } catch { return null; }
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
    // Algoritmo de cpn (Content Playback Nonce) replicado de base.js de YouTube
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * 256) & 63]).join('');
  }

  // Headers que usa la propia web de YouTube en sus peticiones a youtubei.
  // Sin la autenticación SAPISIDHASH el endpoint devuelve una respuesta
  // degradada sin playbackTracking, por eso antes salía undefined.
  async function ytHeaders() {
    const h = {
      'Content-Type': 'application/json',
      'X-Origin': 'https://www.youtube.com',
      'X-Youtube-Client-Name': String(ytcfgGet('INNERTUBE_CONTEXT_CLIENT_NAME') || 1),
      'X-Youtube-Client-Version':
        ytcfgGet('INNERTUBE_CLIENT_VERSION') ||
        ytcfgGet('INNERTUBE_CONTEXT_CLIENT_VERSION') || '',
    };
    const visitor = ytcfgGet('VISITOR_DATA');
    if (visitor) h['X-Goog-Visitor-Id'] = visitor;
    const auth = await sapisidHeader();
    if (auth) {
      h['Authorization'] = auth;
      h['X-Goog-AuthUser'] = '0';
    }
    return h;
  }

  async function markWatchedInYouTube(videoId) {
    const apiKey = getApiKey();
    if (!apiKey) return;

    const headers = await ytHeaders();
    const resp = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`,
      {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          videoId,
          context: getContext(),
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      }
    ).catch(() => null);
    if (!resp) return;

    const data = await resp.json().catch(() => null);
    if (!data) return;

    const tracking = data?.playbackTracking;
    if (!tracking) return;

    const cpn = randomCpn();

    // videostatsPlaybackUrl PRIMERO (inicializa la sesión de reproducción),
    // luego videostatsWatchtimeUrl (registra el historial / barra al 100%).
    // YouTube rechaza watchtime si no se llamó playback antes.
    await pingStats(tracking?.videostatsPlaybackUrl?.baseUrl, cpn, false, headers);
    await pingStats(tracking?.videostatsWatchtimeUrl?.baseUrl, cpn, true, headers);
  }

  // Reconstruye la URL de stats preservando los tokens originales (ei, vm, of,
  // len, docid…) y sobreescribiendo solo los parámetros necesarios, igual que
  // hace yt-dlp en _mark_watched.
  async function pingStats(baseUrl, cpn, isWatchtime, headers) {
    if (!baseUrl) return;
    const u = new URL(baseUrl);
    const len = parseFloat(u.searchParams.get('len') || '0');
    const cmt = String(len > 1 ? len - 1 : len); // justo antes del final

    u.searchParams.set('ver', '2');
    u.searchParams.set('cpn', cpn);
    u.searchParams.set('cmt', cmt);
    u.searchParams.set('el', 'detailpage'); // si no, asume "shorts"

    if (isWatchtime) {
      u.searchParams.set('st', '0');
      u.searchParams.set('et', cmt);
    }

    await fetch(u.toString(), { headers, credentials: 'include' }).catch(() => {});
  }

  // ── UI ──────────────────────────────────────────────────────

  function findThumbnail(overlayEl) {
    let el = overlayEl;
    for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
      if (el.matches?.('yt-thumbnail-view-model')) return el;
      const t = el.querySelector?.('yt-thumbnail-view-model');
      if (t) return t;
    }
    return null;
  }

  // Barra roja de "visto" al 100%, dibujada al instante sin recargar la página.
  // YouTube ya tiene el progreso real guardado; esto solo refleja el estado ya.
  function showProgressBar(thumbnailEl) {
    if (!thumbnailEl || thumbnailEl.querySelector('.wi-progress')) return;
    thumbnailEl.classList.add('wi-has-progress');
    const bar = document.createElement('div');
    bar.className = 'wi-progress';
    thumbnailEl.appendChild(bar);
  }

  function addButtonToOverlay(overlayEl) {
    if (overlayEl.dataset.wi) return;
    const id = findVideoId(overlayEl);
    if (!id) return;
    overlayEl.dataset.wi = id;

    // Si este video ya se marcó en esta sesión y reaparece al hacer scroll,
    // volvemos a pintar la barra.
    if (CLICKED.has(id)) showProgressBar(findThumbnail(overlayEl));

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
      const thumbnail = findThumbnail(overlayEl);
      setTimeout(() => showProgressBar(thumbnail), 1000);
    }, true);

    overlayEl.appendChild(btn);
  }

  function createEyeSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 1 24 22');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.25');
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

  // Pedir los settings al puente una vez registrado el listener (cubre que
  // bridge.js cargue antes o después que este script).
  document.dispatchEvent(new CustomEvent('wi-request-settings'));
})();
