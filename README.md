# Showduino Studio - Complete Web UI

A comprehensive, offline-ready web application for controlling and building shows with the Showduino SUE device.

## File Structure

```
showduino/
├── index.html          # Main HTML entry point
├── style.css           # Complete styling with GoreFX theme
├── app.js              # Main application logic
├── js/
│   ├── api.js          # API client for all SUE endpoints
│   ├── shdo_model.js   # SHDO schema and data models
│   └── panels.js       # Panel component definitions
└── README.md           # This file
```

## Installation

1. Copy all files to the SD card in the `/web` directory:
   ```
   /web/index.html
   /web/style.css
   /web/app.js
   /web/js/api.js
   /web/js/shdo_model.js
   /web/js/panels.js
   ```

2. Ensure your SUE device has the SD card inserted and the web server is running.

3. Connect to the SUE device:
   - AP Mode: Connect to WiFi network "SUE_BOSS" (password: "showduino123")
   - Navigate to http://192.168.4.1 in your browser

## Features

### Core Features
- **Introduction Panel**: Welcome screen with user tier information
- **Connect Panel**: WiFi configuration and device discovery
- **Live Control**: Direct hardware control (LEDs, relays, audio, status LED)
- **Timeline Editor**: DAW-style show builder with draggable clips
- **Playback**: Transport controls and show execution
- **Audio Manager**: Audio file management and dual player control
- **Devices**: Device discovery and inventory
- **Diagnostics**: System status and diagnostics export
- **HauntSync**: Cloud sync integration (when online)
- **Settings**: System and app configuration
- **Help**: Documentation and contact information

### API Endpoints Supported

All SUE firmware endpoints are fully integrated:

#### Status & Connection
- `/api/status` - Device status
- `/api/wifi` - WiFi management
- `/api/espnow` - ESP-NOW configuration

#### LED Control
- `/api/led` - LED line control (single pixel, ranges, global color)
- `/api/led/settings` - LED hardware settings
- `/api/statusled` - Status LED control

#### Relays & PWM
- `/api/relay` - Digital relay control
- `/api/pwm` - PWM output control

#### Audio
- `/api/audio` - Audio playback control (play, stop, pause, resume, volume, list)
- `/api/audio/upload` - Audio file upload

#### RTC
- `/api/rtc` - Real-time clock get/set

#### Storage
- `/api/sd/list` - SD card directory listing
- `/api/sd/read` - Read file from SD
- `/api/sd/write` - Write file to SD
- `/api/sd/delete` - Delete file from SD

#### Projects (SHDO)
- `/api/project/list` - List all projects
- `/api/project/save` - Save project to SD
- `/api/project/load` - Load project from SD
- `/api/project/delete` - Delete project

#### OTA Updates
- `/api/ota` - OTA status and control
- `/api/ota/start` - Firmware upload

#### Firebase/HauntSync
- `/api/firebase` - Firebase configuration and status

## SHDO Format

The Showduino Show Document Object (SHDO) format is a JSON structure for show projects:

```json
{
  "project": {
    "id": "unique_id",
    "name": "Show Name",
    "version": "1.0.0",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  },
  "scenes": [...],
  "tracks": [...],
  "clips": [...],
  "globalSettings": {...},
  "assets": {...},
  "metadata": {...}
}
```

See `js/shdo_model.js` for complete schema and sample project.

## Autosave & Recovery

The application automatically saves project snapshots every 20 seconds to browser localStorage. Access recovery via:
- Call `window.showRecovery()` in browser console
- Or add a recovery menu item

Only the last 20 autosaves are kept to manage storage.

## Subscription Tiers

The application supports three subscription tiers with different feature access:

- **Owner**: Full access to all features (free for Showduino owners)
- **Creator**: Timeline editor, playback, audio manager, HauntSync (cloud-only)
- **Pro**: All features except owner-specific integrations

Current tier is configured in `app.js`:
```javascript
state.user.subscription = 'creator'; // Change to 'owner' or 'pro'
```

## Development

The application is built with vanilla JavaScript (no frameworks) for maximum compatibility and offline operation. All modules are loaded via script tags and work in standard browsers.

### Adding New Panels

1. Add panel HTML generation method to `PanelManager` class in `js/panels.js`
2. Add panel case to `loadPanel()` function in `app.js`
3. Add initialization function if needed
4. Add navigation item to `index.html` sidebar

### Extending API Client

Add new methods to `ShowduinoAPI` class in `js/api.js` following the existing pattern.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)

## Troubleshooting

**Connection issues:**
- Ensure device is powered on and SD card is inserted
- Check WiFi connection to SUE_BOSS network
- Verify web server is running (check serial output)

**Panel not loading:**
- Check browser console for errors
- Verify all JS files are loaded (Network tab)
- Check file paths match SD card structure

**API errors:**
- Check device status via `/api/status`
- Verify endpoint URLs in browser Network tab
- Check serial output on device for errors

## Support

- Website: https://show-duino.com
- Email: showduino38@gmail.com

## License

Showduino Studio - Copyright 2024

