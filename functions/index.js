const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const cors = require('cors')({ origin: true });
const Stripe = require('stripe');

initializeApp();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const appUrl = defineString('APP_URL', { default: 'https://show-duino.com' });
const paymentsEnabled = defineString('PAYMENTS_ENABLED', { default: 'false' });

function sendJson(response, status, body) {
  response.status(status).set('Content-Type', 'application/json').send(JSON.stringify(body));
}

function requirePaymentsEnabled() {
  if (paymentsEnabled.value() !== 'true') {
    const error = new Error('Payments are not currently enabled.');
    error.statusCode = 503;
    throw error;
  }
}

async function verifyUser(request) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    const error = new Error('Authentication is required.');
    error.statusCode = 401;
    throw error;
  }

  const idToken = authorization.substring(7);
  return getAuth().verifyIdToken(idToken);
}

function safeReturnUrl(value, fallbackPath) {
  const fallback = new URL(fallbackPath, appUrl.value());
  if (!value) return fallback.toString();

  const requested = new URL(value);
  const allowedOrigin = new URL(appUrl.value()).origin;
  if (requested.origin !== allowedOrigin) return fallback.toString();
  return requested.toString();
}

async function findOrCreateCustomer(stripe, user) {
  const userRef = getFirestore().doc(`users/${user.uid}`);
  const snapshot = await userRef.get();
  const existingCustomerId = snapshot.exists ? snapshot.data().stripeCustomerId : null;
  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    metadata: { firebaseUid: user.uid }
  });

  await userRef.set({
    email: user.email || null,
    stripeCustomerId: customer.id,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return customer.id;
}

exports.createCheckoutSession = onRequest(
  { secrets: [stripeSecretKey], region: 'europe-west2' },
  (request, response) => cors(request, response, async () => {
    try {
      requirePaymentsEnabled();
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' });

      const user = await verifyUser(request);
      const { priceId, planKey, successUrl, cancelUrl } = request.body || {};
      if (!priceId || !planKey) return sendJson(response, 400, { error: 'priceId and planKey are required.' });

      const stripe = new Stripe(stripeSecretKey.value());
      const customerId = await findOrCreateCustomer(stripe, user);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: safeReturnUrl(successUrl, '/account.html?checkout=success'),
        cancel_url: safeReturnUrl(cancelUrl, '/pricing.html?checkout=cancelled'),
        allow_promotion_codes: true,
        client_reference_id: user.uid,
        subscription_data: {
          metadata: { firebaseUid: user.uid, planKey }
        },
        metadata: { firebaseUid: user.uid, planKey }
      });

      return sendJson(response, 200, { url: session.url });
    } catch (error) {
      console.error('createCheckoutSession failed', error);
      return sendJson(response, error.statusCode || 500, { error: error.message || 'Checkout failed.' });
    }
  })
);

exports.createPortalSession = onRequest(
  { secrets: [stripeSecretKey], region: 'europe-west2' },
  (request, response) => cors(request, response, async () => {
    try {
      requirePaymentsEnabled();
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' });

      const user = await verifyUser(request);
      const userSnapshot = await getFirestore().doc(`users/${user.uid}`).get();
      const customerId = userSnapshot.exists ? userSnapshot.data().stripeCustomerId : null;
      if (!customerId) return sendJson(response, 404, { error: 'No Stripe customer exists for this account.' });

      const stripe = new Stripe(stripeSecretKey.value());
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: safeReturnUrl(request.body && request.body.returnUrl, '/account.html')
      });

      return sendJson(response, 200, { url: session.url });
    } catch (error) {
      console.error('createPortalSession failed', error);
      return sendJson(response, error.statusCode || 500, { error: error.message || 'Portal request failed.' });
    }
  })
);

exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret], region: 'europe-west2' },
  async (request, response) => {
    try {
      const stripe = new Stripe(stripeSecretKey.value());
      const signature = request.headers['stripe-signature'];
      const event = stripe.webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value());

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const uid = session.metadata && session.metadata.firebaseUid;
        if (uid) {
          await getFirestore().doc(`users/${uid}`).set({
            stripeCustomerId: session.customer,
            subscriptionId: session.subscription,
            subscriptionPlan: session.metadata.planKey || 'unknown',
            subscriptionStatus: 'active',
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
        }
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const uid = subscription.metadata && subscription.metadata.firebaseUid;
        if (uid) {
          await getFirestore().doc(`users/${uid}`).set({
            subscriptionId: subscription.id,
            subscriptionPlan: subscription.metadata.planKey || 'unknown',
            subscriptionStatus: subscription.status,
            subscriptionCurrentPeriodEnd: subscription.current_period_end || null,
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
        }
      }

      return sendJson(response, 200, { received: true });
    } catch (error) {
      console.error('stripeWebhook failed', error);
      return sendJson(response, 400, { error: `Webhook error: ${error.message}` });
    }
  }
);
