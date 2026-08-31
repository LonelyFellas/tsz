# V3 创建向导草稿跨步骤测试矩阵

## 判定口径

- `completed_steps` 只表示通过完整校验并被服务端标记完成的步骤；进入或保存后续草稿不得把未完成步骤变成完成。
- `max_reachable_step` 保留为列表“继续创建”的续做落点，不再表达页面访问权限。前端不得用它阻止 draft 在 `basics/forms/meanings/preview` 间导航。
- `intent: "save"` 只做存储安全、引用和结构校验，允许内容不完整；`intent: "complete"` 仍执行该步骤完整性校验。
- “进入词义与例句”是纯导航，不发 impact/forms save/validate 请求，也不要求词形或发音完成。
- 预览与发布仍由后端完整校验守门；本轮不弱化 `validate_forms`、`validate_meanings`、409/422、revision 或并发锁。
- 自动化只使用 fixture、mock、`sqlx::test` 隔离数据库；不创建、保存、发布或删除真实业务词条。

## P0 自动化矩阵

| #     | 层        | 场景                             | 输入 / 前置                                                       | 预期                                                                                             | 对应测试                                      |
| ----- | --------- | -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| P0-01 | 前端单元  | draft 导航不受 max 限制          | `status=draft`、`max_reachable_step=forms`，请求 meanings/preview | requested step 原样可达；四个编辑步骤均在 reachable 集合                                         | `stepAccess.test.ts`                          |
| P0-02 | 前端单元  | published/archived 只读门保持    | published 非 edit 或 archived，请求 forms/meanings                | 仍强制 preview，只读规则不回归                                                                   | `stepAccess.test.ts`                          |
| P0-03 | 页面集成  | #136 不完整 Step 2 进入 Step 3   | forms 拼写/音标/实际发音未完成，max=forms                         | 点击“进入词义与例句”导航到 meanings；不发 impact/saveForms/validate                              | `WordWizardV3.test.tsx`                       |
| P0-04 | 页面集成  | 直接 URL / 刷新继续 Step 3       | GET 返回 max=forms、completed 仅 basics，URL=`/meanings`          | 页面保持 meanings，不重定向 forms；重新加载后仍可编辑已保存 meanings                             | `WordWizardV3.test.tsx`                       |
| P0-05 | 页面集成  | 顶部/完成情况跨步骤              | draft max=forms，点击 meanings/preview 或未完成项                 | 目标步骤可达；跳过的步骤不显示假完成                                                             | `V3WordCreationWizard.test.tsx`、layout tests |
| P0-06 | 页面集成  | Step 2 保存不完整草稿            | 不完整 forms，点击“保存草稿”                                      | 发 `intent:"save"` 并接受 canonical；completed 不新增 forms，续做落点仍 forms                    | `WordWizardV3.test.tsx`                       |
| P0-07 | 页面集成  | Step 3 保存草稿且上游未完成      | canonical forms 未完成，编辑 meanings 后保存                      | 只发 meanings `intent:"save"`；保存成功、内容保留、completed/max 使用服务端响应                  | `WordWizardV3.test.tsx`                       |
| P0-08 | 后端 HTTP | forms 未完成时保存 meanings 草稿 | 有合法 POS 引用、`intent:"save"`                                  | 200；revision 前进；meanings 持久化；completed 不新增 forms/meanings；max 仍指向首个未完成 forms | `lexicon_handler.rs`                          |
| P0-09 | 后端 HTTP | 保存后刷新一致                   | P0-08 后 GET 详情                                                 | meanings、revision、completed_steps、max_reachable_step 与保存响应一致                           | `lexicon_handler.rs`                          |
| P0-10 | 后端 HTTP | 完成 meanings 仍守上游完成门     | forms 未完成，meanings `intent:"complete"`                        | 409 `step_not_reachable`，无 revision/内容写入                                                   | `lexicon_handler.rs`                          |
| P0-11 | 页面/后端 | 预览仍严格校验                   | forms/meanings 不完整，进入 preview 并检查发布条件                | 页面可进入；validate 返回并展示 forms/meanings issues；发布按钮不可成功                          | `WordWizardV3.test.tsx`、`lexicon_handler.rs` |
| P0-12 | 后端 HTTP | 发布仍严格拒绝                   | 保存过不完整草稿后 publish                                        | 422 `validation_failed`，至少含 forms issue；无 publication/状态副作用                           | `lexicon_handler.rs`                          |
| P0-13 | 前端集成  | 未保存本地草稿跨步保留           | 编辑 forms/meanings 后只导航                                      | 回到原步骤内容仍在；不产生隐式保存                                                               | `WordWizardV3.test.tsx`                       |
| P0-14 | 契约      | max/completed 语义同步           | 重新导出 OpenAPI 并同步 types/snapshot                            | wire 形状不变；描述明确 max 是续做落点、completed 是完成态，均非导航 ACL                         | OpenAPI/API client contract tests             |
| P0-15 | 回归      | Step 1 既有改动保护              | 完整 admin 测试与格式检查                                         | `SearchOutlined`、英美主词编辑规则、建议词性展示不回归                                           | 现有 Step 1 测试 + 全量门                     |

## 两次复现门禁

写业务代码前至少取得以下两条确定性红证据：

1. 页面 #136：max=forms 的不完整草稿点击“进入词义与例句”，旧实现仍停留 forms。
2. `resolveV3StepAccess`：draft max=forms 请求 meanings/preview，旧实现返回 effective=forms、requestedReachable=false。

两条红测均命中同一因果链：`max_reachable_step` 被错误当成 draft 导航权限，而不是续做落点。

## 手测边界

- 本轮不创建或修改真实业务词条。
- 如需最终浏览器复核，只打开既有草稿并验证导航/只读状态；不点击任何会保存、发布或删除业务数据的按钮。
