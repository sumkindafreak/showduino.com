/* global SHOWDUINO_CONFIG, ShowduinoFirebase */
(function () {
  'use strict';

  function getConfig() {
    return window.SHOWDUINO_CONFIG || { features: {}, stripe: {}, plans: {} };
  }

  function assertEnabled() {
    const config = getConfig();
    if (!config.features.stripe || !config.features.subscriptions) {
      throw new Error('Showduino subscriptions are not available yet.');
    }
  }

  async function authenticatedRequest(url, body) {
    const token = window.ShowduinoFirebase
      ? await window.ShowduinoFirebase.getIdToken()
      : null;

    if (!token) throw new Error('Please sign in before managing a subscription.');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body || {})
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'The payment request could not be completed.');
    }
    return payload;
  }

  async function startCheckout(planKey) {
    assertEnabled();
    const config = getConfig();
    const priceId = config.plans[planKey];
    if (!priceId) throw new Error(`No Stripe price is configured for ${planKey}.`);

    const result = await authenticatedRequest(config.stripe.checkoutEndpoint, {
      priceId,
      planKey,
      successUrl: `${window.location.origin}/account.html?checkout=success`,
      cancelUrl: `${window.location.origin}/pricing.html?checkout=cancelled`
    });

    if (!result.url) throw new Error('Stripe did not return a checkout URL.');
    window.location.assign(result.url);
  }

  async function openCustomerPortal() {
    assertEnabled();
    const config = getConfig();
    const result = await authenticatedRequest(config.stripe.portalEndpoint, {
      returnUrl: `${window.location.origin}/account.html`
    });

    if (!result.url) throw new Error('Stripe did not return a customer portal URL.');
    window.location.assign(result.url);
  }

  window.ShowduinoStripe = Object.freeze({
    startCheckout,
    openCustomerPortal,
    isEnabled: () => {
      const config = getConfig();
      return Boolean(config.features.stripe && config.features.subscriptions);
    }
  });
})();
