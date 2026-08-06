# RFC 9457 错误响应前端对接需求

## 背景与目标

前端直接采用最新 RFC 9457 错误契约，不兼容旧 `{error: "..."}` 响应。Web 与 Admin 共用的请求层
只从 `type/title/status/detail/code` 与可选 `field` 读取标准 Problem Details 和 tsz 扩展字段，错误
媒体类型按 `application/problem+json` 测试。

## 范围

- 在 `@tsz/types` 定义 snake_case Problem Details wire 类型。
- 在 `@tsz/api-client` 使用 `detail` 作为错误展示文案，使用 `code` 进行机器判断。
- 完整且与实际 HTTP 状态一致的 Problem 保存到 `HttpError.problem`，供表单读取 `field`。
- 未识别、缺字段或非法 JSON安全回退到 HTTP `statusText`。
- Web/Admin 继续通过同一个 `HttpError` 接收错误，无需各自实现解析分支。

## 非范围

- 不读取或声明旧 `error` 字段。
- 本次不实现产品文案本地化目录。
- 不修改业务页面的错误提示和状态码分支。
- 不修改后端实现。
- 不改变词库发布接口现有的 `details[]` 扩展行为。

## 验收标准

- `application/problem+json` 响应产生正确的 `HttpError.message/code/problem`。
- 业务状态使用真实 HTTP status，不能被 body.status 覆盖。
- `field` 可从 `HttpError.problem` 读取。
- 空文案、非对象 JSON、非法 JSON和不一致 Problem 均安全降级。
- 不存在读取 `body.error` 的前端代码或旧格式测试。
- 请求层单测、类型检查、Lint、全仓覆盖率门禁通过。
