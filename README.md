# WatchedIt

Extensión de navegador (Chrome/Edge, Manifest V3) que añade un botón con forma de ojo sobre las miniaturas de YouTube para **marcar un video como visto con un clic**, sin tener que abrirlo.

Al marcarlo, se registra en tu historial de YouTube y se pinta al instante la barra roja de progreso al 100% sobre la miniatura.

## Características

- Botón de ojo que aparece al pasar el ratón sobre la miniatura, integrado junto a los botones nativos de "Añadir a la cola" y "Ver más tarde".
- Marca el video como visto en tu cuenta usando los endpoints internos de YouTube (`youtubei`), autenticando la petición igual que la propia web.
- Barra de progreso roja inmediata sobre la miniatura, sin recargar la página.
- Funciona con videos normales y Shorts.

## Instalación (modo desarrollador)

1. Clona o descarga este repositorio.
2. Abre `chrome://extensions` (o `edge://extensions`).
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Pulsa **Cargar extensión sin empaquetar** y selecciona la carpeta del proyecto.
5. Abre un canal de YouTube y pasa el ratón sobre una miniatura: aparecerá el botón del ojo.

Tras editar el código, vuelve a `chrome://extensions` y pulsa el botón de recargar de la extensión, luego refresca la pestaña de YouTube.

## Estructura del proyecto

```
WatchedIt/
├── icons/            Iconos de la extensión (16/32/48/128 px)
├── manifest.json     Configuración de la extensión (Manifest V3)
├── content.js        Lógica: detección de miniaturas, UI del botón y llamadas a la API de YouTube
├── styles.css        Estilos del botón y de la barra de progreso
└── README.md
```

## Cómo funciona

`content.js` se inyecta en `www.youtube.com` en el mundo `MAIN` (para poder leer `ytcfg`, la configuración interna de YouTube). Observa el DOM con un `MutationObserver` y, cuando aparece el overlay de acciones de una miniatura, le añade el botón del ojo.

Al hacer clic:

1. Pide los datos del reproductor al endpoint `youtubei/v1/player`, autenticando con la cabecera `SAPISIDHASH` (derivada de tus cookies) para obtener el `playbackTracking`.
2. Llama a `videostatsPlaybackUrl` y luego a `videostatsWatchtimeUrl` para registrar la reproducción al 100% en tu historial (mismo flujo que usa yt-dlp en `_mark_watched`).

## Aviso

Esta extensión depende de **endpoints y estructuras internas de YouTube** que no son una API pública y **pueden cambiar sin previo aviso**, lo que rompería la funcionalidad. Es un proyecto personal/educativo; úsalo bajo tu propia responsabilidad y solo con tu propia cuenta.
