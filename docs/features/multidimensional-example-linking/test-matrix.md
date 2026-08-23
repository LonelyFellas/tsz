# 智能词库多维例句关联测试用例矩阵

## 证据边界

- 当前 `tsz-rust/docs/openapi.json` 没有 `shared_sentences`、位置解析、预关联列表或认领端点。本矩阵把“纯前端状态/交互”和“开发 mock 行为”列为可自动化范围；真实 HTTP、数据库唯一约束、跨管理员并发与 publication 引用均列为 BLOCKED，不能用 mock 结果替代。
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
