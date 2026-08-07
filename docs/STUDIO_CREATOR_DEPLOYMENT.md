# Showduino Studio creator/deployment contract

`showduino.com/studio.html` is the creator surface. It can create, preview, save, cloud-sync, import and export `.shdo` projects without a physical Showduino connected.

Deployment targets the local Showduino gateway only. The browser probes `http://showduino-studio.local` and the fallback AP address `http://192.168.4.1`, then POSTs the current project to `/api/production/import`.

If no local Showduino can be reached, Studio exports the exact same project as a `.shdo` file for manual transfer/import. The public site does not require a Showduino or venue Internet connection to create projects.

The `.shdo` payload remains JSON and must include a `project` object. Current creator projects also carry `scenes`, `tracks`, `clips`, `globalSettings`, `assets` and `metadata` when present.
