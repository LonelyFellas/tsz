# V3 Step 3 基本词性双向绑定测试矩阵

| #   | 层   | 场景                                | 输入 / 前置                                          | 预期                                                                                  | 优先级 |
| --- | ---- | ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| 1   | 组件 | Step 2 与 Step 3 共用添加词性选择器 | catalog 含名词、动词，草稿已有名词                   | 两处只显示尚未添加的动词，中文标签、loading、error、disabled 状态一致                 | P0     |
| 2   | 组件 | Step 3 新增基本词性                 | Step 3 选择尚未添加的动词                            | 通过 `addPartOfSpeech` 生成 forms 骨架；回调收到新 forms；活动 Tab 切到新 `pos_id`    | P0     |
| 3   | 组件 | Step 3 禁止重复词性                 | 草稿已有名词，catalog 同时含名词                     | 名词不在可选项中；重复选择不能创建第二个 POS 或新 UUID                                | P0     |
| 4   | 集成 | Step 3 新增同步到 meanings          | Wizard 在 Step 3 调用 `setDraftForms` 新增 POS       | `forms.pos` 与 `meanings.pos` 都出现且复用同一个稳定 `pos_id`；meanings 使用默认模板  | P0     |
| 5   | 集成 | Step 2 新增同步到 Step 3            | Step 2 新增 POS 后切到 Step 3                        | Step 3 出现同一 `pos_id` 的 Tab 和默认 meanings 模板                                  | P0     |
| 6   | 集成 | 普通保存的跨步骤顺序                | forms 与 meanings 都 dirty，Step 3 点击保存草稿      | 严格调用 `save_forms(save)` → `save_meanings(save)`；后者使用 forms 响应后的 revision | P0     |
| 7   | 集成 | 完成保存的跨步骤顺序                | forms 与 meanings 都 dirty，Step 3 点击完成          | 严格调用 `save_forms(complete)` → `save_meanings(complete)`；成功后进入预览           | P0     |
| 8   | 集成 | forms 保存失败                      | forms dirty，`save_forms` 返回 409/422               | 不发送 meanings 请求；两份本地草稿与 dirty 状态保留；错误定位沿用 forms 流程          | P0     |
| 9   | 集成 | meanings 保存失败                   | forms 保存成功，随后 `save_meanings` 返回 422/5xx    | 保留已接受的 forms canonical；meanings 草稿与 dirty 状态保留，可原样重试              | P0     |
| 10  | 集成 | 同 tick 重复提交                    | 连续触发两次 Step 3 保存                             | 只产生一组 forms/meanings 请求，不重复创建或覆盖 revision                             | P0     |
| 11  | 集成 | 步骤切换保留本地内容                | Step 3 新增 POS 并录入未保存内容，切换 Step 2/3      | 新 POS、稳定 ID 和两步输入均不丢失                                                    | P0     |
| 12  | 手测 | 真实页面双向可见与持久化            | 本地 Admin + Rust，Step 3 新增未使用 POS，保存并刷新 | Step 3 立即出现新 Tab；Step 2 显示同一骨架；刷新后仍一致；无控制台/网络错误           | P1     |

## 边界说明

- Step 3 仅新增，不提供删除入口；删除行为继续由 Step 2 的影响确认覆盖。
- 本功能不新增 API 或 wire 字段，因此不增加 api-client 契约测试。
- 自动化测试只验证前端可恢复的顺序保存，不把两个 HTTP 请求宣称为数据库事务。
