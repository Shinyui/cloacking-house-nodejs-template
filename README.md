<h1 align="center">🧭 Cloaking.House Blank Template</h1>

<p align="center">
  <strong>Reusable routing · Flexible pages · Connected conversions</strong><br>
  A Cloaking.House template with optional Meta Conversions API integration.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.x-5FA04E?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 24.x">
  <img src="https://img.shields.io/badge/Express-5.x-222222?style=flat-square&amp;logo=express&amp;logoColor=white" alt="Express 5.x">
  <img src="https://img.shields.io/badge/Meta_CAPI-Optional-0866FF?style=flat-square&amp;logo=meta&amp;logoColor=white" alt="Meta Conversions API (optional)">
</p>

<p align="center">
  <a href="https://cloaking.house/id53345">Cloaking.House referral link</a>
</p>

<p align="center">
  <strong><a href="README.md" lang="en">English</a></strong> · <a href="README.zh-CN.md" lang="zh-CN">简体中文</a> · <a href="README.zh-TW.md" lang="zh-TW">繁體中文</a>
</p>

<p align="center">
  <strong>Quick navigation</strong><br>
  <a href="#quick-start">Quick start</a> · <a href="#project-layout">Project layout</a> · <a href="#environment-variables">Configuration</a> · <a href="#meta-conversions-api">Meta CAPI</a> · <a href="#testing">Testing</a>
</p>

---

This repository is a reusable Cloaking.House routing template with an optional, modular Meta Conversions API integration. It contains:

- A Cloaking.House entry route at /.
- Local White page and Offer page templates.
- Support for loading, redirect, and Offer-page iframe responses.
- A server-side Meta Conversions API client.
- A browser CAPI helper with shared defaults, standard-event shortcuts, attribution cookies, and HTML bindings.

## Requirements

- Node.js 24.x.
- A Cloaking.House flow label.
- A Meta Pixel ID, access token, and public origin when Meta CAPI is enabled.

## Quick start

~~~sh
npm ci
cp .env.example .env
npm start
~~~

Replace CLOAKING_LABEL in .env with your own Cloaking.House flow label. The default local address is http://localhost:3000/.

~~~sh
npm start       # production-style start
npm run dev     # Node.js watch mode
npm test        # run the test suite
~~~

The included Dockerfile can also be used:

~~~sh
docker build -t cloaking-house-template .
docker run --rm --env-file .env -p 3000:3000 cloaking-house-template
~~~

## Project layout

| Path | Purpose |
| --- | --- |
| src/server.js | Starts the HTTP server. |
| src/app.js | Express routes, health check, static assets, and the conversion endpoint. |
| src/flow.js | Cloaking.House requests, response validation, and page loading. |
| src/conversions.js | Shared server-side Meta CAPI module. |
| src/config.js | Environment variable parsing and validation. |
| src/client-ip.js | Explicit client-IP source handling. |
| public/assets/conversions/capi.js | Browser-side CAPI helper. |
| pages/white.html | Local White page. |
| pages/offer.html | Local Offer page. |
| public/assets/white/ | White-page assets. |
| public/assets/offer/ | Offer-page assets. |

Edit the two HTML files directly. Put images, CSS, and other public files in the matching asset directory and reference them with /assets/white/... or /assets/offer/....

## Cloaking.House flow

Requests to / are sent to Cloaking.House with the configured label, user agent, referrer, query string, language, and client IP. The response determines which page is returned:

- loading: load a remote HTTP(S) page, or a local HTML file under pages/.
- redirect: return an HTTP 302 redirect to an HTTP(S) target.
- iframe: load an Offer-page target in a full-page iframe.

If the Cloaking.House API, client IP, or selected page cannot be validated or loaded, the service falls back to the local White page. Files under pages/ are read by the server and are not exposed as public static routes. /healthz returns a small JSON health response.

IP_SOURCE defaults to socket, which uses the direct Node.js socket address. Set IP_SOURCE=x-real-ip only when a trusted reverse proxy overwrites X-Real-IP and the application accepts traffic only from that proxy. The application does not automatically detect a proxy or switch headers based on NODE_ENV.

## Environment variables

Copy .env.example to .env and adjust the values:

| Variable | Default | Description |
| --- | --- | --- |
| CLOAKING_LABEL | required | Cloaking.House flow label. |
| CLOAKING_API_URL | https://cloakit.house/api/v1/check | Cloaking.House check endpoint. |
| IP_SOURCE | socket | socket or x-real-ip. |
| PORT | 3000 | HTTP listening port. |
| META_CAPI_ENABLED | false | Enables the server-side Meta CAPI client. |
| META_PIXEL_ID | empty | Required when CAPI is enabled. |
| META_ACCESS_TOKEN | empty | Required when CAPI is enabled; keep it server-side. |
| META_API_VERSION | v24.0 | Meta Graph API version. |
| META_API_BASE_URL | https://graph.facebook.com | Optional Graph API host override for mocks or controlled environments. |
| PUBLIC_ORIGIN | empty | Absolute site origin, such as https://example.com. Required when CAPI is enabled. |
| META_DEFAULT_CURRENCY | empty | Three-letter ISO 4217 currency used when an event needs a default currency. |
| META_DEFAULT_PHONE_REGION | empty | Two-letter region used to normalize local phone numbers, such as TW. |
| META_TEST_EVENT_CODE | empty | Optional Meta Test Events code. |
| META_CAPI_TIMEOUT_MS | 3000 | Meta request timeout in milliseconds. |
| META_CAPI_RETRIES | 1 | Number of retries for transient failures, from 0 to 2. |
| META_CAPI_RATE_LIMIT | 60 | Conversion requests allowed per IP per minute. |

Meta CAPI is disabled by default. Enable it only after configuring all required values:

~~~env
META_CAPI_ENABLED=true
META_PIXEL_ID=1234567890
META_ACCESS_TOKEN=replace-with-a-server-only-token
PUBLIC_ORIGIN=https://example.com
~~~

The access token is used only by the server when calling Meta. It is never placed in the browser bundle.

## Meta Conversions API

The integration is split into a reusable server module and a small browser client:

- src/conversions.js exposes createConversions(), track(), standard-event shortcuts, and shared defaults.
- public/assets/conversions/capi.js exposes window.CAPI and sends same-origin requests to POST /api/conversions.
- src/app.js wires the route to the same event interface, so browser and server events use the same normalization rules.

### Browser usage

Add the script to a page served from the same origin:

~~~html
<script src="/assets/conversions/capi.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    CAPI.init({ autoPageView: true });
  });
</script>
~~~

The browser API includes:

- CAPI.track(eventName, params).
- CAPI.setDefaults(params) and CAPI.getDefaults().
- CAPI.init({ endpoint, autoPageView, defaults }).
- Eighteen shortcuts: pageView, viewContent, search, addToCart, addToWishlist, initiateCheckout, addPaymentInfo, purchase, lead, completeRegistration, submitApplication, contact, findLocation, schedule, startTrial, subscribe, customizeProduct, and donate.

autoPageView defaults to true. Set it to false when the page sends PageView elsewhere.

~~~js
await CAPI.purchase({
  eventId: 'order-123',
  userData: {
    email: 'customer@example.com',
    phone: '+886912345678',
  },
  customData: {
    value: 1200,
    currency: 'TWD',
    orderId: 'order-123',
    contents: [
      { id: 'sku-001', quantity: 1, itemPrice: 1200 },
    ],
  },
});
~~~

Elements can be bound without writing a click or submit handler:

~~~html
<button
  data-capi-event="Contact"
  data-capi-params='{"customData":{"lead_event_source":"line"}}'>
  Contact us
</button>
~~~

data-capi-params must contain valid JSON. Forms use the same attributes and are tracked on submit.

The browser client automatically creates an event ID, records the current page URL and referrer, and maintains _fbp and _fbc cookies. A URL fbclid is converted into _fbc when possible.

### Server usage

For a direct server integration, load the validated configuration and create one reusable conversion client:

~~~js
import { loadConfig } from './src/config.js';
import { createConversions } from './src/conversions.js';

const config = loadConfig();
const conversions = createConversions({
  config,
  defaults: {
    actionSource: 'website',
    userData: { countryCode: 'TW' },
    customData: { contentType: 'product' },
  },
});

await conversions.track('Lead', {
  eventId: 'lead-123',
  sourceUrl: 'https://example.com/form/success',
  userData: { email: 'customer@example.com' },
  customData: { leadEventSource: 'form' },
});
~~~

createConversions() returns track, all standard-event shortcuts, setDefaults(), and getDefaults(). When using the Express app, a custom client can be injected with createApp({ config, conversions }).

### Shared defaults and merging

Defaults can be supplied during creation or updated later:

~~~js
conversions.setDefaults({
  customData: { currency: 'TWD' },
});

const defaults = conversions.getDefaults();
~~~

The browser equivalent is CAPI.init({ defaults }), CAPI.setDefaults(), and CAPI.getDefaults(). Event values override defaults. userData, hashedUserData, and customData are merged field by field, including when one side uses camelCase and the other uses snake_case.

### Event parameters

Both camelCase and common snake_case aliases are accepted:

- eventId
- eventTime
- actionSource
- sourceUrl
- referrerUrl
- userData
- hashedUserData
- customData
- dataProcessingOptions
- dataProcessingOptionsCountry
- dataProcessingOptionsState
- optOut
- restrictedDataProcessing
- originalEventData
- appData

If eventId is omitted, a UUID is generated. The same built event, including its event ID, is reused for retries. actionSource defaults to website and supports Meta values such as email, app, phone_call, chat, physical_store, system_generated, business_messaging, and other.

eventTime may be a Unix timestamp, date string, or Date value. It must be within the previous seven days and not more than 60 seconds in the future. Website events need an absolute HTTP(S) source URL; the request URL or PUBLIC_ORIGIN is used when available.

For Meta Limited Data Use, dataProcessingOptions currently accepts ['LDU']. When a country value is supplied, a state value is also required; valid country values are 0 or 1, and valid state values are 0 or 1000. optOut and restrictedDataProcessing must be booleans.

### User matching data

The following matching fields are normalized and SHA-256 hashed before being sent:

- Email.
- Phone.
- First name and last name.
- Date of birth.
- Gender.
- City, state, ZIP/postal code, and country.
- External ID.

You may pass raw values through userData, or provide pre-hashed SHA-256 values through hashedUserData. The same field cannot be present in both objects. Local phone numbers need META_DEFAULT_PHONE_REGION; an international number can be supplied with a + prefix.

Common aliases include:

| Canonical concept | Accepted examples |
| --- | --- |
| Email | email, emailAddress, email_address, em |
| Phone | phone, phoneNumber, phone_number, ph |
| Name | firstName / first_name / fn; lastName / last_name / ln |
| Location | city / ct; state / st; zip / postalCode / zp; countryCode / country |
| IDs | externalId, subscriptionId, leadId, fbLoginId, anonId |

Meta identifiers that must remain raw are preserved as raw values, including fbp, fbc, client_ip_address, client_user_agent, subscription_id, lead_id, fb_login_id, anon_id, madid, page_id, page_scoped_user_id, ctwa_clid, ig_account_id, and ig_sid.

For browser requests, the server can add the request IP and User-Agent. It can also read _fbp, _fbc, and the referrer from the request context.

### Custom data and contents

customData keeps supported Meta fields and safely preserves additional scalar or nested fields. Common fields include value, currency, contents, numItems, contentIds, contentName, contentCategory, contentType, contentUrl, orderId, searchString, predictedLtv, deliveryCategory, status, tax, and shipping.

Purchase requires both customData.value and customData.currency. Other monetary events can use META_DEFAULT_CURRENCY. Content items require an ID and a positive quantity. If numItems is omitted, it is calculated from the content quantities.

Content-item aliases:

- productId or contentId becomes id.
- itemQuantity becomes quantity.
- price or itemPrice becomes item_price.

~~~js
customData: {
  contents: [
    { productId: 'sku-001', itemQuantity: 2, price: 600 },
  ],
}
~~~

Null and undefined values are removed from nested data. Non-finite numbers, unsupported values, excessive nesting, and unsafe object keys are handled before sending.

### Endpoint, protections, and failures

The browser client sends JSON to POST /api/conversions with eventName plus the event parameters. The route:

- Requires a matching origin or referrer when PUBLIC_ORIGIN is configured.
- Limits JSON request bodies to 32 KB.
- Applies the configured per-IP rate limit.
- Returns structured JSON error codes such as invalid_origin, request_too_large, and rate_limited.
- Uses a timeout and retries transient Meta responses.
- Logs event metadata without access tokens or complete user data.

The Meta request uses META_CAPI_TIMEOUT_MS and META_CAPI_RETRIES. A retry keeps the same event ID so Meta can deduplicate the event. Set META_TEST_EVENT_CODE to verify events in Meta Test Events.

## Testing

~~~sh
npm test
~~~

The tests cover Cloaking.House routing, local-page fallback, same-origin conversion requests, rate limiting, malformed and oversized JSON, browser defaults, attribution cookies, normalization, hashing, validation, and retry behavior.
