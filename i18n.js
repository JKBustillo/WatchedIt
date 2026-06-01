// Diccionario i18n compartido por content.js (MAIN world, sin chrome.i18n) y
// popup.js. Dos mecanismos:
//   • strings → textos NUESTROS (popup + etiqueta "Marcar como visto"), se
//     eligen según el idioma (ver pickLocale).
//   • detect  → textos de YouTube que debemos RECONOCER; usamos la UNIÓN de
//     todos los idiomas para que la detección funcione sea cual sea el idioma
//     de la interfaz, sin depender de detectarlo.

window.WI_I18N = {
  strings: {
    es: {
      markWatched: 'Marcar como visto',
      markWatchedDesc: 'Botón del ojito y opción en el menú de ⋮',
      hideShorts: 'Ocultar Shorts',
      hideShortsDesc: 'En inicio, suscripciones y búsqueda',
      hideMostRelevant: 'Ocultar «Más relevantes»',
      hideMostRelevantDesc: 'Sección en mis suscripciones',
      hideLive: 'Ocultar directos',
      hideLiveDesc: 'En curso y emisiones pasadas',
    },
    en: {
      markWatched: 'Mark as watched',
      markWatchedDesc: 'Eye button and option in the ⋮ menu',
      hideShorts: 'Hide Shorts',
      hideShortsDesc: 'On home, subscriptions and search',
      hideMostRelevant: 'Hide “Most relevant”',
      hideMostRelevantDesc: 'Section in my subscriptions',
      hideLive: 'Hide live streams',
      hideLiveDesc: 'Live now and past streams',
    },
  },

  // Unión ES + EN.
  detect: {
    // Título del estante de Suscripciones que se oculta con "Ocultar Más relevantes".
    mostRelevant: ['Más relevantes', 'Most relevant'],
    // Insignia de directo EN CURSO (se prueba solo contra badges, texto corto).
    liveRe: /en directo|en vivo|\blive\b/i,
    // Emisiones PASADAS (se prueba contra el texto del contenedor).
    pastRe: /emitido hace|se emitió|retransmitido hace|streamed/i,
  },

  // Normaliza un código de idioma (es-419, en-GB…) a 'es' o 'en' (fallback 'en').
  pickLocale(code) {
    const base = String(code || '').toLowerCase().split('-')[0];
    return base === 'es' ? 'es' : 'en';
  },
};
