'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const dest = path.resolve(__dirname, '../dist');
const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
// The canonical authoring UI is studio.html in the website repository.
// Copy only its current dependencies; never bundle secrets, .git or site admin pages.
for (const file of ['studio.html', 'style.css', 'app.js']) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) throw new Error('Missing canonical Studio asset: ' + file);
  copyFile(source, path.join(dest, file === 'studio.html' ? 'index.html' : file));
}
for (const folder of ['css', 'js', 'media', 'config']) {
  const source = path.join(root, folder);
  if (!fs.existsSync(source)) throw new Error('Missing asset folder: ' + folder);
  fs.cpSync(source, path.join(dest, folder), { recursive: true });
}
const indexPath = path.join(dest, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
// No live Showduino control is implicitly granted by installing an app.
// Deployment remains gated by Studio's existing API checks.
html = html.replace('<title>Showduino Studio | Production Creator</title>',
  '<title>Showduino Studio | Desktop & Android</title>');
fs.writeFileSync(indexPath, html);
console.log('Prepared Showduino Studio local app assets:', dest);
