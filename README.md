# WatchedIt

**English** | [Español](README.es.md)

Browser extension (Chrome/Edge, Manifest V3) that adds an eye-shaped button on YouTube thumbnails to **mark a video as watched in one click**, without having to open it.

When you mark it, the video is recorded in your YouTube history and the red 100% progress bar is drawn instantly over the thumbnail.

## Features

- Eye button that appears when you hover over a thumbnail, integrated next to the native "Add to queue" and "Watch later" buttons.
- Marks the video as watched on your account using YouTube's internal endpoints (`youtubei`), authenticating the request the same way the web app does.
- Instant red progress bar over the thumbnail, without reloading the page.
- Works with regular videos and Shorts.

## Installation (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the project folder.
5. Open a YouTube channel and hover over a thumbnail: the eye button will appear.

After editing the code, go back to `chrome://extensions`, click the extension's reload button, then refresh the YouTube tab.

## Project structure

```
WatchedIt/
├── icons/            Extension icons (16/32/48/128 px)
├── manifest.json     Extension configuration (Manifest V3)
├── content.js        Logic: thumbnail detection, button UI and YouTube API calls
├── styles.css        Styles for the button and the progress bar
├── README.md         Documentation (English)
└── README.es.md      Documentation (Spanish)
```

## How it works

`content.js` is injected into `www.youtube.com` in the `MAIN` world (so it can read `ytcfg`, YouTube's internal configuration). It watches the DOM with a `MutationObserver` and, when a thumbnail's actions overlay appears, it adds the eye button.

On click:

1. It requests the player data from the `youtubei/v1/player` endpoint, authenticating with the `SAPISIDHASH` header (derived from your cookies) to obtain the `playbackTracking` data.
2. It calls `videostatsPlaybackUrl` and then `videostatsWatchtimeUrl` to register the playback at 100% in your history (the same flow yt-dlp uses in `_mark_watched`).

## Disclaimer

This extension relies on **internal YouTube endpoints and structures** that are not a public API and **may change without notice**, which would break its functionality. It is a personal/educational project; use it at your own risk and only with your own account.
