# TASK#160 词形默认模版

来源：禅道任务 160。用户已授权实施及前后端提交、推送、创建 PR；未授权合并或部署。

## 范围与验收

- 每种词形在新增/修改弹窗设置“默认模版”，默认开启；原形始终开启。
- 新建词条、手动新增词性只自动生成默认词形。关闭项仍在手动添加候选中。
- 已有词形、已保存草稿及词典已有候选不因配置变化而删除或自动补回。
- 保存后重新请求/打开验证持久化；失败保留表单设置，版本冲突沿用现有机制。

## 实现与依赖

- 前端：当前任务 worktree `codex/task-160-default-form-template`。
- 后端：`/Users/darwish/Dev/tsz-core/.worktrees/backend/task-160-default-form-template`，同名分支；以本文件为主记录。
- 复用已有词形 CRUD、权限 `lexicon_settings.edit_forms`、revision、目录版本与默认列表字段。
- 新增 `catalog.form_types.is_default` 和对应 CRUD/catalog wire；`default_form_types` 按开关过滤，`allowed_form_types` 保留全部。
- 模板生成继续复用 `fillFormTypeTemplate`，只调整模板来源。

## 兼容与回退

- 新 API 接受旧客户端：创建省略开关时开启，更新省略时保持原值；旧客户端的普通目录请求不做严格 runtime 校验，新增字段不会被拒绝。旧模板仍铺全部可用项。
- 新前端连接旧 API：没有 `is_default` 时禁用开关且不发送该字段；默认列表缺省时回退 `allowed_form_types`，明确空数组不回退。
- 推荐后端先更新、前端随后更新；过渡期旧前端尚不遵循默认列表。前端回退会恢复旧模板行为，不删除数据。
- 迁移 `20261102020000_form_type_default_template` up 为历史词形开启开关，数据库约束禁止关闭原形。
- down 仅移除新列/约束，不删除词形；会永久丢失开关设置。只回退旧二进制可保留新列，但旧模板行为不再受开关控制。

## 当前验证

已完成本地实现与验收，正在交付前后端关联 PR；提交、审查与 CI 的实际状态见关联 PR。未执行合并或部署。

- 前端基线 `8867d344`、后端基线 `6bb608e`，均为对应提交加本任务工作区差异。
- `pnpm typecheck`：7 个项目通过。受影响文件 ESLint、Prettier 与 `git diff --check` 通过。
- 配置页组件测试：9 项通过，包含默认开启、关闭后保存回显、失败保留/重试、原形禁用与旧服务兼容。
- `operations`、`V3FormsAndPronunciationStep`、`WordWizardV3`：200 项通过，涵盖模板、手动添加及草稿回归。
- `pnpm --filter @tsz/api-client test`：36 文件、674 项通过；生成物 SHA256 与选定后端 OpenAPI 一致。
- `cargo test --locked --test catalog_handler --test catalog_schema`：45 项通过，包含持久化、版本冲突、API/数据库原形保护、up/down 往返及历史词形默认开启。
- `cargo sqlx prepare -- --all-targets --all-features` 成功，`.sqlx` 无差异；`cargo clippy --locked --all-targets --all-features -- -D warnings` 和 fmt 通过。

真实链路由 Codex 内置浏览器完成：`127.0.0.1:30460` 的 Vite 同源 `/api/v1` 代理到本任务 Rust 服务 `127.0.0.1:58460`；三个相关 mock 开关均为 false。独立 PostgreSQL 端口 55460、Redis 端口 56460，仅有本任务数据。检测所需的 projection 与 read/create/edit 开关显式开启，使用最小词典 fixture，无 OSS/音频合成请求。

1. 在配置页关闭复数默认模版并保存，刷新页面后重新打开仍关闭；独立 SQL 回读 `is_default=false`、revision=2。
2. 从词典检测到新建词条，名词只铺原形；“增加词形”仍提供复数。
3. 手动添加复数并填写拼写，保存后刷新，复数及其内容仍在；独立 SQL 确认原形与复数均已入库。

验收后已注销临时账号并关闭浏览器页，停止本任务 Vite/Rust/PostgreSQL/Redis 进程，删除整个专属 PostgreSQL 集群（含账号、词典、词条、会话和测试库）。Redis 未启用持久化，进程退出后键全部消失；独立复查四个端口均不监听、数据目录不存在。未接触共享服务，不使用 OSS。保留脱敏测试结果和页面截图；浏览器持久化 UI 偏好未作清除验证。

截图位于本次 Codex 可视化目录的 `task160/`，包含开关刷新回显、新建词条仅原形及手动词形保存后回读。

## PR CI 跟进

关联 PR：前端 [#661](https://github.com/LonelyFellas/tsz/pull/661)，后端 [#375](https://github.com/LonelyFellas/tsz-rust/pull/375)。后端 CI 已通过并已合并。

前端提交 `30485f56` 的 [CI run 41465339020](https://github.com/LonelyFellas/tsz/actions/runs/41465339020) 中，仅 `admin-2` 两个新组件用例超时（10 秒/5 秒），其余质量、构建及分片通过。本地原版本的单文件覆盖率运行仍通过（9 项、用例总耗时 9.27 秒），未把本地成功当作已复现 CI 超时。

失败重试场景会等待 `message.error` 返回的 thenable，而 AntD 通知默认展示 3 秒。补丁仅在测试 provider 将通知设为 0.1 秒，并把成功保存/重开回显与失败保留/重试分开；两段各沿用原场景 10 秒上限，不修改生产代码、断言或覆盖率规则。使用 CI shard 配置、coverage、单 worker 验证 10 项通过；原 `admin-2` 完整覆盖率分片验证也已通过（56 文件、767 项，单 worker）；最终 CI 结果以 PR 最新 head 对应 run 为准。

### 后续超时与主线冲突修复

用户已明确授权修复前端 #661 的测试超时与合并冲突、正常推送并继续跟踪 CI；未授权合并或部署。失败基线为 `1a2df8b0` 的 CI run `41475400548`：两个配置页用例分别 10 秒/5 秒超时。本地相同 coverage/单 worker 路径通过，不能声称在本机重现 Linux 超时。

前一次缩短通知/拆分场景未彻底解决慢机开销。本轮临时探针保留原始 `getComputedStyle` 行为，测得两项用例共 219 次样式计算、约 3960ms；改为表格行内文字、弹窗标题与控件 label 定位，并等待实际弹窗可见/DOM 移除后，为 40 次、约 88ms。两项原路径测试总耗时由约 4.84s 降至 0.94s。生产行为、业务断言、可见性验证及超时上限保留；探针已移除。

同步前端 `origin/main=6204eb7c`，保留其多拼写功能及当前默认模版行为。三个冲突文件均属于生成契约/哈希：复用已在主线生成的完整快照与 runtime bundle，保留默认模版新增契约断言，哈希更新为 `d51eab1fe83602563e66b5ed1efd52e63f3abee69bd26a3de7076576f77fb50e`。该值与后端 `origin/main=282d7e8` 的已提交 `docs/openapi.json` 及所选 `1d45/tsz-rust` 源文件一致；没有手工拼接 schema，也没有改写后端。API-client 36 文件、675 项测试通过，合并后的词形操作测试 58 项通过。完整 admin-2 覆盖率分片通过（56 文件、772 项，192.95s；目标保存重开/失败重试用例约 336ms/450ms）。推送后 CI 结果继续在关联 PR 中记录。
