# 部署来源 Manifest 需求评估

## 背景与目标

`tshb-test` 的 web、admin 和 Rust API 都通过 rsync/服务器编译部署，服务器目录不是 Git checkout。当前只能证明服务可用和本地 `origin/main` CI 通过，不能从服务器上的实际制品反查其精确 Git commit，导致 Smart Lexicon J2 的环境身份项 BLOCKED。

本功能要让每个已验收组件都有一份机器可读、可重新计算的部署来源 manifest，把“CI-green 的精确 main commit”与“服务器实际运行/提供的制品 SHA-256”绑定起来。任何来源、制品或 manifest 不一致必须明确失败，不能继续把该部署作为验收基线。

## 目标端

- 前端仓库 `tsz`：web、admin 部署编排与验收。
- 后端仓库 `tsz-rust`：API 二进制部署编排与验收。
- 目标环境：当前仅 `tshb-test` 非生产环境；方案可复用，但本任务不执行生产部署。

## 用户故事 / 使用场景

1. 作为发布执行者，我希望部署脚本只接受干净、等于最新 `origin/main` 且精确 SHA 的 CI 已成功的 checkout，避免 manifest 给未审核代码背书。
2. 作为验收人员，我希望通过 SSH 读取 web、admin、api 三份 manifest，并重新计算服务器实际制品摘要，确认每个组件的 Git SHA、CI run 和制品完全一致。
3. 作为故障处理人员，我希望组件部署或 smoke 失败时不发布新的已验收 manifest，使“制品已变但 manifest 仍旧”成为明确的失败信号。
4. 作为回退执行者，我希望后端二进制回退时同时恢复与旧二进制配套的 manifest，避免回退后来源记录错配。

## 功能范围

### 本次范围内

- 为 `web`、`admin`、`api` 分别生成 schema version 1 的 JSON manifest。
- manifest 至少记录：仓库、完整 Git SHA、Git tree、远端 ref、CI workflow/run ID/run URL/conclusion、组件、制品类型/路径/SHA-256/文件数、UTC 验收时间。
- web/admin 对不可变 release 内容计算规范化目录 SHA-256；web 固定排除正常请求会改写的 Next 运行缓存，api 对实际 release 二进制计算 SHA-256。
- 部署前 fail closed：status 读取失败、工作区不干净、存在会影响构建的 ignored `.env*`、HEAD 不等于当前远端 main、精确 SHA 没有成功 CI 时拒绝生成和部署；构建环境只允许显式非敏感变量。
- 部署后重新计算服务器制品摘要并与候选 manifest 对账；组件 smoke 成功后才原子发布正式 manifest。
- manifest 固定放在 `/opt/tsz-deploy-manifests/{web,admin,api}.json`，不混入被摘要的制品目录。
- 更新仓库部署文档/技能，给出统一读取、验证、部分部署和回退规则。
- 为来源校验、摘要稳定性、篡改检测、无效输入和原子写入补自动化测试。

### 明确不做

- 不新增公网或鉴权 API（例如 `/version`、`/build-info`）。
- 不把 DSN、密码、token、cookie、环境变量或 CI 凭据写入 manifest。
- 不引入签名、Cosign、SLSA、远程制品仓或完整供应链证明。
- 不改变应用业务逻辑、数据库、Redis、OpenAPI 或前后端 wire 契约。
- 不在本功能中部署、提交、推送、开 PR 或进入 outbox 设计；这些需要后续独立授权/流程。

## 约束与边界

- GitHub `origin/main` 和其精确 SHA 的成功 CI 是源码权威；本地分支名不是权威，允许干净的 detached exact-main worktree。
- manifest 是面向误部署、陈旧部署和运维误报的可审计证明，不抵抗已取得服务器 root 或 GitHub 管理权限的恶意篡改。
- 三个组件独立发布 manifest。web 成功、admin 失败时，只允许 web manifest 前进，并明确报告部分部署。
- 目录摘要必须与所有不可变 release 路径、文件内容、文件大小和符号链接目标绑定，忽略 mtime/uid/gid；web 仅固定排除 `apps/web/.next/cache`，确保正常流量不使正式 manifest 失效。
- manifest 不位于制品目录内，避免摘要自引用；写入使用同目录临时文件加原子 rename。
- 首次具备该功能前的既有部署不能倒推为可信。只有功能合并后重新部署并验证的组件才有 PASS manifest。
- 后端回退必须把二进制和配套 manifest 作为一组恢复；不存在旧 manifest 时，回退后来源状态明确为 UNKNOWN/BLOCKED。

## 验收标准

- [ ] web、admin、api 各有独立 schema v1 manifest，字段完整且不含敏感信息。
- [ ] 三份 manifest 的 `git_sha` 均可定位到对应仓库当次 CI-green `origin/main`。
- [ ] 修改任一被部署文件或 api 二进制后，验证命令稳定失败。
- [ ] 相同目录内容在本地与服务器得到相同摘要；仅 mtime/uid/gid 变化不改变摘要。
- [ ] 工作区脏、远端 main 前进、CI 非 success/缺失时，部署在任何服务器写入前停止。
- [ ] web/admin 的候选 manifest 只有在远端摘要对账与各自 smoke 成功后才成为正式 manifest。
- [ ] api manifest 绑定实际 `target/release/tsz-rust`；health/ready/auth smoke 全部成功后才发布。
- [ ] web 成功而 admin 失败时，两个 manifest 能精确反映各自最后一次成功部署，不伪装成整体成功。
- [ ] 后端回退文档同时恢复二进制和配套 manifest，并在恢复后重新验证摘要。
- [ ] tshb-test 验收能输出三个组件的 Git SHA、CI run、artifact SHA-256 与验证 PASS，且不输出认证材料。

## 开放问题（本次评审确认）

1. 是否接受 manifest 的安全边界为“防误部署/陈旧部署，不抵抗 root 恶意篡改”，本期不引入签名基础设施？推荐接受。
2. 是否接受统一存放路径 `/opt/tsz-deploy-manifests/` 和组件名 `web/admin/api`？推荐接受。
3. 功能合并后是否另行授权按 exact CI-green main 部署三组件到 `tshb-test`，以完成真实验收？当前评估与实现授权不自动包含部署。
