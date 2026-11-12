'use strict';

// Keep the public early-access promise aligned across the homepage, Studio and docs.
// This does not substitute for browser acceptance tests or real account delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const home = read('index.html');
const studio = read('studio.html');
const docs = read('docs.html');
const projects = read('js/studio-projects.js');

assert.match(home, /STUDIO EARLY ACCESS/);
assert.match(home, /href="studio\.html">Create your first show<\/a>/);
assert.match(home, /id="studio-early-access"/);
assert.match(home, /No hardware required|NO HARDWARE REQUIRED/i);
assert.match(home, /href="docs\.html#studio-early-access"/);
assert.match(home, /Browser storage alone can be cleared or lost/);

assert.match(studio, /EARLY ACCESS · Create now, no hardware required/);
assert.match(studio, /export \.shdo to protect your show/i);
assert.match(studio, /id="studio-export-button"/);
assert.match(studio, /id="studio-save-button"/);

assert.match(docs, /id="studio-early-access"/);
assert.match(docs, /No Showduino controller or account is required/);
assert.match(docs, /Export \.shdo/);
assert.match(docs, /Browser storage is tied to this browser and device/);
assert.match(docs, /A browser preview never proves/);

assert.match(projects, /function autosaveCurrentProject/);
assert.match(projects, /function saveCurrentProject/);
assert.match(projects, /function exportCurrentProject/);
assert.match(projects, /function importProjectFile|function importProject|function importCurrentProject/);

console.log('PASS: early-access creator messaging, local save/export path, and getting-started links.');
