# Firebase Setup Guide for Showduino

This guide will help you set up Firebase for cloud sync, authentication, and real-time features.

## Prerequisites

1. A Google account
2. Access to [Firebase Console](https://console.firebase.google.com/)

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Enter project name (e.g., "showduino")
4. (Optional) Enable Google Analytics
5. Click "Create project"

## Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** provider:
   - Click "Email/Password"
   - Toggle "Enable"
   - Click "Save"
3. Enable **Google** provider (optional):
   - Click "Google"
   - Toggle "Enable"
   - Enter support email
   - Click "Save"

## Step 3: Create Firestore Database

1. Go to **Firestore Database** in Firebase Console
2. Click "Create database"
3. Start in **Production mode** (you can change rules later)
4. Select a location closest to your users
5. Click "Enable"

### Firestore Security Rules

Update your Firestore rules to allow authenticated users to read/write their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Users can read/write their own projects
      match /projects/{projectId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    // Posts are readable by all, writable by authenticated users
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        (request.auth.uid == resource.data.authorId || request.auth.uid == request.resource.data.authorId);
      
      // Comments
      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow update, delete: if request.auth != null && 
          (request.auth.uid == resource.data.authorId || request.auth.uid == request.resource.data.authorId);
      }
    }
  }
}
```

## Step 4: Get Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ > **Project settings**
2. Scroll down to "Your apps" section
3. Click the **Web** icon (</>)
4. Register your app (give it a nickname like "Showduino Web")
5. Copy the `firebaseConfig` object

## Step 5: Update Configuration File

1. Open `js/firebase_config.js`
2. Replace the placeholder values with your Firebase config:

```javascript
const FIREBASE_CONFIG = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

## Step 6: Enable Firebase Storage (Optional, for project files)

1. Go to **Storage** in Firebase Console
2. Click "Get started"
3. Start in production mode
4. Use same location as Firestore
5. Click "Done"

### Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Step 7: Test the Integration

1. Open `hauntsync.html` in your browser
2. You should see a "Sign In / Sign Up" section
3. Create an account:
   - Enter email and password
   - Enter a username
   - Click "Sign Up"
4. After signing in, you should see your email displayed
5. Create a test post - it should sync to Firebase
6. Check Firebase Console > Firestore to see your data

## Features Enabled with Firebase

✅ **User Authentication**
- Email/password sign up and sign in
- Google sign in
- Persistent sessions

✅ **Cloud Sync**
- Forum posts sync in real-time
- User profiles sync across devices
- Subscription status syncs
- Project files can be backed up to cloud

✅ **Real-time Updates**
- See new posts from other users instantly
- Comments update in real-time
- Like counts sync automatically

✅ **Offline Support**
- Works offline with localStorage fallback
- Syncs automatically when connection restored
- Queues operations when offline

## Troubleshooting

### Firebase SDK not loading
- Check browser console for errors
- Ensure internet connection
- Verify CDN URLs are correct in HTML

### Authentication not working
- Check Firebase Console > Authentication is enabled
- Verify email/password provider is enabled
- Check browser console for errors

### Posts not syncing
- Check if user is signed in
- Verify Firestore rules allow writes
- Check browser console for errors
- Ensure Firestore database is created

### Config errors
- Double-check all config values are correct
- Ensure no extra quotes or spaces
- Verify project ID matches in all fields

## Alternative: Configure via SUE Device

You can also configure Firebase through the SUE device's web interface:

1. Connect to your SUE device
2. Navigate to Settings > Firebase
3. Enter your Firebase credentials
4. Save configuration

The web UI will automatically load config from the device if available.

