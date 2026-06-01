# WatchedIt

[English](README.md) | **Español**

Extensión de navegador (Chrome/Edge, Manifest V3) para YouTube que te permite **marcar videos como vistos con un clic** y **limpiar tus feeds** (ocultar Shorts, la sección "Más relevantes" y las emisiones en directo). Todo se activa/desactiva desde un popup en la barra de herramientas, y la interfaz funciona en inglés y español.

## Características

### Marcar como visto
- **Botón de ojo** sobre las miniaturas (aparece al pasar el ratón, integrado junto a los botones nativos de "Añadir a la cola" / "Ver más tarde").
- **Opción "Marcar como visto" en el menú de tres puntos (⋮)**, disponible en todas las vistas: inicio, suscripciones, canales y la barra lateral de la página de un video.
- Marca el video como visto en tu cuenta usando los endpoints internos de YouTube (`youtubei`), autenticando la petición igual que la propia web.
- Barra de progreso roja al 100% inmediata sobre la miniatura, sin recargar la página.

### Filtros del feed
- **Ocultar Shorts** en inicio, suscripciones y búsqueda.
- **Ocultar la sección "Más relevantes"** en la página de suscripciones.
- **Ocultar emisiones en directo** (en curso + pasadas) en suscripciones y búsqueda.

### Popup de configuración
- Pulsa el icono de la extensión en la barra para abrir un popup y activar/desactivar cada función — sin necesidad de desactivar toda la extensión.
- Las preferencias se guardan con `chrome.storage.sync` y se aplican al instante, sin recargar.

### Multi-idioma
- Funciona con YouTube en **inglés o español**: la detección se adapta al idioma de la interfaz, y los textos propios de la extensión (popup y la etiqueta "Marcar como visto") se muestran en consecuencia.

## Instalación (modo desarrollador)

1. Clona o descarga este repositorio.
2. Abre `chrome://extensions` (o `edge://extensions`).
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Pulsa **Cargar extensión sin empaquetar** y selecciona la carpeta del proyecto.
5. Abre YouTube. Pasa el ratón sobre una miniatura para ver el botón del ojo, y pulsa el icono de la extensión en la barra para abrir el popup de configuración.

Tras editar el código, vuelve a `chrome://extensions` y pulsa el botón de recargar de la extensión, luego refresca la pestaña de YouTube.

## Estructura del proyecto

```
WatchedIt/
├── icons/            Iconos de la extensión (16/32/48/128 px)
├── manifest.json     Configuración de la extensión (Manifest V3)
├── content.js        Lógica principal (mundo MAIN): botón del ojo, opción del menú ⋮, filtros del feed y llamadas a la API de YouTube
├── bridge.js         Puente (mundo ISOLATED): lee chrome.storage y relaya los ajustes a content.js
├── i18n.js           Diccionario compartido (inglés / español)
├── popup.html        Estructura del popup de configuración
├── popup.css         Estilos del popup de configuración
├── popup.js          Lógica del popup de configuración (lee/escribe chrome.storage)
├── styles.css        Estilos del botón, la barra de progreso y los elementos ocultos
├── README.md         Documentación (inglés)
└── README.es.md      Documentación (español)
```

## Cómo funciona

Dos content scripts se ejecutan en `www.youtube.com`:

- **`content.js`** corre en el mundo `MAIN` (para poder leer `ytcfg`, la configuración interna de YouTube). Observa el DOM con un `MutationObserver` para añadir el botón del ojo, inyectar la opción "Marcar como visto" en el menú ⋮ y aplicar los filtros del feed.
- **`bridge.js`** corre en el mundo `ISOLATED` — el único con acceso a `chrome.storage`. Lee tus preferencias, las relaya a `content.js` mediante un `CustomEvent` y activa clases CSS en `<html>` para el filtro de Shorts.

Al marcar un video como visto:

1. Pide los datos del reproductor al endpoint `youtubei/v1/player`, autenticando con la cabecera `SAPISIDHASH` (derivada de tus cookies) para obtener el `playbackTracking`.
2. Llama a `videostatsPlaybackUrl` y luego a `videostatsWatchtimeUrl` para registrar la reproducción al 100% en tu historial (mismo flujo que usa yt-dlp en `_mark_watched`).

Los filtros de "Más relevantes" y de directos coinciden con el texto que YouTube muestra en pantalla (en cualquier idioma soportado); el filtro de Shorts es estructural (CSS), así que no depende del idioma.

## Aviso

Esta extensión depende de **endpoints y estructuras internas de YouTube** que no son una API pública y **pueden cambiar sin previo aviso**, lo que rompería la funcionalidad. Es un proyecto personal/educativo; úsalo bajo tu propia responsabilidad y solo con tu propia cuenta.
