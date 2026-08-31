# Smart Lexicon V3 草稿跨步骤编辑：测试矩阵

## 判定口径

- draft 四步可达；archived/published 只读和 published edit 不在本次放宽。
- `save` 与 `complete` 是不同业务意图；只复用服务端 canonical 响应，不由前端自行推进完成状态。
- P0 自动化不得依赖真实业务 entry。

## 自动化矩阵

| ID   | 层             | 场景                           | 输入/前置                                                               | 预期                                                                                                            | 优先级 |
| ---- | -------------- | ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| N-01 | 前端单元       | draft 四步可达                 | max=forms，请求 basics/forms/meanings/preview                           | requested=effective，reachable 含四步                                                                           | P0     |
| N-02 | 前端单元       | archived 只读                  | 请求 forms/meanings                                                     | effective=preview、readOnly=true                                                                                | P0     |
| N-03 | 前端单元       | published 非 edit              | 请求任意非 preview                                                      | 固定 preview                                                                                                    | P0     |
| N-04 | 前端单元       | published edit 保持现状        | max=meanings，请求 preview                                              | 仍按当前规则处理，不被 draft 分支放宽                                                                           | P0     |
| N-05 | 页面集成       | 不完整 forms 进入 meanings     | completed 仅 basics、max=forms                                          | 点击后 URL/内容进入 meanings；不发 impact/save/validate                                                         | P0     |
| N-06 | 页面集成       | 直接 URL meanings              | GET 同 N-05                                                             | 不重定向，刷新后仍可编辑                                                                                        | P0     |
| N-07 | 页面集成       | 直接 URL preview               | 不完整草稿                                                              | 保持 preview，可执行检查但无发布按钮                                                                            | P0     |
| N-08 | 页面集成       | 顶部四步点击                   | draft 任意 max                                                          | 四步均启用；点击进入目标                                                                                        | P0     |
| N-09 | 页面集成       | 完成情况越过续做落点           | 目标位于 meanings/preview                                               | 精确导航目标步骤/POS/字段                                                                                       | P0     |
| N-10 | 页面集成       | 越步不画假完成                 | completed 仅 basics，active preview                                     | forms/meanings 为 wait，不是 finish                                                                             | P0     |
| N-11 | 页面集成       | forms 保存不完整草稿           | `intent=save`                                                           | 请求成功；completed/max 使用服务端响应                                                                          | P0     |
| N-12 | 页面集成       | meanings 在 forms 未完成时保存 | `intent=save`                                                           | 只发 meanings save；canonical 内容保留                                                                          | P0     |
| N-13 | 页面集成       | 未保存本地 forms 往返          | 编辑后 forms → meanings → forms                                         | 输入仍在，不发生隐式保存                                                                                        | P0     |
| N-14 | 页面集成       | 未保存本地 meanings 往返       | 编辑后 meanings → forms → meanings                                      | 输入仍在；dirty 提示保持                                                                                        | P0     |
| N-15 | 页面集成       | 零词性 meanings                | forms/meanings pos 为空                                                 | 显示既有 Empty/新增入口，不是空白或崩溃                                                                         | P0     |
| N-16 | 后端 HTTP 回归 | forms 未完成保存 meanings      | 合法 POS 引用、`intent=save`                                            | 200、revision 前进、completed 不变、max=forms                                                                   | P0     |
| N-17 | 后端 HTTP 回归 | 保存后 GET                     | N-16 后刷新                                                             | 内容/revision/completed/max 一致                                                                                | P0     |
| N-18 | 后端 HTTP 回归 | forms 未完成 complete meanings | `intent=complete`                                                       | 409 `step_not_reachable`，无 revision/内容写入                                                                  | P0     |
| N-19 | 后端 HTTP 回归 | save 仍校验引用                | 不存在的 pos/node ID                                                    | 422 结构化 issue，无写入                                                                                        | P0     |
| N-20 | 后端 HTTP 回归 | 发布不完整草稿                 | 已保存不完整 forms/meanings                                             | 422 `validation_failed`，无 publication/状态副作用                                                              | P0     |
| N-21 | 回归           | 多维例句 dirty state           | meanings 含未保存句子/关联                                              | 纯导航不丢数据、不触发 claim/save                                                                               | P0     |
| N-22 | 回归           | 列表继续创建                   | max=forms                                                               | 列表仍落到 forms，不因四步可达改成 preview                                                                      | P1     |
| N-23 | 页面集成       | 自动模板与删除 POS             | canonical meanings 为空；或 dirty meanings 含被删 POS/被删 sense 跨引用 | 自动模板有 clean baseline 且还原后恢复 clean；删除 POS 后裁剪孤儿和跨引用，并按 forms→meanings 新 revision 保存 | P0     |

## 手测清单

- [ ] 使用隔离测试草稿：forms 未完成时直接打开 meanings，保存后刷新内容仍在。
- [ ] 返回 forms，再回 meanings，确认两边数据和完成状态正确。
- [ ] 直接打开 preview，点击检查，确认问题被展示且不能发布。
- [ ] archived/published 非编辑条目仍只读 preview。
- [ ] 不使用真实业务词条；需要写入测试数据时先取得单独授权并记录清理方案。

## 实施阶段质量门

- 前端聚焦：`stepAccess.test.ts`、`WordWizardV3.test.tsx`、`V3WordCreationWizard.test.tsx`。
- 回归：admin typecheck/lint、`pnpm test:cov`。
- 后端只跑现有聚焦/全量门证明环境能力，不因本切片改业务代码。
