# Instructions to Update Your GitHub Pages Site

This guide will help you update your GitHub repository with the new Showduino/HauntSync integration.

## Step 1: Prepare Your Files

I've created an updated `website_index.html` file for you. Here's what you need to do:

## Step 2: Update Your Local Repository

1. **Navigate to your local GitHub repository folder** (where you cloned `showduino.com`)
   ```bash
   cd path/to/showduino.com
   ```

2. **Copy the new index.html**
   - Copy `website_index.html` from `c:\Users\tjpro\Desktop\showduino\website_index.html`
   - Rename it to `index.html` in your GitHub repo folder
   - This will replace your existing index.html

3. **Copy other required files** (if not already in repo):
   - `studio.html`
   - `hauntsync.html`
   - `style.css` (or update existing one)
   - `js/` folder with all JavaScript files

## Step 3: Push to GitHub

```bash
# Add all changes
git add .

# Commit with a message
git commit -m "Update website with HauntSync and Studio integration"

# Push to GitHub
git push origin main
```

## Step 4: Verify on GitHub Pages

Your site should update automatically at: `https://sumkindafreak.github.io/showduino.com/`

## Files You Need to Ensure Are in Your Repo

### Required Files:
- `index.html` (updated version)
- `style.css`
- `studio.html`
- `hauntsync.html`
- `js/firebase_config.js`
- `js/firebase_auth.js`
- `js/firebase_sync.js`
- `js/paypal_config.js`
- `js/paypal_integration.js`
- `js/forum.js`
- `js/api.js`
- `js/shdo_model.js`
- `js/timeline.js`
- `js/audio_browser.js`
- `js/dmx_editor.js`
- `js/led_studio.js`
- `js/panels.js`
- `js/connection_detector.js`
- `app.js`

### Optional Files:
- `FIREBASE_SETUP.md`
- `PAYPAL_SETUP.md`

## Notes

- GitHub Pages will automatically deploy changes after you push
- If using a custom domain (show-duino.com), make sure `CNAME` file is still in repo
- All file paths should be relative (which they are)

