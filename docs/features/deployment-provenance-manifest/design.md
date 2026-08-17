# 部署来源 Manifest 技术设计

## 方案概述

在两个仓库各自的原生部署入口中加入同一 schema 的 provenance manifest。部署前先证明本地 checkout 干净、`HEAD == origin/main`、精确 SHA 的 GitHub CI 为 success；构建后对本地制品生成候选 manifest。同步制品后在服务器重新计算摘要并与候选值对账，各组件 smoke 全部成功后，才把候选文件原子 rename 为 `/opt/tsz-deploy-manifests/<component>.json`。

web/admin 使用规范化目录摘要，api 使用 release 二进制摘要。服务器验收直接读取 manifest 并重新计算实际制品，无需 Git checkout，也不新增公网接口。

不选“只记录 Git SHA 文本”，因为它无法绑定实际制品；不选把 SHA 编译进页面/API，因为仍不能覆盖完整静态目录且会扩大运行时契约；不选签名供应链，因为当前目标是消除操作性来源缺口，签名密钥治理超出本轮范围。

## Manifest schema v1

```json
{
  "schema_version": 1,
  "component": "web",
  "source": {
    "repository": "LonelyFellas/tsz",
    "git_sha": "40 lowercase hex",
    "git_tree": "40 lowercase hex",
    "remote_ref": "refs/heads/main"
  },
  "ci": {
    "workflow": "CI",
    "run_id": 123456789,
    "run_url": "https://github.com/LonelyFellas/tsz/actions/runs/123456789",
    "conclusion": "success"
  },
  "artifact": {
    "kind": "directory",
    "path": "/opt/tsz-web",
    "sha256": "64 lowercase hex",
    "file_count": 123,
    "excluded_paths": ["apps/web/.next/cache"]
  },
  "accepted_at": "RFC3339 UTC"
}
```

- `component` 固定枚举：`web | admin | api`。
- admin artifact path 为 `/opt/tsz-admin/dist`；api 为 `/opt/tsz-rust/target/release/tsz-rust`，`kind=file`、`file_count=1`。
- `excluded_paths` 是按组件固定的严格字段：web 仅允许 `apps/web/.next/cache`，admin/api 必须为空数组；调用方不能自定义扩大排除范围。
- `accepted_at` 是 smoke 成功并准备发布正式 manifest 的时间，不是 build 开始时间。构建阶段的内部候选文件使用 `accepted_at=null`；只有 `accept` 操作可以补入时间并生成正式 schema v1 manifest，正式验证拒绝 null。
- 不记录 commit subject、操作者、主机环境或任意自由文本，缩小转义和敏感信息风险。
- 解析器拒绝缺字段、额外字段、错误枚举、非完整 SHA、非 HTTPS GitHub run URL 和非 success conclusion。

## 目录摘要算法

Node 24 脚本递归 `lstat` artifact root，按 UTF-8 相对 POSIX 路径排序，为每个节点生成一行 canonical JSON：

- 普通文件：`["file", relative_path, byte_length, sha256(content)]`
- 符号链接：`["symlink", relative_path, link_target]`
- 目录本身不单独计数；其他节点类型直接失败。

每行以单个 `\n` 连接后取 SHA-256。JSON 序列化负责路径转义，摘要不包含 mtime、uid、gid 或平台文件模式。空目录不影响摘要；Next/Vite 产物没有依赖空目录的运行语义。

web 的 Next 运行时会在 `apps/web/.next/cache` 写图片/fetch/增量缓存，该路径不是 release 制品且正常流量会改变它，因此摘要固定排除整棵目录。排除规则进入严格 schema；其他路径仍全部参与摘要。admin 没有运行时可写目录，不排除任何路径。

`artifact.file_count` 统计参与摘要的普通文件与符号链接总数（目录不计数）。

web 现有两个 rsync 来源（standalone 与 `.next/static`）先合并到一次性本地 staging root，再计算摘要并用一次 `rsync --delete` 同步，保证本地摘要的目录形状与 `/opt/tsz-web` 完全一致。staging 使用 `mktemp -d`，退出时精确清理。

admin 直接对 `apps/admin/dist` 计算摘要。manifest 位于独立目录，不参与 artifact 摘要。

## 来源与 CI 门禁

### 前端

在任何 build/rsync 前执行共享 fail-closed helper：

1. `git status --porcelain` 必须成功且输出为空；
2. `HEAD` 必须是完整 SHA，且等于 `git ls-remote origin refs/heads/main`；
3. 记录 `HEAD^{tree}`；
4. 从 GitHub origin URL 推导 `owner/repo`；
5. 通过 `gh api` 查精确 SHA 最新 `CI` workflow，必须 `completed/success`；
6. 拒绝 Next/Vite 会自动读取但被 Git 忽略的 `.env*` 文件；build 使用清空后的环境，只 allowlist `PATH`、`TMPDIR` 与脚本显式设置的非敏感构建变量；
7. 在开始任何服务器写入前再次读取 remote main，防止 main 前进，并重复 status/ignored-env 检查。

分支名不作为门禁，因此干净的 detached exact-main worktree仍可部署。Mirror to Gitee 由现有部署技能继续检查，但直接 rsync 架构下不进入 provenance schema。

### 后端

继续复用 `.agents/skills/deploy/scripts/require-green-main.sh` 的 main/CI 门禁。门禁成功后记录同一个 CI run ID/URL，并在 rsync 前再次核对 clean main。服务器完成 build、restart、health/ready 和 login→refresh→logout smoke 后，调用仓库内 manifest 工具绑定实际 release 二进制。

## 发布时序

### web

1. 来源/CI 门禁；构建 Next standalone。
2. 合并 standalone/static 到本地 staging，生成 `accepted_at=null` 的内部候选 `web.json`。
3. 再次确认 remote main 未前进。
4. rsync staging 到 `/opt/tsz-web`。
5. 把候选 manifest 上传为 `/opt/tsz-deploy-manifests/.web.json.<unique>.partial`。
6. 服务器对 `/opt/tsz-web` 重算摘要并验证候选 manifest。
7. 重启 tsz-web、校验 nginx、完成页面/API/service smoke。
8. `accept` 操作补入当前 UTC 时间并把正式文件原子 rename 为 `web.json`，再执行一次正式 manifest 验证。

### admin

流程相同，artifact root 为 `apps/admin/dist` ↔ `/opt/tsz-admin/dist`；只有 admin 页面/API/nginx smoke 成功后发布 `admin.json`。web/admin manifest互不覆盖。

### api

1. 原有 exact-main CI 门禁与 rsync；服务器编译 release 二进制。
2. 重启并完成 health、ready、未认证 refresh、login→refresh→logout smoke。
3. manifest 工具对实际二进制计算 SHA-256并原子写 `api.json`。
4. verify 子命令重新读取正式 manifest并对实际二进制复算。

manifest 发布不是服务启动的前置条件；若 smoke 失败，组件可能已经变更但正式 manifest不会前进。此时“正式 manifest 与实际制品不一致”就是部署失败证据，必须回退或修复，不能验收。

## 代码影响范围

### 前端仓库 `tsz`

- `deploy/provenance.mjs`（新增）：schema 校验、目录摘要、候选 manifest 生成/验证。
- `deploy/provenance.test.mjs`（新增）：使用 Node 内置 test runner覆盖摘要与 schema，不引入生产依赖。
- `deploy/deploy-source.sh`（新增）：clean/exact-main/GitHub CI fail-closed 门禁，向两个部署脚本提供只读元数据。
- `deploy/deploy-web.sh`：staging、候选上传、远端摘要验证、smoke 后原子发布。
- `deploy/deploy-admin.sh`：候选上传、远端摘要验证、smoke 后原子发布。
- `.agents/skills/deploy/SKILL.md`：把三方核验中的 web/admin manifest加入独立验证与汇报。
- 根 `package.json`（按测试落地结果决定）：若需要统一命令，只增加 `test:deploy-provenance`，不接入应用包。

### 后端仓库 `tsz-rust`

- `ops/deployment_manifest.py`（新增）：stdlib-only 的 file manifest create/verify/atomic write。
- `ops/test_deployment_manifest.py`（新增）：临时二进制、篡改、无效 schema/输入、原子替换测试。
- `.github/workflows/ci.yml`：在 Rust 门禁中执行 Python manifest 定向测试。
- `.agents/skills/deploy/SKILL.md`：记录 CI run元数据，smoke 后创建/验证 api manifest；备份与回退同时处理旧 manifest。
- `docs/deployment.md`：补 schema、裸机部署写入/验证、回退和安全边界。

不修改 Rust application source、Cargo 依赖、API、数据库迁移或 OpenAPI。

## 复用与约定

- 继续使用现有 `deploy-web.sh`、`deploy-admin.sh` 与 Rust deploy skill作为唯一部署入口。
- 前端使用仓库固定 Node 24.19.0；远端 web 已有相同 `/usr/bin/node`，目录验证不新增系统依赖。
- 后端工具仅依赖服务器已由 PG18 runbook使用并审核过的 Python 3 标准库。
- 所有临时路径通过 `mktemp` 或带随机后缀的同目录 partial 文件创建；trap 只删除本轮精确临时目标。
- shell 中传入的 SHA、run ID、repository、URL 均先按白名单格式验证，不执行任意自由文本。

## 测试策略（概览）

评审通过后先使用 `test` 技能展开用例矩阵，再写测试代码。

- Node 单元测试：目录顺序稳定、内容/路径/符号链接变化、mtime变化、非法节点、schema严格校验。
- Shell 集成测试：临时 Git remote/伪造 `gh`，覆盖 clean、dirty、main前进、CI缺失/失败/成功。
- Python 单元测试：api 文件摘要、原子创建、篡改检测、字段/URL/SHA校验、旧正式 manifest不被失败候选覆盖。
- 脚本静态检查：`bash -n`；若环境有 ShellCheck则运行但不把未声明依赖设为唯一门禁。
- 前端质量门：相关定向测试、`pnpm typecheck`、`pnpm lint`、`pnpm test:cov`。
- 后端质量门：Python定向测试、`cargo fmt/check/clippy/test`（Rust未改但按仓库 ship 门执行）、`git diff --check`。
- 真实验收（合并、CI-green、另获部署授权后）：按顺序部署 web→admin→api；读取三份 manifest，复算实际制品，验证 GitHub run、HTTP、systemd、nginx和auth smoke。

## 风险与回滚

- **摘要跨平台不一致**：canonical JSON记录不含平台元数据；真实部署前用相同 fixture在 macOS/Linux对账。
- **web staging改变目录形状**：保持现有 standalone/static目标路径，增加结构测试和构建后目录抽查。
- **部署成功但 manifest未发布**：该状态 fail closed 为未验收；可重新运行精确部署或回退，不能手工补写正式 manifest。
- **部分部署**：每组件独立 manifest，汇报不得用单一“前端已部署”掩盖 web/admin差异。
- **后端回退错配**：备份时把当前二进制与 `api.json` 放入同一带时间戳目录；回退后强制 verify。旧部署没有 manifest时明确 BLOCKED。
- **root可篡改**：本期明确接受该边界；若未来需要对抗主机管理员篡改，再独立设计CI签名与离线公钥验证。
- **回滚代码**：恢复原部署脚本/技能即可停止生成新 manifest；服务器已有 manifest保留作历史证据，不自动删除。制品回退按现有流程执行。
