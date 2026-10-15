# C 端词典

## 目标与验收

登录后从首页及网站/学习/教学菜单进入词典；游客经 RouteGuard 登录返回，API 同样校验 C 端身份。搜索英文拼写包含匹配，只读当前有效的已发布 V3 智能词条，草稿、撤回、归档及旧发布内容均不可见。

搜索框初始居中，搜索后置于左上。历史按账号存于本地 localStorage，不上传；最近前置、大小写去重，最多保存 20 条，页面最多显示一行，可重查/逐条删除。存储不可用仍能查词。

结果分页；显示偏好方言主拼写/其他拼写，按已有词性顺序最多两个词性、每个取首个词义。释义按用户 CEFR 最近等级选择（同距低级优先），中文优先，一条即可；语法结构对应所选释义。点击进入详情，查看音标、已有发音和例句。没有录音不伪造合成或暴露后台试听接口。二期词频排序不在本次范围。

## 依赖与实现

- 已在主线：登录守卫、用户学习偏好、词条发布边界、词表安全内容投影、富文本只读组件、对象存储短签。
- 直接复用：完整词条投影和当前发布行锁、主题/导航/表单组件。
- 新增：dictionary 查询/详情/音频授权接口、严格 wire 契约、搜索/列表/详情与本地历史。
- 查询：GET /dictionary?q=&page=&page_size=（q 必填非空，最多100字）；GET /dictionary/entries/{id}；GET /dictionary/entries/{id}/audio/{asset_id}，均要求 C 端 AuthUser。音频仅为该词条当前发布内容实际引用的资产签短期 URL。
- 前端工作区：/Users/darwish/.codex/worktrees/consumer-dictionary/tsz，分支 codex/consumer-dictionary。
- 后端工作区：/Users/darwish/Dev/tsz-core/tsz-rust-consumer-dictionary，分支 codex/consumer-dictionary，基线 9cff1b8。

## 验证与交付边界

后端 handler 验证鉴权、包含搜索/分页、归档和撤回隔离、音频引用授权及无后台字段；前端验证等级选择/方言、请求竞态、历史隔离/删除/损坏存储、入口和状态。同步后端导出 OpenAPI 与 api-client runtime bundle，执行定向测试、类型/lint/生产构建，按可用隔离环境进行真实页面验收。无环境或凭据则明确标注未验收。

新增独立接口可后端先发布，旧前端不受影响；新前端依赖新增接口，旧后端返回404时显示失败及重试，不回退假数据。用户已授权前后端提交、推送并创建 PR；合并与部署仍需对应授权。

## 本地验收结果（2026-10-15）

- 版本输入：前端 591ab6a3 + 本任务工作区差异；后端 9cff1b8 + 本任务工作区差异。OpenAPI 已由选定后端导出，前端 snapshot/runtime bundle 的来源和 SHA-256 已核对一致。
- 代码检查：全仓 typecheck、lint 通过（保留既有三条 warning）；web 生产构建通过。api-client 全包 529 项通过。词典专属前端 9 项通过，导航相关 9 项通过。
- 全仓普通测试首次：3781 通过、2 跳过、4 失败。两处本次新增导航入口的旧断言已更新并定向通过；另两个未修改的 admin 用例发生 5 秒超时，原超时配置下单独复验均通过。没有再次重复全仓，也未把首次运行记为全绿。
- 后端：`cargo fmt --check`、`SQLX_OFFLINE=true cargo clippy --locked --all-features --all-targets -- -D warnings` 通过；隔离 Postgres/Redis 下 `cargo test --locked --all-features --test wordlists_handler` 全部 14 项通过，含4项词典回归：鉴权/分页与发布隔离、surface 版本隔离、音频引用签名、共享例句隐藏/撤回。
- 真实页面：本任务 Next 生产构建/next start（127.0.0.1:13439）→ 本任务后端二进制（127.0.0.1:18439）→ 独立 Postgres（127.0.0.1:55587/dictionary_acceptance）、独立 Redis（127.0.0.1:56389/0）。没有拦截 dictionary API 或使用词典 mock；本地登录/引导、包含搜索、详情、偏好从 BrE 切换到 AmE 后即时变更主拼写、历史刷新保留及删除后刷新不恢复均通过。390px 列表与详情无横向溢出，深浅主题已截图检查。
- 样本：仅本任务隔离库的 centre/central 发布内容与测试用户；通过测试 helper 准备发布快照，不能视作后台创编发布 UI 验收。fixture 构建入口已移除。音频鉴权与短签已用内存对象存储回归，浏览器样本无真实录音，实际录音播放未验收。
- 截图保留在 `/Users/darwish/.codex/artifacts/consumer-dictionary/20261015/`。测试服务在验收后停止，测试数据库删除；未接触共享/测试服数据库。
- 实施阶段已完成本地验证。当前已进入用户授权的双仓 PR 交付阶段；不执行合并或部署。

## PR 交付阶段

同步最新主线：前端基线 `8e8dc577`，后端基线 `af16569`，并重新导出/同步权威 OpenAPI，保留新增主线契约。原生提交/推送 hooks 正常执行，独立 reviewer 在提交后审查精确版本。前端依赖后端新增的三个独立接口，应先发布后端；此次没有新增 migration、后台接口变化或新开关。旧前端不调用新增接口，新前端访问旧后端时呈现查询失败及重试。实际部署版本与混合部署环境未核实，本次只交付 PR。
