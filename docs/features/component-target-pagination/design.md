# 方案与验证

## 基线和依赖

前端工作树 `/Users/darwish/Dev/tsz-core/tsz-component-pagination`，实现基线 `142cb3e`，交付前同步 origin/main `c770607`；后端 `/Users/darwish/Dev/tsz-core/tsz-rust-component-pagination`，origin/main `3932435`。两仓分支 `codex/component-target-pagination`。原工作树未提交测试及词性修复不动。

已有：component-targets/search 的 cursor/next_cursor、严格响应解码、候选分组、成分展开重试。
小改动：请求可选 entry_id、游标绑定新字段、稳定排序、OpenAPI/types 同步。
新增：完整结果枚举与分批快照加载、前端主列表加载更多、目标内多页加载。
关键路径：后端查询与契约 → 前端分页与目标查询 → 专项回归 → 统一质量门。

## 后端

保持响应结构、候选计数和 cursor offset 语义。去掉匹配词面总量与词条总量硬截断；先读轻量词面标识，分批读取最多 200 个词条快照/草稿投影，再复用 published_candidates 转换及完整候选键去重。最终按匹配等级、发布状态、headword、entry_id、pos/base/variant 稳定排序后分页。total 是完整候选数，truncated 仅表示存在下一页。

新增可选 entry_id，在 SQL 截取/装载前过滤，并绑定 cursor digest。对目标词条的全部候选沿同一个接口读取；不存在/归档/词面不匹配返回空，不错绑其他同名词条。游标编码版本与字段语义一致，旧游标失效需重新加载。

此设计优先保证完整结果与兼容性：精确候选总数需要遍历匹配集，每页仍存在全匹配集统计成本；分批加载控制快照峰值，不能把它宣传为仅处理当前页50条。更大规模如需消除此成本，后续需候选投影分页或缓存快照，不纳入本次范围。

## 前端

主列表保存 next_cursor/loadingMore/error/stale。追加完整候选原始数组，由现有 entry→form→sense 分组去重，不只按 entry_id 丢弃后页。重复点击用请求锁拦截；初次/追加请求使用同一查询条件。查询变更通过 effect 生命周期屏蔽迟到响应。失败仅更新分页提示，保留候选、选中路径和已选目标；cursor 字段的 invalid_query 提示重新加载，清空旧候选后取首批，不改宿主已保存关联。

成分查询新增 entry_id，并在该目标内追踪 next_cursor 直到结束后展示完整词形词义；失败允许重试。旧后端 truncated 且无 next_cursor 时提示候选未完整返回，不宣称已全部加载，不提示用户修改固定词面。

## 兼容与发布顺序

响应不加字段。新增请求 entry_id 被旧后端 deny_unknown_fields 拒绝，因此后端先发布，再前端。新后端接受旧请求；现有前端仍只展示首批，但不报解码错误。部署不在本次授权范围。

## 风险验证与收尾

后端：超200词条、超2000重复词面、按entry_id查后排目标、多base候选跨页、稳定顺序、cursor绑定参数与generation。前端：50后候选可选、跨页同词条合并、空批仍可继续、失败重试不丢选择、过期游标刷新、卸载/换词面迟到响应隔离、目标定向查询。检查API严格解码与生成物来源；最后各仓原生质量门一次。

后端验收命令（配置隔离 PostgreSQL/Redis 后）：`SQLX_OFFLINE=true cargo test --locked --test lexicon_handler component_target_search`

## 已取得的验证证据（实现阶段；交付检查见 PR）

- 前端 `pnpm typecheck`、相关文件 ESLint 通过；`pnpm --filter @tsz/api-client test` 为 9 文件 / 393 项通过。
- 最终 `pnpm test:cov` 为 176 文件 / 2624 项通过、2 项既有跳过。首次全量的一处旧断言未接收新 AbortSignal，已补明确断言后完整重跑通过。
- 后端专项 `component_target_search` 7 项通过。1001 个词条均经正常创建发布 helper 建立，8008 条候选每50条遍历完整，无重复遗漏；遍历约33秒（本机隔离测试，不作为生产基准）。
- 新版请求中的 entry_id 已被严格 OpenAPI 契约确认可选 UUID；前端 runtime bundle 的 source hash 与后端导出原文件一致：`d94ce9ed1a6f17cb9d6dc6cc6e8fbdd05ff809f185f926888238dcd12469b87b`。
- SQLx prepare 在本任务 PostgreSQL 上完成；修改的是动态查询，没有新增宏查询缓存。生成器移除的既有缓存已恢复，避免本次夹带缓存清理。
- 独立只读审查未发现分页主链路阻断；指出的范围外 resolve 游标修改已恢复。
- 分页状态直接置于现有级联组件内，没有新增单次使用的 hook。整理后定向25项及完整前端覆盖率检查再次通过。
- 实现阶段未部署，尚未进行新版页面与已部署服务的真实联调。前端 PR 需要后端配套实现先发布；后端候选仍为 `3932435` 加工作区差异，导出的 OpenAPI 哈希见上文。
- 区块顺序改为「多维释义 → 成分用词 → 多维例句 → 拓展词」，仅移动渲染位置，相关组件91项测试通过。
- 本地隔离容器：`tsz-component-pagination-pg`（55442）、`tsz-component-pagination-redis`（56393）。后端最终 fmt/Clippy 通过，`cargo test --locked --all-features` 全量900项通过、1项既有忽略（真实OSS写入冒烟需独立凭据）；本任务两个隔离容器已清理。

后端验收命令（配置隔离 PostgreSQL/Redis 后）：`SQLX_OFFLINE=true cargo test --locked --test lexicon_handler component_target_search`
