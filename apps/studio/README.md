# Showduino Studio — Windows + Android app foundation

**Status: source-only prototype; not a tested or released installer.** This packages the existing canonical `studio.html` authoring frontend from `sumkindafreak/showduino.com`. Do **not** substitute the Comms-hosted system console in `new_showduino/web/showduino-studio/`; that is a different product surface.

## Architecture

- One Studio UI and one SHDO v2 authoring model, shared on Windows and Android.
- Windows: Electron window with Node integration OFF, context isolation and renderer sandbox ON; no privileged preload or exposed native API.
- Android: Capacitor local web assets, Android project generated with `cap add android`.
- Show selection, start/stop and production control remain Director-owned. P4 owns execution and Emergency independently; this app is a creator/transfer client only.
- Default to offline editing and exporting .shdo. No auto-start on deployment and no Emergency clear capability.

## Prerequisites

Node.js + npm. For Android, Android Studio, Android SDK and JDK are required. For Windows installer packaging, use Windows build tools.

From the website repository root:

```powershell
cd apps/studio
npm install
npm run start:windows
```

Build an unsigned Windows installer on a Windows development machine:

```powershell
npm run build:windows
```

Android project creation (first time only) and launch:

```powershell
npm run android:init
npm run android:open
```

After website Studio changes:

```powershell
npm run android:sync
```

The `prepare:web` script copies the website's existing authoring assets into a generated `dist/`. Do not commit `dist/`, `android/`, or `node_modules/` in this initial PR.

## Known limitations / acceptance before publishing

1. **Not yet tested:** no Windows .exe/.msi or Android APK has been produced in this PR. Test the launch screen, all tabs, .shdo import/export, local save, mobile viewport and Android back navigation.
2. **External CDNs:** existing Studio HTML loads Supabase and Anime.js via HTTPS. Initial offline authoring may be affected; vendor/replace those dependencies before advertising fully offline support.
3. **Relative assets:** some Studio modules may load additional dynamic resources. Inspect runtime logs and bundle any missing resources before release.
4. **Local device connectivity:** the website's current deployment code assumes browser-origin same-origin endpoints. A packaged renderer has a different origin and Android local-network/HTTP rules; do not turn off web security or assume direct P4 control works. Build an explicit, restricted transport after hardware testing; require confirmation before any deploy command. No automatic RUN.
5. **Authentication:** validate OAuth redirect/deep-link behaviour separately if HauntSync login is enabled in packaged builds.
6. **Security:** restrict navigations, permissions and exposed file access; audit dependency versions, CSP, content loading and signed release artefacts.
7. **Build verification:** run `npm install`, `npm run prepare:web`, Electron launch and Android sync on an actual development machine before marking green.

## Keep the hardware finish line separate

The non-DMX 22-second physical scenario and Emergency acceptance remain tracked in `new_showduino`. Building the app does not change hardware firmware or certify Emergency response.
