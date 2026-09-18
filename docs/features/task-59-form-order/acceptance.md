# TASK59 真实前后端浏览器联调

## 结论

**草稿目标的真实多维释义关联链路通过；不是 TASK59 全场景通过。**

使用真实 Playwright Chromium（headless），浏览器登录 → Vite 同源代理 → Rust API → 页面多维释义关联下拉 → 选中词义 → 页面保存 → 独立 GET 核对。无 page.route、无接口 mock、无注入页面状态替代交互；service worker blocked。账号和密码仅从环境读取，未写入报告。

已证明：

- `form_groups` 组序及 `members` 成员序决定实际候选顺序，而不是 `forms` 数组顺序。
- 命中的原形位于配置末尾时不会被置顶。
- 同拼写 `taskhung` 的过去分词、过去式分别保留。
- 新建组前置后，重新打开真实页面得到新顺序。
- 页面选中的是过去分词；保存后 GET 中 word/pos/base/form/variant/sense 身份与 fixture 一一相符。直连 8359 GET 与 3059 代理 GET 内容完全一致，断言通过。

未验证/受阻：

- 发布请求返回 422：最小草稿缺少语义区间、语法结构、定义的 grammar_structure_id、细分词性、词频和 sense_group_id。**未发布成功，发布快照与未发布调序隔离语义未验证**，不是排序测试失败。
- 当前后端写入契约拒绝跨组共享同一 form_id：422 `form_group_membership_invalid`，`a concrete form can belong to only one form group`。该历史数据兼容场景未通过真实写入构造，未绕过 API 改库。
- 多维例句、共享例句、短语成分、独立关联词搜索、英美变体筛选、历史未入组词形不在本次页面通过范围。

## 环境与来源

- 前端：`/Users/darwish/Dev/tsz-core/tsz-task-59`，HEAD `03e88e4be35e0306f041c40e8e9e4c299fec57d1` + 工作区修改；admin Vite dev `http://127.0.0.1:3059`，PID 82877，cwd 为该 checkout 的 `apps/admin`。
- 后端：`/Users/darwish/Dev/tsz-core/tsz-rust-task-59`，HEAD `df925192e9ce54211bbf9d691f1a1e5461a81b5c` + 工作区修改；PID 82874，监听 `127.0.0.1:8359`，实际加载 `/private/tmp/task59-api`。
- `/tmp/task59-api-build.log` 明确记录编译上述后端 checkout；`/tmp/task59-api` 与 `/Users/darwish/.cargo-target/debug/tsz-rust` SHA256 均为 `45bc1f0173a3ccfcd3e22036786b5186ecc58b8fde9624b46a11b7ba2c9f0d2e`，mtime 均为 `2026-09-18 16:38:59`。进程启动 `16:42:47`，晚于构建。
- 实际启动命令：`BACKEND_API_URL=http://127.0.0.1:8359/api/v1`，`VITE_ADMIN_WORDS_MOCK=false`、`VITE_ADMIN_PART_OF_SPEECH_MOCK=false`、`VITE_ADMIN_TTS_MOCK=false`。
- 隔离资源：`tsz-task59-pg` 映射 `127.0.0.1:55459 → 5432`，数据库 `task59`；`tsz-task59-redis` 映射 `127.0.0.1:56459 → 6379`，Redis DB 0。runtime 中脱敏连接目标吻合。
- 本轮没有修改仓库文件。结束时发现 `SentenceEditor.test.tsx` 相比开始新增工作区修改，属于并发外部变更，本轮未写入或回退。既有其他修改也完整保留。
- 此证据仅适用于 admin Vite dev，不证明 preview/生产代理。

## Fixture 与页面操作

目标词条：`01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc`（taskhang，最终复合标题 taskhang / taskhangother，draft revision 5）。
宿主词条：`01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e`（taskhost，draft revision 5）。

页面：`http://127.0.0.1:3059/words/01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e/v3/wizard/meanings`

实际操作：打开“定义 2 英美通用内容编辑器” → “关联单词” → 点击正文 taskhang → 展开目标词条 → 读取词形列 → 点击“过去分词 taskhung” → 点击 TASK59 词义 → 完成编辑 → 保存草稿。

### 第一轮：成员顺序完全反转

forms 创建/数组顺序：原形 taskhang → 过去式 taskhung → 过去分词 taskhung → 现在分词 taskhanging。

配置 members 反向排列后，**UI 实际顺序（严格数组断言通过）**：

1. 现在分词 taskhanging
2. 过去分词 taskhung
3. 过去式 taskhung
4. 原形 taskhang

### 第二轮：组序 + 成员序

在 forms 数组末尾追加原形 taskhangother、过去式 taskhungother，但把其组放在 form_groups 第一位，成员顺序设为过去式 → 原形。原组置于第二位，继续保持反向成员顺序。

重新打开页面，首先能回显已保存的原关联；在页面清除关联、再次打开下拉后，**UI 实际顺序（严格数组断言通过）**：

1. 过去式 taskhungother
2. 原形 taskhangother
3. 现在分词 taskhanging
4. 过去分词 taskhung
5. 过去式 taskhung
6. 原形 taskhang

重新选择同一过去分词并保存。清除后重选会创建新的 text_link.id，这是预期编辑行为；目标身份保持不变，不把 link 自身新 ID 描述为排序改变身份。

## 保存后独立核对

最终宿主 GET 的英文定义 `content.common.text_links[0]`：

- target_word_id：`01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc`
- target_pos_id：`eeb18c9a-4dd4-40b2-9682-802893b7ad47`
- target_base_form_id：`c2a9cd57-3c84-45ca-a522-5c1f76f5b239`
- target_form_id：`3a9e249e-9479-4ae5-9aab-a27637fa87f0`（past_participle）
- target_variant_id：`d0cb7b34-20f2-4029-8f00-b5ce4207bf71`
- target_sense_id：`eda97817-ad5c-481d-81b0-0e16ca60b6db`
- target_dialect：common；source_segments：`{start:0,end:8,surface:"taskhang"}`。

独立请求不仅读取保存响应：新 APIRequestContext 使用 refresh 后发起 GET，并额外直连 8359 对比返回 word 深度相等；断言上述各目标 ID 与目标词条对应节点一致。组配置改变后、再次 UI 编辑前的 GET 也已确认原绑定未被调序改写。

## API 路径与实际状态码

下列路径均以 `/api/v1/admin` 为前缀；浏览器业务请求走 3059 同源代理：

| Method | Path                                                                     | Status / 证据                                                    |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| POST   | /auth/refresh                                                            | 首次无会话 401（预期）；登录后后续刷新 200                       |
| POST   | /auth/login-code                                                         | 202，浏览器先请求验证码                                          |
| POST   | /auth/login                                                              | 200，浏览器三要素登录                                            |
| GET    | /profile                                                                 | 200                                                              |
| POST   | /lexicon/detections                                                      | 200                                                              |
| POST   | /lexicon/entries                                                         | 201，仅创建本任务两个词条                                        |
| GET    | /lexicon/entries/01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc                    | 200                                                              |
| POST   | /lexicon/entries/01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc/steps/forms/impact | 有效配置 200；尝试跨组重复 form_id 为 422                        |
| PUT    | /lexicon/entries/01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc/steps/forms        | 最初误用 past 类型为 422；改用 past_tense 后及后续排序更新均 200 |
| PUT    | /lexicon/entries/01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc/steps/meanings     | 200                                                              |
| POST   | /lexicon/entries/01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e/steps/forms/impact | 200                                                              |
| PUT    | /lexicon/entries/01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e/steps/forms        | 200                                                              |
| POST   | /lexicon/entries/component-targets/search                                | 200，真实多维释义下拉触发                                        |
| PUT    | /lexicon/entries/01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e/steps/meanings     | 200，两轮页面保存均通过                                          |
| GET    | /lexicon/entries/01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e                    | 200，浏览器加载、独立代理 GET、直连 8359 GET                     |
| GET    | /lexicon/entries/01a0b3b3-4cc0-7e21-8ac2-c9bcc91ea30e/inbound-references | 200                                                              |
| GET    | /settings/parts-of-speech/catalog                                        | 200                                                              |
| GET    | /lexicon/sentences                                                       | 200，仅页面加载附带查询，不算例句页面验收                        |
| GET    | /speech/voices                                                           | 200                                                              |
| POST   | /lexicon/entries/01a0b3b2-d1aa-77c2-bbf6-1f20adc039dc/publications       | 422，最小草稿缺发布必填项；快照语义未验证                        |

初始 fixture 中一个无原形的词形组未出现在可关联候选，调整为含原形的有效组后完成测试；未把无 base_form_ids 的节点过滤误判为排序失败。页面探查期间发生过定位器严格模式/超时，修正一次性脚本定位与清除关联后重新打开弹层的步骤后，最终两轮均完整执行并严格断言，未跳过失败断言。

## 证据文件

截图：

- `/tmp/task59-login.png`：登录成功后的真实后台。
- `/tmp/task59-dropdown-order.png`：第一轮反向成员序下拉。
- `/tmp/task59-dropdown-multigroup.png`：第二轮组序及成员序下拉。
- `/tmp/task59-reloaded-link.png`：重新加载后已有草稿关联回显。
- `/tmp/task59-saved.png`：最终保存后的真实页面。

数据与网络（不含凭据）：

- `/tmp/task59-ui-order.json`、`/tmp/task59-ui-multigroup-order.json`
- `/tmp/task59-fixtures.json`：初始目标/宿主及第一轮排序配置。
- `/tmp/task59-multigroup.json`：最终目标配置。
- `/tmp/task59-independent-get.json`：最终独立 GET 结果。
- `/tmp/task59-identity-proof.json`：直连/代理相等和身份断言结果。
- `/tmp/task59-network-login.json`、`/tmp/task59-network-fixture.json`、`/tmp/task59-network-ui.json`、`/tmp/task59-network-ui-multigroup.json`、`/tmp/task59-network-ops.json`：method/path/status，不含 headers/token/body。

一次性脚本：`/tmp/task59-browser.cjs`、`/tmp/task59-fixture.cjs`、`/tmp/task59-ui.cjs`、`/tmp/task59-ui-multigroup.cjs`、`/tmp/task59-api-ops.cjs`。脚本是分阶段验收记录，不应直接全量重跑创建 fixture。`/tmp/task59-browser-state.json` 含会话凭据，权限 600，不属于可公开报告附件。

## 清理结果（主 agent 完成）

子代理交接时保留环境；主 agent 核对 PID/cwd 和容器绑定后，已停止本任务 API/Vite，删除 `tsz-task59-pg`、`tsz-task59-redis` 及其匿名卷（含本任务 fixture 和隔离测试库）。8359/3059/55459/56459 均无监听。已删除临时连接配置、runtime 凭据和 browser storage state；保留脱敏测试日志、脚本、截图和报告。未触碰其他任务服务、共享库或生产数据。
