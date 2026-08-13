# 管理端 TTS 试听接入设计

## 方案

沿用现有三层边界：`@tsz/types` 镜像 snake_case wire；`@tsz/api-client` 只负责鉴权 HTTP；admin adapter 把 wire 映射为 `@tsz/voice-editor` camelCase 领域模型。播放器和短期 URL 生命周期留在编辑器组件内，不进入词条 model/store。

不采用浏览器构造 SSML 或直接选择 provider voice id：服务端必须掌握规范化、供应商映射、缓存键和签名 URL。高级 SSML 面板只是本地教学预览，绝不作为试听请求字段。

## 影响文件

- `packages/types/src/admin-tts.ts`：OpenAPI speech wire。
- `packages/api-client/src/admin.ts` 及契约测试：GET voices、POST previews。
- `apps/admin/src/features/dictionary/voice-editor/adapter.ts`：能力映射、请求白名单、RFC 9457 安全错误分类、409 有界重试。
- `packages/voice-editor/src/types.ts`：领域错误的可重试属性。
- `packages/voice-editor/src/editor/VoiceRichTextEditor.tsx`：状态机、TTL timer、媒体错误、stale/abort/unmount 清理、响应式可访问 UI。
- 相邻单元/组件测试与本目录测试矩阵。

## 数据与状态流

`open` → 带 AbortSignal 拉取目录 → 选 alias/capabilities → canonicalize RichTextV2 → adapter 白名单映射 → POST preview → 仅内存持有 `{audioUrl, expiresAt, cached}` → 创建 Audio 播放。内容或设置变化、到期、媒体错误、关闭/卸载均停止播放并清除结果。

409 且 problem code 为 `speech_preview_in_progress` 时 adapter 使用短退避自动重试，最多三次总请求；AbortSignal 可中断等待。其他错误映射为稳定、安全的客户端文案，不传递响应 detail/message。401/403 不在 adapter 吞掉，由现有 HttpClient 刷新/登出/门禁处理后再落为通用错误。

## 能力约束

- voice 只使用 API 返回的 `alias/locale/gender/capabilities`。
- style 必须存在于当前 voice styles；rate/pitch 必须为预设整数且落在服务端范围内。
- 切换 voice 清理不合法设置；adapter 在请求边界再次校验，防止绕过 UI。

## 风险与回滚

- 系统时钟偏差可能使 URL 提前失效；音频 error 事件会走同一清理路径并允许重生。
- 409 等待期间切换内容需及时 abort；使用 abortable timer。
- 功能由现有 `VITE_VOICE_PREVIEW` 控制，可关闭 adapter 注入而不影响 RichText 编辑。

## 验证

先跑 voice-editor/admin/api-client 聚焦测试，再跑 OpenAPI 同步契约、`pnpm test:cov`、`pnpm typecheck`、`pnpm lint` 与 admin production build。真实 Azure/OSS 只列手测，不在自动化调用。
