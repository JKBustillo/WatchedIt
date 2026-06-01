# WatchedIt

**English** | [Español](README.es.md)

Browser extension (Chrome/Edge, Manifest V3) for YouTube that lets you **mark videos as watched in one click** and **declutter your feeds** (hide Shorts, the "Most relevant" shelf and live streams). Everything is toggled from a popup in the toolbar, and the interface works in English and Spanish.

## Features

### Mark as watched
- **Eye button** on thumbnails (appears on hover, integrated next to the native "Add to queue" / "Watch later" buttons).
- **"Mark as watched" option in the 3-dot (⋮) menu**, available in every view: home, subscriptions, channels and the watch-page sidebar.
- Marks the video as watched on your account using YouTube's internal endpoints (`youtubei`), authenticating the request the same way the web app does.
- Instant red 100% progress bar over the thumbnail, without reloading the page.

### Feed filters
- **Hide Shorts** on home, subscriptions and search.
- **Hide the "Most relevant" shelf** on the subscriptions page.
- **Hide live streams** (live now + past streams) on subscriptions and search.

### Settings popup
- Click the extension icon in the toolbar to open a popup and toggle each feature on/off — no need to disable the whole extension.
- Preferences are saved with `chrome.storage.sync` and applied instantly, without reloading.

### Multi-language
- Works with YouTube in **English or Spanish**: detection adapts to the interface language, and the extension's own text (popup and the "Mark as watched" label) is shown accordingly.

## Installation (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the project folder.
5. Open YouTube. Hover over a thumbnail to see the eye button, and click the extension icon in the toolbar to open the settings popup.

After editing the code, go back to `chrome://extensions`, click the extension's reload button, then refresh the YouTube tab.

## Project structure

```
WatchedIt/
├── icons/            Extension icons (16/32/48/128 px)
├── manifest.json     Extension configuration (Manifest V3)
├── content.js        Main logic (MAIN world): eye button, ⋮ menu option, feed filters and YouTube API calls
├── bridge.js         Bridge (ISOLATED world): reads chrome.storage and relays settings to content.js
├── i18n.js           Shared dictionary (English / Spanish)
├── popup.html        Settings popup markup
├── popup.css         Settings popup styles
├── popup.js          Settings popup logic (reads/writes chrome.storage)
├── styles.css        Styles for the button, the progress bar and hidden elements
├── README.md         Documentation (English)
└── README.es.md      Documentation (Spanish)
```

## How it works

Two content scripts run on `www.youtube.com`:

- **`content.js`** runs in the `MAIN` world (so it can read `ytcfg`, YouTube's internal configuration). It watches the DOM with a `MutationObserver` to add the eye button, inject the "Mark as watched" option into the ⋮ menu, and apply the feed filters.
- **`bridge.js`** runs in the `ISOLATED` world — the only one with access to `chrome.storage`. It reads your preferences, relays them to `content.js` via a `CustomEvent`, and toggles CSS classes on `<html>` for the Shorts filter.

Marking a video as watched:

1. It requests the player data from the `youtubei/v1/player` endpoint, authenticating with the `SAPISIDHASH` header (derived from your cookies) to obtain the `playbackTracking` data.
2. It calls `videostatsPlaybackUrl` and then `videostatsWatchtimeUrl` to register the playback at 100% in your history (the same flow yt-dlp uses in `_mark_watched`).

The "Most relevant" and live-stream filters match YouTube's on-screen text (in any supported language); the Shorts filter is structural (CSS), so it does not depend on the language.

## Disclaimer

This extension relies on **internal YouTube endpoints and structures** that are not a public API and **may change without notice**, which would break its functionality. It is a personal/educational project; use it at your own risk and only with your own account.
