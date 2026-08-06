# RFC 9457 错误响应前端对接设计

## 技术方案

`packages/types/src/api.ts` 定义 `ProblemDetails`，保持 snake_case wire 字段，不声明 deprecated
`error`。`packages/api-client/src/http.ts` 尝试解析 JSON，并且只从非空 `detail` 取得展示文案；机器
判断只读取字符串 `code`。

只有标准字段类型完整、`status` 是整数且与实际 HTTP 状态一致时，响应才保存为
`HttpError.problem`。不完整响应仍可独立提取安全的 `detail/code`，但不得作为可信完整 Problem 使用。
旧的 `details[]` 是词库发布检查扩展，继续单独保留。

## 影响文件

- `packages/types/src/api.ts`：Problem Details wire 类型。
- `packages/api-client/src/http.ts`：RFC 9457 解析与 `HttpError.problem`。
- `packages/api-client/src/http.test.ts`：解析与状态机测试矩阵。

## 测试矩阵

| ID  | 层级 | 场景              | 输入/前置条件                     | 期望                               | 优先级 |
| --- | ---- | ----------------- | --------------------------------- | ---------------------------------- | ------ |
| N1  | 单元 | 标准字段错误      | 完整 Problem + field              | detail/code/problem 全部正确       | P0     |
| N2  | 单元 | 正式媒体类型      | `application/problem+json`        | 正确解析，不依赖旧字段             | P0     |
| N3  | 单元 | 状态不一致        | body.status 与 HTTP 状态不同      | 使用 HTTP 状态，拒绝保存 Problem   | P0     |
| N4  | 单元 | 非法 body 状态    | 0、负数、小数、越界状态           | 拒绝保存 Problem，不影响安全文案   | P0     |
| N5  | 单元 | 空白 detail       | detail 只有空白                   | 回退 statusText                    | P0     |
| N6  | 单元 | 缺失/错误标准字段 | null、数组、错误字段类型          | statusText 回退，不抛解析异常      | P0     |
| N7  | 单元 | 非 JSON           | `res.json()` 抛错                 | statusText 回退                    | P0     |
| N8  | 单元 | 畸形扩展          | field 非字符串、details 混入数字  | Problem/details 安全降级           | P0     |
| N9  | 回归 | 403 全局分支      | code=must_change_password         | onForbidden 仍按 code 触发         | P0     |
| N10 | 回归 | 401 刷新          | 携带 token 的请求收到 Problem 401 | 刷新并重试，状态机行为不变         | P0     |
| N11 | 回归 | 422 details 扩展  | Problem + details 数组            | `isIncompleteHttpError` 行为不变   | P0     |
| N12 | 单元 | 网络失败          | fetch 直接 reject                 | 保留原网络异常，不伪装成 HTTP 错误 | P1     |

双击提交、乐观回滚和跨页面 E2E 不适用于无状态的响应解析函数；现有认证刷新测试覆盖唯一相关的状态
迁移，本次不重复建立页面级用例。

## 风险与回滚

- 后端若仍返回只有 `error` 的旧响应，前端只会显示 `statusText`；这是明确选择，不提供兼容保证。
- `detail` 文案不是机器契约，所有业务分支继续只读取 `code`。
- 回滚只需恢复请求层解析，不涉及状态、缓存或持久化数据。
