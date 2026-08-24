// Public website runtime configuration.
// Firebase's web configuration identifies the public client app; it is not a private admin credential.
// Never commit Firebase service-account keys or other server secrets here.
window.SHOWDUINO_CONFIG = Object.freeze({
  environment: 'production',
  features: {
    supabase: false,
    firebase: true,
    authentication: true,
    cloudSync: true,
    community: true,
    stripe: false,
    subscriptions: false
  },
  firebase: {
    apiKey: 'AIzaSyCbBK1hwavHkKopd6cycSXOc8QQQhVPWYU',
    authDomain: 'hauntsync-forum-4b992.firebaseapp.com',
    projectId: 'hauntsync-forum-4b992',
    storageBucket: 'hauntsync-forum-4b992.appspot.com',
    messagingSenderId: '525589326062',
    appId: '1:525589326062:web:cfa0d7dc272c292fbb2840'
  },
  // Kept only so older pages fail safely while the Firebase migration is reviewed.
  supabase: {
    url: '',
    publishableKey: ''
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
