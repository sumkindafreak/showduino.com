# PayPal Subscription Setup Guide

This guide will help you configure PayPal for subscription payments in HauntSync.

## Step 1: Create PayPal Developer Account

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Sign in with your PayPal account (or create one)
3. Navigate to **Dashboard** > **My Apps & Credentials**

## Step 2: Create a PayPal App

1. Click **"Create App"**
2. Fill in the details:
   - **App Name**: HauntSync
   - **Merchant**: Select your business account
   - **Features**: Enable **"Subscriptions"**
3. Click **"Create App"**
4. Copy your **Client ID** (you'll need this)

## Step 3: Create Subscription Plans in PayPal

1. Go to [PayPal Subscriptions Dashboard](https://developer.paypal.com/dashboard/subscriptions/plans)
2. Click **"Create Plan"**

### Create Pro Plan ($9.99/month)

1. **Plan Details**:
   - Plan name: `HauntSync Pro`
   - Description: `Pro subscription for HauntSync`
   - Pricing: `$9.99 USD per month`
   - Billing cycle: `Monthly`
   - Setup fee: `$0`

2. Click **"Create Plan"**
3. Copy the **Plan ID** (starts with `P-`)

### Create Enterprise Plan ($29.99/month)

1. **Plan Details**:
   - Plan name: `HauntSync Enterprise`
   - Description: `Enterprise subscription for HauntSync`
   - Pricing: `$29.99 USD per month`
   - Billing cycle: `Monthly`
   - Setup fee: `$0`

2. Click **"Create Plan"**
3. Copy the **Plan ID** (starts with `P-`)

## Step 4: Update Configuration File

Open `js/paypal_config.js` and replace the placeholder values:

```javascript
const PAYPAL_CONFIG = {
    // Replace with your PayPal Client ID from Step 2
    clientId: 'YOUR_ACTUAL_CLIENT_ID_HERE',
    
    // Use 'sandbox' for testing, 'production' for live payments
    environment: 'sandbox',
    
    // Replace with your Plan IDs from Step 3
    plans: {
        pro: 'P-YOUR_PRO_PLAN_ID_HERE',
        enterprise: 'P-YOUR_ENTERPRISE_PLAN_ID_HERE'
    },
    
    // Prices (for display - should match your PayPal plans)
    prices: {
        pro: {
            monthly: 9.99,
            currency: 'USD'
        },
        enterprise: {
            monthly: 29.99,
            currency: 'USD'
        }
    }
};
```

## Step 5: Testing (Sandbox Mode)

1. Make sure `environment: 'sandbox'` in `paypal_config.js`
2. Use PayPal sandbox test accounts:
   - Go to [PayPal Sandbox](https://developer.paypal.com/dashboard/accounts)
   - Create test buyer and seller accounts
   - Use test buyer account to test payments

## Step 6: Go Live (Production Mode)

1. **Verify your PayPal Business Account**:
   - Complete business verification in PayPal
   - Ensure your account is in good standing

2. **Switch to Production**:
   - Update `environment: 'production'` in `paypal_config.js`
   - Use your **Production Client ID** (create a production app)
   - Use your **Production Plan IDs** (create plans in production)

3. **Test with small amount first** before going fully live

## What You Need to Provide

Please provide:
1. **PayPal Client ID** (from Step 2)
2. **Pro Plan ID** (from Step 3)
3. **Enterprise Plan ID** (from Step 3)

## Features

✅ **Automatic Subscription Management**
- Users can subscribe with PayPal
- Subscriptions automatically renew monthly
- Status synced to Firebase

✅ **Billing History**
- All transactions recorded
- Visible in user dashboard

✅ **Cancel Subscriptions**
- Users can cancel anytime
- Access retained until end of billing period

✅ **Firebase Integration**
- Subscription status synced to Firestore
- Accessible across devices

## Security Notes

- Never commit your production Client ID to public repos
- Use environment variables or secure storage for production
- Client IDs are safe to expose (they're public), but Plan IDs should be kept secure
- Always test in sandbox before going to production

## Troubleshooting

**PayPal buttons not showing:**
- Check browser console for errors
- Verify Client ID is correct
- Ensure PayPal SDK loaded (check Network tab)

**Payment fails:**
- Verify Plan IDs are correct
- Check PayPal account status
- Ensure sandbox/production environment matches

**Subscription not activating:**
- Check Firebase connection
- Verify user is authenticated
- Check browser console for errors

## Support

For PayPal integration issues:
- [PayPal Developer Docs](https://developer.paypal.com/docs/)
- [PayPal Subscriptions API](https://developer.paypal.com/docs/subscriptions/)

