# 管理端 TTS 试听接入需求

## 目标

在管理端词条创建流程的英语 RichTextV2 编辑器中接入真实语音目录与临时试听接口。管理员可以按服务端能力选择稳定 voice alias、风格、语速和音高，生成并播放 300 秒短期签名 URL，同时获得明确、安全、可恢复的状态反馈。

## 范围

- 目标端：`apps/admin` 的词条创建/编辑 RichTextV2 场景，以及共享 `@tsz/voice-editor`。
- 接口：`GET /api/v1/admin/speech/voices`、`POST /api/v1/admin/speech/previews`。
- 输入仅允许 canonical RichTextV2、voice alias、受能力约束的 style/rate/pitch。
- 覆盖初始、目录加载、生成、generated、hit、播放、过期、错误、重试和竞态清理。
- 401/403 继续由现有 admin `HttpClient` 全局鉴权流程处理。

## 用户流程

1. 打开英语语音富文本编辑器后加载 voice 目录；首项为默认 alias。
2. UI 按当前 voice capabilities 提供风格、语速、音高选项，切换 voice 时清理不再合法的旧选项。
3. 点击“生成试听”后只提交规范化 RichTextV2 和受控参数；成功后区分“新合成”与“缓存命中”并播放。
4. URL 到期、内容/参数变化或音频加载/播放失败后立即废弃旧 URL，允许重新生成。
5. `speech_preview_in_progress` 最多自动重试两次并短暂等待；429/503 可手动重试；400/404/422 显示不可重试的安全提示。

## 安全与约束

- 不提交或保留 SSML、provider voice id、hash、object key、音频内容或任意用户 URL。
- `audio_url` 仅保存在组件内存；不写 localStorage、query string、日志、埋点或错误报告。
- 不向界面展示不受信任的服务端响应正文。
- 快速连点只产生一个生成请求；切换内容/voice/style 时取消或忽略旧响应；卸载时停止音频并清理请求和计时器。

## 验收标准

- wire 类型、路径、方法和字段与 tsz-rust `docs/openapi.json` 一致。
- generated/hit、播放中、过期/重新生成、全部指定错误分支均有可观察状态。
- capabilities 对 UI 与提交参数形成双重约束。
- 自动化覆盖测试矩阵中所有 P0；API 全部使用 mock。

## 不在范围

- 后端、Azure/OSS、正式音频 Worker/CDN、持久音频、头像、部署及其他无关 UI。

## 未决问题

- 当前契约未返回本地化 voice 展示名，首期仅展示 alias、locale、gender；不推断或暴露供应商身份。
