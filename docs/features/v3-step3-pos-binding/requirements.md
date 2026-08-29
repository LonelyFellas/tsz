# V3 Step 3 基本词性双向绑定需求评估

## 背景与目标

当前 V3 编辑器只能在 Step 2「词形与发音」新增基本词性。Step 3「词义与例句」虽然按词性展示内容，但没有新增入口，管理员发现缺少词性时必须返回 Step 2 操作。

目标是在 Step 3 提供与 Step 2 相同的「添加基本词性」入口，使新增结果立即同时出现在两个步骤，并保持同一组 POS、词形、词义节点身份。

## 目标端

Admin 管理后台，Smart Lexicon V3 编辑器。

## 用户故事 / 使用场景

- 管理员在 Step 3 编辑词义时发现缺少词性，可直接选择一个尚未添加的基本词性。
- 新词性立即成为 Step 3 当前 Tab，并带有默认语义区间、语法结构、词义、定义和例句模板。
- 返回 Step 2 时，同一词性及其稳定 POS ID、默认原形/发音骨架已经存在，不重新生成另一份节点。
- 管理员在 Step 2 新增词性后进入 Step 3，也能立即看到对应模板。
- 从 Step 3 保存时，系统先持久化 forms，再以最新 revision 保存 meanings，管理员不需要手动返回 Step 2。

## 功能范围

### 本次范围内

- Step 3 顶部增加与 Step 2 同款「添加基本词性」选择器。
- 只显示 catalog 中尚未添加的词性，禁止重复 POS code。
- Step 3 新增时复用 Step 2 的 POS 创建规则和默认 forms 骨架。
- 同一操作同时更新本地 `draftForms` 和 `draftMeanings`，并切换到新 POS。
- Step 2 新增词性继续即时补齐 Step 3 默认模板。
- Step 3 保存时，如果 forms dirty，则先保存 forms，再保存 meanings。
- Step 3 完成时，forms 使用 `intent=complete`；普通保存使用 `intent=save`。
- 保存失败时保留所有未保存内容，并显示现有结构化错误/重试入口。

### 明确不在范围内

- 在 Step 3 删除基本词性；删除仍由 Step 2 承担，并沿用影响确认。
- 自动推断新增词性的派生形式、音标、真实发音或正式释义。
- 新增后端 wire 字段或修改 OpenAPI。
- 将两个 HTTP 保存请求伪装成数据库单事务。
- 修改 V2 编辑器。

## 约束与边界

- `forms.pos` 是基本词性与稳定 POS ID 的权威来源；Step 3 不创建独立 meanings-only POS。
- 新增逻辑必须复用现有 `addPartOfSpeech`，不得复制或重新解释词性模板规则。
- meanings 模板必须复用 `ensureV3MeaningsForForms`，不得生成第二套默认节点。
- Step 3 选择器与 Step 2 使用同一 catalog、相同禁用/加载/错误状态和相同中文标签。
- 切换步骤不得丢失本地 forms/meanings dirty 内容。
- 保存顺序固定为 forms → meanings；meanings 请求必须使用 forms 响应后的最新 revision。
- forms 保存成功、meanings 保存失败时，不回滚已持久化 forms；本地 meanings 保持 dirty，允许原样重试。
- 未发布草稿阶段可以保留不完整 forms；完成/预览/发布仍由后端完整校验决定。

## 验收标准

- [ ] Step 2 和 Step 3 都显示同款「添加基本词性」选择器。
- [ ] 两处可选项集合一致，已存在词性不会重复出现。
- [ ] Step 3 新增 POS 后立即出现新 Tab，并自动切换到该 Tab。
- [ ] 返回 Step 2 后可看到同一个 POS ID 和同一份默认 forms 骨架。
- [ ] Step 2 新增 POS 后进入 Step 3，可看到同一个 POS ID 和默认 meanings 模板。
- [ ] 新增过程中不产生 meanings-only POS、重复 POS code 或重复稳定 ID。
- [ ] Step 3 普通保存按 `save_forms(save) → save_meanings(save)` 调用。
- [ ] Step 3 完成按 `save_forms(complete) → save_meanings(complete)` 调用。
- [ ] meanings 请求使用 forms 响应后的 revision。
- [ ] forms 保存失败时不发送 meanings 请求。
- [ ] meanings 保存失败时 forms 保持已保存，meanings 本地内容与 dirty 状态保留并可重试。
- [ ] 切换 Step 2/3 前后，新 POS 与输入内容不丢失。
- [ ] 相关单测、集成测试、typecheck、lint、build 和真实浏览器验收通过。

## 开放问题

1. **持久化原子性：**是否接受推荐的两接口顺序保存及可恢复的部分成功？若要求数据库级原子性，需要后端新增组合命令。
2. **Step 3 删除：**本次建议不提供；是否确认删除继续只在 Step 2 操作？
3. **新增后的默认完成度：**建议保持草稿模板，不自动把 Step 2 或 Step 3 标记完成。
