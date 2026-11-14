# TASK#165 默认词形共享模板

来源：<http://47.121.142.19/zentao/index.php?m=task&f=view&taskID=165>，附件 fileID=217。
用户已授权按评估方案实施前后端并验证，随后要求「按批处理，每批按新窗口」。本地实施与验证已经完成；用户随后明确授权「前后端都开 PR，跟进 CI，全部通过后汇总」。当前允许提交、推送与 PR，不包含合并或部署。

## 已确定的范围

- 词性配置新增「默认共享模板」，每组选择若干「基本词性＋词形类型」，使用稳定配置 ID；同一标签只属于一个组合，组合至少两个成员。
- 复用 #160 的默认生成开关：先决定生成哪些词形，再应用共享模板；不得自动添加其他词性或恢复已关闭的词形。
- 模板只应用新建词条/新增词性产生的标签，初版只处理首个默认变化组。不修改历史词条/草稿，不在重开/刷新后反复应用，不重新合并手动拆开的内容。
- 空模板可以默认共享；已有内容仅在完整内容兼容时共享，不得仅因拼写相同覆盖词典提供的不同拼写、音标、读法或音频。新增词性接入现有共享内容时保留旧内容与身份。
- 补「独立编辑」：复制当前共享内容后将指定标签改绑，保留填写结果、引用身份及其他标签内容。当前移除标签会删除绑定，不能替代拆分。
- 模板编辑使用独立权限，普通录入者只消费 catalog。保存失败保留输入，版本冲突明确恢复方式。
- 新版 /lexicon-next 与旧 /words 编辑器复用同一内容模型，须核对两条创建/新增词性接线。
- 默认组合包括各词性原形、名词复数＋动词三单、动名词＋现在分词、形容词/副词比较级、形容词/副词最高级。只能引用真实目录已有配置；缺少的词形类型不得根据显示名猜测或擅自新建，记录实际种子覆盖，业务人员可通过页面配置。

## 唯一任务工作树及写入权

- 前端：`/Users/darwish/.codex/worktrees/task-165-form-sharing/tsz`，分支 `codex/task-165-form-sharing`，基线 `a1bfa3fe`。
- 后端：`/Users/darwish/.codex/worktrees/task-165-form-sharing-api/tsz-rust`，同名分支，基线 `863d8d1`。
- 原协调聊天停止源码写入。各批依赖顺序接续；同一 checkout/index 一个写入者，必须复用工作树，不从主线另建覆盖本次改动。
- 前端已成功 `pnpm install --frozen-lockfile`，Node 24.19.0 / pnpm 10.33.0，hooks 正常安装；第二批前端实现及检查见下文，均未提交。
- 后端第一批已接管并完善协调聊天初稿；代码与 `docs/openapi.json` 均仍未提交。最终结果与证据见下文。

## 批次与完成条件

1. 后端配置、权限、迁移及契约：接管后端初稿，完成验证与 OpenAPI 导出。主记录说明最终 method/path、wire、权限、种子覆盖、新旧兼容与回退限制。只读前端以核对消费者；不改前端源码/生成物。完成后明确释放后端写入权。
2. 前端：等待第一批成功完成，从指定后端 OpenAPI 原生同步；实现类型、请求、配置页、模板应用、独立编辑、新旧入口，定向验证及类型/格式/lint。更新本记录，明确释放两仓写入权。不自行修改第一批仍在写入的后端。
3. 联调和收尾：等待第二批成功完成后，接管两仓。核实隔离 Postgres/Redis、实际构建、代理及 mock，使用 Codex 内置浏览器验证保存配置→重开回显→新建/新增词性共享→独立编辑→保存刷新保留→历史/词典冲突保护。运行剩余必要检查及两仓最终门，修复实际失败，不额外安排独立审查。清理本批 fixture/进程，只保留脱敏证据。

各批只将测试通过视为相应层证据，mock 与两仓单测不能代替真实联调。无需外部语音/OSS 即可验证本任务时不创建音频资源；若确需 OSS，先按项目规则验证专用前缀列举、版本读取与永久删除权限，结束彻底清理。

## 第一批后端契约与交接

后端输入：`/Users/darwish/.codex/worktrees/task-165-form-sharing-api/tsz-rust`，`codex/task-165-form-sharing`，HEAD `863d8d1ea911bd41daefa9462b7a41dcc4a5714a` **加本任务未提交工作区差异**，不是纯提交产物。

### 最终端点和 wire

| Method / path                                             | 权限与行为                                                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/admin/settings/parts-of-speech/catalog`      | 延用 `words.access` / `sentences.access` / `lexicon_settings.access` 任一权限；新增必有 `form_sharing`，与 `items`、`form_types`、`catalog_version` 同条 SELECT、同一 MVCC 快照。普通录入者只消费此入口。 |
| GET `/api/v1/admin/settings/parts-of-speech/form-sharing` | `lexicon_settings.access`；返回持久化模板，供配置页读取。                                                                                                                                                 |
| PUT `/api/v1/admin/settings/parts-of-speech/form-sharing` | 独立 `lexicon_settings.edit_form_sharing`（依赖 `lexicon_settings.access`）；整体替换模板，事务内复核会话版本与授权。普通管理员不自动获授；`edit_forms` 不包含此权限。                                    |

读写成功均返回 `FormSharingTemplate`：

```json
{
  "revision": 1,
  "groups": [
    {
      "id": "<stable UUID>",
      "members": [
        {
          "part_of_speech_id": "<catalog part UUID>",
          "form_type_id": "<catalog form UUID>"
        },
        {
          "part_of_speech_id": "<catalog part UUID>",
          "form_type_id": "<catalog form UUID>"
        }
      ]
    }
  ]
}
```

PUT 请求为 `{"base_revision":1,"groups":[...]}`。组和成员顺序按数组保存，保留客户端给定的组 UUID；不得用显示名作为身份。最多 100 组，每组 2–100 成员；组 UUID 不重复，同一 `(part_of_speech_id,form_type_id)` 全局唯一。仅接受 `kind=word` 的词性；`base` 可搭配任何单词词性，其他词形必须真实归属于所选词性。`groups:[]` 可持久化关闭共享。允许引用 `is_default=false` 的类型，但保存模板绝不恢复其默认生成开关；前端仍须先筛选实际默认生成标签，再应用模板。

- PUT 200：`revision` 和 `catalog_version` 各加 1；失败完整回滚。请求、组、成员均拒绝未知字段。
- 400：`invalid_form_type`，`field=groups`（组合/归属/数量无效），或 `field=base_revision`（非正数）；422：请求结构非法；401/403 延用标准 Problem Details。
- 409：`revision_conflict`，`field=base_revision`，`meta.current_revision` 为现值。前端保留输入，提示重新加载后核对并重试，不自动覆盖。
- 词性 DELETE 被模板引用：409 `part_of_speech_in_use`，`field=form_sharing`。词形 DELETE 被模板引用：409 `form_type_in_use`，`field=form_sharing`。词形改挂被模板引用：409 `form_type_in_use`，`field=part_of_speech_id`。需先移除模板引用再删除/改挂；展示字段及默认生成开关仍可编辑。`usage_count` 仍统计词条使用，不包含模板成员，不能仅凭它认定可删。上述错误已注册简体/繁体恢复提示，配置页可据 code/field 呈现操作建议。

### 持久化、种子及回退

配对迁移：`20261114020000_form_sharing_templates.up.sql` / `.down.sql`。新增 singleton revision、组、成员和 JSON view；词性/词形引用用 RESTRICT。模板保存按权限 → singleton → 词性 → 词形 → 元数据的顺序加锁；词形改挂持有原行锁后查模板引用。两个先后顺序的真实数据库并发测试已通过，避免验证后并发改挂留下失效组合。

实际默认种子只有两组：

1. 当前目录所有单词词性的 `base`（标准种子 noun/pronoun/verb/adjective/adverb，共 5 标签）。
2. `noun/plural` + `verb/third_person_singular`。

标准目录无动名词独立类型；`comparative` / `superlative` 目前仅属于 adjective，adverb 无对应独立配置。因此剩余三类不铺种、不猜 code、不擅自建类型；业务配置补齐真实目录项后可手工组建。缺少配对成员时，迁移移除不足两成员的组，不创建缺失目录项。

up/down 不回写词条、历史草稿或已有共享内容/绑定，不修改已有词形默认生成开关，也不授予普通管理员新权限；两方向都递增 catalog epoch。**down 会永久丢失本功能模板组、成员、revision 和修改人记录，重新 up 只重建默认种子**；需停写并备份/显式恢复配置。新后端依赖新表/view，不能在新进程仍运行时执行 down。旧二进制重启带新迁移记录的数据库尚未做真实组合验收；现有 `src/lib.rs` 使用默认 SQLx migrator（`ignore_missing=false`），旧迁移集合会拒绝未知已应用版本，不能把直接切回旧 binary 当作安全回退。未来发布/恢复须按项目控制器与迁移门禁执行；本批无部署授权和动作。

### OpenAPI 精确来源

- 原生导出命令：在上述后端工作树执行 `SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi`，不启动服务。
- 唯一 spec：`/Users/darwish/.codex/worktrees/task-165-form-sharing-api/tsz-rust/docs/openapi.json`。
- spec SHA-256：`d2ce123744436f656d1b280196e17579a2d81818677c32c69d949a3c9b43965b`。
- 后端变更文件内容摘要（按路径排序，`path\0bytes\0` 拼接，含未跟踪文件及 spec）：`47b93676facb871ec633a925923b0d72f3bef1fffd69a49b501bc133de06f430`，共 20 文件。
- spec 差异仅一个新增路径（GET/PUT）、四个新增 schema（`FormSharingTemplate` / `FormSharingGroup` / `FormSharingMember` / `UpdateFormSharingTemplate`）及 `CatalogResponse.form_sharing`。既有端点 wire 无其他变化。
- 新增 SQL 都是运行时 `query*`，未改 SQLx 编译宏查询；`.sqlx` 无需新增缓存，离线全目标编译/Clippy 验证缓存可用。
- 第二批须显式设 `OPENAPI_SOURCE` 指向此 spec，清除 `SYNC_OPENAPI_RUNTIME_ONLY` 后走前端原生同步；本批未操作前端源码、类型或生成物。

### 验证证据

隔离依赖由本批从空目录创建：独占 loopback PostgreSQL 16（角色 `task165`；运行时端口 58619）、Redis（端口 58620/DB0）。所有集成测试显式设置 `DATABASE_URL`、`TEST_REDIS_URL`、`REDIS_URL`；SQLx 每测试创建临时库。未读取共享 `.env`、连接共享库或启动后端服务，未创建 OSS 资源。

已通过：

- `SQLX_OFFLINE=true cargo test --locked --all-features --test admin_permissions_handler`：19 项；复用同一批首次联合运行中的有效结果。
- `SQLX_OFFLINE=true cargo test --locked --all-features --test catalog_handler --test catalog_schema`：17 + 35 项，包括权限/缓存授权撤销、保存后新 AppState 重读、版本冲突、非法组合原子性、目录引用保护、并发改挂、迁移往返、缺失种子保护。
- 新测试嵌入现有 `catalog_handler`、`catalog_schema` target；`python3 -I ops/test_ci_test_modules.py` 9 项通过，已确认它们归 CI `platform` 分区，无新增未登记 target。
- 原生 OpenAPI 导出成功，结构差异检查及 `git diff --check` 通过。
- `SQLX_OFFLINE=true cargo test --locked --all-features --lib form_sharing`：2 项；`--lib admin::authorization::tests`：2 项；`--lib openapi::tests`：14 项；`--lib i18n::errors::tests`：8 项。包含一个重复覆盖的 OpenAPI 用例，合计 25 个不同单测通过。
- `SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings`：最终输入通过；`SQLX_OFFLINE=true cargo fmt --all -- --check`：通过。
- 清理回执：SQLx 临时库已全部移除（专用集群仅余系统 `postgres` 库），Redis DB0 键数为 0；已停止本批 PG/Redis 并删除专属数据目录、日志和登记，无残留。测试用 fixture 未触及共享数据；编译产物保留于原有公共 Cargo 缓存。

首次验证曾暴露初稿遗漏管理路由授权表、旧 fixture 未移除新增引用及旧 catalog epoch 预期；已修正，目录相关重跑全绿，无遗留失败。

兼容性：旧前端本任务基线 `a1bfa3fe` 的 `partOfSpeechSettings.catalog()` 直接 JSON parse，未对 catalog 使用严格 runtime validator，故源码核对未发现新增字段拒绝点；本批未做真实混合版本页面验收。新前端接旧 API 的缺字段/新端点降级由第二批实现验证（旧后端未知路由可能返回 403，不能只假设 404）。候选前端+候选后端的浏览器链路、历史与词典内容冲突保护、共享/独立编辑保存刷新均留第三批。全量运行时/PR CI、提交、push、PR、合并、部署均未执行。

## 当前阶段

**前后端业务提交的 PR、独立审查与完整 CI 均已通过。** 前端 PR #784、后端 PR #410 均保持打开，未合并或部署。当前仅补齐本文档交付回执；文档提交仍执行正常 hooks、增量审查与最新 head CI，最终结果以 PR 最新检查及交付回复为准。

## 跨批依赖（第三批已解决，保留发现依据）

- 原生同步指定后端 spec 后，发现前端基线已有的 `NextEntry.medium_locale`、`CreateNextEntry.medium_locale`、`NextEntryMatchesQuery.medium_locale`、`NextCapabilities.medium_ownership` 在后端基线 spec 中缺失。生成物如实反映指定输入，已有 `lexicon-next.test.ts` 的 medium ownership 严格解析回归失败；不得删除既有断言或手改生成物掩盖。第三批须先对齐后端此能力/精确版本，再重新原生导出同步并运行 api-client 全套。只读调查已找到后端现有提交 `56f2b85 feat(lexicon): bind drafts to medium locale ownership (#409)`（另有实现提交 `2c0d460`）；当前任务 HEAD 不包含该提交。第三批先核实并复用现有能力，勿重新实现或覆盖本任务未提交改动。
- 旧 `/words` 的 `src/lexicon/shared_forms.rs` 身份校验仅允许区域节点迁移到已保存内容，拒绝迁移读法 ID 或绑定到新复制内容；独立编辑前端会保留变体/读法公开 ID，复制新槽位，因此第三批须补齐后端安全拆分校验与持久化测试。新版 `/lexicon-next` 仅固定角色及父引用，源码核对可支持此身份保留，但尚未真实联调。

## 第二批前端交接

输入前端 HEAD `a1bfa3fe818d5bff90bfc0a81062fa7a707afa54` 加本批未提交差异；后端只读，未修改后端源码/spec。此工作树实际采用 `@tsz/ui/admin/*` 与 Lucide，依照其 `apps/admin/style.md`、现有样板及禁止重引 AntD 的 lint 复用控件，未进行 UI 框架迁移。

### 实现与入口

- `packages/types/src/part-of-speech.ts`：新增 `FormSharingMember` / `FormSharingGroup` / `FormSharingTemplate` / `UpdateFormSharingTemplate`，全部 snake_case。catalog 的 `form_sharing` 只为旧 API 兼容而可选；新后端实际必有。
- `packages/api-client/src/admin.ts`：`partOfSpeechSettings.getFormSharing()` / `updateFormSharing(input)`，原生 GET/PUT 到 `/settings/parts-of-speech/form-sharing`，不做字段转换。`dataSource.ts` 暴露相同能力。`scripts/sync-openapi.mjs` 将四个新 schema 纳入 endpoint 快照白名单；两个 JSON 生成物均来自显式 `OPENAPI_SOURCE`，未手改。runtime 输入哈希仍为上文 `d2ce1237…965b`，已独立核对原 spec SHA-256 相同；契约 canary 已更新。
- `PartOfSpeechSettings.tsx` 的「单词 → 默认共享模板」接入 `FormSharingSettings.tsx`；可添加/删除组合、选择已有「词性＋词形」稳定 ID、保存空模板，跨组已用标签禁选，每组 2–100 标签。组 UUID 创建一次并在保存/编辑中保留。保存失败/后台重拉不替换本地编辑；409 禁止盲重试，显式确认重新加载后才放弃本地版本。旧 catalog 缺能力时显示不支持，不调用旧后端可能返回 403 的新路径。引用删除/改挂错误按 code+field 提示先移除模板引用。
- `packages/shared/src/auth/adminPermissions.ts` 注册独立 `lexicon_settings.edit_form_sharing` 及 access 依赖；普通 `edit_forms` 不授予共享编辑，超级管理员按既有规则可操作。新文案补简体/繁体/英文。
- `word-creation-v3/defaultFormSharing.ts`：只接受显式的 `newFormIds`，只匹配真实目录 ID、单词词性与首个 general 组，先按 #160 实际默认生成的标签筛选；不增词性/词形。完整内容比较保留音标、读法顺序、音频、rich text、音色等数据差异，仅忽略结构槽位 ID 和 origin。新空模板可接入兼容已有内容，但拼写冲突仍保留。旧内容及旧绑定优先且不合并旧标签；同标签的多条词典行保留独立。手动拆分/普通更新/重开不走此函数。
- `V3FormsAndPronunciationStep.tsx` 新增词性入口先补默认词形，再转换 shared_v1 并仅对本次新词性标签应用模板。新版 `lexicon-next/FormsStep.tsx` 与旧 `/words` 都直接复用此组件；新版新建返回空编辑器，用户第一次添加词性走同入口，后续添加也一致，未加重开时 effect。
- 旧 `/words` 的 `V3WordCreationWizard.tsx` 在既有 `prefillNewDraft`、revision=1、forms/meanings 未保存门禁内仅初始化一次；共享后首个词性回填主词保留共享内容图，避免再次展开转换拆散共享。历史与已保存草稿不回补、不合并。
- `sharedFormsModel.ts` 新增 `detachSharedFormContent`，复制内容、区域/读法槽位及 pronunciation_slots 映射；指定 form/variant/pronunciation 的公开引用 ID、组成员/规则性与其他标签保持。`V3FormContentModal.tsx` 在每个共享标签旁提供「独立编辑」，等待当前音频任务后复制、收起，之后可从该标签打开独立内容；不会删除绑定。旧 catalog 缺本任务能力或服务不支持 content reassignment 时不显示新拆分动作；候选后端当前仍缺旧版拆分持久化支持，须第三批修正后验收。

### 代码验证实际结果

- 显式 `env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/task-165-form-sharing-api/tsz-rust/docs/openapi.json pnpm --filter @tsz/api-client sync:openapi`：成功；275 路径，451 个 runtime closure schema。四个新增管理 schema 已纳入 endpoint 快照；runtime 无 catalog 解码器，不增加无用根。
- `pnpm --filter @tsz/api-client test`：**727 通过、1 失败，40 文件中39通过**。唯一失败是既有 `lexicon-next.test.ts` 的 `medium_locale` 严格响应解析（源码基线错位见剩余依赖），未跳过/放宽。新模板请求、endpoint/schema 契约及其他 api-client 用例通过。第三批对齐后端后须重新导出、同步、更新 canary 并重跑全套。
- admin 定向运行过 `defaultFormSharing.test.ts`（10 项）、`sharedFormsModel.test.ts`、`V3FormContentModal.test.tsx`、`V3FormsAndPronunciationStep.test.tsx`、`V3WordCreationWizard.test.tsx`、`FormSharingSettings.test.tsx`（5 项）、`PartOfSpeechSettings.test.tsx`，以及新版 `EntryLayout` / `EntryDialectScope` / `MeaningsStep` 回归，均通过。命令使用 `pnpm --filter @tsz/admin exec vitest run <上述 src 文件>` 分依赖批运行；最后一次 Wizard+默认共享 139 项通过，配置+模型 15 项通过，独立编辑能力门禁变更后单独重跑该组件用例通过。没有将重叠运行累加为独立测试总数。
- 新增用例证明：默认标签/默认关闭过滤、旧 catalog 降级、相同拼写但不同拼写/音标/读法/音频/标注保护、新增标签接入旧内容时旧图不变、独立编辑的内容/引用身份/映射复制、首次创建共享与历史重开不重合并、配置独立授权、失败保留输入、409 显式恢复及稳定 ID wire。
- `pnpm --filter @tsz/{admin,api-client,types,shared} typecheck` 分别通过（各包命令独立执行）；最终 admin 检查包含新增测试。受影响文件各包 ESLint 通过且无遗留警告；受影响 Prettier 格式检查和 `git diff --check` 通过。`pnpm check:admin-ui`：44 个样式检查及4项脚本测试通过。`packages/shared/src/auth/adminPermissions.test.ts` 18 项通过。
- 测试环境输出既有 jsdom `getComputedStyle` pseudo-elements 未实现提示，不影响断言与退出码。未新增运行时忽略项、PENDING、测试 skip 或覆盖率排除；单文件 `-t 指定共享标签` 的其他用例由定向筛选自然未运行，此前组件全套已经通过。

### 第三批验收路径与环境提醒

1. 先处理上面的后端能力错位与安全拆分支持；尤其不能通过删除 `medium_locale` 断言、手改 runtime JSON、任意放宽稳定身份校验来通过检查。后端新改动须相应原生测试并重新导出契约。
2. 重建隔离 PG/Redis 与真实后端服务，核实构建、代理和 mock。本批没有启动服务/浏览器，没有创建数据库、账号、OSS、录音或其他 fixture；第一批专用实例已清理，不能沿用其端口认定环境可用。
3. 管理页进入「词性配置 → 单词 → 默认共享模板」：保存配置 → 离开重开/刷新回显 → 独立授权/409/引用保护。首次只有两类实际种子，不声称缺目录的三类已自动覆盖。
4. 新 `/lexicon-next`：创建 → 添加名词/动词 → 核对原形、复数/三单默认共享且禁用默认不生成；点内容浮窗内指定标签「独立编辑」→ 编辑 → 保存刷新，确认原标签/其他标签与引用均保留。新草稿初始没有词性，不应根据模板擅加词性。
5. 旧 `/words`：新建草稿初始化和新增词性都验；重点验证持久化的内容/区域/读法身份以及首词性主词回填。保存后重开、历史草稿、已拆分标签、词典音标/读法/音频冲突必须保留。
6. 默认 `partOfSpeechDataSource` 使用真实 API，没有为本功能增加 mock。旧版内容能力以实际响应 capability 和 `X-TSZ-Form-Contents` / `X-TSZ-Form-Content-Reassignment` 协商为准，新版必须确认 form_editor 支持；不要把旧 mock catalog 缺 `form_sharing` 的“不支持”状态当真实失败。`VITE_ADMIN_TTS_MOCK` 默认 false，本任务可不创建语音/OSS资源；若涉及相关 UI 全量检查，保留原有环境开关并按真实链路核实。
7. 本批只证明本地代码和组件行为。真实浏览器、持久化联调、两仓最终门、全仓运行时套件仍留第三批；PR/CI、提交、推送、合并、部署未涉及。

**第二批完成；明确释放前端及主记录写入权。后端写入权沿用第一批已释放。** 在本交接记录写完后，本聊天不再修改两仓，等待协调聊天安排第三批。

## 第三批最终验收与修复

第三批先等待第二批完成并明确释放写入权后接管，两仓及唯一主记录由本聊天串行写入；最终已释放写入权。复用前两批有效结果，不额外安排独立审查。下述是最终状态，覆盖前文交接时的未完成项。

### 修复与契约

- 语言所属能力直接复用后端已合入提交 `56f2b85e0cd1f457ff1b570c4f64a83646c0d468` 的 `src/lexicon_next`、配对迁移和既有测试补丁；未重写能力，未创建 Git 提交，未覆盖本任务目录配置改动。该补丁新增 `20261114100000_lexicon_next_medium_ownership` 配对迁移；其历史数据归属规则和 up/down 由原有真实 PG 测试验证。
- 旧 `/words` 独立编辑已用新增回归实际复现：复制新内容/槽位、保留公开标签/区域/读法 ID 后，原实现 impact 返回 409 `stable_node_id_changed`。`src/lexicon/shared_forms.rs` 现仅允许当前仍在草稿中的标签向全新内容槽位迁移自己的引用；沿用上游父子/角色/词条归属与槽位身份校验，既有内容中的读法槽位仍不可改挂。首轮定向回归发现已删除标签也被放行，已加入当前绑定检查修正；历史恢复、跨词条/跨角色、旧槽位挪用与并发防护回归均通过。新增回归同时证明编辑副本不会改变其他标签和原内容。
- 原生重新导出并指定 `OPENAPI_SOURCE` 同步两个前端 JSON 生成物；canary 已更新。最终 OpenAPI SHA-256：`b620cee8b93dcdaa211457bb4149af85625d3281c52dfd07702d6cf4d17a61cc`。运行时新增 SQL 不使用 SQLx 编译宏，`.sqlx` 无变化。

### 最终代码检查

- 后端：`SQLX_OFFLINE=true cargo test --locked --all-features --test lexicon_handler shared_forms:: -- --nocapture`：21 项通过，包含失败基线修复、拆分回读、退役身份、引用影响、并发、发布/恢复与多拼写保护。
- 后端：显式独占 DB/Redis 环境运行 `cargo test --locked --all-features --test lexicon_next`：21 项通过，含所属语言持久化、严格 wire、权限、节点并发身份与新迁移 up/down。
- 后端：`SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings`、`cargo fmt --all -- --check` 通过；服务、seed、OpenAPI exporter 实际构建成功。第一批 catalog/权限/共享模板迁移往返检查输入未变，复用其通过结果。
- 前端：`pnpm --filter @tsz/api-client test`：40 文件、728 项全部通过，第二批的 `medium_locale` 失败已消除。`pnpm typecheck`：全部 7 个可执行包检查通过，含 web、admin、api-client、types、shared、ui、voice-editor。
- 前端：最终生成物同步后，Admin 的默认共享、共享模型、独立编辑浮窗、新增词性、旧 Wizard、配置页及新版语言/布局/词义等 10 个受影响文件共 327 项通过；既有 jsdom pseudo-elements 提示不影响退出码。
- 前端：复用第二批各变更包/文件 ESLint、Prettier；第三批变更的 canary 单独 ESLint/Prettier 通过。`pnpm check:admin-ui`：44 个样式和 4 项脚本测试通过。最终 OpenAPI 同步后重跑实际 `pnpm --filter @tsz/admin build` 通过，生产构建中 mock 全关。真实浏览器验收使用明确配置的 Vite dev 代理，不把它作为生产代理已验收的证据。

### 真实页面与独立回读

本批从空目录创建独占 loopback PostgreSQL 16（角色 `task165`，`127.0.0.1:49548/task165_b3`）和 Redis（`127.0.0.1:49549/0`），创建时独立 SQL 核实库/角色/端口、Redis 键数 0；服务启动迁移前已核实目标。API 使用本任务源码实际构建后复制的独占二进制，监听 49550；Admin 从指定前端工作树启动，监听 49551，`BACKEND_API_URL=http://127.0.0.1:49550/api/v1`，浏览器走同源 `/api/v1`。二进制摘要、版本输入、原始请求关联的脱敏结果见 [验收证据](evidence/acceptance.json)。

主代理使用 Codex 内置可见浏览器操作，mock 全关。专属临时超级管理员、权限测试管理员、1 条新版草稿、2 条旧版草稿及两条词典源记录都只存在本批隔离库。空库缺词典导入时页面真实返回“内置词典暂时不可用”；补入明确标记的本地词典 fixture 后继续。编辑拼写曾触发既有自动语音流程并收到未配置存储的不可用响应；为完成无需音频的本任务，随后显式关闭 `VITE_VOICE_PREVIEW`、`VITE_VOICE_AUDIO_UPLOAD`、`VITE_VOICE_EDITOR`、`VITE_AZURE_PRONUNCIATION_INPUTS`，保持 TTS/词条/词性 mock 为 false。未创建 OSS 对象，无外部语音验收结论。

| 场景                  | 实际结果                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配置保存/重开         | 页面实际删除第二组合并保存，独立 HTTP GET 得 revision=4、groups=1；刷新重开仍仅一组。随后恢复隔离 fixture 原两组。稳定组 UUID 保留。                                                                                                        |
| 配置并发冲突          | 独立 HTTP 并发更新后，页面保存收到真实 409，保留本地删除组合的输入、禁用盲重试；点击重新加载先明确确认，再回显服务器版本。                                                                                                                  |
| 新版创建/新增词性     | 新建空草稿不擅加词性；页面先加 noun 再加 verb，保存后独立 GET 证明 7 标签对应 5 内容，原形和复数/三单分别共享。                                                                                                                             |
| 新版独立编辑          | 填入拼写和音标后拆出 verb/base；公开 form/variant/pronunciation ID 不变，noun 与原内容完全保留；编辑副本、保存刷新后仍独立。再加 adjective/base 接入旧 noun 内容，旧两个词性图不变，已拆 verb 不重合并。最终真实保存/回读 revision=6。      |
| 旧版创建/词典差异     | `taskdict` 真实词典 fixture 的 noun/base 和 verb/base 拼写相同但 UK/US 音标分别不同，初始化保存回读均保留独立内容；兼容的 plural/third_person_singular 共享。                                                                               |
| 旧版独立编辑/新增词性 | 页面把 noun/plural 拆出、修改后保存，保留全部公开引用 ID、verb 内容及所有原内容；刷新不重合并。随后加 adjective/base 成功接入旧 noun 内容，旧图完全不变。最终 revision=6。                                                                  |
| 默认关闭与首组        | 在真实 API 关闭仍被模板引用的三单默认生成，旧版页面新增 verb 只生成 base/present_participle/past_tense/past_participle，没有恢复三单；首组原形仍共享。手工给第二变化组新增原形，保存回读证明其内容独立且原内容不变。默认开关最终恢复。      |
| 历史草稿              | 默认配置改变后重开已保存草稿，独立 GET 与前次图完全一致，已存在三单未删除、独立编辑未重新合并。                                                                                                                                             |
| 独立权限              | 真实普通管理员仅有 words.access、lexicon_settings.access、edit_forms：catalog GET 200、模板管理 GET 200，但模板 PUT 403；edit_forms 未隐含新权限。                                                                                          |
| 真实请求链            | 浏览器同源配置 PUT、新版 PUT、旧版 impact POST/保存 PUT 的 200、后端相同 request_id 日志和独立 HTTP GET 相互对应；见 [浏览器网络证据](evidence/browser-network.json)、[后端关联日志](evidence/backend-correlations.log)。无 mock/拦截响应。 |
| Admin UI              | 1440px 桌面、1050px 较窄桌面可操作；保存、冲突恢复、浮窗和独立编辑均由真实页面完成。截图见 evidence 下 JPG。                                                                                                                                |

### 混合版本与限制

- 使用本任务前端基线 `a1bfa3fe` 的原严格 runtime validator/原 schema，以及候选 validator/schema，对候选真实 API 的 3 个响应（旧能力头的 NextEntry、已协商所属语言的 NextEntry、旧词条 AdminWordV3）各验证一次，全部接受；未协商所属语言的真实响应不输出新字段。旧 catalog 直接 parse，源码无拒绝新增字段的严格 schema。
- 候选前端接旧 API 的缺 `form_sharing` 情况由第二/三批组件回归证明：不调用新管理路由（不把未知路由 403 当作可编辑），不自动共享/开放拆分。新版编辑器既有 `medium_ownership` 能力门禁继续保留。此项是受控契约/组件证据，未启动真实已部署旧 API 二进制。
- 未执行已部署旧二进制与新增迁移记录组合的启动验收。默认 SQLx migrator 的 `ignore_missing=false` 仍意味着直接回退旧 binary 会拒绝未知迁移；共享模板 down 会丢失配置，所属语言 down 会丢失归属字段。未来发布前须按原生配套发布与迁移恢复门禁决定顺序/回退，不把本地功能通过解释成安全部署/回退已验证。
- 种子仍只有目录真实支持的两类（各词性原形；复数/三单）；动名词配对、adverb 比较级/最高级缺目录项，未擅自创建。业务补齐真实配置后可通过页面组合。

### 清理与交付终点

正常结束已完整清理，见 [清理回执](evidence/cleanup.json)：专属 fixture 数据库已删除，专属集群仅余系统库后停止并移除数据目录；Redis 的 61 个测试键随独占实例停止及数据目录删除而移除，未用 FLUSHDB/FLUSHALL；API、Admin 与临时清理服务全部停止，49548–49551 均无监听。临时认证文件、原始响应、原始日志、专用二进制、脚本及登记均已删除，只保留脱敏证据。浏览器已退出专属账号，refresh cookie 不存在，local/session storage、IndexedDB、CacheStorage、service worker 均为 0，已关闭专属页并恢复视口。未创建 OSS 对象。共享服务、其他工作树、受保护工作区、node_modules 与公共 Cargo 缓存未清理/迁移。

两仓工作树及未提交变更保留；没有 commit、push、PR、CI、合并或部署。全仓 PR/main 运行时 CI、真实已部署版本组合、OSS 合成/上传均未执行，不在本地验收结论内。**本任务约定的本地实施与验证终点已完成，第三批释放两仓和唯一主记录写入权。**

## 后端 PR 交付（已完成）

本轮复用原后端任务工作树及分支；后端源码继续由后端交付批持有写入权，主记录现已交给前端交付聊天（见本节交接声明），未操作前端源码/生成物。已 fetch 并快进到主线 `56f2b85e0cd1f457ff1b570c4f64a83646c0d468`；第三批复制的所属语言补丁逐文件与主线核实一致，已消除重复差异。本任务源码及最终 spec 的接管内容均保留。

- 后端 [PR #410](https://github.com/LonelyFellas/tsz-rust/pull/410)，base `56f2b85e0cd1f457ff1b570c4f64a83646c0d468`，最新 head `78f4c7010cb4269b178a8876882fb88e8c171c57`，无合并冲突，未开启自动合并。3 个提交依次为默认模板/安全拆分、拆分后历史恢复修复、CI 配套修正。
- 原模板迁移编号早于新主线迁移，会被 `ops/migration_compatibility.py` 判为 `baseline_migration_missing`。尚未发布的本任务迁移改为 `20261114110000_form_sharing_templates.up.sql` / `.down.sql`，SQL 不变，测试 include 路径同步；用主线真实迁移文件/checksum 构造 ledger 后，原生 helper 验证新增区间恰为 `[20261114110000]`。前文旧编号/摘要只是历史批次证据，当前交付以此编号和最终提交为准。
- 第 1 轮独立审查确认 1 个 P2：保留读法引用 ID 拆分保存后，内部 `PublicationRestore` 错把恢复旧发布映射视为非法改挂。增强原有发布/回滚/恢复集成用例，先在 `8abab34` 实际复现 restore-draft 409（预期 200）；最小修复后 21 项 shared_forms 回归全部通过，独立 GET 恢复原发布图。修复仅放行来自当前词条已存 publication 快照的已知内容映射；普通 Draft、同内容换槽、归属/父子/角色/槽位身份校验保持。第 2 轮确认修复。
- 首次 CI [43552764103](https://github.com/LonelyFellas/tsz-rust/actions/runs/43552764103) 在 identity/admin 各发现一项配套遗漏：克隆等价 helper 未规范化新表 `form_sharing_settings.updated_at` 的迁移时钟；profile 精确期望仍是旧 50 项权限、缺本任务新增 key。现分别仅补这一表/字段规范化和新权限精确期望（51 项），保留其他完整比较/隔离/污染拒绝检查与严格权限集合断言。第 3 轮确认修正；推送后仓库 concurrency 自动取消旧 head 的剩余运行，旧 run 不是最终通过依据。
- 审查 reviewer `/root/backend_ship_review`：累计 **3 轮**；独立审查确认缺陷 **1 个 P2，已修复**；另有 **2 处 CI 配套遗漏，已修正**；证据排除误报 0；当前未解决 0；关联回归/回退未知。最终结论覆盖 `78f4c7010cb4269b178a8876882fb88e8c171c57`，未变范围复用初审证据，未额外叠加审查。

### 本轮实际验证

- 显式专属 DB/Redis 运行 catalog_handler **17 项**、catalog_schema **35 项**、shared_forms **21 项**，均通过；历史恢复修复后同组 **21 项再通过**（不重复累加）。admin_profile **12 项通过**，包含精确全量权限与普通管理员无默认业务授权。
- CI profile/workflow 脚本单测 **31 项通过**；helper `rustfmt --edition 2024 --check` 与 `git diff --check` 通过。
- 原 CI template helper 在独占 PostgreSQL 上实际 prepare/cleanup 通过，171 migrations；`fresh_clone_equivalent`、`data_schema_sequence_isolated`、`cleanup_isolated`、`template_unchanged`、`dirty_rejected`、`checksum_rejected` 六项全部 true。使用临时 Cargo manifest 引用原 helper/原迁移、相同锁定依赖及离线缓存，无运行时源码变更。
- 3 次提交均正常执行 pre-commit：`cargo sqlx prepare -- --all-targets --all-features` 与 `cargo clippy --all-targets --all-features -- -D warnings`，全部成功；`.sqlx` 始终无最终差异。两次正常推送均执行 pre-push fmt 并通过；没有绕过 hooks 或 force push。
- 原生重新导出 OpenAPI，最终内容仍为第三批的 `b620cee8b93dcdaa211457bb4149af85625d3281c52dfd07702d6cf4d17a61cc`。相对 main 仅共享模板 GET/PUT、四个 schema 和 catalog 字段；本轮交付/修复未再改变 wire，不需要前端重新生成。spec 精确归属为后端最终 head 的 `docs/openapi.json`。
- 此前真实页面/严格 validator 混合版本验收证据沿用第三批；本轮历史恢复由真实 PG handler→持久化→独立 GET 回归补证。旧部署 binary 与新迁移记录的真实启动/回退、OSS 合成/上传仍未验证，原回退限制不变。

### 最新 CI 与清理

最新 CI：[43553767720](https://github.com/LonelyFellas/tsz-rust/actions/runs/43553767720)，**attempt 1**，已核实 run 的 `head_sha` 为 `78f4c7010cb4269b178a8876882fb88e8c171c57`。已完成，结论 **success**；15 个任务成功，包含全部7个集成分片、单元/文档测试、质量门及最终汇总。PR 事件的发布制品构建/验证按原条件跳过，不冒称完成发布验收。

本轮专用资源已完整清理：第一组 PG/fixture 数据库、Redis 的 60 个本批测试键随独占实例及目录删除移除，63147/63148 无监听；第二组 PG 的 helper template/probes 已由原 helper 清理，admin_profile 临时库已自动移除，专属 fixture 库随后删除，集群仅余系统库后停止，53579 无监听。两组数据/日志/临时 manifest、symlink、源码保护备份和登记均删除，未使用 FLUSHDB/FLUSHALL；原工作树/源码/缓存完整，无 OSS 对象。后端工作区干净。后端最终 CI 已通过，后端聊天已释放源码写入权；前端交付聊天只读核实最终结果后在本记录补齐。

**后端交付契约已冻结，主记录写入权交给前端交付聊天。** 后端 PR #410 的 head `78f4c7010cb4269b178a8876882fb88e8c171c57`、base `56f2b85e0cd1f457ff1b570c4f64a83646c0d468`、3 轮审查与最新 CI `43553767720` attempt 1 已完整交接；OpenAPI SHA-256 仍为 `b620cee8b93dcdaa211457bb4149af85625d3281c52dfd07702d6cf4d17a61cc`。前端可以据此并行提交/审查/PR，无需等待后端 CI。后端源码写入权继续由后端交付聊天持有，只在该聊天和后端 PR 跟进最新 head CI 全绿；若需改契约，会先在该聊天即时说明，由协调聊天安排。后端本回合不再修改此主记录。未合并、未部署。

## 前端 PR 交付（进行中）

本轮复用前端任务工作树与 `codex/task-165-form-sharing`，接到后端明确的契约冻结/主记录交接后开始写入。已 fetch 并快进至前端最新 `origin/main` `f55a99db70679dfeeeaa0cb6419b4a29c15e1f05`，该主线比原基线新增3个已合入的语音反馈/生成修复与按账号记忆语言选择提交，均无本任务文件冲突，保留全部本任务差异及第三批证据。后端源码仍由后端聊天持有写入权，本聊天只读。

- 配套后端 [PR #410](https://github.com/LonelyFellas/tsz-rust/pull/410)，冻结 head `78f4c7010cb4269b178a8876882fb88e8c171c57`。已独立核对该工作树 `docs/openapi.json` 与前端 runtime 的 SHA-256 均为 `b620cee8b93dcdaa211457bb4149af85625d3281c52dfd07702d6cf4d17a61cc`；生成输入及业务契约未变，复用第三批原生同步与728项 api-client检查证据，不重复改写生成时间。
- 真实页面验收与清理复用第三批精确输入证据；该证据的历史 `not_run` 字段保留当时事实，PR/CI当前进展以本节为准。脱敏后端关联日志仅含method/route/status/request_id，已核实并将显式暂存通用 `*.log` 忽略的此单个文件，保证证据链接完整。
- 快进主线后补跑 `pnpm --filter @tsz/api-client test`：40 文件/728 项通过；Admin 的本任务7个文件，加最新主线直接相关语音/新版入口4个文件，合计11文件/403项通过（`pnpm --filter @tsz/admin exec vitest run` 显式文件列表）。没有新增失败，既有 jsdom pseudo-elements 提示不影响退出码。
- 审查与最终CI状态在后续结果中补齐。仅提交、推送、开PR并跟进CI；未合并或部署。

### 前端精确提交审查与 CI 回执

- 前端 [PR #784](https://github.com/LonelyFellas/tsz/pull/784)，base `f55a99db70679dfeeeaa0cb6419b4a29c15e1f05`，业务 head `a2733440c6d7553957080c4cff3e5ab3ca9d4c9d`；PR 可合并、未开启自动合并。实现提交 `e65224dcf163ebcb4cbdb80bf72067a215f4c0bf` 与修复提交 `a2733440…4c9d` 均已正常提交、推送。
- 独立 reviewer `/root/frontend_ship_review` 的业务审查共 **2轮**，确认 **1个P2、已修复，未解决0、已报告误报0；关联回归/回退未知**。初审覆盖 `f55a99db..e65224dc` 的完整34文件及直接调用链/四张截图；第2轮覆盖 `e65224dc..a2733440` 和原问题，未变范围复用初审。没有让 reviewer 重跑全量门，没有以自审替代独立门。
- 初审确认：模板页用 query 缓存值初始化后不再接受新 GET；显式 reload 未更新缓存，离开重入可再次回到旧 revision。新增回归在旧实现实际失败2项（界面仍显示旧组、保存继续传 base_revision=2 而不是3）；已有本地编辑后台刷新场景旧实现通过。最小修复以本地 draft 覆盖 query 数据：干净时跟随服务器，首次编辑/提交固定内容及 revision；保存/reload 成功写回缓存，显式 reload 取消旧在途查询避免迟到响应回滚。配置相关两文件45项通过，含缓存重入、409恢复重入、旧请求迟到、后台 GET 不覆盖脏输入；没有放宽原断言。
- 所有实现/修复提交正常执行 pre-commit 的 Prettier/分包 ESLint 与 commit-msg；实际 pre-push 的 `pnpm typecheck` 全7个可执行包通过（按原生 Turbo 输入复用有效缓存），没有跳过 hooks 或 force push。修复未改变 API、共享内容算法或持久化协议；真实浏览器证据仍归属于第三批精确输入，本轮新增缓存行为由组件回归证明，不冒称每个新 SHA 均重新做完整页面验收。
- 前端业务 head **`a2733440c6d7553957080c4cff3e5ab3ca9d4c9d`** 的 [CI run 43554933715](https://github.com/LonelyFellas/tsz/actions/runs/43554933715)，**attempt1，completed/success，10个任务全部success**。具体包括 quality（lint/typecheck/format/生产build）、tooling-tests、commitlint、packages/web/admin-1/admin-2/admin-3 五个覆盖率分片、coverage-merge（每测试文件恰执行一次）及 verify。PR 不生成 main 发布制品，也未部署。
- 后端最终 [PR #410](https://github.com/LonelyFellas/tsz-rust/pull/410)，head **`78f4c7010cb4269b178a8876882fb88e8c171c57`**、base `56f2b85e0cd1f457ff1b570c4f64a83646c0d468`，精确 [CI run 43553767720](https://github.com/LonelyFellas/tsz-rust/actions/runs/43553767720)，**attempt1，completed/success，15 success，2个发布制品任务按PR条件skipped**。后端3轮审查的1个P2及2处CI配套遗漏均已处理，未解决0。该结果已由前端交付聊天独立读取 GitHub 核实；后端已释放源码写入权，OpenAPI摘要保持不变，专属资源清理完成。
- 两仓 PR 互相关联并复用此唯一主记录。未来发布仍须核实已部署版本、迁移与回退；实际旧部署二进制启动/回退、OSS合成/上传未验证，限制保持。用户仅授权提交/推送/PR/CI，未合并、部署或扩大数据操作范围。

本文档回执是上述业务 CI 成功后的唯一追加变更，不包含运行时代码；它继续由同一 reviewer 做增量复查并走正常 hooks/完整 CI。**前端最终 head、该文档提交的精确成功 run/attempt 与总审查轮次在 [PR #784正文及最新检查](https://github.com/LonelyFellas/tsz/pull/784) 和最终交付回复记录**，避免把旧 head 的成功冒认为新 head 已通过。验证完成前保持本聊天持有前端及主记录写入权；完成后在交付回复明确释放，两仓变更均不自动合并或部署。
