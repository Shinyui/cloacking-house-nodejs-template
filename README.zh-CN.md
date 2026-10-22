<h1 align="center">🧭 Cloaking.House Blank Template</h1>

<p align="center">
  <strong>灵活分流 · 自定义页面 · 转化事件整合</strong><br>
  可复用的 Cloaking.House 分流模板，内置可选的 Meta Conversions API 模块。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.x-5FA04E?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 24.x">
  <img src="https://img.shields.io/badge/Express-5.x-222222?style=flat-square&amp;logo=express&amp;logoColor=white" alt="Express 5.x">
  <img src="https://img.shields.io/badge/Meta_CAPI-%E5%8F%AF%E9%80%89-0866FF?style=flat-square&amp;logo=meta&amp;logoColor=white" alt="Meta Conversions API（可选）">
</p>

<p align="center">
  <a href="README.md" lang="en">English</a> · <strong><a href="README.zh-CN.md" lang="zh-CN">简体中文</a></strong> · <a href="README.zh-TW.md" lang="zh-TW">繁體中文</a>
</p>

<p align="center">
  <strong>快速导航</strong><br>
  <a href="#环境要求与启动">快速启动</a> · <a href="#页面与目录">页面与目录</a> · <a href="#环境变量">环境变量</a> · <a href="#浏览器端-capi">浏览器 CAPI</a> · <a href="#服务器端-capi">服务器 CAPI</a> · <a href="#测试">测试</a>
</p>

---

## 项目简介

这是一个可复用的 Cloaking.House 分流模板，并内置可选的 Meta Conversions API 模块。项目包含根路径 /、本地 White page 和 Offer page、loading / redirect / Offer 页 iframe 模式，以及服务器端和浏览器端的统一转化事件接口。

## 环境要求与启动

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

## 页面与目录

编辑 pages/white.html 和 pages/offer.html。White 页素材放在 public/assets/white/，Offer 页素材放在 public/assets/offer/，网页中分别使用 /assets/white/... 和 /assets/offer/...。

主要文件如下：

- src/app.js：Express 路由、健康检查、静态资源和 CAPI 接口。
- src/flow.js：Cloaking.House 请求、响应校验和页面加载。
- src/conversions.js：服务器端 Meta CAPI 共用模块。
- src/config.js：环境变量校验。
- public/assets/conversions/capi.js：浏览器端 CAPI SDK。

## Cloaking.House 分流

访问 / 时，服务会把 label、User-Agent、Referer、查询参数、语言和客户端 IP 发送给 Cloaking.House。返回结果支持：

- loading：加载远程 HTTP(S) 页面，或加载 pages/ 下的本地 HTML。
- redirect：返回 HTTP 302 跳转。
- iframe：Offer 页使用全屏 iframe 加载目标。

API、IP 或目标页面失败时会回退到本地 White page。pages/ 是服务器读取的私有路径，不会被静态公开。/healthz 用于部署健康检查。

IP_SOURCE 默认是 socket。只有在可信反向代理覆盖 X-Real-IP，并且 Node.js 只接受该代理连接时，才使用 IP_SOURCE=x-real-ip。程序不会根据平台或 NODE_ENV 自动选择代理 Header。

## 环境变量

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

## 浏览器端 CAPI

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

## 服务器端 CAPI

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

## 参数、归一化与校验

事件支持 eventId、eventTime、actionSource、sourceUrl、referrerUrl、userData、hashedUserData、customData、dataProcessingOptions、dataProcessingOptionsCountry、dataProcessingOptionsState、optOut、restrictedDataProcessing、originalEventData 和 appData。不传 eventId 时会生成 UUID；重试时会复用同一个 ID。

Email、电话、姓名、出生日期、性别、城市、省州、邮编、国家和外部 ID 会按 Meta 规则规范化后使用 SHA-256。也可以把已经 SHA-256 的值放进 hashedUserData，同一字段不能同时出现在 userData 和 hashedUserData。

fbp、fbc、IP、User-Agent、lead_id、subscription_id、fb_login_id、anon_id、madid、page_id、page_scoped_user_id、ctwa_clid、ig_account_id 和 ig_sid 等 Meta 标识保持原值。电话号码使用本地格式时设置 META_DEFAULT_PHONE_REGION=TW 等两位国家代码。

customData 支持 value、currency、contents、numItems、contentIds、contentName、contentCategory、contentType、contentUrl、orderId、searchString、predictedLtv、deliveryCategory、status、tax 和 shipping 等字段。Purchase 必须同时提供 value 和 currency；其他金额事件可以使用 META_DEFAULT_CURRENCY。

内容项必须包含 ID 和正数数量。productId / contentId 会归一化为 id，itemQuantity 归一化为 quantity，price / itemPrice 归一化为 item_price。没有 numItems 时会自动累加内容项数量。

dataProcessingOptions 当前支持 ['LDU']。设置国家后必须设置州；国家值为 0 或 1，州值为 0 或 1000。optOut 和 restrictedDataProcessing 必须是布尔值。

## 请求安全与可靠性

浏览器将 JSON 发送到 POST /api/conversions。接口会执行同源校验、32 KB JSON 大小限制和按 IP 的每分钟速率限制，并返回结构化错误，例如 invalid_origin、request_too_large 和 rate_limited。Meta 请求支持超时和暂时性错误重试，日志不会记录 Access Token 或完整用户资料。设置 META_TEST_EVENT_CODE 后可以在 Meta Test Events 中验证事件。

## 测试

~~~sh
npm test
~~~

测试覆盖 Cloaking.House 分流、本地 White page 回退、同源校验、速率限制、错误 JSON、超大请求、浏览器默认值、归因 Cookie、字段归一化、哈希、校验和重试。
