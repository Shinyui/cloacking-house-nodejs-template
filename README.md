# Cloaking.House Blank Template

This repository is a reusable Cloaking.House routing template with an optional, modular Meta Conversions API integration. It contains:

- A Cloaking.House entry route at /.
- Local White page and Offer page templates.
- Support for loading, redirect, and Offer-page iframe responses.
- A server-side Meta Conversions API client.
- A browser CAPI helper with shared defaults, standard-event shortcuts, attribution cookies, and HTML bindings.

This document is available in English, Simplified Chinese, and Traditional Chinese.

## English

### Requirements

- Node.js 24.x.
- A Cloaking.House flow label.
- A Meta Pixel ID, access token, and public origin when Meta CAPI is enabled.

### Quick start

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

### Project layout

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

### Cloaking.House flow

Requests to / are sent to Cloaking.House with the configured label, user agent, referrer, query string, language, and client IP. The response determines which page is returned:

- loading: load a remote HTTP(S) page, or a local HTML file under pages/.
- redirect: return an HTTP 302 redirect to an HTTP(S) target.
- iframe: load an Offer-page target in a full-page iframe.

If the Cloaking.House API, client IP, or selected page cannot be validated or loaded, the service falls back to the local White page. Files under pages/ are read by the server and are not exposed as public static routes. /healthz returns a small JSON health response.

IP_SOURCE defaults to socket, which uses the direct Node.js socket address. Set IP_SOURCE=x-real-ip only when a trusted reverse proxy overwrites X-Real-IP and the application accepts traffic only from that proxy. The application does not automatically detect a proxy or switch headers based on NODE_ENV.

### Environment variables

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

## 简体中文

### 项目简介

这是一个可复用的 Cloaking.House 分流模板，并内置可选的 Meta Conversions API 模块。项目包含根路径 /、本地 White page 和 Offer page、loading / redirect / Offer 页 iframe 模式，以及服务器端和浏览器端的统一转化事件接口。

### 环境要求与启动

- Node.js 24.x。
- 一个 Cloaking.House flow label。
- 只有启用 Meta CAPI 时才需要 Meta Pixel ID、Access Token 和网站公开来源。

~~~sh
npm ci
cp .env.example .env
npm start
~~~

把 .env 中的 CLOAKING_LABEL 改成自己的 Cloaking.House label。默认地址是 http://localhost:3000/。

~~~sh
npm run dev     # 开发模式，监听文件变化
npm test        # 运行测试
~~~

也可以使用 Docker：

~~~sh
docker build -t cloaking-house-template .
docker run --rm --env-file .env -p 3000:3000 cloaking-house-template
~~~

### 页面与目录

编辑 pages/white.html 和 pages/offer.html。White 页素材放在 public/assets/white/，Offer 页素材放在 public/assets/offer/，网页中分别使用 /assets/white/... 和 /assets/offer/...。

主要文件如下：

- src/app.js：Express 路由、健康检查、静态资源和 CAPI 接口。
- src/flow.js：Cloaking.House 请求、响应校验和页面加载。
- src/conversions.js：服务器端 Meta CAPI 共用模块。
- src/config.js：环境变量校验。
- public/assets/conversions/capi.js：浏览器端 CAPI SDK。

### Cloaking.House 分流

访问 / 时，服务会把 label、User-Agent、Referer、查询参数、语言和客户端 IP 发送给 Cloaking.House。返回结果支持：

- loading：加载远程 HTTP(S) 页面，或加载 pages/ 下的本地 HTML。
- redirect：返回 HTTP 302 跳转。
- iframe：Offer 页使用全屏 iframe 加载目标。

API、IP 或目标页面失败时会回退到本地 White page。pages/ 是服务器读取的私有路径，不会被静态公开。/healthz 用于部署健康检查。

IP_SOURCE 默认是 socket。只有在可信反向代理覆盖 X-Real-IP，并且 Node.js 只接受该代理连接时，才使用 IP_SOURCE=x-real-ip。程序不会根据平台或 NODE_ENV 自动选择代理 Header。

### 环境变量

.env.example 已列出全部变量。最重要的配置包括：

~~~env
CLOAKING_LABEL=your-cloaking-house-label
META_CAPI_ENABLED=true
META_PIXEL_ID=1234567890
META_ACCESS_TOKEN=server-only-token
PUBLIC_ORIGIN=https://example.com
META_API_VERSION=v24.0
META_DEFAULT_CURRENCY=TWD
META_DEFAULT_PHONE_REGION=TW
META_CAPI_TIMEOUT_MS=3000
META_CAPI_RETRIES=1
META_CAPI_RATE_LIMIT=60
~~~

Meta CAPI 默认关闭。启用时必须同时提供 META_PIXEL_ID、META_ACCESS_TOKEN 和 PUBLIC_ORIGIN。Access Token 只在服务器端使用，不会发送到浏览器。

其他变量包括 CLOAKING_API_URL、PORT、META_API_BASE_URL、META_TEST_EVENT_CODE 和 IP_SOURCE。META_API_BASE_URL 可用于 Mock 或受控环境；META_DEFAULT_PHONE_REGION 用于本地电话号码的国际化；META_DEFAULT_CURRENCY 用于需要金额的事件。

### 浏览器端 CAPI

在同源页面中加入：

~~~html
<script src="/assets/conversions/capi.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    CAPI.init({ autoPageView: true });
  });
</script>
~~~

可用接口：

- CAPI.track(eventName, params)。
- CAPI.init({ endpoint, autoPageView, defaults })。
- CAPI.setDefaults() 和 CAPI.getDefaults()。
- 18 个快捷方法：pageView、viewContent、search、addToCart、addToWishlist、initiateCheckout、addPaymentInfo、purchase、lead、completeRegistration、submitApplication、contact、findLocation、schedule、startTrial、subscribe、customizeProduct、donate。

autoPageView 默认是 true，不需要自动 PageView 时设置为 false。浏览器端会自动生成 eventId，带入当前 URL 和 Referer，并维护 _fbp / _fbc Cookie。

~~~js
await CAPI.purchase({
  eventId: 'order-123',
  userData: { email: 'customer@example.com', phone: '+886912345678' },
  customData: {
    value: 1200,
    currency: 'TWD',
    orderId: 'order-123',
    contents: [{ id: 'sku-001', quantity: 1, itemPrice: 1200 }],
  },
});
~~~

也可以用 HTML 自动绑定：

~~~html
<button
  data-capi-event="Contact"
  data-capi-params='{"customData":{"lead_event_source":"line"}}'>
  联系我们
</button>
~~~

data-capi-params 必须是合法 JSON；表单使用相同属性并在提交时发送事件。

### 服务器端 CAPI

推荐通过配置和共用工厂建立一个可复用实例：

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

返回对象提供 track、18 个快捷方法、setDefaults() 和 getDefaults()。默认值可以在创建时或之后设置：

~~~js
conversions.setDefaults({ customData: { currency: 'TWD' } });
~~~

事件参数会覆盖默认参数；userData、hashedUserData 和 customData 按字段合并，并兼容 camelCase 与 snake_case。

### 参数、归一化与校验

事件支持 eventId、eventTime、actionSource、sourceUrl、referrerUrl、userData、hashedUserData、customData、dataProcessingOptions、dataProcessingOptionsCountry、dataProcessingOptionsState、optOut、restrictedDataProcessing、originalEventData 和 appData。不传 eventId 时会生成 UUID；重试时会复用同一个 ID。

Email、电话、姓名、出生日期、性别、城市、省州、邮编、国家和外部 ID 会按 Meta 规则规范化后使用 SHA-256。也可以把已经 SHA-256 的值放进 hashedUserData，同一字段不能同时出现在 userData 和 hashedUserData。

fbp、fbc、IP、User-Agent、lead_id、subscription_id、fb_login_id、anon_id、madid、page_id、page_scoped_user_id、ctwa_clid、ig_account_id 和 ig_sid 等 Meta 标识保持原值。电话号码使用本地格式时设置 META_DEFAULT_PHONE_REGION=TW 等两位国家代码。

customData 支持 value、currency、contents、numItems、contentIds、contentName、contentCategory、contentType、contentUrl、orderId、searchString、predictedLtv、deliveryCategory、status、tax 和 shipping 等字段。Purchase 必须同时提供 value 和 currency；其他金额事件可以使用 META_DEFAULT_CURRENCY。

内容项必须包含 ID 和正数数量。productId / contentId 会归一化为 id，itemQuantity 归一化为 quantity，price / itemPrice 归一化为 item_price。没有 numItems 时会自动累加内容项数量。

dataProcessingOptions 当前支持 ['LDU']。设置国家后必须设置州；国家值为 0 或 1，州值为 0 或 1000。optOut 和 restrictedDataProcessing 必须是布尔值。

### 请求安全与可靠性

浏览器将 JSON 发送到 POST /api/conversions。接口会执行同源校验、32 KB JSON 大小限制和按 IP 的每分钟速率限制，并返回结构化错误，例如 invalid_origin、request_too_large 和 rate_limited。Meta 请求支持超时和暂时性错误重试，日志不会记录 Access Token 或完整用户资料。设置 META_TEST_EVENT_CODE 后可以在 Meta Test Events 中验证事件。

### 测试

~~~sh
npm test
~~~

测试覆盖 Cloaking.House 分流、本地 White page 回退、同源校验、速率限制、错误 JSON、超大请求、浏览器默认值、归因 Cookie、字段归一化、哈希、校验和重试。

## 繁體中文

### 專案簡介

這是一個可重複使用的 Cloaking.House 分流範本，並提供可選、模組化的 Meta Conversions API 整合。內容包含 / 入口、本機 White page 與 Offer page、loading／redirect／Offer 頁 iframe 模式，以及前後端共用的轉換事件介面。

### 環境要求與啟動

- Node.js 24.x。
- Cloaking.House flow label。
- 只有啟用 Meta CAPI 時才需要 Meta Pixel ID、Access Token 與網站公開來源。

~~~sh
npm ci
cp .env.example .env
npm start
~~~

把 .env 裡的 CLOAKING_LABEL 改成自己的 Cloaking.House label。預設網址是 http://localhost:3000/。

~~~sh
npm run dev     # 開發模式
npm test        # 執行測試
~~~

也可以使用 Docker：

~~~sh
docker build -t cloaking-house-template .
docker run --rm --env-file .env -p 3000:3000 cloaking-house-template
~~~

### 頁面與目錄

直接編輯 pages/white.html 和 pages/offer.html。White page 素材放在 public/assets/white/，Offer page 素材放在 public/assets/offer/，頁面中分別使用 /assets/white/... 和 /assets/offer/...。

主要檔案如下：

- src/app.js：Express 路由、健康檢查、靜態素材與 CAPI 接口。
- src/flow.js：Cloaking.House 請求、回應驗證與頁面載入。
- src/conversions.js：伺服器端 Meta CAPI 共用模組。
- src/config.js：環境變數解析與驗證。
- public/assets/conversions/capi.js：瀏覽器端 CAPI SDK。

### Cloaking.House 分流

請求 / 時，服務會把 label、User-Agent、Referer、查詢參數、語言與客戶端 IP 傳給 Cloaking.House。回應模式如下：

- loading：載入遠端 HTTP(S) 頁面，或載入 pages/ 內的本機 HTML。
- redirect：回傳 HTTP 302 導向。
- iframe：Offer page 使用全螢幕 iframe 載入目標。

Cloaking.House API、IP 或目標頁面無法驗證或載入時，會回退到本機 White page。pages/ 是伺服器讀取的私有路徑，不會被靜態公開。/healthz 可供部署平台做健康檢查。

IP_SOURCE 預設為 socket，使用 Node.js 直接取得的連線位址。只有在可信任的反向代理會覆寫 X-Real-IP，且 Node.js 只接受該代理連線時，才使用 IP_SOURCE=x-real-ip。程式不會依平台或 NODE_ENV 自動切換代理標頭。

### 環境變數

.env.example 已列出完整設定。啟用 Meta CAPI 的基本設定如下：

~~~env
CLOAKING_LABEL=your-cloaking-house-label
META_CAPI_ENABLED=true
META_PIXEL_ID=1234567890
META_ACCESS_TOKEN=server-only-token
PUBLIC_ORIGIN=https://example.com
META_API_VERSION=v24.0
META_DEFAULT_CURRENCY=TWD
META_DEFAULT_PHONE_REGION=TW
META_CAPI_TIMEOUT_MS=3000
META_CAPI_RETRIES=1
META_CAPI_RATE_LIMIT=60
~~~

Meta CAPI 預設停用。啟用時必須同時設定 META_PIXEL_ID、META_ACCESS_TOKEN 和 PUBLIC_ORIGIN。Access Token 只留在伺服器端，不會放進瀏覽器。

其他可用變數包括 CLOAKING_API_URL、PORT、META_API_BASE_URL、META_TEST_EVENT_CODE 與 IP_SOURCE。META_API_BASE_URL 可用於 Mock 或受控環境；META_DEFAULT_PHONE_REGION 用來處理本地電話；META_DEFAULT_CURRENCY 可作為金額事件的預設幣別。

### 瀏覽器端 CAPI

在同源頁面加入：

~~~html
<script src="/assets/conversions/capi.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    CAPI.init({ autoPageView: true });
  });
</script>
~~~

可使用：

- CAPI.track(eventName, params)。
- CAPI.init({ endpoint, autoPageView, defaults })。
- CAPI.setDefaults() 與 CAPI.getDefaults()。
- 18 個快捷方法：pageView、viewContent、search、addToCart、addToWishlist、initiateCheckout、addPaymentInfo、purchase、lead、completeRegistration、submitApplication、contact、findLocation、schedule、startTrial、subscribe、customizeProduct、donate。

autoPageView 預設為 true；不需要自動 PageView 時設定為 false。瀏覽器會自動產生 eventId、帶入目前網址與 Referer，並維護 _fbp／_fbc Cookie。

~~~js
await CAPI.purchase({
  eventId: 'order-123',
  userData: { email: 'customer@example.com', phone: '+886912345678' },
  customData: {
    value: 1200,
    currency: 'TWD',
    orderId: 'order-123',
    contents: [{ id: 'sku-001', quantity: 1, itemPrice: 1200 }],
  },
});
~~~

也可以透過 HTML 自動綁定：

~~~html
<button
  data-capi-event="Contact"
  data-capi-params='{"customData":{"lead_event_source":"line"}}'>
  聯絡我們
</button>
~~~

data-capi-params 必須是合法 JSON；表單使用相同屬性，會在送出時追蹤事件。

### 伺服器端 CAPI

建議透過設定和共用工廠建立可重複使用的實例：

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

回傳物件包含 track、18 個快捷方法、setDefaults() 與 getDefaults()。預設值可以在建立時或之後設定：

~~~js
conversions.setDefaults({ customData: { currency: 'TWD' } });
~~~

單次事件的值會覆寫預設值；userData、hashedUserData 和 customData 會逐欄位合併，也接受 camelCase 與 snake_case。

### 參數、正規化與驗證

事件支援 eventId、eventTime、actionSource、sourceUrl、referrerUrl、userData、hashedUserData、customData、dataProcessingOptions、dataProcessingOptionsCountry、dataProcessingOptionsState、optOut、restrictedDataProcessing、originalEventData 和 appData。省略 eventId 時會自動產生 UUID；重試會沿用同一個 ID。

Email、電話、姓名、出生日期、性別、城市、州／省、郵遞區號、國家與外部 ID 會依 Meta 規則正規化後使用 SHA-256。也可以把已經 SHA-256 的值放在 hashedUserData；同一欄位不能同時出現在 userData 和 hashedUserData。

fbp、fbc、IP、User-Agent、lead_id、subscription_id、fb_login_id、anon_id、madid、page_id、page_scoped_user_id、ctwa_clid、ig_account_id 和 ig_sid 等 Meta 識別碼會保持原值。使用本地電話格式時，請設定 META_DEFAULT_PHONE_REGION=TW 等兩碼國家代碼。

customData 支援 value、currency、contents、numItems、contentIds、contentName、contentCategory、contentType、contentUrl、orderId、searchString、predictedLtv、deliveryCategory、status、tax 和 shipping 等欄位。Purchase 必須同時提供 value 和 currency；其他金額事件可以使用 META_DEFAULT_CURRENCY。

內容項目必須有 ID 和正數數量。productId／contentId 會轉成 id，itemQuantity 會轉成 quantity，price／itemPrice 會轉成 item_price。省略 numItems 時會自動加總內容項目的數量。

dataProcessingOptions 目前支援 ['LDU']。設定國家後也必須設定州；國家值為 0 或 1，州值為 0 或 1000。optOut 與 restrictedDataProcessing 必須是布林值。

### 請求安全與可靠性

瀏覽器會把 JSON 傳送到 POST /api/conversions。介面會檢查同源、限制 JSON body 為 32 KB、套用每個 IP 的每分鐘速率限制，並回傳結構化錯誤，例如 invalid_origin、request_too_large 和 rate_limited。Meta 請求具備逾時與暫時性錯誤重試；日誌不會記錄 Access Token 或完整使用者資料。設定 META_TEST_EVENT_CODE 後，可以在 Meta Test Events 驗證事件。

### 測試

~~~sh
npm test
~~~

測試涵蓋 Cloaking.House 分流、本機 White page 回退、同源驗證、速率限制、錯誤 JSON、超大請求、瀏覽器預設值、歸因 Cookie、欄位正規化、雜湊、參數驗證與重試。
