// Public website runtime configuration.
// The Supabase publishable key is safe to expose in browser code; private service keys must never be committed here.
window.SHOWDUINO_CONFIG = Object.freeze({
  environment: 'production',
  features: {
    supabase: true,
    authentication: true,
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
