// Copy this file to runtime-config.js during deployment.
// Never commit secret keys. Firebase web config and Stripe publishable keys are public identifiers,
// but keep live values in your deployment environment so test and production remain separate.
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
