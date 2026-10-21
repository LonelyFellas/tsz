# 任务 146：词形与发音重设计

> 2026-10-21 · 前后端已实现，自动化和隔离环境核心链路已验证。真实语音与完整视觉验收尚未完成。本文是两仓唯一主记录。
>
> 本次授权包括实施、自动化测试、本任务隔离环境的登录、fixture、保存、发布、历史恢复和清理；用户后续明确要求「提 pr」，已包含两仓必要的提交、推送及关联 PR。合并、部署和修改禅道/Figma 仍未授权。

## 1. 目标与范围

将“一份拼写和发音内容”与“它在某词性、变化组中承担的词形用途”分开。管理员在总览审校，从内容弹窗编辑一次，同词条内显式指派的多个标签共同读取该内容；每个标签继续保留自己的语法用途与引用身份。

已实现的界面包括总览表、内容弹窗和跨词性标签指派，复用 Ant Design 6、原有拼写/语音编辑器、音色目录与试听接口。页面保存、草稿、发布的边界保持明确。

范围外：音色配置中心、全局配音、自动按拼写合并、跨词条共享、任意两份旧内容合并、批量合成与任务中心，以及词义/例句产品流程重设计。

## 2. 来源与固定版本

- [禅道 #146](http://47.121.142.19/zentao/index.php?m=task&f=view&taskID=146)：本会话已读取总览审校、全面编辑和指派标签要求；后续登录过期，未确认新增备注，未修改任务状态。
- [Figma 原稿](https://www.figma.com/design/MGoCAQmE8rOPXDTi9wczd0/词形与发音-重新设计?node-id=0-1)：已通过远程 MCP 读取设计上下文和截图。内容主体 `49:657`；跨词性标签 `51:979`、`51:982`。原稿未定义完整的取消、失败、冲突和窄屏行为，本记录补齐这些边界。
- 两仓分支均为 `codex/task-146-form-content-design`，复用现有任务 worktree，由当前会话统一写入。

| 仓库 | 任务工作区                                                                     | 实施基线                                   |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| 前端 | `/Users/darwish/Dev/tsz-core/.worktrees/frontend/task-146-form-content-design` | `63a3b34e0f68c96d1adfcf08d6266de56c457ba8` |
| 后端 | `/Users/darwish/Dev/tsz-core/.worktrees/backend/task-146-form-content-design`  | `1e1fbd79a36be06b8c65e27f401453840acc1563` |

基线已包含 #145；后端 #254/#255/#256 的逐字正音、拼写独立试听、IPA/UPS 独立配置也已合入。未修改 `dictionary-search-layout`、`tsz-lexicon-domain-batch-2` 或其他任务工作区。

后端 `docs/openapi.json` 已由 Rust 1.98.0 原生 exporter 导出，并通过显式 `OPENAPI_SOURCE=<本任务后端>/docs/openapi.json` 同步前端；没有手改生成 JSON。后端原始文件 SHA-256 与前端 runtime bundle 的 `_source_sha256` 相同：

`066c1db9d4b103b33a7345a400e0f8f9347336af5d9adf522183640c874211fe`

现网版本、现网数据规模及迁移耗时未核实。本地候选不能作为已部署版本证据。

## 3. 已采用的产品规则

以下五项沿用实施授权中的默认取舍，不记作用户逐项另行批准：

| 项目           | 本次行为                                                     |
| -------------- | ------------------------------------------------------------ |
| 英美区别       | 对当前共享内容及其全部标签生效，不改变组内其他内容           |
| 多变化组       | 显式选择目标组；只有一个组时自动选该组                       |
| 规则变化       | 按标签及必要地区侧保存，不随共享正文强制统一                 |
| 多读法、多音色 | 逐条显示读法，显示实际试听音色/倍率，可展开其他配置          |
| 移除最后标签   | 明确删除内容，进入页面草稿及原有影响流程，不建立无标签内容池 |

共享仅限同一词条。同内容在同组中不能重复绑定同类型；不同组的用途、专用范围及词义关联独立。新增标签生成新的 binding 及引用节点 ID，不把其他绑定的 ID 复制过去。

## 4. 数据模型与身份

```text
entry
├─ contents[]：拼写、发音、语音设置的唯一可写源
│  ├─ content_id、内容级 dialect_rules
│  ├─ common 或 uk/us 地区槽位与读法槽位
│  └─ pronunciation_slots：显式地区读法对应及退役身份
└─ pos[] → forms[] / form_groups[]
   └─ binding：form_id、form_type、content_id、用途与规则性
      └─ regional_bindings：本绑定的 variant/pronunciation 引用 ID → 内容槽位
```

内容槽位与 binding 引用节点承担不同职责。原 variant/pronunciation 节点仍在原 form/variant 父级下，不迁父到 content。内容顺序决定读取顺序，显式映射决定引用身份；不按拼写、读法字符串或数组位置猜测对应。

内部 `DraftFormsStepContentV3` 保存规范 shared 图，并提供派生 `pos` 供既有业务读取。`expandFormContents` 也是派生视图，不能成为另一份独立正文。前端用 `setFormContents` 更新作者图；旧结构操作经 `applyFormsStructure` 应用，避免派生副本覆盖共享正文。

后端存储：

- `lexicon.v3_form_contents`、`v3_form_content_bindings` 保存内容与绑定。
- `v3_form_content_slots`、`v3_form_content_node_slots` 保存永久槽位和 node→slot 身份。
- `v3_form_pronunciation_mappings`、`v3_form_pronunciation_mapping_slots` 保存显式读法地区对应。
- 延迟复合外键和聚合校验共同保证 entry/content 一致、无悬空绑定、无跨词条共享。

既有节点的 entry、parent、role、stable slot 不可改绑。impact 与 PUT 均在影响确认前预检，持久化再复核，并以条件 upsert/受影响行数作为最后防线。entry revision 是整个共享图的并发边界。

显式拆合建立的 correspondence 有独立 ID，common/uk/us 侧各保存 pronunciation slot 与 variant slot。退役侧仍保留身份；请求省略已经持久化的 metadata 时从永久账本补回，显式冲突继续拒绝。重排、删除和恢复均按槽位。

**旧 component 的明确限制：** 旧词形成分的 parent/role 仍属于原 variant。前端对带非空旧 `component_usages` 的地区拆合提前拒绝，后端也保护含成分的原 variant；同地区编辑继续保留原 ID/父级。本次没有建立 component correspondence，不能声称这类旧数据可任意地区往返。

## 5. 作者协议、迁移与发布

保持 `schema_version=3`，新增严格表示 `forms_format: "shared_v1"`，通过 `X-TSZ-Form-Contents: v1` 协商，并提供 `shared_form_contents` 能力。OpenAPI 的 `FormsStepRepresentationV3` 用 `oneOf` 描述 shared/expanded；新对象和地区 union 分支拒绝额外字段。

复用既有词条、forms impact/PUT、发布与历史端点。权限仍为原编辑归属、`words.access`、`words.edit`；试听仍需 `speech.generate`，能力头不替代权限。

- `contents` 是唯一正文，binding 只保存身份、映射和用途。
- 新关系非法返回 422 `form_content_mapping_invalid` 并附精确 `field_issues`；稳定引用身份错误返回相应 409；版本冲突继续使用 entry revision。
- optional 字段区分缺省和显式 null；`component_usages` 保留缺省与空数组区别，null 拒绝。
- 不支持的旧读取返回 409 `form_contents_client_upgrade_required`；可无损展开的旧读仍可用。
- 已进入共享模型的合法旧 forms 写入在持久化前拒绝，不允许旧 payload 拆散关系。结构本身非法时可先返回 422。
- 新 Admin 同时要求能力存在且收到 shared 图；连接无该能力的 API 时禁用共享编辑。
- dirty、恢复、并发比较、指纹和确认 token 均包含完整内容、绑定与身份 metadata。

新增成对迁移：

1. `20261020090000_shared_form_contents`：旧草稿一 form 一 content，不按 spelling 合并，保留原节点/成员与入站引用身份，从旧组复制内容规则。
2. `20261020220000_form_pronunciation_slots`：独立保存读法地区对应，未改已应用迁移 checksum。

旧 publication JSON/hash 不回填、不改写；旧快照通过统一解码边界适配。新 publication 冻结自包含 shared 内容、绑定和槽位映射；恢复草稿重新建立共享图，公开回滚使用历史快照而不以当前草稿覆盖历史。词表和学习读取发布快照，保留具体 form 用途，不按 content ID 去重。

有损 down 必须拒绝：出现共享 binding、新格式快照/投影或读法身份映射后保留兼容后端。恢复旧二进制不等于数据库可回退，SQLx 迁移检查也需考虑。

## 6. 管理端交互

总览保留词性与变化组，每个标签绑定占一行。显示拼写、英美实际发音、音色、倍率和编辑入口；多读法逐条呈现，共享内容显示影响标签数。两侧试听按各自 locale 和实际解析出的音色配置，显示与播放复用同一解析函数。

`actual_pron` 仅用于展示，不自动写入 IPA/UPS 或合成输入。表格渲染不自动生成音频；不可试听时说明原因。既有拼写标注、停顿、独立拼写设置与音素配置继续复用。

草稿分层：

1. 拼写/语音设置器和标签选择“完成”只进入内容弹窗草稿；取消不改变外层。
2. 内容弹窗“确认，应用到草稿”一次性更新页面内容与标签；不调用保存接口。
3. 页面保存才执行 impact/token/PUT；成功后使用 canonical 响应和独立读取确认结果。

关闭、切步骤与离开接入统一 guard；连续关闭复用同一个确认。409、422、网络失败保留完整页面草稿，过期后台读取不能覆盖。

共享字段错误携带 `content_id/content_slot_id`，沿实际 binding/POS/group 打开内容弹窗并聚焦真实控件。总览可将共享问题投影到相关标签，但摘要只计一次。过期聚焦通过 AbortSignal 取消。

## 7. 自动化与代码验证

以下为本任务实际执行结果，未以 mock 冒充真实联调。同输入已有有效检查沿用，未为文档修订重复全套。

| 检查                                                    | 结果                                              |
| ------------------------------------------------------- | ------------------------------------------------- |
| Rust 1.98.0，lib 与 8 个受影响集成目标                  | 690 通过，0 失败                                  |
| 后端 fmt、全目标/全特性 Clippy `-D warnings`            | 通过                                              |
| Admin 全量 Vitest                                       | 138 文件，2020 通过、2 跳过                       |
| api-client 契约与请求测试                               | 27 文件，578 通过                                 |
| shared 包                                               | 19 文件，364 通过                                 |
| 受影响包 lint/typecheck、Admin build                    | 通过；最后测试宿主变更后 Admin typecheck 再次通过 |
| 新 Modal 测试 ESLint、Prettier；两仓 `git diff --check` | 通过                                              |

后端 690 项组成：lib 380、`learning_runs_handler` 23、`learning_tasks_handler` 15、`lexicon_audio_asset_references` 22、`lexicon_handler` 160、`lexicon_v3_lifecycle` 12、`lexicon_v3_storage_schema` 13、`shared_sentences` 34、`wordlists_handler` 31。

覆盖内容包括永久身份、防改绑、metadata 省略补回、地区拆合/退役恢复、真数据库并发一成功一冲突、影响与保存一致性、迁移回退拒绝、发布不可变、批量及幂等、回滚/历史草稿恢复、音频引用，以及共享发布内容的词表/学习消费。前端覆盖分层取消、多组显式选择、最后标签删除、完整 shared 草稿、失败保留、错误定位及过期聚焦。

执行后端命令须显式使用 `cargo +1.98.0`，尤其从前端目录用 `--manifest-path` 时，不能假定会自动选择后端工具链。测试仅连接本任务隔离数据库/Redis。不要清理共享 `/Users/darwish/.cargo-target`。

## 8. 真实联调证据

环境：API `127.0.0.1:18446`，Admin `127.0.0.1:13146`，PG `127.0.0.1:55446` 的 `task146_app/task146_test`，Redis `127.0.0.1:56346/0`。API 使用任务独立二进制且核实实际进程，cwd 在专用临时目录以避开共享 dotenv。Admin 明确连接该 API，词条/POS/TTS mock 均关闭。未启动 Web。

Orca 使用独立 `task146-acceptance` profile。验收 fixture 词条 `01a158a5-b2ad-7361-9e5b-4d4ca2de0a84`，共享 content `47b2d346-13d5-487e-a41f-a7d45fe44f0f`，分别绑定名词、动词原形。以下数据仅用于本地测试，结束后清理。

| 实际链路                       | 观察结果                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 跨词性共享、地区拆合及重新打开 | 保存读回保持共享与槽位身份；各 binding 引用节点独立                                                                                         |
| 标签选择后取消                 | 标签选择状态关闭，外层仍为两个原标签                                                                                                        |
| 内容修改并确认                 | 独立 GET 仍 revision 9，未提前服务端写入                                                                                                    |
| 页面保存                       | impact 200、PUT 200，独立 GET revision 10；刷新再打开读回新字典音标，实际发音和 IPA 保持原值                                                |
| 页面检查与发布                 | validate/impact 200，发布 201；独立 GET 和页面历史显示第 1 次发布、source revision 10                                                       |
| 历史详情                       | 页面实际请求详情 200，并展示只读快照及两词性内容                                                                                            |
| 发布后修改草稿                 | revision 11，独立历史读取仍与原 shared 图完全相等                                                                                           |
| 真实 HTTP 公开回滚及同键重放   | 两次 201，只形成第 2 次发布；当前发布 shared 图等于原快照，草稿未被覆盖                                                                     |
| 归档、恢复为草稿               | 各请求 200，保留修改后的草稿，供页面恢复验收                                                                                                |
| 页面恢复第 1 次历史到草稿      | 独立 GET revision 12，完整 forms 与历史完全相等，仍有两个共享标签；未自动公开                                                               |
| 页面重新发布恢复内容           | 第 3 次发布，source revision 12，独立列表确认当前版本                                                                                       |
| 公开词表读取                   | 隔离词表 fixture 经 SQL 准备；真实 `GET /wordlists/{id}/items?view=full` 200，名词/动词共用拼写音标但保留各自 form/variant/pronunciation ID |
| 再改未发布草稿                 | 独立 GET revision 13；公开词表仍为已发布值，publication 列表/内容未变                                                                       |
| 旧能力头组合                   | 无能力头读取混合地区记录 409；合法旧写 409 `form_contents_client_upgrade_required`，独立 GET 证明零误写                                     |
| 窄屏                           | 390px 收起导航后总览无页面横向溢出，表格内可滚动至编辑；内容弹窗英美区上下排列，页面宽度 390px                                              |

公开词表 fixture `cc971ca3-af27-4913-b46e-253ae61ae146` 仅用于消费验证，非页面创建词表流程。学习共享快照、新旧轮次及答案固化由真实数据库集成测试覆盖，未启动 Web 学习页面进行端到端操作。

Orca 环境存在 CSS 动画停在 `currentTime=0` 的情况；验收时仅在专用页面结束停滞动画，没有修改生产动画代码。实际 DOM 与控件交互可验证，但多次截图仍缺失 DOM 中已经打开的弹窗，不能把这些图片作为弹窗视觉通过证据。宽屏 DOM 已确认两个英美区各 481px 并列；完整 Figma 视觉核对仍未完成。窄屏固定列随项目既有容器规则改为普通列，操作通过表格内横滚访问。

`AZURE_SPEECH_ENABLED=false`，未加载共享对象存储或供应商凭据。真实合成、播放、人工听辨未验证；参数和展示自动化通过不等于语音验收通过。

## 9. 混合版本与后续发布边界

| 组合                    | 已有证据与限制                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| 旧 Admin + 新 API       | 契约/handler 覆盖可无损读取及旧写保护；本地真实 HTTP 证明不支持的读取与合法旧写安全拒绝。未启动旧 Admin 构建 |
| 新 Admin + 旧 API       | 能力缺失/非 shared 图时禁用编辑的自动化通过；未运行真实旧 API 二进制                                         |
| 新 Admin + 新 API       | 本地真实页面保存、刷新、发布、历史详情及恢复通过                                                             |
| 阅读/学习 + 新快照      | 真实公开词表 HTTP 与集成测试通过；Web 阅读/学习页面未启动                                                    |
| 旧二进制 + 已写共享数据 | 不宣称可回退；有损 down 拒绝测试通过，保留兼容后端                                                           |

候选方向为先部署具备新旧读写边界和消费者适配的后端，再部署新 Admin。当前没有核实已部署版本，以上不是现网发布批准；发布前仍需按原生配套发布和部署门禁验证精确版本组合、迁移及回退限制。

## 10. 清理与交付状态

清理部分完成，剩余操作被自动审批阻止，未宣称全部清理完成：

- 本任务 Admin/API 已停止，独立复查 `13146/18446` 无监听；两个专用验收标签页已关闭。
- PG `127.0.0.1:55446`（PID `75487`，数据目录 `/private/tmp/tsz-task146-local.ITKeOn/pg`）和 Redis `127.0.0.1:56346`（PID `74939`）仍运行。停止命令均被自动审批以当前可见记录缺少实例创建证据为由拒绝，未改用 kill 或其他方式绕过。
- Orca 专用 profile `b88d50ea-7090-463d-a470-1de7786954f9`（`task146-acceptance`）仍存在。已从原始会话找到创建回执，删除仍被自动审批拒绝；未触碰默认 profile。
- 专用目录 `/private/tmp/tsz-task146-local.ITKeOn` 及其中的隔离数据库、Redis 文件、二进制和 `credentials.json` 均保留；该目录权限为 `700`，凭据文件权限为 `600`，未打印凭据值。
- 已按原始工具记录核实的临时脚本、JSON 数据副本、截图和样本仍保留。删除这些精确文件及凭据的命令也被自动审批拒绝。另有 141 份任务测试日志及 `/private/tmp/tsz-task146-figma.micyKU` 参考图目录尚未清除。

剩余清理范围仅限上述任务资源：停止指定 PG/Redis、删除专用 profile、专用临时目录和已核实归属的临时文件，再独立复查。工具门禁要求用户对具体停止/删除目标明确确认或提供其接受的可见创建记录；当前停止重试。共享 Cargo target、主仓、其他 worktree、其他服务及默认浏览器数据不在清理范围。

实现和验证证据已保留在代码、测试及本记录。尚未完成的验收范围为真实语音、完整视觉核对、真实旧版本二进制组合和 Web 阅读/学习页面端到端操作。两仓按「提 pr」授权进入交付流程，复用任务分支，合入最新主线、完成精确提交的独立审查并正常执行 hooks 后创建关联 PR；不合并、不部署。交付门禁继续复用上述专用 PG/Redis，未尝试绕过清理拒绝。
