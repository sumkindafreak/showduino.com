// Copy this file to runtime-config.js during deployment.
// Never commit secret keys. Firebase web config and Stripe publishable keys are public identifiers,
// but keep live values in your deployment environment so test and production remain separate.
window.SHOWDUINO_CONFIG = Object.freeze({
  environment: 'development',
  features: {
    firebase: false,
    authentication: false,
    // W5-05: keep false until Google is enabled in Supabase and a real login has been tested.
    googleSignIn: false,
    cloudSync: false,
    stripe: false,
    subscriptions: false
  },
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },
  // W5-08: Cloudflare Turnstile SITE key (public). Empty = off. Set this and deploy
  // BEFORE turning CAPTCHA on in Supabase Auth, or sign-in will fail.
  captcha: {
    provider: 'turnstile',
    siteKey: ''
  },
  stripe: {
    publishableKey: '',
    checkoutEndpoint: '/api/createCheckoutSession',
    portalEndpoint: '/api/createPortalSession'
  },
  plans: {
    creator: '',
    pro: '',
    enterprise: ''
  }
});
