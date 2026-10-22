// Public website runtime configuration.
// The Supabase publishable key is safe to expose in browser code; private service keys must never be committed here.
window.SHOWDUINO_CONFIG = Object.freeze({
  environment: 'production',
  features: {
    supabase: true,
    authentication: true,
    // W5-05: keep false until Google is enabled in Supabase and a real login has been tested.
    googleSignIn: false,
    cloudSync: true,
    firebase: false,
    stripe: false,
    subscriptions: false
  },
  supabase: {
    url: 'https://fczxcvlyydcqdhjkejmd.supabase.co',
    publishableKey: 'sb_publishable_r1eWnA-Vi2HJHG3y9njZxQ_VOxivZDW'
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
