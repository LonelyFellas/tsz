# Smart Lexicon V3 草稿跨步骤编辑：需求评估

## 背景与目标

V3 draft 当前仍被前端 `max_reachable_step` 限制：词形与发音未完成时，直接进入或刷新 meanings/preview 会被重定向，顶部步骤和完成情况导航也只能到“续做落点”。这把完成信息错误地当成了访问权限。

目标是让可编辑 V3 草稿能在 `basics`、`forms`、`meanings`、`preview` 之间自由导航并保存不完整草稿；完成、发布检查和发布仍由后端严格校验。

## 目标端

- admin V3 创建向导。
- 后端行为不新增需求：最新 main 已具备所需的 `save` / `complete` / publish 分层。

## 用户故事

1. 管理员只创建了基本词性、发音尚未补齐，先进入 meanings 录入已有释义并保存。
2. 管理员在 forms 与 meanings 间往返，未保存的本地输入不因纯导航丢失，也不会被隐式保存。
3. 管理员直接访问或刷新 `/wizard/meanings`、`/wizard/preview`，页面保持目标步骤，不被 `max_reachable_step` 弹回。
4. 管理员在 preview 提前检查；服务端如实列出 forms/meanings 问题，不能发布。
5. 管理员点击“完成并进入下一步”时仍承担完成语义；内容不完整或上游未完成时继续失败。

## 功能范围

### 本次做

- `status=draft` 时四个步骤全部可达。
- 顶部步骤条、完成情况导航、按钮导航和直接 URL 使用相同可达规则。
- `intent="save"` 可保存结构合法但内容不完整的 forms/meanings。
- `completed_steps` 和 `max_reachable_step` 原样使用服务端响应，不因访问或普通保存伪造完成。
- 未保存的 forms/meanings 本地草稿跨步骤保留；检查/发布继续要求先处理 dirty draft。
- 预览页在早期草稿上安全降级，并由服务端发布校验守门。

### 本次不做

- 不放宽 `intent="complete"`。
- 不放宽 `validate` / `publish`，不删除 `step_not_reachable`、revision 或存储安全校验。
- 不改变 archived 和 published 非编辑态只读 preview 规则。
- 不改变 published edit mode 的当前门禁；本需求明确只针对 draft。
- 不改变列表“继续创建”使用 `max_reachable_step` 选择默认落点。
- 不在 `basics` 增加创建后主词编辑；该问题归切片 1 的开放问题 O3。
- 不重新实现多维例句能力。

## 约束与边界

- `completed_steps` 只表达已通过服务端完整性校验并标记完成的步骤。
- `max_reachable_step` 在 draft 中只表达默认续做落点，不是 ACL。
- `intent="save"` 仍执行 schema、稳定 ID、引用、内容上限和 storage-safe 校验。
- `intent="complete"` 保存 meanings 时，forms 未完成继续返回 409 `step_not_reachable`。
- 发布对当前 canonical 聚合独立重跑完整校验，不能依赖客户端完成状态。
- `basics` 在已创建 draft 中是创建证据/建议的只读回顾页；“跨步骤编辑”指可编辑草稿会话中的自由导航及 forms/meanings 编辑。

## 验收标准

- [ ] draft `max_reachable_step=forms` 时，basics/forms/meanings/preview 都可点击。
- [ ] 直接访问/刷新 meanings 或 preview 不重定向到 forms。
- [ ] 顶部步骤只按 `completed_steps` 画完成态，越步不会产生假绿勾。
- [ ] forms 不完整时 meanings `intent="save"` 返回成功，revision 前进，内容可刷新恢复。
- [ ] 上述保存不新增 forms/meanings 到 `completed_steps`，默认续做落点仍是 forms。
- [ ] meanings `intent="complete"` 在 forms 未完成时仍 409，且无写入。
- [ ] 不完整 forms/meanings 的 validate/publish 仍失败并给出结构化 issues。
- [ ] 纯导航不发 impact、save 或 validate 请求；未保存本地输入往返保留。
- [ ] archived/published 只读继续固定 preview；published edit mode 现状不变。
- [ ] 早期草稿在 meanings 无词性时显示既有空态，preview 能安全展示且不可发布。

## 待评审开放问题

### O1：basics 是否要支持创建后编辑

本切片按当前产品结构保留 `V3BasicsStep` 只读；Step 1 最终主词只在创建草稿前确认。若“跨步骤编辑”被解释为 basics 也必须修改主词，应扩展切片 1，而不是只取消导航门禁。

### O2：published edit mode 是否同步放宽

正式需求只说 V3 草稿。建议保留 published edit mode 当前按 `max_reachable_step` 限制的行为，避免把已发布修订工作流夹带进本切片。
