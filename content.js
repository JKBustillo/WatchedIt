(() => {
  const CLICKED = new Set();
  const I18N = window.WI_I18N;

  // ── i18n ────────────────────────────────────────────────────
  // La etiqueta "Marcar como visto" se muestra en el idioma de YouTube para
  // combinar con el menú. Se resuelve perezosamente (ytcfg listo al usarse).
  let _label = null;
  function markLabel() {
    if (_label == null) {
      const loc = I18N.pickLocale(ytcfgGet('HL') || document.documentElement.lang);
      _label = I18N.strings[loc].markWatched;
    }
    return _label;
  }

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
    applyFilters();
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
    btn.title = markLabel();
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

  // ── Menú de 3 puntos (kebab) ────────────────────────────────
  // El popup del menú es único y YouTube reutiliza sus items entre aperturas
  // (no siempre dispara mutaciones), así que NO dependemos del observer:
  // inyectamos al pulsar el ⋮ y reintentamos mientras el menú aparece.
  let menuVideoId = null;
  let menuAnchor = null;
  let menuOpenedAt = 0;

  document.addEventListener('click', (e) => {
    // UI nueva: el ⋮ es un button-view-model dentro de un lockup.
    // UI vieja: ytd-menu-renderer. Cubrimos ambas.
    const trigger = e.target?.closest?.('ytd-menu-renderer, button-view-model');
    if (!trigger) return;
    menuVideoId = findVideoId(trigger);
    menuAnchor = trigger;
    menuOpenedAt = Date.now();
    // Si el botón no pertenece a un vídeo (no es el ⋮), no hacemos nada; si era
    // un menú real, la inyección solo prosperará cuando aparezca el menú.
    if (!menuVideoId) return;

    // Quitamos cualquier ítem nuestro previo (videoId obsoleto) y reintentamos
    // inyectar mientras el dropdown se renderiza de forma asíncrona.
    document.querySelectorAll('.wi-menu-item').forEach((el) => el.remove());
    let tries = 0;
    const tick = () => {
      tryInjectIntoOpenMenus();
      if (++tries < 12) setTimeout(tick, 50);
    };
    tick();
  }, true);

  function tryInjectIntoOpenMenus() {
    // UI nueva (view-model): yt-list-view-model dentro de un dropdown/sheet.
    document.querySelectorAll('yt-list-view-model').forEach((list) => {
      if (list.closest('tp-yt-iron-dropdown, yt-sheet-view-model, ytd-popup-container')) {
        injectIntoList(list);
      }
    });
    // UI vieja (Polymer): #items con ytd-menu-service-item-renderer.
    document.querySelectorAll('#items').forEach((lb) => {
      if (lb.closest('ytd-menu-popup-renderer, tp-yt-iron-dropdown')) {
        injectIntoListbox(lb);
      }
    });
  }

  // Inyección en el menú nuevo (yt-list-item-view-model).
  function injectIntoList(list) {
    if (!settings.markWatchedEnabled) return;
    if (!menuVideoId || Date.now() - menuOpenedAt > 1500) return;
    if (list.querySelector('.wi-menu-item')) return;

    const template = list.querySelector('yt-list-item-view-model');
    if (!template) return;

    const videoId = menuVideoId;
    const anchor = menuAnchor;

    const item = template.cloneNode(true);
    item.classList.add('wi-menu-item');

    const title = item.querySelector('.ytListItemViewModelTitle, .yt-core-attributed-string');
    if (title) title.textContent = markLabel();

    // Sustituimos el SVG del icono por el ojito.
    const oldSvg = item.querySelector('svg');
    if (oldSvg) {
      const svg = createEyeSvg();
      svg.classList.add('wi-menu-eye');
      oldSvg.replaceWith(svg);
    }

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!CLICKED.has(videoId)) {
        CLICKED.add(videoId);
        markWatchedInYouTube(videoId);
      }
      const thumb = findThumbnail(anchor);
      setTimeout(() => showProgressBar(thumb), 1000);
      closeOpenMenus();
    }, true);

    // Lo añadimos en el mismo contenedor que el resto de items.
    template.parentElement.appendChild(item);
    refitMenu(list);
  }

  function closeOpenMenus() {
    document.querySelectorAll('tp-yt-iron-dropdown').forEach((dd) => {
      try { dd.close?.(); } catch {}
    });
  }

  // El dropdown fija su altura al abrirse, antes de que inyectemos el item;
  // le pedimos que recalcule tamaño/posición para que no aparezca scroll.
  function refitMenu(el) {
    const dd = el.closest('tp-yt-iron-dropdown');
    if (!dd) return;
    requestAnimationFrame(() => {
      try { dd.notifyResize?.(); } catch {}
      try { dd.refit?.(); } catch {}
    });
  }

  function injectIntoListbox(listbox) {
    if (!settings.markWatchedEnabled) return;
    if (!menuVideoId || Date.now() - menuOpenedAt > 1500) return;
    if (listbox.querySelector('.wi-menu-item')) return;

    // Clonamos un ítem nativo para heredar el estilo de YouTube.
    const template = listbox.querySelector('ytd-menu-service-item-renderer');
    if (!template) return;

    const videoId = menuVideoId;
    const anchor = menuAnchor;

    const item = template.cloneNode(true);
    item.classList.add('wi-menu-item');

    const label = item.querySelector('yt-formatted-string, .yt-core-attributed-string');
    if (label) label.textContent = markLabel();

    // Reemplazamos el icono nativo por el ojito (yt-icon usa shadow DOM, así
    // que sustituimos el elemento entero por un span con nuestro SVG).
    const icon = item.querySelector('yt-icon');
    if (icon) {
      const span = document.createElement('span');
      span.className = icon.className;
      const svg = createEyeSvg();
      svg.classList.add('wi-menu-eye');
      span.appendChild(svg);
      icon.replaceWith(span);
    }

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!CLICKED.has(videoId)) {
        CLICKED.add(videoId);
        markWatchedInYouTube(videoId);
      }
      const thumb = findThumbnail(anchor);
      setTimeout(() => showProgressBar(thumb), 1000);
      closeOpenMenus();
    }, true);

    listbox.appendChild(item);
    refitMenu(listbox);
  }

  // ── Filtros: Más relevantes y directos ──────────────────────
  // (Shorts se ocultan por CSS con la clase wi-hide-shorts de bridge.js.)

  function isSubsPage() {
    return location.pathname.startsWith('/feed/subscriptions');
  }

  function isSearchPage() {
    return location.pathname.startsWith('/results');
  }

  // Sección "Más relevantes" de Suscripciones: ocultamos el shelf cuyo #title
  // coincida (en cualquier idioma soportado). Reversible (toggle quita la clase).
  function filterMostRelevant() {
    const on = settings.hideMostRelevant;
    document.querySelectorAll('ytd-rich-shelf-renderer').forEach((shelf) => {
      const title = shelf.querySelector('#title');
      const isMR = !!title && I18N.detect.mostRelevant.includes(title.textContent.trim());
      shelf.classList.toggle('wi-hidden-mr', on && isMR);
    });
  }

  function isLiveContainer(c) {
    // Directo en curso: insignia "EN DIRECTO" / "LIVE" en la MINIATURA. No usamos
    // la del avatar (ytSpecAvatarShapeLiveBadgeText) porque aparece también en
    // vídeos normales de canales que están emitiendo en otro sitio.
    const badges = c.querySelectorAll('.ytBadgeShapeText, .badge-shape-wiz__text, ' +
      '.ytThumbnailBadgeViewModelBadge, ytd-thumbnail-overlay-time-status-renderer, ' +
      '[overlay-style="LIVE"], .badge-style-type-live-now');
    for (const b of badges) {
      if (I18N.detect.liveRe.test(b.textContent || '')) return true;
    }
    // Emisiones pasadas ("Emitido hace…" / "Streamed … ago", etc.).
    if (I18N.detect.pastRe.test(c.textContent || '')) return true;
    return false;
  }

  // Directos (en curso + pasados) en Suscripciones y búsqueda. Usamos toggle
  // para soportar el reciclado de nodos que hace YouTube al hacer scroll.
  function filterLive() {
    const on = settings.hideLive && (isSubsPage() || isSearchPage());
    document.querySelectorAll(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model'
    ).forEach((c) => {
      c.classList.toggle('wi-hidden-live', on && isLiveContainer(c));
    });
  }

  function applyFilters() {
    filterMostRelevant();
    filterLive();
  }

  let filtersQueued = false;
  function scheduleFilters() {
    if (filtersQueued) return;
    filtersQueued = true;
    requestAnimationFrame(() => { filtersQueued = false; applyFilters(); });
  }

  window.addEventListener('yt-navigate-finish', scheduleFilters);

  // ── Init + observer ─────────────────────────────────────────

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
    // Re-aplicar filtros JS cuando aparezcan vídeos/secciones nuevos.
    if (settings.hideMostRelevant || settings.hideLive) scheduleFilters();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Pedir los settings al puente una vez registrado el listener (cubre que
  // bridge.js cargue antes o después que este script).
  document.dispatchEvent(new CustomEvent('wi-request-settings'));
})();
