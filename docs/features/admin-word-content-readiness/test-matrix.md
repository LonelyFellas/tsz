# 词条内容联动生成与真实完成度测试矩阵

## 自动化用例

| #   | 层   | 场景                  | 输入 / 前置                                                                         | 预期                                                           | 优先级 |
| --- | ---- | --------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| R01 | 单元 | 空白初始化骨架        | 1 个空语义区间、3 个 POS，各含空 grammar/sense/sentence                             | 语义区间 `0/1`、语法 `0/3`、词义 `0/3`、例句 `0/3`，均为待完善 | P0     |
| R02 | 单元 | 完整 meanings         | 双语区间、完整双方言 grammar、有效 sub POS/frequency/中文释义、双语例句与唯一 focus | 四项完成数等于总数，状态为完成                                 | P0     |
| R03 | 单元 | 部分完成              | 多 POS 中仅部分节点有效                                                             | 每类独立计算完成数，不因同类任一节点存在而全绿                 | P0     |
| R04 | 单元 | 方言边界              | unified、distinguish 缺 UK、distinguish 缺 US                                       | unified 只验 common；distinguish 必须 UK/US 都完整             | P0     |
| R05 | 单元 | 词义边界              | 缺区间、无效区间、缺 sub POS、缺 frequency、缺中文释义                              | 每种情况均未完成并返回稳定首个定位字段                         | P0     |
| R06 | 单元 | 例句关联边界          | 缺英文、缺中文、0/2 条 focus、跨 sense focus                                        | 例句未完成并定位到 sentence                                    | P0     |
| R07 | 单元 | 基本词性与词形        | 0 POS、有效 POS、无需派生词形 POS、空 group、非法 slot、基准发音不全                | 与 forms 完成校验一致；可选无派生不误报                        | P0     |
| R08 | 单元 | 生成资格              | forms 未完成、空白骨架、已有人工内容、已完整、已尝试当前 revision                   | 只有 forms 完成且可安全填充时允许自动 enrich 一次              | P0     |
| R09 | 单元 | 空位保护              | 空字段、manual 非空、dictionary 非空、partial 多 POS                                | 生成合并候选只包含空字段，人工/已有内容不覆盖不重排            | P0     |
| A01 | API  | enrich 请求           | word id、base_revision、idempotency key、empty_only                                 | POST 正确路径，snake_case body 与 header 原样发送              | P0     |
| A02 | 契约 | 后端端点未落地        | 当前 OpenAPI 无 enrich path                                                         | 进入带原因的 PENDING 白名单，不伪装成已支持                    | P0     |
| C01 | 组件 | 空骨架摘要            | `centre` 等价 fixture                                                               | 左侧显示 `0/1, 0/3, 0/3, 0/3` 且无绿色勾                       | P0     |
| C02 | 组件 | canonical 完整摘要    | 完整 word fixture                                                                   | 七项正确完成，数量与真实有效节点一致                           | P0     |
| C03 | 组件 | 未保存草稿实时更新    | meanings textarea 从空变完整但未保存                                                | 摘要实时更新，canonical word 不被误写                          | P0     |
| C04 | 组件 | 点击待完善项          | 非当前步骤/POS 的首个 issue                                                         | 导航到正确步骤并携带 node_id/field/pos_id                      | P0     |
| C05 | 集成 | forms 完成触发 enrich | save forms 成功、返回新 revision、空白骨架、能力开启                                | 只发一次 enrich，使用保存响应 revision，成功更新 cache/word    | P0     |
| C06 | 集成 | 重复与陈旧响应        | 同 tick 双击、切换 word、dirty 后旧响应返回                                         | 不重复请求，不把旧结果写入新词条或覆盖本地编辑                 | P0     |
| C07 | 集成 | partial               | enrich 返回部分正文和 remaining issues                                              | 保留返回内容，显示 partial/待完善，不显示全部完成              | P0     |
| C08 | 集成 | 409/429/503           | revision conflict、限流、provider 不可用                                            | 保留内容，显示可恢复提示；自动失败不循环，允许显式重试         | P0     |
| C09 | 集成 | 真实能力未开放        | production capability=false                                                         | 不请求不存在端点，显示“自动生成暂不可用”，手工编辑正常         | P0     |
| E01 | E2E  | 新词条关键路径        | 多词性、mock enrich 完整响应                                                        | forms complete → 生成 → meanings 可编辑 → 摘要完成 → 保存      | P1     |
| E02 | E2E  | 历史空草稿            | forms 已完成、meanings 空白                                                         | 只补空位，刷新后保持服务端返回内容                             | P1     |

## 手测清单

- [ ] Codex 内置浏览器打开测试环境现有 `centre/center` 草稿：修复部署后空节点不再显示绿色完成。
- [ ] 在 meanings 页面逐项填写语义区间、grammar、词义和例句：左侧无需保存即可实时变化。
- [ ] 点击左侧待完善项：切换到正确步骤和 POS，首个无效字段进入可见区域。
- [ ] 后端 enrich/provider 部署后，新建多词性英美区分单词：只自动生成一次，内容有真实来源，保存刷新一致。
- [ ] 后端 enrich/provider 部署后，历史空草稿：只填空字段，不覆盖已有人工正文。
- [ ] 分开记录 mock、HTTP 契约、真实后端和内置浏览器结果；后端未部署前不得把 mock PASS 报成真实生成 PASS。
