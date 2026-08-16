# Smart Lexicon J2 非生产联合验收报告（2026-08-16）

## 结论

**J2 = FAIL，不满足 R1 前置。**

B4 非生产回填、parity、不可逆 cutover 和创建 gate 的开启/关闭均已按审核制品完成；真实浏览器也证明了第二个 `workspace` 能以不同 `word_id` 创建。但 P0 用例 C02 稳定失败：`workspaces` 已命中新建词条保存的 plural form，前端却因内置词典 `not_found` 把整个检测判为“不可继续”，没有提供“仍继续创建”。此外，发布/恢复冲突矩阵、关联词同名消歧、真实并发与 outbox consumer 重放仍缺完整真实链路证据。

本任务未修改业务代码、未提交、未推送、未部署、未触碰生产。创建 gate 已恢复为 `epoch=3/OFF`；publication gate 从未开启。

## 精确基线与安全边界

| 项目        | 记录                                                                                                                                                                                                                                                | 状态                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 前端        | `13589142402deef778af0c2313f3a6b9abde44a1`；部署页面与本地 `origin/main` 对齐                                                                                                                                                                       | PASS                       |
| 后端        | `e5f24820f7f95962a938fb92852c2ec9c5db1312`；服务二进制 SHA-256 `ac85cd48c18f3d6f7dd32534a44257ac2fdb316517736eee0ae21502cfff0496`                                                                                                                   | PASS                       |
| OpenAPI     | `docs/openapi.json` SHA-256 `9208bd3e80e4f1772cf2b61221786c48ad0b44babeeea66d320ce33c72ab288c`                                                                                                                                                      | PASS                       |
| 环境        | `tshb-test`，明确为共享非生产测试环境；PostgreSQL database `tsz`、user `app`、schema `lexicon/public`；Redis `127.0.0.1:6379/0`，无独立 namespace                                                                                                   | PASS（按用户本轮明确授权） |
| 依赖任务    | “完成 B8 F6 F7 发布恢复联调”已合入并部署上述精确 SHA；其真实浏览器证据不继承为 J2 PASS                                                                                                                                                              | PASS                       |
| 已合并纵切  | B6/F4、B7/F5、B9/F8、B6+B9/F9、B8/F6/F7 均在当前 main 历史中可定位；合并状态不替代本报告实测                                                                                                                                                        | PASS                       |
| 数据保护    | 写前 `pg_dump`：`/opt/tsz-rust/backups/j2-20260816-pre-cutover/tsz-pre-b4.dump`，7,491,357 bytes，SHA-256 `8a20783bf3e5a59b24be6eb78b2e907cd9fa5b244b2d279421d9f8f2ebffb506`；已恢复到一次性 PostgreSQL 18 容器并核对 entries=8、surface_sources=14 | PASS                       |
| policy 备份 | `/opt/tsz-rust/backups/j2-20260816-pre-cutover/surface-policies.txt`，SHA-256 `5da81819048334fc291ac4577abcfad12d89c27916caf86afa2bd4b0ed48b7ad`                                                                                                    | PASS                       |

所有凭据、cookie、token、签名 URL 均未写入报告或终端证据。

## J2 验收矩阵

证据层严格区分：`组件`、`mock Playwright`、`真实 HTTP`、`真实浏览器`、`真 DB/Redis`。

| ID  | 场景                                              | 证据层                    | 结果                                 | 关键证据/缺口                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------- | ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | 非生产身份与精确 SHA                              | 只读环境                  | PASS                                 | 见“精确基线与安全边界”                                                                                                                                                                                                                                        |
| E02 | DB/Redis/outbox/policy 可观测                     | 真 DB/Redis               | PASS                                 | host/db/user/schema、Redis DB0、policy epoch 均已记录；无敏感值                                                                                                                                                                                               |
| E03 | seed/reset/cleanup/可恢复快照                     | 真 DB                     | PASS                                 | 写前 dump 已做恢复校验；仅新增稳定测试 ID `01a00af8-f8d7-7030-85b3-f74871010a1a`                                                                                                                                                                              |
| E04 | B4/R3 审核制品与 hash                             | 制品                      | PASS                                 | cutover SQL hash `a9d1b96094390ed2a50893d1558ef4b0582df17e979d7236f56a112287dacd8e`；runbook hash `e90f723ab42a63010f96e44d10124827027dd771449d2e87872db662026c5776`；CLI hash `92a7dcc0cb0f9fe112dad80f903501dec070e56edc19de625a12972bb74f0619`；未手写 SQL |
| M01 | 回填前 counts/digest                              | 真 DB                     | PASS                                 | entries=8、headwords=9、forms=29、relations=0、publications=3、surface_sources=14、outbox=23；entry digest `f6070a5cdec79f9f102b74534f1a9b2d`                                                                                                                 |
| M02 | migrate→backfill→preflight                        | 真 DB/Redis               | PASS                                 | scanned/changed=8/8；active rows=82/82；命令均输出机器可读 JSON                                                                                                                                                                                               |
| M03 | source 覆盖范围                                   | 真 DB                     | PASS                                 | current_publication/archived=20、draft/archived=34、draft/draft=28；包含 common 展开后的 UK/US scope、headword/form                                                                                                                                           |
| M04 | projection parity                                 | 真 DB                     | PASS                                 | missing=0、orphan=0、mismatch=0、surface outbox lag=0；checksum `25bef7a5be255ef4facf4c85811a2d9042c8b7b905c0f960386a7cb0d41e7da1`                                                                                                                            |
| M05 | 回填期间 update/delete 竞争与 gate 前增量         | 真 DB 并发                | BLOCKED                              | 代码/集成覆盖存在，但本次共享测试库未安全制造并发 delete/update；不能用组件证据代替                                                                                                                                                                           |
| C01 | 第二个 `workspace`                                | 真实浏览器+HTTP+DB        | PASS                                 | detection `200`；完整 warning；创建 `201`；新 ID `...71010a1a` 与旧 ID `...a0a093e6` 不同；ack count=1、epoch=2                                                                                                                                               |
| C02 | `workspaces` 命中 plural 且可继续                 | 真实浏览器+HTTP+DB        | **FAIL**                             | form impact `200`、保存 `200`；再次 detection `200` 返回 form match `...71010a1a`，但内置词典 `not_found` 使 UI “不可继续”，按钮缺失                                                                                                                          |
| F01 | form→headword/headword→form/form→form/同 entry    | 真 DB 集成+部分真实浏览器 | BLOCKED                              | 真实浏览器仅证明跨 entry headword/form impact；四向矩阵未全部实跑                                                                                                                                                                                             |
| F02 | Forms 取消不升 revision；确认持久化 evidence      | 真实浏览器+HTTP+DB        | PASS（确认路径）/BLOCKED（取消路径） | impact `200` 显示 2 条跨词条命中；确认保存 `200`；forms ack count=1；取消 revision 未实跑                                                                                                                                                                     |
| P01 | Publish 0→1；gate OFF 阻断第二 active             | 真 DB 集成                | BLOCKED                              | Rust 真 PostgreSQL/Redis 定向集成通过，未取得真实浏览器纵切                                                                                                                                                                                                   |
| P02 | gate ON visibility/ordinary/composite             | 真 DB 集成                | BLOCKED                              | publication gate 在本轮真实环境始终 OFF；没有审核 operator CLI 可安全开启                                                                                                                                                                                     |
| P03 | 详情/列表/批量恢复                                | 真实浏览器+HTTP           | BLOCKED                              | 列表单条归档 `200`、恢复 `200` PASS；详情与批量未实跑                                                                                                                                                                                                         |
| P04 | 409/410、TTL、epoch、match 新增/消失、idempotency | 真 DB 集成                | BLOCKED                              | 定向集成有覆盖；真实 HTTP/浏览器故障注入未完成                                                                                                                                                                                                                |
| R01 | 两个同名 target、exact/contains、分页、sense 消歧 | 真 DB 集成                | BLOCKED                              | 定向 related-search 集成通过；真实浏览器没有安全的两 target seed                                                                                                                                                                                              |
| R02 | 精确保存 target_word_id+target_sense_id           | 真 DB/浏览器              | BLOCKED                              | 未在真实浏览器创建关联                                                                                                                                                                                                                                        |
| L01 | 同名列表多行、rowKey 与动作按 word_id             | 真实浏览器+HTTP           | PASS（当前页）                       | 列表同时显示 `workspace ...71010a1a` 与 `workspace ...a0a093e6`；归档/恢复精确命中新 ID；数据不足以验证多页排序                                                                                                                                               |
| L02 | warning snapshot total/digest/ack/preview         | 真 DB+浏览器              | BLOCKED                              | total 与精确 ID 在 UI 可见、ack 已持久化；digest/audit 回看页未完成                                                                                                                                                                                           |
| L03 | 同名审计、入站摘要、状态不串行                    | 真 DB+浏览器              | BLOCKED                              | detection 中两个 ID 各自显示入站摘要=0；完整审计回看未完成                                                                                                                                                                                                    |
| X01 | create/save/publish/restore 并发重确认            | 真 DB 并发                | BLOCKED                              | Rust 定向集成通过，真实运行服务双客户端竞争未执行                                                                                                                                                                                                             |
| X02 | 双击/网络重试/idempotency consumption             | 真 DB 集成                | BLOCKED                              | Rust 定向集成通过，真实浏览器网络重试未执行                                                                                                                                                                                                                   |
| S01 | R3 前停止                                         | 真 DB/Redis               | PASS                                 | preflight 要求 creation/publication OFF、writer barrier 与 parity 均通过；未满足时 fail closed                                                                                                                                                                |
| S02 | 审核 hash 不可逆 cutover                          | 真 DB/Redis               | PASS                                 | 旧 UNIQUE `true→false`，非唯一 lookup 保持 `true`，parity 不变，服务 health `200`                                                                                                                                                                             |
| S03 | R3 后 roll-forward-only 停用                      | 真 DB/Redis+浏览器        | PASS                                 | 未重建旧 UNIQUE；creation `epoch=2/ON→epoch=3/OFF`；关闭后 detection `200` 仍展示完整 4/4 warning，明确不签 token                                                                                                                                             |
| S04 | outbox 重放幂等                                   | 真 DB/outbox              | BLOCKED                              | 当前 37 条 pending，attempts=0、无锁、无 last_error；仓库模型说明独立 consumer 尚属未来能力，本环境无可执行的审核 consumer/replay 制品                                                                                                                        |

## B4 非生产回填与切换证据

执行顺序严格为 `migrate → backfill → preflight → hash 校验 → cutover → policy-enable`，验收结束执行 `policy-disable`。

- 回填后 active projection=82，parity 100%，缺失/孤儿/mismatch 均为 0，surface projection outbox lag=0。
- cutover 前旧跨 entry UNIQUE 存在、非唯一 lookup 存在；creation/publication policy 均为 epoch=1/OFF。
- cutover 仅执行 hash 为 `a9d1b960...dacd8e` 的审核 SQL。完成后旧 UNIQUE 不存在，lookup index 保留，服务 active、`/healthz=200`。
- creation policy 临时开启到 epoch=2；完成浏览器验证后通过仓库 CLI 关闭到 epoch=3/OFF。
- 不尝试重建旧 UNIQUE；测试环境现有两个同名 `workspace` 保持可读。紧急处置遵循只前滚：停签 token，保留 reader/surface lock/非唯一读取，前向修复 writer/projection/consumer。

## 五条业务链路

1. **Detection/Create：部分 PASS、总体 FAIL。** 第二个 `workspace` 创建成功；`workspaces` plural 命中正确但 UI 错误阻断继续创建。
2. **Forms：部分 PASS。** 跨 entry impact modal、确认与持久化 evidence 通过；四向、取消不升 revision 未完成。
3. **Publish/Restore：BLOCKED。** 列表单条草稿归档/恢复真实通过；发布 gate 三类确认、详情/批量、409/410 未获真实浏览器证据。
4. **关联词：BLOCKED。** 只有真 DB 定向集成，真实浏览器同名 sense 消歧未完成。
5. **列表/审计：部分 PASS。** 同名列表多行和精确 word_id 动作通过；多页稳定性及完整审计回看未完成。

## 真实 HTTP 与浏览器 trace 摘要

Nginx access log 与浏览器 DOM/action trace 对齐：

- `POST /api/v1/admin/lexicon/detections` → `200`（22:27:56）
- `POST /api/v1/admin/lexicon/entries` → `201`（22:28:03）
- `POST .../steps/forms/impact` → `200`（22:29:30）
- `PUT .../steps/forms` → `200`（22:29:37）
- `POST /api/v1/admin/lexicon/detections` → `200`（22:29:45，plural 缺陷复现）
- `POST .../archive` → `200`（22:31:29）
- `GET ...?status=archived` → `200`（22:31:38）
- `POST .../restore` → `200`（22:31:49）
- gate OFF 后再次 detection → `200`，完整显示 4/4 surface sources 与两个精确 `word_id`，UI 明示 `exact_headword_creation_temporarily_disabled`。

## 自动化证据（不替代真实链路）

- Rust 真 PostgreSQL/Redis 定向集成：7/7 PASS，覆盖 forms 双 token/反向匹配、publish/restore gate、batch、composite、epoch/match 重确认、双击幂等、related search。
- api-client：267/267 PASS。
- F7 目标组件：45/45 PASS。
- 前端全仓 typecheck：PASS。
- mock Playwright：未用作本轮 J2 结论依据。

## 未解决问题与负责人建议

1. **P0 产品缺陷（建议前端 F4 owner 新开 Bug 任务）：** detection 结果同时存在有效 surface warning 与 dictionary `not_found` 时，继续创建能力应以审核后的 surface continuation policy 为准；当前 UI 错误优先使用词典失败状态。先补真实复现回归，再做最小修复。
2. **发布/恢复验收缺口（B8/F6/F7 owner + QA）：** 提供经审核的 publication gate operator 入口与专用 seed，补三类 impact、三个恢复入口、409/410/TTL/epoch/并发。
3. **关联词验收缺口（B9/F8 owner + QA）：** 准备两个同名且各含稳定 sense ID 的测试 target，补 exact/contains、多页、第二 sense 精确持久化。
4. **运行保障缺口（SRE）：** 明确 release commander/DRI、数值停止阈值、consumer 观测与审核重放制品。当前 37 条 pending outbox 不影响本轮同步 surface parity，但使 S04 不能 PASS。
5. **清理：** 新测试词条 `01a00af8-f8d7-7030-85b3-f74871010a1a` 当前为未归档草稿，revision=2、lifecycle_revision=3。永久删除属于破坏性操作，本轮未获删除确认；可由测试数据 owner 明确确认后单独清理。

只有上述 P0 缺陷修复、所有 BLOCKED 真实链路补齐且再次全量通过后，J2 才可改判 PASS 并满足 R1 前置。
