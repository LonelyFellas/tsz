# 前端 CI 模块化并行测试需求评估

## 背景与目标

当前前端 monorepo 的 GitHub Actions `CI` workflow 已把 `verify`、`commitlint`、`e2e`
分成三个 Job，但 `verify` 内部仍顺序执行 lint、typecheck、format、全量覆盖率测试和 build；
`e2e` 内部也顺序执行 web 与 admin 两套 Playwright 测试。因此，Job 级并行没有覆盖到当前的
主要耗时路径。

2026-08-25 对最近 10 次成功的 main CI 重新统计后，基线为：

| 指标                                      | 最近 10 次中位数 | 最新 main run |
| ----------------------------------------- | ---------------- | ------------- |
| `verify` Job                              | 358.5 秒         | 377 秒        |
| `Unit tests (with coverage thresholds)`   | 298.5 秒         | 293 秒        |
| `e2e` Job                                 | 112.5 秒         | 112 秒        |
| `E2E (smoke)` 中 web + admin 串行测试步骤 | 72 秒            | 74 秒         |

最新 main run 的覆盖率测试包含 133 个测试文件：admin 75、web 30、packages 28。其中文件级
累计执行时间约为 admin 331.51 秒、web 25.10 秒、packages 16.60 秒；admin 的最长单文件约
84.90 秒。由此可见，仅把 `apps/admin`、`apps/web`、`packages` 各自放进一个 Job，仍会让
admin 成为接近原耗时的长尾，不能有效达到加速目标。

本功能的目标是在不减少测试、不降低覆盖率、不改变发布门禁的前提下，把前端 CI 的单测和
E2E 按模块拆为多个可独立观察的并行任务，并在最后统一汇总失败语义。以 warm-cache 的 GitHub
Actions 运行作为度量口径，目标把成功 CI 的关键路径中位数从约 6 分钟降到 4 分钟以内；若
GitHub Runner 排队或依赖下载异常，则单独记录，不把外部排队时间伪装成代码执行性能。

## 目标端

本功能属于整个前端 monorepo 的工程基础设施，覆盖：

- `packages/*` 的 Vitest 单元测试和 100% 覆盖率门槛；
- `apps/web` 的 Vitest 测试、90% 覆盖率门槛和 Playwright E2E；
- `apps/admin` 的 Vitest 测试、90% 覆盖率门槛和 Playwright E2E；
- lint、typecheck、format、build、Node runtime、覆盖率锁和部署工具测试；
- PR 与 main push 两种 GitHub Actions 触发方式。

不涉及用户可见页面、后端接口或运行时业务行为。

## 用户故事 / 使用场景

1. 作为开发者，我希望提交 PR 后 packages、web、admin 测试并行开始，以便更快获得失败反馈。
2. 作为开发者，我希望 admin 大型测试集内部继续分片，避免评估基线中 75 文件的 Job 抵消并行收益。
3. 作为评审者，我希望失败 Job 名能直接指出是 packages、web、admin 某个分片、覆盖率合并还是
   E2E 失败，而不是等待一个总 Job 结束后再翻完整日志。
4. 作为质量负责人，我希望拆分后仍执行全部现有 Vitest 文件，并在合并后的完整覆盖率上
   继续执行 packages 100%、web/admin 90% 的原有门槛。
5. 作为仓库维护者，我希望新增测试文件自动进入相应 project，并且分片范围缺失、重叠、报告
   缺失或合并失败时 CI fail closed。
6. 作为发布执行者，我希望 `CI` workflow 与 required checks `verify`、`commitlint`、`e2e` 保持
   稳定，现有 exact-main 部署来源校验不需要迁移或临时放宽。

## 主流程

1. PR 或 main push 触发 `CI`。
2. 静态质量/构建、工程工具测试、Vitest 模块矩阵、web E2E、admin E2E 和 PR commitlint 在依赖
   安装后并行执行。
3. Vitest 模块矩阵至少包括 packages、web、admin 的完整范围；admin 使用多个互补分片。
4. 每个 Vitest 模块上传自身 blob 报告和覆盖率原始结果。
5. 覆盖率汇总任务下载所有模块报告，合并为一次完整测试结果，并在完整结果上检查原覆盖率门槛。
6. `verify` 汇总任务等待静态质量、工程工具、所有单测模块和覆盖率合并；任一前置任务失败则
   `verify` 失败。
7. `e2e` 汇总任务等待 web/admin E2E；任一失败则 `e2e` 失败。
8. required checks 继续以 `verify`、`commitlint`、`e2e` 对外暴露。

## 错误流程

- 任一单测模块失败：其余矩阵项继续执行，保留同一次 CI 的完整失败信息；最终 `verify` 失败。
- 某模块未产出 blob、artifact 下载不完整或报告版本不一致：覆盖率合并失败，最终 `verify` 失败。
- 合并后测试文件数量减少、同一文件重复或覆盖率低于既有门槛：最终 `verify` 失败。
- lint、typecheck、format、build 或工程工具测试失败：其他独立任务可继续，最终 `verify` 失败。
- web/admin 任一 E2E 失败：分别上传对应报告，另一端不因 fail-fast 被提前取消，最终 `e2e` 失败。
- GitHub Actions run 被用户取消：汇总任务不得把取消误报为成功。
- Runner 排队或 GitHub 服务异常：保留为平台状态，不自动重试业务测试、不降低门槛。

## 功能范围

### 本次范围内

- 重构 `.github/workflows/ci.yml` 的 Job 拓扑和测试命令；
- 使用 Vitest 已锁定版本提供的分片、blob 报告和 coverage merge 能力；
- 增加 shard 专用 coverage 配置：与完整配置共享 provider/include/exclude，但 shard 阶段不执行
  局部 thresholds，完整 thresholds 只在 merge 阶段裁决；
- packages、web、admin 以仓库相对路径过滤测试文件，不用 `--project` 裁掉其他 Vitest project 上下文，
  保留应用测试对共享包的补充覆盖；
- packages、web、admin 的单测并行，其中 admin 再拆成多个互补分片；
- web/admin Playwright E2E 并行；
- 增加必要的 CI 模块清单、参数校验和 workflow 结构回归测试；
- 保留本地 `pnpm test:cov` 和 lefthook pre-push 的单机完整质量门；
- 记录基线、目标、真实 PR/main Actions 结果与回退方法。

### 明确不在范围

- 不删除、跳过、改写或降级现有业务测试与 E2E 场景；
- 不降低 packages 100%、web/admin 90% 的覆盖率门槛；
- 不修改业务代码、测试断言语义、OpenAPI、后端仓库、数据库或部署脚本；
- 不为追求速度改用不受控的第三方 Runner；
- 不引入按 changed-files 跳过未改模块的增量测试；本期每次 CI 仍完整执行；
- 不复用未验证的构建产物到部署，不改变 exact-main 部署来源校验；
- 不修改 GitHub ruleset；通过保留 required check 名兼容现有规则；
- 不包含合并、部署或生产环境操作。

## 约束与边界

### 完整性与覆盖率

- 当前根 `vitest.config.ts` 的 6 个 projects 均必须进入并行测试：`shared`、`ui`、
  `api-client`、`voice-editor`、`web`、`admin`。
- admin 分片必须形成 `1/N ... N/N` 的完整集合，分母一致、索引无缺失或重复。
- 测试结果必须先合并，再以当前根配置执行覆盖率阈值检查；不得在分片上用局部阈值冒充全局门禁。
- shard 配置不得复制一份会独立漂移的 coverage policy；provider/include/exclude 与完整配置必须来自
  同一导出，只有 thresholds/reporter 在 shard 与 merge 阶段有意不同。
- 模块选择必须使用受控的仓库相对路径过滤器，同时保留根配置的全部 6 个 projects；不能用
  `--project` 替代，因为 packages 100% 门槛依赖 web/admin 对共享鉴权逻辑的真实补充覆盖。
- 五个模块均必须保留现有 coverage runner 的 `--maxWorkers=2` 默认稳定性控制；允许调用方显式覆盖的
  既有行为不得改变。
- 实施时以 `vitest list --filesOnly --json` 动态生成完整权威清单，并由实际 shard run 的 reporter
  从 `TestModule[]` 产出各模块真实执行 inventory；不得假设 `vitest list` 会应用 `--shard`。merge 按
  `(projectName, repository-relative filepath)` 精确集合对账；评估基线为 133，实施快照为 156，均不是
  写死常量。
  缺失、额外或重复 tuple 均 fail closed，新增测试文件由 project include 自动纳入。

### 兼容性

- workflow 名继续为 `CI`。
- GitHub 仓库当前 ruleset 强制 `verify`、`commitlint`、`e2e`；三者名称和 PR/main 行为必须保留。
- `commitlint` 继续只在 PR 执行；main push 上允许按现有规则跳过。
- `concurrency` 的 PR 新提交取消旧 run、main 不取消行为保持不变。
- `.nvmrc`、`packageManager`、pnpm lockfile、现有 action major versions和最小权限保持不变。
- 本地 `pnpm test:cov` 的单实例覆盖率锁和 pre-push 行为保持不变。

### 性能

- warm-cache 成功 run 的关键路径中位数目标不超过 4 分钟，观察窗口至少包含 3 次有效 PR/main run。
- 模块数量应在收益与安装/artifact 开销间平衡；推荐 5 个 Vitest 矩阵项，不为几秒级 packages
  测试继续拆成四个独立 Runner。
- 单个模块目标不超过约 180 秒；若 admin 分片仍持续超过目标，再基于真实 Actions 数据调分片数，
  不靠猜测长期固化。
- 并行会增加总 Runner 分钟和重复安装开销；wall-clock 加速是本期主指标，同时记录总 Job 时间变化。

### 安全与权限

- workflow 保持 `contents: read`，不新增写权限、部署凭据或外部服务 token。
- 矩阵参数必须来自仓库内固定清单，不拼接 PR 输入、分支名或不可信文件内容执行 shell。
- artifact 只保存测试/覆盖率结果，禁止包含 `.env`、cookie、token、构建密钥或用户数据。
- 报告短期保留；失败日志不得输出认证信息。

### 可观测性

- Job 名须能区分静态质量、工程工具、packages、web、admin 分片、coverage merge、web E2E、
  admin E2E 和最终汇总。
- 矩阵关闭 `fail-fast`，一次 run 尽可能展示所有模块结果。
- 覆盖率合并输出完整 summary；失败时保留可下载报告。
- PR 合入前记录旧/新关键路径、各模块时长、排队时间和总 Runner 时间，区分执行变快与排队波动。

## 验收标准

- [ ] `.github/workflows/ci.yml` 将静态质量/构建、工程工具、Vitest 模块、coverage merge 和 E2E
      拆成可并行 Job。
- [ ] Vitest 至少形成 packages、web、admin 三个语义模块，admin 使用三个完整互补分片。
- [ ] 现有 6 个 Vitest projects 和实施时全部测试文件恰好被执行一次；无遗漏、无重复。
- [ ] shard 使用无 thresholds 的专用配置收集 coverage，provider/include/exclude 与根完整配置单一
      来源；`coverage.reporter` 显式为 `[]`，任何 shard 不因其他模块未覆盖或重复生成最终报告而
      提前失败。
- [ ] 模块用 packages、apps/web、apps/admin 路径过滤测试文件，不传 `--project`；合并覆盖率与原生
      单机结果一致，packages 仍达到 100%。
- [ ] 所有分片 blob 合并成功，并在合并结果上继续执行当前 packages 100%、web/admin 90% 门槛。
- [ ] 五个模块执行均默认 `--maxWorkers=2`，并有参数回归证明没有绕过既有稳定性限制。
- [ ] merge 前以动态 full inventory 对实际 shard reporter 产出的五份 module inventory 做 tuple 集合
      对账，删除一份、重复一份、module 名错配或同文件跨模块重复均失败。
- [ ] lint、typecheck、format、build、Node runtime、coverage-lock、部署工具测试均未丢失。
- [ ] web 23 个、admin 16 个现有 Playwright 场景分别运行并并行启动；任一失败均令最终 `e2e` 失败。
- [ ] 单测矩阵和 E2E 子任务均关闭 fail-fast 或具备等价的“另一模块继续运行”行为。
- [ ] required check 上下文仍为 `verify`、`commitlint`、`e2e`，GitHub ruleset 无需改动。
- [ ] PR 与 main push 的成功/失败/取消路径均经过 workflow 结构测试和至少一次真实 Actions 验证。
- [ ] 本地 `pnpm test:cov`、pre-push 语义和原覆盖率配置不变且全绿。
- [ ] 至少 3 次有效 warm-cache run 的关键路径中位数不超过 4 分钟；未达到时保留正确性改造，
      依据真实模块时长决定调整或回滚，不虚报达标。
- [ ] `git diff --check`、YAML 解析、相关 Node 测试、全量原生质量门通过。

## 开放问题

1. 性能目标是否接受“关键路径中位数 ≤ 4 分钟、至少 3 次有效 run”的推荐口径？
2. 推荐首版把 admin 固定为 3 个原生 Vitest 分片；若真实 CI 显示 2 个已足够，是否优先减少
   Runner 消耗，还是继续保留 3 分片追求更短 wall-clock？
3. coverage HTML artifact 推荐仅失败或阈值异常时保留 7 天，blob 中间产物保留 1 天；是否需要
   每次成功 run 也长期保存 HTML？本方案默认不长期保存。
