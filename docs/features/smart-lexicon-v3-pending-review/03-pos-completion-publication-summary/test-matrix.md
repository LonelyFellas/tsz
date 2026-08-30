# Smart Lexicon V3 基本词性未填计数与发布问题汇总：测试矩阵

## 判定口径

- 本地徽标与 publication issues 是两个独立测试域。
- 所有汇总断言以原始 issues 数组为准，不以去重 message 为准。
- field state 只由显式 validate/publish 更新或清除。
- 每个 P0 在实施阶段必须落成自动化；当前阶段不写测试代码。

## A. 本地 POS 未填计数

| ID   | 层   | 场景                           | 输入/前置                             | 预期                                       | 优先级 |
| ---- | ---- | ------------------------------ | ------------------------------------- | ------------------------------------------ | ------ |
| C-01 | 单元 | common form 多字段为空         | 空 spelling + 空 pronunciation fields | 该 form 只计 1                             | P0     |
| C-02 | 单元 | uk_us 仅一侧不完整             | UK 完整、US 缺 actual pron            | 该 form 计 1；补齐后 0                     | P0     |
| C-03 | 单元 | 无 pronunciation               | spelling 有值、列表空                 | form 计 1                                  | P0     |
| C-04 | 单元 | 空 form group                  | members 为空                          | 每个空 group 计 1                          | P0     |
| C-05 | 单元 | 多 form / group 混合           | 2 incomplete forms + 1 empty group    | 总计 3，不按空字段数膨胀                   | P0     |
| C-06 | 组件 | Step 2 输入实时递减            | 编辑拼写/音标/style                   | Badge 立即变化，无 validate 请求和字段错误 | P0     |
| C-07 | 组件 | Step 2 全部完成                | count=0                               | Badge 不显示，删除按钮位置不变             | P1     |
| C-08 | 单元 | POS 无 grammar                 | grammar list 为空                     | Step 3 计 1                                | P0     |
| C-09 | 单元 | grammar variant 为空           | 一个 grammar 多个 variant，任一空     | 该 grammar 计 1                            | P0     |
| C-10 | 单元 | POS 无 sense                   | senses 为空                           | 计 1                                       | P0     |
| C-11 | 单元 | sense 缺多个维度               | group/subPos/frequency/中文释义缺失   | 每个缺失维度各计 1                         | P0     |
| C-12 | 单元 | sentence 不完整                | unified 或 uk_us 任一英文/中文缺失    | 每条 sentence 计 1                         | P0     |
| C-13 | 单元 | 非“未填”非法值                 | frequency 非法但非空、关系目标 stale  | 本地徽标不擅自计 server 规则               | P0     |
| C-14 | 组件 | Step 3 输入/删除实时重算       | 编辑或删除 sense/sentence             | Badge 立即变化，不等待检查                 | P0     |
| C-15 | 组件 | 最近发布 issues 存在           | publication issues 非空               | Badge 仍只由 local draft 计算              | P0     |
| C-16 | 组件 | 删除非最后一个 POS             | 确认删除                              | 词形/词义同步既有行为，剩余 POS 计数正确   | P0     |
| C-17 | 组件 | 仅剩一个 POS / 无 forms 上下文 | 删除入口边界                          | 既有删除约束不回归                         | P1     |

## B. 发布问题汇总与导航

| ID   | 层   | 场景                        | 输入/前置                               | 预期                                                    | 优先级 |
| ---- | ---- | --------------------------- | --------------------------------------- | ------------------------------------------------------- | ------ |
| S-01 | 单元 | 原始总数                    | 39 issues、5 种 message                 | total=39，不等于 5                                      | P0     |
| S-02 | 单元 | 同 POS 跨步骤               | noun forms 8 + meanings 3               | noun total=11，by_step 分别为 8/3                       | P0     |
| S-03 | 单元 | 多 POS                      | adjective/noun/verb                     | 各 POS 数量准确、顺序稳定                               | P0     |
| S-04 | 单元 | 显式 pos_id                 | node_location.pos_id 存在               | 精确归属对应 POS                                        | P0     |
| S-05 | 单元 | ancestor 归属 meanings      | 无 pos_id，ancestor 含 sense/definition | 遍历实际结构归属正确 POS                                | P0     |
| S-06 | 单元 | 无法归属 POS                | general forms/meanings issue            | 进入对应步骤兜底组，不猜 POS                            | P0     |
| S-07 | 单元 | 类型聚合                    | 相同 code 跨 POS/form type              | code 数量、scope label 准确                             | P0     |
| S-08 | 单元 | 已知 code 无精确字段 anchor | 当前枚举 code、位置只能到 step          | 保留数量和安全产品文案，导航降级到 step                 | P0     |
| S-09 | 组件 | 29 条重复发音 + 其他 10 条  | 39 issues                               | 标题 39；发音文案一组 29；无逐条警告墙                  | P0     |
| S-10 | 组件 | POS 卡导航                  | 点击 adjective 组                       | 传递该组首个原始 issue                                  | P0     |
| S-11 | 组件 | 类型导航                    | 点击 pronunciation type                 | 传递该类型首个原始 issue                                | P0     |
| S-12 | 集成 | 精确 forms 导航             | pronunciation issue                     | 激活 forms/POS/form/variant/pronunciation 并 focus 字段 | P0     |
| S-13 | 集成 | 精确 meanings 导航          | frequency/definition/grammar issue      | 激活 meanings/POS/sense 并 focus 对应控件               | P0     |
| S-14 | 集成 | 目标节点已删除              | 最近检查 issue 指向旧节点               | 降级到 step/POS，不抛异常                               | P0     |
| S-15 | 组件 | layout 去重                 | issues 非空                             | layout 无 `待完成项` region，preview 是唯一汇总         | P0     |

## C. 检查/发布事件边界与字段状态

| ID   | 层            | 场景                    | 输入/前置                          | 预期                                            | 优先级 |
| ---- | ------------- | ----------------------- | ---------------------------------- | ----------------------------------------------- | ------ |
| E-01 | 状态单元/集成 | 首次 validate 失败      | 点击检查，返回 issues              | publicationIssues 整体设置，摘要/字段状态出现   | P0     |
| E-02 | 状态单元/集成 | validate 成功           | 下一次返回 valid/[]                | publicationIssues 清空，摘要/字段状态消失       | P0     |
| E-03 | 状态单元/集成 | publish validation 失败 | 发布返回 issues                    | publicationIssues 用发布响应替换                | P0     |
| E-04 | 状态单元/集成 | 普通输入                | 已有 publicationIssues 后编辑字段  | issue 保持；不发 validate，不主动清除           | P0     |
| E-05 | 状态单元/集成 | `intent=save` 成功      | 已有 publicationIssues 后保存      | canonical 更新，但 publicationIssues 保持       | P0     |
| E-06 | 状态单元/集成 | `intent=complete` 失败  | 返回 validation issues             | problem 显示；不覆盖 publicationIssues          | P0     |
| E-07 | 状态单元/集成 | save validation 失败    | 结构/存储 issue                    | problem 显示；不生成发布字段红框                | P0     |
| E-08 | 状态单元/集成 | 网络/revision 错误      | validate/publish 之外失败          | 不覆盖最近检查结果                              | P0     |
| E-09 | 组件          | 发音字段映射            | pronunciation_required             | style/dict/actual 控件 error + 短 help          | P0     |
| E-10 | 组件          | sense 字段映射          | sub_pos_required/frequency_invalid | Select/InputNumber error + 短 help              | P0     |
| E-11 | 组件          | definition 字段映射     | definition_invalid/grammar issue   | 内容/语法控件 error + help                      | P0     |
| E-12 | 组件          | 可访问性                | 映射字段                           | `aria-invalid`/antd status 与可见 help 同时存在 | P0     |
| E-13 | 集成          | 新 entry 会话           | 切换 entry ID                      | 旧 publicationIssues 不泄漏到新会话             | P0     |
| E-14 | 集成          | 发布成功                | publish 完成                       | 会话结束/刷新后无旧 issue 残留                  | P0     |

## D. 后端合同回归

| ID   | 层        | 场景                     | 输入/前置                                 | 预期                                                  | 优先级 |
| ---- | --------- | ------------------------ | ----------------------------------------- | ----------------------------------------------------- | ------ |
| B-01 | 后端 HTTP | validate 返回 raw issues | 多 POS 多缺项                             | 数组长度/代码/step 完整，不由后端去重文案             | P0     |
| B-02 | 后端 HTTP | pronunciation 定位       | 缺 style/dict/actual                      | node/ancestor/pos/form/variant/pronunciation 定位可用 | P0     |
| B-03 | 后端 HTTP | meanings 定位            | subPos/frequency/definition/sentence 缺项 | step/node/ancestor 足以归属 POS 和字段                | P0     |
| B-04 | 后端 HTTP | publish 仍权威           | 不完整草稿                                | 发布拒绝，无 publication；issues 与规则一致           | P0     |
| B-05 | 契约      | 新/未知 issue code       | OpenAPI/runtime schema                    | 已纳入新枚举时前后端同步；真正未知响应 fail closed    | P0     |

## 手测清单

- [ ] 真实测试草稿逐项补 Step 2/3，观察徽标实时递减且无红框。
- [ ] 点击检查发布条件，记录服务端 raw issues 总数，并与总览/POS/类型数量对账。
- [ ] 点击 forms 与 meanings 各一个“去填写”，确认步骤、POS 和焦点正确。
- [ ] 修改字段后不检查，确认旧标记仍在；再次检查后才更新/清除。
- [ ] 页面上不存在旧的逐条 `待完成项` 警告墙。
- [ ] 不用真实业务 entry；需要写入/删除测试数据必须另行授权。

## 实施阶段质量门

- 先跑纯函数矩阵，再跑 5 个 V3 相关组件/会话文件。
- admin typecheck、lint、`git diff --check`。
- `pnpm test:cov` 保持 admin 业务逻辑覆盖率门槛。
- 真后端验收对账 raw issue 数；mock 只能验证 UI，不作为合同已部署证据。
