# Showduino Launch Setup

The repository is intentionally safe by default. Firebase, authentication, cloud sync, Stripe, and subscriptions remain disabled until all production services are configured and tested.

## 1. Create Firebase environments

Create separate Firebase projects for development and production. Register a Web app in each project, then copy the Web configuration values into a deployment-generated `config/runtime-config.js`.

Enable:

- Firebase Authentication with Email/Password
- Cloud Firestore
- Firebase Hosting
- Cloud Functions

Deploy the included Firestore security rules before enabling cloud sync.

## 2. Configure Cloud Functions

From the repository root:

```bash
cd functions
npm install
cd ..
firebase login
firebase use --add
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions,firestore:rules,hosting
```

Set the production app URL and keep payments disabled initially:

```bash
firebase functions:params:set APP_URL=https://show-duino.com
firebase functions:params:set PAYMENTS_ENABLED=false
```

## 3. Configure Stripe in test mode

Create recurring prices for each intended subscription tier. Add the resulting `price_...` identifiers to the deployment version of `config/runtime-config.js`.

Create a webhook endpoint pointing to:

```text
https://show-duino.com/api/stripeWebhook
```

Subscribe it to at least:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Store its signing secret using `STRIPE_WEBHOOK_SECRET`.

## 4. Test locally

Use the Firebase Emulator Suite for Authentication, Firestore, Functions, and Hosting. Use Stripe test-mode cards only. Verify that users cannot read another user's documents and cannot write subscription fields directly.

## 5. Enable in stages

Update the deployed runtime configuration in this order:

1. `firebase: true`
2. `authentication: true`
3. `cloudSync: true`
4. Add Stripe test publishable key and test price IDs
5. `stripe: true`
6. `subscriptions: true`
7. Set the Functions parameter `PAYMENTS_ENABLED=true`

Only replace test Stripe values with live values after successful end-to-end testing.

## Security rules

- Never place a Stripe secret key or webhook secret in website JavaScript.
- Never trust a subscription tier supplied by the browser.
- Subscription status is written by verified Stripe webhooks through Firebase Admin.
- Redirect URLs are restricted to the configured Showduino origin.
- Production and development must use separate Firebase projects and Stripe modes.
