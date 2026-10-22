<h1 align="center">🧭 Cloaking.House Blank Template</h1>

<p align="center">
  <strong>彈性分流 · 自訂頁面 · 轉換事件整合</strong><br>
  可重複使用的 Cloaking.House 分流範本，提供可選的 Meta Conversions API 模組。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.x-5FA04E?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 24.x">
  <img src="https://img.shields.io/badge/Express-5.x-222222?style=flat-square&amp;logo=express&amp;logoColor=white" alt="Express 5.x">
  <img src="https://img.shields.io/badge/Meta_CAPI-%E5%8F%AF%E9%81%B8-0866FF?style=flat-square&amp;logo=meta&amp;logoColor=white" alt="Meta Conversions API（可選）">
</p>

<p align="center">
  <a href="README.md" lang="en">English</a> · <a href="README.zh-CN.md" lang="zh-CN">简体中文</a> · <strong><a href="README.zh-TW.md" lang="zh-TW">繁體中文</a></strong>
</p>

<p align="center">
  <strong>快速導覽</strong><br>
  <a href="#環境要求與啟動">快速啟動</a> · <a href="#頁面與目錄">頁面與目錄</a> · <a href="#環境變數">環境變數</a> · <a href="#瀏覽器端-capi">瀏覽器 CAPI</a> · <a href="#伺服器端-capi">伺服器 CAPI</a> · <a href="#測試">測試</a>
</p>

---

## 專案簡介

這是一個可重複使用的 Cloaking.House 分流範本，並提供可選、模組化的 Meta Conversions API 整合。內容包含 / 入口、本機 White page 與 Offer page、loading／redirect／Offer 頁 iframe 模式，以及前後端共用的轉換事件介面。

## 環境要求與啟動

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

## 頁面與目錄

直接編輯 pages/white.html 和 pages/offer.html。White page 素材放在 public/assets/white/，Offer page 素材放在 public/assets/offer/，頁面中分別使用 /assets/white/... 和 /assets/offer/...。

主要檔案如下：

- src/app.js：Express 路由、健康檢查、靜態素材與 CAPI 接口。
- src/flow.js：Cloaking.House 請求、回應驗證與頁面載入。
- src/conversions.js：伺服器端 Meta CAPI 共用模組。
- src/config.js：環境變數解析與驗證。
- public/assets/conversions/capi.js：瀏覽器端 CAPI SDK。

## Cloaking.House 分流

請求 / 時，服務會把 label、User-Agent、Referer、查詢參數、語言與客戶端 IP 傳給 Cloaking.House。回應模式如下：

- loading：載入遠端 HTTP(S) 頁面，或載入 pages/ 內的本機 HTML。
- redirect：回傳 HTTP 302 導向。
- iframe：Offer page 使用全螢幕 iframe 載入目標。

Cloaking.House API、IP 或目標頁面無法驗證或載入時，會回退到本機 White page。pages/ 是伺服器讀取的私有路徑，不會被靜態公開。/healthz 可供部署平台做健康檢查。

IP_SOURCE 預設為 socket，使用 Node.js 直接取得的連線位址。只有在可信任的反向代理會覆寫 X-Real-IP，且 Node.js 只接受該代理連線時，才使用 IP_SOURCE=x-real-ip。程式不會依平台或 NODE_ENV 自動切換代理標頭。

## 環境變數

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

## 瀏覽器端 CAPI

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

## 伺服器端 CAPI

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

## 參數、正規化與驗證

事件支援 eventId、eventTime、actionSource、sourceUrl、referrerUrl、userData、hashedUserData、customData、dataProcessingOptions、dataProcessingOptionsCountry、dataProcessingOptionsState、optOut、restrictedDataProcessing、originalEventData 和 appData。省略 eventId 時會自動產生 UUID；重試會沿用同一個 ID。

Email、電話、姓名、出生日期、性別、城市、州／省、郵遞區號、國家與外部 ID 會依 Meta 規則正規化後使用 SHA-256。也可以把已經 SHA-256 的值放在 hashedUserData；同一欄位不能同時出現在 userData 和 hashedUserData。

fbp、fbc、IP、User-Agent、lead_id、subscription_id、fb_login_id、anon_id、madid、page_id、page_scoped_user_id、ctwa_clid、ig_account_id 和 ig_sid 等 Meta 識別碼會保持原值。使用本地電話格式時，請設定 META_DEFAULT_PHONE_REGION=TW 等兩碼國家代碼。

customData 支援 value、currency、contents、numItems、contentIds、contentName、contentCategory、contentType、contentUrl、orderId、searchString、predictedLtv、deliveryCategory、status、tax 和 shipping 等欄位。Purchase 必須同時提供 value 和 currency；其他金額事件可以使用 META_DEFAULT_CURRENCY。

內容項目必須有 ID 和正數數量。productId／contentId 會轉成 id，itemQuantity 會轉成 quantity，price／itemPrice 會轉成 item_price。省略 numItems 時會自動加總內容項目的數量。

dataProcessingOptions 目前支援 ['LDU']。設定國家後也必須設定州；國家值為 0 或 1，州值為 0 或 1000。optOut 與 restrictedDataProcessing 必須是布林值。

## 請求安全與可靠性

瀏覽器會把 JSON 傳送到 POST /api/conversions。介面會檢查同源、限制 JSON body 為 32 KB、套用每個 IP 的每分鐘速率限制，並回傳結構化錯誤，例如 invalid_origin、request_too_large 和 rate_limited。Meta 請求具備逾時與暫時性錯誤重試；日誌不會記錄 Access Token 或完整使用者資料。設定 META_TEST_EVENT_CODE 後，可以在 Meta Test Events 驗證事件。

## 測試

~~~sh
npm test
~~~

測試涵蓋 Cloaking.House 分流、本機 White page 回退、同源驗證、速率限制、錯誤 JSON、超大請求、瀏覽器預設值、歸因 Cookie、欄位正規化、雜湊、參數驗證與重試。
