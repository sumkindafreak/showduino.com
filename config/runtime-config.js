// Launch-safe defaults. Replace at deploy time; keep all integrations disabled until launch.
window.SHOWDUINO_CONFIG = Object.freeze({
  environment: 'development',
  features: {
    firebase: false,
    authentication: false,
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
