# 实现与验证

前端：`/Users/darwish/Dev/tsz-core/tsz`，保留当前工作树，交付分支为 `codex/form-spelling-regularity`。
后端：`/Users/darwish/Dev/tsz-core/tsz-rust-form-spelling-regularity`，实现基于 `041e9a1`，ship 时合入 `e07d7e4` 主线的隔离分支。
ship 时同步前端 `f8f545a` / 后端 `e07d7e4` 已合入的多组词义绑定能力；本次不改其业务逻辑。

## 依赖与方案

可复用：V3 拼写变体、词形编辑器、英美转换、草稿 JSON 和发布快照。
小改动：组级 UI 移除、拼写标题右侧开关、预览移除规则组文案。
新增：variant 可选 `is_regular` boolean、关系表列、兼容规范化和回归测试。
关键路径：DTO/保存兼容 → 前端 wire 与转换 → UI → OpenAPI 同步 → 验证。

组级 `is_regular` 保留为历史兼容字段，不能再作为新业务判断来源。
三种变体增加可选但非 null 的 `is_regular`。历史缺字段按所属组回填；多个旧组冲突时 false 优先，无组时默认 true。显式新字段优先。旧请求缺字段时先保留当前同 ID 变体值。
前端共用拼写+分发音仍是 uk/us 结构，一个控件写两份相等值；后端按 spelling_mode 校验一致性，不按字符串碰巧相等判断。
拆分复制值，合并不同值时提示先统一。修改标记不改变稳定节点 ID。

## 存储和兼容

迁移新增 `lexicon.v3_form_variants.is_regular` nullable boolean，回填当前关系表的旧组值。保存同时写 JSON 和关系列；不可变历史快照不重写，读时兼容。down 仅在草稿和发布快照均未写入新字段时删除新列；已有新格式 JSON 时明确拒绝回退。导出数据本身不解除阻止，需另行设计兼容的数据恢复流程。
影响 forms preview/save、词条 GET 和发布响应内的 variant。无新增端点、权限或业务筛选。
旧后端严格拒绝新请求字段，旧前端严格拒绝新响应字段；完整新版本不能直接与旧版本混用。实际发布需兼容阶段：先旧前端仅放宽响应 schema（不发送新字段），再后端，最后本次编辑 UI；本任务不执行部署。历史缺字段由新端处理，不代表任意混合版本安全。

## 验收

前端：`pnpm --filter @tsz/admin test src/features/dictionary/word-creation-v3/operations.test.ts src/features/dictionary/word-creation-v3/model.test.ts src/features/dictionary/word-creation-v3/components/V3FormsAndPronunciationStep.test.tsx`；`pnpm --filter @tsz/api-client test`；`pnpm typecheck`；受影响 lint 和格式检查。完成时运行全仓普通测试。
后端：`SQLX_OFFLINE=true cargo test --locked --all-features --lib`、`cargo fmt --check`、`SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings`。隔离数据库中执行生命周期往返测试与 migration up/down，核验 JSON、关系列、发布快照。
OpenAPI 按官方 export_openapi 生成并显式指定本次后端路径同步到前端。

## 本次验证结果（2026-09-17）

- 前端全仓普通测试覆盖 184 个文件：首轮 179 个文件通过；修正新字段默认值及契约指纹的预期后，剩余 5 个文件单 worker 复验全过（包含首轮 worker 启动超时的文件）。合计 2756 项通过、2 项原有跳过；未修改超时阈值。
- `pnpm typecheck` 七个项目通过；受影响文件 ESLint、Prettier 和 `git diff --check` 通过。
- 后端全量 `--lib`：281 项通过；handler 往返/发布/旧请求兼容及迁移回填/回退保护各一项通过；Clippy all-targets/all-features 与 fmt 通过。
- PostgreSQL 16 与 Redis 7 使用本任务新建的隔离容器，未访问业务环境。实现阶段未执行浏览器视觉验收、提交、推送或部署；后续 ship 记录见配套 PR。
- OpenAPI 官方生成物与前端 runtime bundle 来源 SHA256 一致。产物来源为本任务后端 checkout，ship 时重新生成，不代表已部署版本。

## Ship 基线整合

前端已合入 `f8f545a`，后端已合入 `e07d7e4`；保留主线词义多组绑定与引用保护。本次迁移编号顺延为 `20260917180000_add_form_variant_regularity`，排在主线 `20260917120000` 之后。后端保留任务工作树，从完整已审提交推送到 `dev` 并创建面向 `main` 的 PR，不改动其他 worktree。

## 兼容部署补丁

现网 admin=f8f545a、API=e07d7e4，二者旧协议不能直接与本功能的另一端混用。
新增 `VITE_FORM_SPELLING_REGULARITY`，生产缺省关闭、开发缺省开启；部署脚本显式接受 `DEPLOY_FORM_SPELLING_REGULARITY`（默认 true），先显式 false 发布兼容读取前端。
关闭时隐藏规则选项，不在新建及旧数据英美转换时生成变体字段；始终保留新 API 返回的显式值（包括 false），wire 不做统一剥离。
规范顺序为：该补丁合 main 且精确 CI 成功 → admin false → 确认所有录入人员已保存并刷新/关闭旧标签页 → 专用 backend_deploy_runner 部署 API 并验收 → 同一 frontend main 的 admin true。两次 admin 制品来源相同但构建开关不同，制品摘要分别验证。

切换 API 前必须确认旧页面已处理；现有资源更新提示不会自动刷新有编辑内容的页面，不能把发布静态资源当作所有客户端已升级。无法确认时停在兼容 admin + 旧 API，不切换后端。
