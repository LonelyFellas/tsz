---
name: code-review-frontend
description: 审查 tsz 前端 Next Web、React/antd Admin 与共享包改动，关注鉴权竞态、请求与状态一致性、wire/运行时契约、交互回归及有效测试。只报告，不自动修复或交付。
---

# TSZ 前端代码审查

## 范围与证据

- 以所选 checkout 的 `AGENTS.md`、受影响目录规范、实际源码与配置为准。本文路径相对于所选仓库根目录；技能链接相对于本文件。
- 记录根目录、HEAD、基线和脏状态。用户指定范围优先；未指定且有改动时检查 staged、unstaged、非忽略 untracked 及其最终合成行为；干净分支通常从与 `origin/main` 的 merge-base 审查。需要最新引用先 fetch，失败明确时效局限。
- 精确提交/PR 读取对应 Git 对象，不用当前脏文件替代；不同 worktree 不混用。父目录或多个候选目标不明确时先问。
- 读完整 diff、直接调用链及相关测试，只检查变化实际命中的风险，不机械输出整张检查表。

## 按变化选择检查

### 共享层与 API

- wire 类型在 `packages/types` 中保持 snake_case、与后端 JSON 一致；检查必填/可选/nullable、枚举、分页、日期/ID、状态码和错误体，不用断言或转换层掩盖漂移。
- 请求沿 `packages/api-client` 到组件/Query/store 追踪；检查 path/method、参数编码、取消/超时、失败反馈与错误是否被吞掉。
- 共享业务和鉴权逻辑放 `packages/shared`，请求与类型各归其包；分层问题须说明实际不一致、回归或明确违反的项目约定，避免泛化重构。
- API 改动只读核对 [contract-sync](../contract-sync/SKILL.md)：选定后端实现/DTO → `docs/openapi.json` → 前端 endpoint/runtime 快照 → 类型/实际消费者。核实两仓 checkout、SHA 与脏状态，不运行生成器。
- V3 严格 runtime validator 可能拒绝新增响应字段；检查旧前端+新后端、新前端+旧后端及目标组合，按证据判断发布顺序。`PENDING` 不能掩盖已实现端点不一致。拿不到配套版本时明确兼容性未验证。

### 鉴权、安全与异步状态

- 共享鉴权内核 `@tsz/shared/auth` 的 refresh 并发合并、过期/撤销、失败退出和重试是否一致；web/admin 薄壳是否产生不同会话行为。
- refresh cookie 的 path 限制决定不能把客户端路由守卫误换成依赖该 cookie 的 Next 服务端 middleware。UI 门禁不能代替服务端授权。
- 登出/注销后受保护页用整页跳转；检查 RouteGuard/GuestGuard 竞态、缓存残留和用户切换后的数据串用。
- TanStack Query key 是否含实际筛选/分页/身份维度；mutation 后失效范围、乐观更新回滚、旧请求覆盖新状态、重复提交和组件卸载后的异步行为。
- 检查不可信 HTML/URL、开放重定向、浏览器 bundle 泄密和敏感日志；只报告有可达输入与实际影响的路径，不仅凭关键词判漏洞。

### Web：`apps/web` / `packages/ui`

- Next 服务端/客户端边界、浏览器 API 的执行时机、水合一致性、请求瀑布及错误/空数据状态。
- 主题状态从 localStorage 派生；检查水合后 html 的 `.dark` 是否按约定重新断言，避免闪烁或状态不同步。
- 公开页面才检查 SEO/metadata/可索引性；权限页不机械套 SEO。长列表、包体、重复请求仅在有规模/调用证据时报告性能缺陷。
- 检查关键流程、表单校验、键盘操作、焦点/可访问名称以及移动端可用性；不把审美偏好当 bug。

### Admin：`apps/admin`

- 沿用 React Router + TanStack Query + antd v6，不引入 tailwind / `@tsz/ui`，不套 Next 路由或 Web SEO 规则。
- 检查筛选/翻页/排序联动、删除最后一行后的页码、编辑切换的旧表单值、保存失败时草稿保留和重复提交。
- `Form.List` 动态行使用 `field.key`，避免删除/重排造成行状态错位；检查 noStyle Form.Item 的无效 style、v6 Alert 的 `title` 等实际命中的 API 变化。
- 沿真实业务 ID 追踪词条/词形/义项/例句等选中关系、批量操作与回填，不因展示文本相同混用实体；仅对本次涉及的领域展开。

## 最小验证与交付

- 读取当前 package scripts、Vitest/Playwright、CI 清单及邻近测试，参考 [test](../test/SKILL.md) 选择已有单文件/包测试；只读任务不自动补测、更新快照、格式化或同步契约。
- admin 测试核对 matchMedia/ResizeObserver 垫片及 antd 两字按钮空格；大表格避免昂贵查询导致伪超时。测试必须断言用户结果或请求契约，不能只验证 mock 自洽。
- Web 本地真实验收按项目规范用 build + next start，不启动 next dev；仅在风险需要且依赖/数据安全已核实时运行。其余未运行项如实报告。
- 不固定覆盖率门槛，不重复已有效的全量测试，不自动进入 ship。只读审查是行为约束而非沙箱；当前会话审查不冒充独立 reviewer，也不满足 ship 的独立 pre-push 门禁。
- 输出按 P0（紧急广泛事故）/P1（严重关键故障）/P2（实质缺陷）/P3（低影响确定缺陷）排序。每条给仓库/文件:行号、具体触发、影响、代码/契约/测试证据与最小修复方向；先找反证、合并同根因，不凑数、不报纯风格。
- 结尾列实际审查版本、执行命令/结果、环境阻塞和未验证风险。没有确定问题写「未发现可确认缺陷」。不修改、不暂存、不提交、不推送、不部署，不覆盖用户改动。
