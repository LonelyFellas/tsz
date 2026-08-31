# 智能词库多维例句关联测试用例矩阵

## 证据边界（2026-08-22 历史）

- 本节 `M/D/U/R/H-*` 是 2026-08-22 旧模型和 Mock 开发的历史矩阵；当时 `tsz-rust/docs/openapi.json` 没有正式位置关联端点。2026-08-30 当前 OpenAPI 已有 linked 关联只读投影和独立整组替换命令，但仍没有 Pending list/claim 契约；正式实施以文末 `FS-*` 为当前权威矩阵。
- 历史矩阵把“纯前端状态/交互”和“开发 mock 行为”列为可自动化范围；真实 HTTP、数据库唯一约束、跨管理员并发与 publication 引用当时均列为 BLOCKED，不能用 mock 结果替代。
- “例句只保存一次”是数据不变量，不是界面术语；产品界面只称“多维例句”，不出现独立的“共享例句”区块。
- 真实数据源下保持现有 legacy 例句保存行为且不显示新能力警告；只有开发/mock 数据源启用新模型，避免向现有 `additionalProperties: false` 的 meanings 契约发送未知字段。
- 一期只测连续单个英文词，不包含短语成分展开、学习端出题或音频联动。

## 自动化用例

| #    | 层          | 场景                    | 输入/前置                                                        | 预期                                                                             | 优先级 |
| ---- | ----------- | ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| M-01 | 单元        | ASCII 选区转码点范围    | `Center ...` 的 UTF-16 selection                                 | 生成半开区间并回读相同 `surface`                                                 | P0     |
| M-02 | 单元        | emoji 前缀后的选区      | `😀 Center`                                                      | UTF-16 下标正确转换为 Unicode code point，下标不偏移                             | P0     |
| M-03 | 单元        | 同词两次与合法词形字符  | 同句两个 `on`；`it's`、`well-known`                              | 两个位置身份不同；撇号/连字符可作为单词内部字符                                  | P0     |
| M-04 | 单元        | 非法选区                | 空选区、前后空白、多个词、越界                                   | 返回明确校验错误，不产生关联                                                     | P0     |
| M-05 | 单元        | pending 规范化与业务键  | 大小写、首尾空白、弯引号；同句同位置                             | 规范化值稳定；键为 sentence + range + normalized word                            | P0     |
| M-06 | 单元        | pending 去重和位置互斥  | 重复 pending；同位置已有 linked                                  | 重复项不追加并返回 duplicate；同位置不同状态被拒绝                               | P0     |
| M-07 | 单元        | 不同句/不同位置不误去重 | 三个 sentence ID；同句两个 range                                 | 分别保留三条/两条 pending                                                        | P0     |
| M-08 | 单元        | 共享句按 sense 派生     | 一句三个 linked；同 sense 两个位置                               | 根池正文仅一份；每个 sense 只看到同一 sentence ID 一次                           | P0     |
| M-09 | 单元        | 方言预览替换            | 精确 `uk/us`、仅 `common`、无 variant、多位置                    | 精确方言优先、common 回退、缺失保留 surface；从句尾替换不破坏 range              | P0     |
| M-10 | 单元        | 原文修改失效位置        | 英文变化；仅中文/CEFR 变化                                       | 英文变化清除 positioned association 身份并返回待重标建议；中文/CEFR 保留         | P0     |
| M-11 | 单元        | canonical 保存投影      | linked 含只读 POS/headword/variants；pending 含 normalized/audit | 保存输入只含 canonical snake_case 字段，不写回只读投影或方言偏好                 | P0     |
| M-12 | 单元        | 共享例句完成校验        | 空正文/译文、无关联、错位 surface、重叠位置；合法 pending/linked | 无效内容阻断 complete；合法 pending 不阻断发布准备                               | P0     |
| M-13 | 单元        | 私有类型隔离            | admin/mock 本地草案含 `shared_sentences`                         | 不扩展 `@tsz/types` 正式 meanings/save wire；真实请求仍有编译期字段保护          | P0     |
| M-14 | 单元        | 删除词义清理根例句      | 删除关联目标后根例句仅剩 pending 或没有关联                      | 仍有 pending 时保留；关联归零时一并删除，不留下 UI 不可见的非法 orphan           | P0     |
| D-01 | mock 数据源 | resolver 唯一匹配       | 已发布 target，surface 只命中一个 form slot                      | `resolved`，自动返回基本词性与 form slot                                         | P0     |
| D-02 | mock 数据源 | resolver 真实歧义       | 同 POS 两个合法 slot 命中同一 surface                            | `ambiguous` 且列出候选，不静默猜测                                               | P0     |
| D-03 | mock 数据源 | resolver 无匹配/不可用  | surface 不命中，或 target/sense 未发布                           | `unmatched` 或稳定错误，不伪造 linked                                            | P0     |
| D-04 | mock 数据源 | 保存 pending 最终去重   | 同一业务键重复出现在 payload                                     | mock 持久态只保留一条，linked/pending 不共占位置                                 | P0     |
| D-05 | mock 数据源 | 反向查询                | 目标发布词头/词形命中历史 normalized word                        | 返回原句、range、owner revision；不同词不返回                                    | P0     |
| D-06 | mock 数据源 | 认领与冲突              | 选择具体 sense/form；重复/过期认领                               | 原 association ID 原子转 linked；第二次得到 409，不覆盖第一目标                  | P0     |
| D-07 | mock 数据源 | 当前草稿自关联          | 新建 draft 的当前 sense 与已完成词形匹配原句位置                 | 当前 draft 可作为本句归属目标解析；其他候选仍只来自已发布 word                   | P0     |
| U-01 | 集成        | 真实数据源能力门        | `sentenceAssociations=false`                                     | 不显示新能力警告、不发新请求/字段，legacy 多维例句编辑仍可用                     | P0     |
| U-02 | 集成        | 抽屉新增、归属与取消    | mock 能力开启，点击“添加例句”；填写正文但未关联当前词义          | 未建立精确位置关联前不能完成；确认当前词义关联后只新增一份根数据；取消不新增     | P0     |
| U-03 | 集成        | 抽屉编辑与归属          | 点击已有根例句英文区域；修改译文并完成                           | 打开“编辑多维例句”抽屉；原对象被原位更新、不追加副本，且只在目标词义显示         | P0     |
| U-04 | 集成        | 原句选择与候选          | 抽屉内用鼠标/键盘选择单词                                        | 显示 surface/range，并用 `relatedSearchV2` 展示 word-only exact/contains 候选    | P0     |
| U-05 | 集成        | 唯一解析确认            | resolver=`resolved`                                              | 直接显示自动识别的词性/词形，管理员确认后生成 linked，无额外歧义控件             | P0     |
| U-06 | 集成        | 歧义解析                | resolver=`ambiguous`                                             | 只在此状态显示 form slot 选择；未选不能确认 linked                               | P0     |
| U-07 | 集成        | 未匹配与重复提示        | 搜索/解析无匹配，连续两次保存 pending                            | 首次生成 pending；第二次不新增并显示“已存在”提示；可与其他 linked 共存           | P0     |
| U-08 | 集成        | 英文原文影响确认        | 已有 linked + pending 后编辑英文                                 | 显示影响数与旧目标参考；确认后必须补回全部失效位置，少补或删除已补位置仍阻断完成 | P0     |
| U-09 | 集成        | 单份对象与方言预览      | 一句关联多个 sense；管理员偏好切换                               | 抽屉正文只有一份且无例句级方言开关；预览随偏好变化但持久化不增 dialect           | P0     |
| U-10 | 集成        | 历史 pending 认领       | 已发布当前词条命中 pending，选择具体 sense                       | 成功后刷新列表；已认领或 owner revision 409 均提示并刷新，不本地覆盖             | P0     |
| U-11 | 集成        | resolver 竞态           | 快速切换两个目标，先发请求最后返回                               | 只采用最新目标的解析结果，旧响应不覆盖当前选择                                   | P0     |
| U-12 | 集成        | 认领同拍重复点击        | 同一事件循环连续触发两次正式认领                                 | 只发一个 claim 请求，并复用本次操作的幂等键                                      | P0     |
| U-13 | 回归        | 产品术语                | 编辑区与预览页渲染多维例句                                       | 用户界面只显示“多维例句”，不出现内部“共享例句”术语                               | P0     |
| U-14 | 集成        | pending 列表失败重试    | 首次 list pending 失败，管理员点击重试                           | 显示错误且重试后恢复真实列表，不构造本地 pending                                 | P1     |
| U-15 | 集成        | pending 解析分支        | resolver 返回 ambiguous / unmatched                              | 歧义时必须选 form slot 才可认领；无匹配时保持阻断并显示提示                      | P0     |
| U-16 | 集成        | 只读抽屉权限边界        | 已发布词条只读查看现有多维例句                                   | 可查看并关闭抽屉；不查询 pending，不显示编辑、关联、删除或完成动作               | P0     |
| U-17 | 集成        | 英文草稿完成门          | 修改已有例句英文但不点“应用英文原文修改”                         | “完成”保持禁用，不能静默关闭并丢弃刚输入的英文                                   | P0     |
| U-18 | 集成        | 候选 exact-first 与分页 | 短词查询同时有 exact/contains、多页、phrase 与当前词条其他 sense | 只查询 word，加载 exact/contains 全部分页；exact 在前、词条去重但保留其他 sense  | P0     |
| U-19 | 集成        | pending 列表分页        | 第一页返回 `next_cursor`，后续页有待认领项或加载失败             | 显示服务端 `total`；可分页去重；失败时提示并可按真实状态重试                     | P0     |
| U-20 | 集成        | pending 分页刷新竞态    | 加载下一页期间完成一条认领并触发首屏刷新                         | 淘汰旧分页响应并重置 loading；新首屏仍可继续按新游标分页                         | P0     |
| R-01 | 回归        | legacy 例句流程与升级   | 未启用新能力或存量 `WordSentenceV2`                              | 未启用时原流程不变；启用后从英文区域进入抽屉并无损迁移正文、译文和节点 ID        | P0     |
| R-02 | E2E         | 重复项当前页详情弹窗    | 检测到重复或 surface 来源，点击现有词条                          | 当前页 Modal 展示详情；关闭后 URL、输入和检测结果不变，不产生 popup              | P0     |

## 联调与手测清单

| #    | 层              | 场景                                         | 前置                                            | 预期                                                    | 状态                                   |
| ---- | --------------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| H-01 | 真实 HTTP       | meanings additive wire + resolver/list/claim | Rust OpenAPI 合入正式字段和端点                 | method/path/body/header 与 OpenAPI 精确一致             | BLOCKED：当前契约不存在                |
| H-02 | 真实 PostgreSQL | pending partial unique                       | 后端迁移与真实库                                | 并发保存同一业务键最终仅一行                            | BLOCKED：当前表/约束不存在             |
| H-03 | 真实并发        | 双管理员 claim                               | 两个已登录管理员与同一 pending                  | 仅一个成功，另一个稳定 409                              | BLOCKED：当前端点不存在                |
| H-04 | 已登录浏览器    | 完整 `Center the picture on the wall.` 流程  | 新契约后端 + 已发布 center/picture/wall/on 数据 | 三个 linked、一个 pending、重复仍一条、发布 on 后可认领 | BLOCKED：等待真实后端                  |
| H-05 | 已登录浏览器    | 英美偏好预览                                 | 新契约返回 form variants                        | uk/us 各验一次，payload 无 association dialect          | BLOCKED：等待 resolver/read projection |
| H-06 | 范围核对        | 排除项                                       | 当前一期页面                                    | 无短语成分展开、学习端出题、音频联动                    | PASS：新编辑器与模型均未引入这些能力   |

## 执行顺序

1. 先实现并跑纯逻辑 `M-*`，建立位置、去重、共享与原文变更的不变量。
2. 再实现 mock 数据源 `D-*`，让 resolver/pending/claim 有可重复状态机证据。
3. 最后接入 admin 组件 `U-*`，并运行 `R-01` 的 legacy focused 回归。
4. 完成后运行 admin focused tests、`pnpm typecheck`、`pnpm lint`；不运行或不具备真实条件的行保持 BLOCKED，不改写为 PASS。

## 2026-08-29 V3 前端 Mock 验收切片

以下 `VM-*` 只证明抽屉内存交互与前端视觉原型，不替代上表任何真实 resolver、pending、claim、HTTP 或数据库证据。写测试代码前先以本矩阵锁定行为。

| #      | 层   | 场景                     | 输入/前置                                            | 预期                                                                                      | 优先级 |
| ------ | ---- | ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| VM-01  | 集成 | 打开抽屉不预写           | V3 sense 无例句，点击“添加例句”                      | 显示前端 Mock 抽屉与代表性样例；父级 meanings 完整值和例句数量不变                        | P0     |
| VM-02  | 集成 | 取消/关闭不修改父级      | 打开后编辑英文、CEFR，再取消或点关闭                 | 抽屉关闭；父级 `onChange` 数据不变；重新打开恢复代表性样例                                | P0     |
| VM-03  | 组件 | 英文、CEFR 与匹配过期    | 修改英文并切换 CEFR                                  | 输入值仅在抽屉变化；可见状态提示需要重新模拟匹配                                          | P0     |
| VM-04  | 组件 | 句中标记与局部定位       | 点击已标记词块，再点“模拟匹配”                       | 词块有稳定可访问名称/选中态；显示对应定位信息与明确 Mock 匹配反馈                         | P0     |
| VM-04A | 组件 | 自定义连续词语           | 点击“标记词语”，依次选择首词和尾词，再确认“组为词语” | 连续范围预览；少于两个词不能确认；确认后短语卡片与范围仅在抽屉内更新                      | P0     |
| VM-04B | 组件 | 自定义短语 Pending 词义  | 确认自定义短语后编辑预填词义                         | 显示一条明确标记 Pending 的预填词义；输入仅在抽屉内更新，关闭后不进入父级 meanings        | P0     |
| VM-05  | 组件 | 关联分组信息层级         | 打开代表性完成态                                     | 同时存在单词、短语 Mock 卡片；可读到目标、具体词义、词形类型和 BrE/AmE 状态               | P0     |
| VM-06  | 组件 | 模拟生成分层译文         | 清空或修改译文后点击“模拟生成”                       | 形成初阶/中阶/高阶三层确定性文本；提示未调用 AI、未写业务数据                             | P0     |
| VM-07  | 组件 | 译文新增、编辑、删除     | 新增一条译文、修改内容、删除一条                     | 列表与输入按本地操作更新；空列表仍保留“添加译文”入口                                      | P0     |
| VM-08  | 组件 | 保存预览边界             | 点击“保存预览”                                       | 抽屉保持打开，显示“仅保留在抽屉内存/未写入词条”，不触发关闭或外部回调                     | P0     |
| VM-09  | 集成 | 主页面最后一条删除       | sense 仅一条例句，点击删除                           | 例句数组为空；显示“暂无多维例句”；“添加例句”仍可见可用                                    | P0     |
| VM-10  | 回归 | 正式契约隔离             | 静态检查 import/props 与父组件调用                   | Mock 不导入 data source/API，不接受 meanings `value/onChange/onSave`，不扩展 V3 wire      | P0     |
| VM-11  | 手测 | 桌面高密度视觉与键盘可达 | 内置浏览器打开本地 V3 meanings 并展开抽屉            | 约 960–980px 宽；四段层级清楚、不是连续表格；品牌蓝/圆角与 admin 一致；Tab 可遍历主要控件 | P0     |
| VM-12  | 手测 | 代表性完成态停留         | 模拟匹配、生成三级译文、选中 `center`，点击保存预览  | 页面不保存/发布；浏览器停在可评审完成态，边界提示和关联详情同时可见                       | P0     |

### 本切片执行顺序

1. 先写独立组件测试的 VM-03～VM-08，再实现本地状态与 UI。
2. 接入父组件后跑 VM-01、VM-02、VM-09，并用静态检查核对 VM-10。
3. 运行 focused Vitest、admin typecheck、lint、Prettier、`git diff --check`。
4. 最后在 Codex 内置浏览器完成 VM-11、VM-12；不点击任何真实保存、完成、发布操作。

## 2026-08-30 正式前后端能力测试矩阵

### 证据规则

- 本节全部为联合评审后的实施门，当前状态均为 `PLANNED`；Mock 的 `VM-*` 通过不能替代这里的生产证据。
- `FS-C-*` 必须由当前 `tsz-rust/docs/openapi.json` 与前端生成 snapshot 对账；不得手改 snapshot 伪造通过。
- `FS-B-*` 中数据库唯一、事务、行锁和并发必须在真实 PostgreSQL 执行，纯函数/mock 不算通过。
- `FS-F-*` 测前端状态和请求边界；新例句两阶段保存必须分别覆盖第一步失败和第二步失败。
- `FS-E-*` 使用 Codex 内置浏览器、本地真实 admin/backend 和专用测试词条；不得对现有业务词条做破坏性写入。

### 契约与类型

| #       | 层         | 场景                     | 输入/前置                                              | 预期                                                           | 优先级 | 状态                         |
| ------- | ---------- | ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------- | ------ | ---------------------------- |
| FS-C-01 | OpenAPI    | 现有 linked payload 兼容 | 当前 `source_range + target_word_id + target_sense_id` | 扩展后继续合法，method/path/revision/幂等键不变                | P0     | PASS：HTTP/OpenAPI           |
| FS-C-02 | OpenAPI    | Pending target shape     | phrase headword + optional gloss，无 target UUID       | linked/pending 严格互斥；半套字段 422                          | P0     | PASS：unit/HTTP/DB           |
| FS-C-03 | OpenAPI    | 关联响应投影             | linked 与 pending 混合列表                             | `state` 正确；pending 不伪造 target/form/POS                   | P0     | PASS：HTTP/runtime decoder   |
| FS-C-04 | 类型       | meanings 写入隔离        | `WordSentenceWritableV3`                               | 继续没有 `associations` / `associations_state`                 | P0     | PASS：typecheck/decoder      |
| FS-C-05 | OpenAPI    | Pending list/claim       | cursor、claim body、Idempotency-Key                    | schema、状态码、Problem Details 与设计一致                     | P0     | PASS：OpenAPI/HTTP           |
| FS-C-06 | api-client | 请求封装                 | replace/list/claim                                     | method/path/query/header/body 精确匹配 OpenAPI                 | P0     | PASS：380 tests              |
| FS-C-07 | OpenAPI    | 分层中文译文契约         | `zh_translations[]` + band + RichText                  | band 闭合且唯一、总数 1..3；writable 不以单值 `zh_text` 为权威 | P0     | PASS：OpenAPI/runtime schema |

### 后端纯逻辑、数据库与服务

| #       | 层        | 场景                         | 输入/前置                                  | 预期                                                                 | 优先级 | 状态                              |
| ------- | --------- | ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------- | ------ | --------------------------------- |
| FS-B-01 | 单元      | Unicode 连续短语 range       | ASCII、emoji 前缀、组合音标、撇号/连字符   | 码点半开区间与 surface 一致，不按 UTF-16 偏移                        | P0     | PASS：20 unit tests               |
| FS-B-02 | 单元      | Pending 目标形状             | linked、pending、两者混合、两者皆空        | 仅两种完整形状通过，稳定 issue field/code                            | P0     | PASS：unit/HTTP                   |
| FS-B-03 | 单元      | Pending 规范化               | 大小写、首尾空白、弯引号、真连字符         | 服务端生成稳定 normalized headword，前端值不权威                     | P0     | PASS：unit/HTTP                   |
| FS-B-04 | 单元/DB   | 范围冲突                     | 同方言重叠、同起点、不同方言、不同句       | 同方言重叠拒绝；不同方言/句不误伤                                    | P0     | PASS：HTTP/PostgreSQL             |
| FS-B-05 | DB        | migration backfill           | 全部存量 linked 行                         | `state=linked`，target/snapshot/form 值与计数不变                    | P0     | PASS：linked regression           |
| FS-B-06 | DB        | linked/pending CHECK         | 直接插入非法半套行                         | 数据库最终拒绝，不依赖 service                                       | P0     | PASS：PostgreSQL CHECK            |
| FS-B-07 | DB        | Pending 反向索引             | 多 entry/句/位置同 normalized phrase       | 查询只返回 active 命中项，分页稳定无重复                             | P0     | PASS：cursor/stale scan HTTP      |
| FS-B-08 | 服务      | 整组替换原子性               | 列表中一条非法、一条合法                   | 整组不写；旧关联完整保留                                             | P0     | PASS：HTTP/PostgreSQL             |
| FS-B-09 | 服务      | 自动 resolver 与人工 Pending | 同句发布重算且有人工 Pending               | resolver 不删除、不覆盖、不转化 Pending                              | P0     | PASS：resolver version regression |
| FS-B-10 | 服务      | 正文修改失效                 | linked + pending 后修改英文 text           | 受影响位置失效/清理并要求重标，不静默平移                            | P0     | PASS：publish regression          |
| FS-B-11 | 服务      | claim 成功                   | active Pending + 已发布目标 sense          | 原 association ID/range 原地转 linked，owner lifecycle revision 增加 | P0     | PASS：HTTP/PostgreSQL             |
| FS-B-12 | 并发      | 双管理员 claim               | 两事务认领同一 Pending 到不同 sense        | 仅一个成功；另一方稳定 409，不覆盖                                   | P0     | PASS：concurrent HTTP             |
| FS-B-13 | 服务      | claim 幂等                   | 同 key 同 payload重放、同 key 不同 payload | 首次结果可重放；不同 payload 冲突                                    | P0     | PASS：HTTP replay                 |
| FS-B-14 | lifecycle | 关联独立投影边界             | 来源 entry 同时有 linked/pending           | 两者均不冻结进 publication snapshot，当前读取按 lifecycle 投影       | P0     | PASS：现有架构回归                |
| FS-B-15 | lifecycle | claim 后当前读取             | 已发布来源 entry 完成 claim                | 历史 publication 不变；当前读取立即 linked，无 meanings 待发布       | P0     | PASS：HTTP/PostgreSQL             |
| FS-B-16 | 回滚      | capability 关闭              | 数据库已有 pending 行                      | 禁止新写；旧 linked 读写正常；pending 数据不丢                       | P0     | PASS：独立默认关闭 flag + HTTP    |
| FS-B-17 | migration | 单条译文回填                 | A/B/C sentence level + 既有 zh_text ID     | ID/内容不变；分别落 a1_a2/b1_b2/c1_c2                                | P0     | PASS：migration/unit/HTTP         |
| FS-B-18 | DB/服务   | 三档约束                     | 重复 band、4 条、空 RichText、合法 1–3 条  | 非法最终拒绝；合法原子保存且顺序确定                                 | P0     | PASS：unit/DB/HTTP                |
| FS-B-19 | HTTP/回归 | 新建词条默认例句重复保存     | 保存词形后保存默认例句，再完成进入预览     | 相同节点身份可幂等复用；不得触发 node ownership invariant 500        | P0     | PASS：HTTP 红绿测试/browser       |

### 前端组件与集成

| #       | 层       | 场景                    | 输入/前置                                                  | 预期                                                                              | 优先级 | 状态                               |
| ------- | -------- | ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| FS-F-01 | 集成     | 打开生产抽屉            | 服务端 linked/pending/unresolved 投影                      | 不加载 Mock fixture；完整还原服务端状态                                           | P0     | PASS：component/page tests         |
| FS-F-02 | 集成     | 取消与关闭              | 编辑 sentence/范围/pending gloss 后关闭                    | 不发 meanings/association/claim 请求，父级不变                                    | P0     | PASS：component/page tests         |
| FS-F-03 | 集成     | 已有目标正式关联        | related-search 唯一/多个 sense                             | 必须选择具体 sense；保存 linked 完整列表                                          | P0     | PASS：component test               |
| FS-F-04 | 集成     | 不存在单词/短语 Pending | `rareword` 或 `center of the wall`，预填词义后在卡片内修改 | 单词为 word、连续多词为 phrase；payload 使用最终编辑值且不带 target UUID/只读投影 | P0     | PASS：component/wizard tests       |
| FS-F-05 | 集成     | 新例句两阶段成功        | meanings save → association replace                        | 使用第一步新 revision；两步成功后才关闭并刷新                                     | P0     | PASS：wizard test                  |
| FS-F-06 | 集成     | 新例句第一步失败        | meanings save 4xx/5xx                                      | 不发 association 请求；保留完整抽屉草稿                                           | P0     | PLANNED                            |
| FS-F-07 | 集成     | 新例句第二步失败        | sentence 已保存，association 4xx/5xx                       | 保持抽屉并提示 unresolved 可恢复状态；不伪装回滚                                  | P0     | PASS：drawer failure retention     |
| FS-F-08 | 集成     | revision/生命周期冲突   | replace/claim 返回 409                                     | 刷新真实 entry，旧本地 base revision 不重放                                       | P0     | PLANNED                            |
| FS-F-09 | 集成     | Pending 创建目标跳转    | 点击“创建短语”                                             | navigation state 只预填 headword/gloss/return_to，不改词条 wire                   | P0     | PASS：parser/Drawer/create page    |
| FS-F-10 | 集成     | 取消目标创建            | 从创建页返回未完成                                         | 原 Pending 仍在；不产生已绑定假状态                                               | P0     | PASS：navigation-only boundary     |
| FS-F-11 | 集成     | Pending list 与 claim   | 分页、选择具体 sense、claim 成功/冲突                      | 列表去重刷新；成功转 linked，冲突以服务端为准                                     | P0     | PASS：panel/API tests              |
| FS-F-12 | 集成     | 英文修改门禁            | 已有位置后改英文                                           | 旧位置标为失效；完成前必须全部重标/删除                                           | P0     | PASS：drawer dialect test          |
| FS-F-13 | 集成     | 方言预览                | uk/us/common form 与缺失 variant                           | 按用户偏好展示；缺失保留 surface；payload 无偏好字段                              | P0     | PASS：drawer dialect test          |
| FS-F-14 | 可访问性 | 键盘完成范围与 Pending  | Tab/Enter、首尾词、gloss 编辑、保存/取消                   | 焦点顺序可见，控件有稳定名称，错误可定位                                          | P0     | PLANNED                            |
| FS-F-15 | UI 回归  | 基本词性移除图标        | 对比词形页与 meanings 页 POS Tab                           | 同为 MinusCircle、danger/text/small，显示边界和 aria 一致                         | P0     | PASS：step component test          |
| FS-F-16 | 可访问性 | 三个区块整栏折叠        | 鼠标、Enter、Space、右侧嵌套按钮                           | 多维释义/多维例句/关联词均单次切换，嵌套按钮不双触发                              | P0     | PASS：step component/browser       |
| FS-F-17 | 集成     | 三档中文译文            | 初=C1/C2、中=B1/B2、高=A1/A2；从单条新增到三条             | 仅显示缺失档位；最多三条；编辑、删除、重加与刷新无损                              | P0     | PASS：drawer/summary/history tests |
| FS-F-18 | UI 回归  | 外层多维例句只读摘要    | 等级、英文、汉语译文与编辑抽屉入口                         | 外层不可直接编辑；译文前缀只显示“初/中/高”，统一进抽屉修改                        | P0     | PASS：step component/browser       |
| FS-F-19 | 集成     | 最后一条译文保护        | 只剩一档时点击删除                                         | 前端阻止且提示至少保留一条；不触发父级 onChange/save                              | P0     | PASS：drawer component test        |
| FS-F-20 | UI 回归  | 抽屉译文层级标签精简    | 抽屉展示初阶/中阶/高阶译文                                 | 每行只显示完整层级名，不重复显示“初/中/高”徽标或 CEFR 括号                        | P0     | PASS：drawer test/browser          |
| FS-F-21 | UI 回归  | 抽屉译文轻量列表        | 同时展示 1–3 档译文与新增入口                              | 区块内不再嵌套卡片；层级、输入、删除单行对齐，分隔清晰且窄屏可读                  | P1     | PASS：drawer test/browser          |
| FS-F-22 | UI 回归  | 关联状态产品化文案      | 抽屉、预览、待认领列表、Mock 原型                          | 用户界面与可访问名称不出现 Linked/Pending；分别显示已关联、待关联或待认领         | P0     | PASS：72 tests/browser             |

### 回归与能力开关

| #       | 层   | 场景                 | 输入/前置                             | 预期                                                      | 优先级 | 状态                                |
| ------- | ---- | -------------------- | ------------------------------------- | --------------------------------------------------------- | ------ | ----------------------------------- |
| FS-R-01 | 回归 | V3 meanings 保存     | 读到只读 associations 后再保存草稿    | 写入 DTO 剥离只读投影，已有独立关联不被删除               | P0     | PASS：decoder/HTTP                  |
| FS-R-02 | 回归 | 自动关联             | noun/verb/adjective/adverb + stopword | 现有 resolver 结果与词性闸不变                            | P0     | PASS：20 unit + consumer            |
| FS-R-03 | 回归 | 人工 linked 整组修正 | 当前生产 endpoint 旧 payload          | 行为、revision、幂等键和错误码兼容                        | P0     | PASS：5 HTTP tests                  |
| FS-R-04 | 回归 | 当前投影与发布历史   | linked/pending/unresolved 混合        | 当前 lifecycle 投影与不可变 publication snapshot 边界正确 | P0     | PASS：lifecycle/preview tests       |
| FS-R-05 | 回归 | capability 关闭      | 后端写开关关闭、旧前端                | 现有 linked 读取/修正和 meanings 流程可用                 | P0     | PASS：optional wire + UI gate       |
| FS-R-06 | 回归 | Mock 隔离            | 生产组件启用/关闭                     | Mock 类型和 fixture 不进入请求或 production state         | P0     | PASS：separate production component |
| FS-R-07 | 回归 | 单值兼容别名         | 新数组含 1–3 档、旧客户端读取         | 服务端确定性派生 zh_text；新 writable 以上行数组为权威    | P0     | PASS：unit/HTTP/decoder             |

### 真实联调与浏览器验收

| #       | 层                | 场景               | 前置                                | 预期                                                    | 状态                        |
| ------- | ----------------- | ------------------ | ----------------------------------- | ------------------------------------------------------- | --------------------------- |
| FS-E-01 | HTTP + PostgreSQL | Pending 保存与刷新 | 本地真实 V3 entry/sentence          | PUT 200，刷新后同 association ID/range/gloss            | PASS：sqlx HTTP integration |
| FS-E-02 | HTTP + PostgreSQL | 重复/重叠/冲突     | 真实 revision、重复位置、重叠范围   | DB/service 最终拒绝，Problem code 稳定                  | PASS：sqlx HTTP integration |
| FS-E-03 | 双会话            | 并发 claim         | 两个管理员、同一 Pending            | 仅一个成功，另一方 409 后刷新真实状态                   | PASS：tokio concurrent HTTP |
| FS-E-04 | 内置浏览器        | 新例句完整流程     | 专用测试词条、能力开关开启          | 新增 → 标记短语 → Pending gloss → 两阶段保存 → 刷新一致 | BLOCKED：等待评审与实现     |
| FS-E-05 | 内置浏览器        | 创建目标后 claim   | Pending + 新建 phrase 完成          | 返回来源页，人工选择具体 sense 后转 linked              | BLOCKED：等待评审与实现     |
| FS-E-06 | 内置浏览器        | 正文修改失效       | linked/pending 均存在               | 修改英文后旧 range 不再有效，必须重标                   | BLOCKED：等待评审与实现     |
| FS-E-07 | lifecycle         | 发布边界           | linked + pending + 历史 publication | 历史不变；claim 后当前投影 linked 且只推进 lifecycle    | PASS：HTTP/lifecycle tests  |
| FS-E-08 | 内置浏览器        | 新发布目标自动查询 | 发布 location 与 central location   | 原例句选择单词/连续短语后返回各自已发布具体词义         | PASS：本地真实发布与查询    |

### 实施顺序与硬门

1. 联合评审先确认 Pending publication、显式创建/claim、两阶段保存和范围不重叠四项产品决策。
2. 评审通过后使用 `test` skill，把 `FS-C-*`、`FS-B-*` 先落成红测试和迁移约束，再实现后端。
3. 后端 OpenAPI/HTTP/DB 全绿且 capability 默认关闭后，前端同步契约并实现 `FS-F-*`。
4. `FS-C/B/F/R` 全绿后才进行 `FS-E-*` 真实联调；Mock 通过不解锁发布。
5. 任何 P0 失败都停止进入下一阶段；不得降覆盖率、注释测试、绕过 hook 或把 BLOCKED 改写成 PASS。

## 2026-08-30 句内一键发现与草稿候选测试矩阵

以下 `AD-*` 在用户批准 requirements/design 后进入 `test` skill，当前均为实现前 `PLANNED`。

| #       | 层         | 场景                     | 输入/前置                                             | 预期                                                       | 优先级 | 状态                             |
| ------- | ---------- | ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- | ------ | -------------------------------- |
| AD-C-01 | OpenAPI    | 批量解析契约             | all_published_targets / selected_segments             | 模式、scope、segments、base candidate/status 严格闭合      | P0     | PASS：Rust/TS 契约               |
| AD-C-02 | 契约       | 现有 GET 兼容            | related-search 单 q 客户端                            | method/path/query/response 完全不变                        | P0     | PLANNED                          |
| AD-C-03 | 单元       | 内部 core 与 HTTP 解耦   | Rust core 输入/输出 + 例句 adapter                    | core 无 association/HTTP DTO；adapter 生成严格例句响应     | P0     | PASS：16 unit                    |
| AD-C-04 | OpenAPI    | V3 segments 单权威       | association_schema_version=3                          | V3 始终 source_segments[1..20]；V2 才使用 source_range     | P0     | PASS：contract/HTTP              |
| AD-C-05 | OpenAPI    | Resolve tagged union     | all_published_targets / selected_segments             | oneOf+discriminator；非法 mode/scope/optional 组合不可构造 | P0     | PASS：contract                   |
| AD-C-06 | 契约       | 完整性与分页             | complete / overloaded、多候选/多sense                 | true total/cursor 与过载严格区分，cursor 绑定 generation   | P0     | PARTIAL：无cursor                |
| AD-C-07 | OpenAPI    | 短语词形成分契约         | common / uk / us phrase variant                       | 每个 phrase_variant 独立 component_usages 严格数组         | P0     | PASS：Rust/TS/OpenAPI            |
| AD-B-01 | 纯逻辑     | 正文 token 与位置        | 1、2、7、100 token                                    | token/码点半开区间正确，不生成任意子序列组合               | P0     | PASS：unit                       |
| AD-B-02 | 纯逻辑     | Unicode 与标点           | emoji、组合音标、撇号、连字符、`.?!;:`                | 不按 UTF-16；硬标点不跨越；词内符号保留                    | P0     | PASS：unit                       |
| AD-B-03 | 纯逻辑     | 重复 surface 去重        | 同一句两次 location                                   | 数据库 key 一份，响应恢复两个独立 range                    | P0     | PASS：unit/HTTP                  |
| AD-B-04 | HTTP/DB    | 已发布全量匹配           | word/连续 phrase/可分离 phrase、V2/V3                 | 每个当前 publication 候选与 sense 均返回且稳定排序         | P0     | PARTIAL：缺pattern权威           |
| AD-B-05 | HTTP/DB    | 发布生命周期新鲜度       | publish/activate/archive/restore 后立即扫描           | 只反映当前 publication，归档目标消失，无旧缓存             | P0     | PLANNED                          |
| AD-B-06 | HTTP/DB    | 单次内部 discovery 调用  | 40 token + 100 万 entry/1000 万 alias                 | 一个 HTTP；无前端逐 token/短语/组合查询，SQL 固定≤4        | P0     | PLANNED                          |
| AD-B-07 | HTTP/DB    | 手动草稿多段查询         | selected_segments + published_and_draft               | 返回已发布/未归档草稿分组；草稿 linkability=pending_only   | P0     | PASS：service/UI                 |
| AD-B-08 | HTTP/DB    | 已发布且有草稿修改       | 同 entry current publication + dirty draft            | 正式候选不重复，标记 has_unpublished_changes               | P1     | PLANNED                          |
| AD-B-09 | HTTP       | 上限与截断               | 101 token；单词 range >20 candidates                  | 101 返回稳定 422；候选带 total/cursor，不伪称全部          | P0     | PLANNED                          |
| AD-B-10 | 性能       | 百万词条识别基准         | 100 万 entry、1000 万 form alias、40 token            | server P95 ≤700ms、total P95 ≤1s，记录候选 C/query count   | P1     | PLANNED                          |
| AD-B-11 | DB/迁移    | 存量 range 回填 segment  | linked/pending/不同方言存量                           | 每条原 range 原 ID 回填 ordinal=0，内容与计数不变          | P0     | PASS：migration                  |
| AD-B-12 | DB/服务    | 多段交集约束             | turn...off + light；共享/相交 segment                 | 中间 light 可关联；真实 segment 相交最终拒绝               | P0     | PASS：unit/service               |
| AD-B-13 | HTTP       | 多段规范化与去重         | 乱序、重叠、相邻、错 surface、重复提交                | 乱序/重叠/错位 422；相邻合并；重复不制造第二条关联         | P0     | PLANNED                          |
| AD-B-14 | 纯逻辑/DB  | 连续短语 pattern         | central location 连续/分散出现                        | 连续命中；普通 contiguous pattern 分散时不误命中           | P0     | PASS：Aho unit                   |
| AD-B-15 | 纯逻辑/DB  | 可分离短语 pattern       | turn off separable/contiguous 配置                    | separable 命中 turn...off；未标 separable 时只连续命中     | P0     | DEFERRED：独立 authoring PR      |
| AD-B-16 | 性能/安全  | 高频锚点候选上限         | take/get/set 大量短语                                 | 双锚点/稀有 token 收敛；超限明确截断，不退化为组合穷举     | P1     | PLANNED                          |
| AD-B-17 | HTTP/DB    | 词形识别归并原形         | locations、went、英美变体                             | 分别解析到 location、go、对应方言原形并保留 match 证据     | P0     | PLANNED                          |
| AD-B-18 | HTTP/DB    | 多 POS/多原形歧义        | 同 surface 跨 POS/group/base                          | 全部 BaseFormCandidate 返回，resolver_state=ambiguous      | P0     | PLANNED                          |
| AD-B-19 | HTTP/DB    | 多词形命中同一原形       | 同句多个 alias 指向一个 base                          | 按 entry/publication/POS/base 去重，matches[] 全量稳定     | P0     | PLANNED                          |
| AD-B-20 | lifecycle  | 发布映射权威             | current publication + 未发布词形修改                  | 自动只用已发布 alias→base；草稿变化只在手动组可见          | P0     | PLANNED                          |
| AD-B-21 | 单元       | FST 一对多 postings      | 同 key 多 entry/POS/base、mmap 重载                   | offset/postings 无损；歧义不被覆盖，排序确定               | P0     | PARTIAL：内存FST                 |
| AD-B-22 | 单元       | Aho 去重/边界/重叠       | 重复 pattern、cat/concatenate、长短嵌套               | 一个 PatternID→postings；无子串假阳性；重叠全返回          | P0     | PASS：unit                       |
| AD-B-23 | 单元       | 可分离状态机             | slot、min/max gap、硬标点、普通 phrase                | 仅登记 separable 的 pattern 跨段命中，segments 精确        | P0     | PASS：unit                       |
| AD-B-24 | 集成       | generation 强水位        | 并发提交反序、base+delta+tombstone、坏 manifest       | 不漏事务；完整快照原子切换；损坏/缺口明确503               | P0     | PARTIAL：事务水位                |
| AD-B-25 | 性能       | 百万级索引构建与查询     | 100 万 entry/1000 万 alias、40/100 token              | 构建≤30m、AC≤512MB、热切换PSS≤4GB、P95达门                 | P1     | PLANNED                          |
| AD-B-26 | 兼容/HTTP  | 旧 writer 多段保护       | 句中已有 segmented，提交 V2 单 range replace          | 409 upgrade_required；父/segment 全部不变                  | P0     | PASS：HTTP                       |
| AD-B-27 | DB/迁移    | segment 父子最终约束     | 错 owner/方言、ordinal gap、21段、交集                | FK/CHECK/排斥或锁检查最终拒绝；23P01映射422                | P0     | PARTIAL：锁校验                  |
| AD-B-28 | migration  | guard→dual-write→cutover | 旧 writer 新增/更新/删除、存量回填                    | segment0与legacy对账；多段后down显式失败                   | P0     | PASS：schema/HTTP                |
| AD-B-29 | generation | snapshot+delta 合并      | 新增/修改/归档/恢复、重复事件、outbox gap             | tombstone先应用、无漏数；gap/hash坏明确503                 | P0     | PLANNED                          |
| AD-B-30 | 单元       | FST/AC artifact 安全     | checksum坏、offset越界、原地修改、版本不符            | 拒载且保留旧Arc；不读取损坏mmap/postings                   | P0     | PLANNED                          |
| AD-B-31 | 单元       | slot 语义边界            | turn quickly off / turn the light off                 | 首期只验证gap/boundary，不声称识别语法宾语                 | P0     | PASS：unit                       |
| AD-B-32 | 服务       | 正文修改失效             | linked+pending多段后改英文                            | 同事务删除对应scan/parent/segments；CEFR/中文不影响        | P0     | PLANNED                          |
| AD-B-33 | 并发       | claim owner锁与UUID竞态  | replace vs claim、删除/跨owner UUID重用               | owner lookup同事务；锁后复验entry_id；无错owner revision   | P0     | PASS：service                    |
| AD-B-34 | 服务       | Pending多段全链路        | reverse list/claim、任一segment漂移                   | ordinal聚合完整；headword重算；漂移fail closed             | P0     | PASS：HTTP/service               |
| AD-B-35 | DB/迁移    | 方言词形成分父子约束     | common、BrE、AmE 词形及不同 component                 | 组件只归属一个 phrase_variant；父删级联；跨词形不串数据    | P0     | PASS：migration/HTTP             |
| AD-B-36 | HTTP/服务  | 成分用词完整发布快照     | 唯一词义、无匹配、多词义、历史激活                    | 已解析保存身份/词形/释义；未解析保留词面；历史逐版恢复     | P0     | PARTIAL：未接association variant |
| AD-F-01 | 组件       | 一键发现只读             | 点击按钮后等待成功/失败                               | 不触发 onChange/save/association PUT；一个请求             | P0     | PASS：component                  |
| AD-F-02 | 组件       | 命中信息层级             | location + central location + turn...off              | 摘要区分单词/短语，只渲染命中卡片，sense 按需展开          | P0     | PLANNED                          |
| AD-F-03 | 组件       | 唯一/歧义候选            | 单 sense、多 entry、多 sense                          | 唯一候选自动进本次关联；歧义候选必须人工选择               | P0     | PASS：component                  |
| AD-F-04 | 组件       | 任意多 token 选择        | turn the light off 选择 turn/off                      | 预览 turn … off，查询 turn off，payload 保留两个 segment   | P0     | PASS：component                  |
| AD-F-05 | 组件       | 手动草稿候选             | published + draft + published-with-draft              | 分组、状态和动作正确；草稿只能查看/转 Pending              | P0     | PASS：component                  |
| AD-F-06 | 组件       | 正文/方言变化失效        | 请求中修改英文或方言                                  | abort/忽略旧响应，sentence_hash 不符不应用                 | P0     | PASS：component                  |
| AD-F-07 | 可访问性   | 键盘扫描与多段选择       | Tab/Enter/Space、增删 token、重叠/live 状态           | 焦点可见、aria-pressed/live、冲突原因和中文名称完整        | P0     | PASS：component                  |
| AD-F-08 | 组件       | 词形到原形证据           | locations / went 命中                                 | 卡片展示命中词形→原形→具体词义，不产生 alias 重复卡片      | P0     | PLANNED                          |
| AD-F-09 | 组件       | 自动/手动模式状态机      | 切换模式、逐token增删、点击查询                       | 切token不请求；显式查询一次；本次关联始终保留              | P0     | PASS：component                  |
| AD-F-10 | 组件       | 重叠位置可达             | location/central location、turn/turn...off            | 独立位置按钮均可鼠标/键盘打开，不靠下划线猜测              | P0     | PASS：component                  |
| AD-F-11 | 组件       | 按位置归并原形           | 同一base在两个位置、同位置多个alias                   | 两位置分开；只在同source fingerprint内合并matches          | P0     | PLANNED                          |
| AD-F-12 | 组件       | sense摘要与分页          | 候选/词义多页、generation变化、旧cursor               | 各位置独立加载/去重；旧cursor不混入                        | P0     | PLANNED                          |
| AD-F-13 | 组件       | 手动无命中/草稿          | 多段无候选、草稿多词义/未完成                         | segments保留可转Pending；草稿UUID不进入正式payload         | P0     | PASS：component                  |
| AD-F-14 | 组件       | 完整请求失效防线         | A慢于B、方言/模式/segments变化、关闭抽屉              | abort+requestId+hash/fingerprint对账，旧响应不生效         | P0     | PASS：component                  |
| AD-F-15 | 组件       | 最长短语自动加入         | central location + location 均唯一                    | 只自动加入短语；location 标成被覆盖，不出现重叠报错        | P0     | PASS：component                  |
| AD-F-16 | 组件       | 成分用词展示             | central location / turn...off                         | 分别展示 central+location / turn+off；不生成独立关联       | P0     | PASS：component                  |
| AD-F-17 | 组件       | 方言词形成分独立编辑     | common 拆 BrE/AmE；两侧增删/改词面                    | 两侧不同 component ID、互不串改；有配置时禁止静默合并      | P0     | PASS：component                  |
| AD-F-18 | 组件/API   | 成分手动选择已发布词义   | 已发布唯一/多词义、无命中、请求失败                   | 可选择完整目标快照；无命中/失败保留待选择且不丢输入        | P0     | PASS：component                  |
| AD-R-01 | 回归       | 现有手动 published 查询  | 选择 location / central location                      | 当前已发布候选、保存 payload 和关联规则不变                | P0     | PLANNED                          |
| AD-R-02 | 回归       | meanings 写入隔离        | 扫描、清空、关闭抽屉                                  | meanings/association wire 无 discovery 字段                | P0     | PLANNED                          |
| AD-R-03 | 回归       | 自动/手动位置一致        | 自动与手动都命中 turn/off                             | 两者生成相同规范 segments；自动只写抽屉内存，不直接 PUT    | P0     | PLANNED                          |
| AD-R-04 | 单元       | 第二内部调用方复用       | 两个 service harness 调用同一 core                    | 无需复用 HTTP DTO，命中事实与排序一致                      | P0     | PLANNED                          |
| AD-R-05 | 产品回归   | 发布自动关联边界         | 新 capability 开关前后 publish                        | 开关启用后不再新增隐式关联；存量不删除，发现仍需人工确认   | P0     | PASS：HTTP                       |
| AD-R-06 | 回归       | 相同拼写不同方言成分     | BrE/AmE phrase surface 相同、component 不同           | 例句按 matched phrase_variant 展示正确一侧，不合并两侧     | P0     | PLANNED                          |
| AD-E-01 | 内置浏览器 | 自动单词与连续短语       | location + central location 已发布                    | 同一次一键发现命中两者及具体词义                           | P0     | PLANNED                          |
| AD-E-02 | 内置浏览器 | 手动未发布草稿           | 一个未归档、从未发布的目标草稿                        | 草稿组可见，可转 Pending，不出现已关联假状态               | P0     | PLANNED                          |
| AD-E-03 | 内置浏览器 | 可分离短语动词           | turn the light off + separable turn off               | 一键和手动均命中具体词义；light 可独立关联                 | P0     | PLANNED                          |
| AD-E-04 | 内置浏览器 | 真实词形归并             | locations 与 went 对应目标已发布                      | 一键发现只展示 location/go 原形及正确具体词义              | P0     | PLANNED                          |
| AD-E-05 | 内置浏览器 | 旧客户端多段保护         | 已有 segmented 后模拟旧 payload                       | 明确升级/只读提示，不能渲染外包络或覆盖保存                | P0     | PLANNED                          |
| AD-E-06 | 内置浏览器 | BrE/AmE 成分独立编辑     | central location：central/location vs center/location | 同屏两侧独立、各两项、查找词义入口可用；不点击保存         | P0     | PASS：本地浏览器                 |

### 实施硬门

1. 先落 `AD-C-04/05`、`AD-B-26..34` 红测试与 Guard release；旧 writer 保护未上线前禁止创建 segment 表或写多段。
2. 再落 core/OpenAPI、FST/AC/状态机和 generation 红测试；100 万 entry/1000 万 alias+pattern 的构建、RSS、P95和切换基准通过后才接前端按钮。
3. 前端先覆盖 `AD-F-01/03/05/06/09..14` 再接视觉层级，确保扫描无写入、草稿不直连、重叠可达和旧响应失效。
4. `AD-R-05` 产品边界确认且 `AD-C/B/F/R` 全绿后进行 `AD-E`；不得用前端循环/组合枚举替代内部 discovery core。
