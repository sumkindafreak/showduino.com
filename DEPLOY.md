# Deploy Showduino Website to GitHub Pages

This guide will help you deploy all the updated files to your GitHub repository.

## Files Prepared for Deployment

### HTML Files
- `index.html` - Main landing page
- `studio.html` - Showduino Studio application
- `hauntsync.html` - HauntSync cloud platform

### CSS & JavaScript
- `style.css` - Main stylesheet
- `app.js` - Main application logic
- `js/` directory with 14 JavaScript modules

### Documentation
- `README.md` - Main documentation
- `FIREBASE_SETUP.md` - Firebase setup instructions
- `PAYPAL_SETUP.md` - PayPal integration guide
- `GITHUB_UPDATE_INSTRUCTIONS.md` - Update instructions

## Option 1: Deploy via Command Line (Recommended)

### Step 1: Navigate to your GitHub repository

```bash
cd /path/to/your/showduino.com
```

For example:
```bash
cd C:\Users\tjpro\Documents\GitHub\showduino.com
```

### Step 2: Copy all files from deployment folder

Copy all files from `c:\Users\tjpro\Desktop\showduino\github-deployment\*` to your repository folder.

```bash
# On Windows (PowerShell)
Copy-Item -Path "c:\Users\tjpro\Desktop\showduino\github-deployment\*" -Destination "." -Recurse -Force

# On Windows (Command Prompt)
xcopy "c:\Users\tjpro\Desktop\showduino\github-deployment\*" . /E /Y

# On Linux/Mac
cp -r /path/to/github-deployment/* .
```

### Step 3: Check what changed

```bash
git status
```

### Step 4: Add all changes

```bash
git add .
```

### Step 5: Commit with a descriptive message

```bash
git commit -m "Complete website update with HauntSync, Studio, and Firebase integration"
```

### Step 6: Push to GitHub

```bash
git push origin main
```

If your main branch is called `master` instead of `main`:
```bash
git push origin master
```

### Step 7: Wait for deployment

GitHub Pages usually takes 1-2 minutes to deploy. Your site will be live at:
- `https://sumkindafreak.github.io/showduino.com/`
- Or your custom domain: `https://show-duino.com`

## Option 2: Deploy via GitHub Desktop

1. Open GitHub Desktop
2. Select your `showduino.com` repository
3. Copy all files from the deployment folder to your repository folder
4. GitHub Desktop will show all changes
5. Enter a commit message: "Complete website update"
6. Click "Commit to main"
7. Click "Push origin"

## Option 3: Manual Upload via GitHub Website

1. Go to `https://github.com/sumkindafreak/showduino.com`
2. Click "Add file" > "Upload files"
3. Drag and drop all files from the deployment folder
4. Scroll down and click "Commit changes"
5. Wait for GitHub Pages to deploy

## What's Included

### Core Features
✅ Responsive landing page with logo and navigation
✅ Showduino Studio - Full show control interface
✅ HauntSync - Cloud platform with authentication
✅ Firebase integration (requires configuration)
✅ PayPal subscription system (requires configuration)
✅ Mobile-responsive design
✅ Offline-capable architecture

### JavaScript Modules
- `api.js` - SUE device API client
- `firebase_config.js` - Firebase configuration
- `firebase_auth.js` - User authentication
- `firebase_sync.js` - Cloud synchronization
- `paypal_config.js` - PayPal configuration
- `paypal_integration.js` - Subscription handling
- `connection_detector.js` - Network mode detection
- `shdo_model.js` - Show data model
- Additional modules for timeline, audio, DMX, LEDs, forum, panels

## Next Steps After Deployment

### 1. Configure Firebase (Optional but Recommended)
Follow instructions in `FIREBASE_SETUP.md` to enable:
- User authentication
- Cloud project sync
- Community forum
- Real-time collaboration

### 2. Configure PayPal (For Subscription Features)
Follow instructions in `PAYPAL_SETUP.md` to enable:
- Pro subscription ($9.99/month)
- Enterprise subscription ($29.99/month)
- Automatic billing

### 3. Test Your Website
- Visit your GitHub Pages URL
- Test all three pages (Home, Studio, HauntSync)
- Try signing up/signing in (after Firebase config)
- Verify mobile responsiveness

## Troubleshooting

### Site not updating?
- Clear browser cache (Ctrl+F5 or Cmd+Shift+R)
- Wait a few minutes for GitHub Pages to deploy
- Check GitHub Actions tab for deployment status

### 404 errors?
- Ensure all files are in the root directory
- Check that `index.html` exists in root
- Verify repository settings: Settings > Pages > Source = main branch

### Features not working?
- Check browser console for errors (F12)
- Verify Firebase/PayPal configuration if using those features
- Ensure all JavaScript files are loading (Network tab in DevTools)

## File Structure

```
showduino.com/
├── index.html
├── studio.html
├── hauntsync.html
├── style.css
├── app.js
├── js/
│   ├── api.js
│   ├── firebase_config.js
│   ├── firebase_auth.js
│   ├── firebase_sync.js
│   ├── paypal_config.js
│   ├── paypal_integration.js
│   ├── connection_detector.js
│   ├── shdo_model.js
│   ├── timeline.js
│   ├── audio_browser.js
│   ├── dmx_editor.js
│   ├── led_studio.js
│   ├── forum.js
│   └── panels.js
├── README.md
├── FIREBASE_SETUP.md
├── PAYPAL_SETUP.md
└── GITHUB_UPDATE_INSTRUCTIONS.md
```

## Support

For issues or questions:
- Email: showduino38@gmail.com
- Website: https://show-duino.com
- GitHub: https://github.com/sumkindafreak/showduino.com

---

**Ready to deploy!** Follow the steps above to update your live website.
