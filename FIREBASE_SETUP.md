# Showduino / HauntSync Firebase

Showduino now uses the existing Firebase project **`hauntsync-forum-4b992`** as the cloud backend for HauntSync and signed-in Studio projects.

## What Firebase owns

- **Firebase Authentication** — Showduino ID sign-up/sign-in/password reset/email verification.
- **Cloud Firestore** — HauntSync community posts and replies.
- **Cloud Firestore** — private per-user Showduino projects.
- **Cloud Firestore** — private per-user device inventory.
- Existing Firebase Functions / Stripe integration remain separate and are not changed by the HauntSync client.

## Web app configuration

The public Firebase web configuration lives in:

`config/runtime-config.js`

The project is:

- Project ID: `hauntsync-forum-4b992`
- Auth domain: `hauntsync-forum-4b992.firebaseapp.com`

Firebase web config values are public client identifiers. **Never commit service-account JSON, Admin SDK private keys, Stripe secrets, or other server credentials.**

## Required Firebase Console checks

Open Firebase Console and select `hauntsync-forum-4b992`.

### Authentication

Under **Authentication → Sign-in method**:

1. Enable **Email/Password**.
2. Keep any other providers disabled until they are deliberately added to the Showduino UI.

Under **Authentication → Settings → Authorized domains**, make sure these are present:

- `show-duino.com`
- `www.show-duino.com` if the site uses the www host
- `localhost` for local development

### Firestore

The repository contains the production rules in `firestore.rules`.

Data layout:

```text
profiles/{uid}
users/{uid}/projects/{projectId}
users/{uid}/devices/{deviceId}
posts/{postId}
posts/{postId}/comments/{commentId}
```

Community posts/replies are publicly readable. Creating content requires authentication. Private projects, device inventory and profiles are restricted to their owning Firebase user.

The rules deliberately preserve the existing protection around Stripe/subscription fields on `users/{uid}` so browser clients cannot grant themselves subscription state.

## Deploy Firestore rules

With Firebase CLI authenticated to the project:

```bash
firebase use hauntsync-forum-4b992
firebase deploy --only firestore:rules,firestore:indexes
```

`.firebaserc` already selects `hauntsync-forum-4b992`, and `firebase.json` already points to `firestore.rules` and `firestore.indexes.json`.

## Website integration

- `account.html` uses `js/cloud/firebase-service.js` for Showduino ID authentication.
- `hauntsync.html` uses Firebase for the live community, replies, projects and device inventory.
- `studio.html` continues to save locally and also saves/opens cloud projects through Firebase when a user is signed in.
- `index.html` now promotes HauntSync as a first-class part of Showduino.

## First live test

After the rules are deployed:

1. Open `https://show-duino.com/account.html`.
2. Create a test Showduino ID.
3. Confirm the account appears in Firebase Authentication.
4. Open HauntSync and create a test post.
5. Reply to the post.
6. Confirm `posts` and the `comments` subcollection appear in Firestore.
7. Open Studio, save a small test show while signed in, and confirm it appears under `users/{uid}/projects`.
8. Open HauntSync from another browser/device and confirm the public feed updates.
9. Confirm another authenticated user cannot read another user's private `projects` or `devices` paths.

## Legacy folder

`HauntSyncForum_Configured/` is the old standalone forum prototype. It is retained only as historical reference; the live website should use the integrated Firebase service and `hauntsync.html` instead.
