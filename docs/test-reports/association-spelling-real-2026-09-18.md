# 关联候选按拼写折叠：本地真实联调验收

## 结论

2026-09-18 完成浏览器逐步操作及真实服务批量回归。4 个合成词条、12 条例句，22 项最终检查通过（20 项场景检查、首次手动选择保存、12 条数据的独立 SQL 核对）。未发现本次改动的功能缺陷，未因此修改业务代码。

## 环境与真实性

- 前端：`tsz-association-spelling`，`codex/association-spelling`；基线 `6aeca841fd6bcf2f4f366eecea35f6a1bfe684e3`，加载未提交的候选折叠改动。
- 后端：干净的 `tsz-rust-association-acceptance`，`df925192e9ce54211bbf9d691f1a1e5461a81b5c`；从该 checkout 重新编译，独立复制 binary 后启动，SHA-256 记于证据 manifest。
- Chromium → `http://127.0.0.1:3462` → Vite 同源代理 `/api/v1` → `http://127.0.0.1:8462/api/v1`。
- 任务独占 Postgres `127.0.0.1:55462/association_acceptance`、Redis `127.0.0.1:56462/0`；迁移、账号、测试数据均在隔离容器内。
- `VITE_ADMIN_WORDS_MOCK`、`VITE_ADMIN_PART_OF_SPEECH_MOCK`、`VITE_ADMIN_TTS_MOCK` 均为 `false`；未安装 Playwright route 拦截或 service worker 替代业务请求。登录使用后端开发环境自带的测试短信验证码通道，不代表短信供应商验收。
- fixture 经真实 detection/create/forms impact/forms PUT/meanings PUT API 创建；不是直接往页面塞假响应。浏览器登录、打开例句、点击关联、选择词形词义、确认、完成保存；独立 GET 及 SQL 验证持久化。

## 数据矩阵

| fixture        | 用途                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| job            | 名词小写、名词大写 Job、动词；每个词形都有同拼写 UK/US 两个变体，job 音标分别为 /dʒɒb/ 与 /dʒɑːb/ |
| colour / color | 同词形不同地区拼写，不得折叠成错误目标                                                            |
| book           | common 通用变体，作为例句创建时必须存在的来源词义关联                                             |
| bank           | 两个独立的同拼写词形：通用组与专用组；专用组只允许“河岸专用义”                                    |

例句覆盖 common、英式、美式正文，旧 UK/US 关联、无关联、大小写、动词、不同拼写、无候选、专用词义。此处为结构验收用合成数据，不是词典内容校对。

## 最终检查

| #   | 检查                                                                                 | 结果 |
| --- | ------------------------------------------------------------------------------------ | ---- |
| 1   | common 正文首次选择 job，浏览器 PUT 200，独立 GET 为真实 UK 坐标                     | 通过 |
| 2   | 旧 US 关联只有一行同拼写词形，勾选回显正确，保存不换侧                               | 通过 |
| 3   | 旧 UK 关联勾选回显正确，保存不换侧                                                   | 通过 |
| 4   | 保存后重新打开页面仍只有一行且保持选中                                               | 通过 |
| 5   | Job 大写独立保留，保存到对应 form_id                                                 | 通过 |
| 6   | job 动词独立保留，保存到对应 pos_id/form_id/sense_id                                 | 通过 |
| 7   | 美式正文优先于管理员英式偏好，保存 US                                                | 通过 |
| 8   | 英式正文优先于管理员美式偏好，保存 UK                                                | 通过 |
| 9   | common 正文在管理员美式偏好下新关联保存 US                                           | 通过 |
| 10  | 旧美式关联在英式偏好下仍保留 US                                                      | 通过 |
| 11  | 旧英式关联在美式偏好下仍保留 UK                                                      | 通过 |
| 12  | color 命中美式拼写及真实 US variant_id                                               | 通过 |
| 13  | colour 命中英式拼写及真实 UK variant_id                                              | 通过 |
| 14  | 无匹配候选不能确认；取消后保存不产生虚假关联                                         | 通过 |
| 15  | bank 两个同拼写但不同 form_id 的行不合并，专用词形不显示“银行”义                     | 通过 |
| 16  | 清除、保存、重新打开无旧关联；显式重选按当前偏好建立新关联                           | 通过 |
| 17  | 人工提交不存在的 form_id，被真实 API 400 拒绝；revision/content 不变                 | 通过 |
| 18  | 过期 base_revision 被 409 拒绝，不覆盖现有数据                                       | 通过 |
| 19  | job 草稿发布后，旧关联继续折叠展示、勾选回显和保存                                   | 通过 |
| 20  | 发布后重新选择，持久化有效 target_publication_id 和地区坐标                          | 通过 |
| 21  | 4 个词条的所有地区变体 ID、pronunciations 与 fixture 快照逐项一致                    | 通过 |
| 22  | 12 条例句 GET 的 revision、sentence 内容、annotations 与直接 PostgreSQL 查询逐项相等 | 通过 |

保存链路：`PUT /api/v1/admin/lexicon/sentences/{id}` → 新 GET → `lexicon.shared_sentences` 与 `lexicon.shared_sentence_annotations.target_ref`。发布使用真实 `POST /api/v1/admin/lexicon/entries/{id}/publications`。

## 执行中校正的测试预期

原始执行记录保留失败尝试，最终结果没有将未通过项冒充通过：

- 输入 color 时，真实搜索只返回匹配的 color，不保证同时返回 colour。分开输入两种拼写验收，各自保存正确地区 ID。
- 管理员偏好 US 时，colour 的标签为“原形 colour（英式）”，不应断言无后缀。
- 通用组允许一般适用词义，包含专用词义；限制应检查专用组排除非适用词义，而不是强制两组词义集合互斥。
- 无效关联目标实际返回 400 而非最初脚本假定的 422；已按具体错误内容及存储不变重验。
- 初次发布脚本误用 `/publish` 得到 404；改为既有 `/publications` 后，发布及重新选择全链路通过。

## 证据、清理与边界

证据目录：`/Users/darwish/Dev/tsz-core/delivery-reports/association-spelling-20260918/`。

- `manifest.json`：版本、构建哈希、22 项最终结论及被校正用例映射。
- `results.json`：原始场景执行历史，包含脚本预期错误及后续重验，不只保留成功结果。
- `storage-evidence.json`：12 条例句最终 revision 和完整关联坐标；`fixtures.json`、`sentences.json`：合成 fixture。
- `network.ndjson`：浏览器目标业务请求路径、方法与状态码；独立 Node API 检查不在此浏览器日志中。
- `final-old-us.png`、`job-forms.png`、`source-us-picker.png`、`dedicated-allowed-senses.png`：实际页面截图。

已恢复测试账号偏好为 UK，停止本任务前端/API/浏览器进程，删除本任务独占数据库与 Redis 容器，移除临时登录凭据；没有修改、停止或清空其他任务服务。截图和无凭据的数据证据已归档。

本次真实浏览器入口为独立例句编辑。词条内正文、短语成分入口及跨候选分页未单独进行真实页面验收，仍由已有组件回归覆盖，不能宣称已真实联调。只核对发音数据不变，未调用外部 TTS 或验收录音播放；未验证生产构建代理、部署环境或线上历史数据。未提交、推送或部署。
