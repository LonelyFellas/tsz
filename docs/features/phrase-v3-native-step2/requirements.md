# Smart Lexicon 短语 V3-native 编辑统一需求

> 审批状态：2026-08-28 用户已批准按推荐方案执行；现有 V2 phrase 采用未上线环境清理重建方案，后端正式 OpenAPI 先行。

## 背景

当前统一创建入口会按输入是否含内部空格区分单词与短语，但分类后进入两套正式模型：

- 单词创建为 `schema_version=3`，使用 V3-native `forms[] + form_groups[].members[]`，并进入 `/words/:id/v3/wizard/*`；
- 短语创建为 `schema_version=2`，使用 `base_form + form_groups[].slots[]`，并进入 `/words/:id/wizard/*`。

这导致同一个产品步骤“词形与发音”在数据能力、页面结构、保存校验、响应式布局和后续维护上长期分叉。当前短语 Step 2 的排版变化不是单独的 CSS 回归，而是 V2 phrase contract 与 V3 word contract 不同造成的正式产品差异。

用户已确认新的产品规则：单词与短语在 Step 2 必须使用相同 UI 和相同数据结构；`word | phrase` 只表示词条业务类型，不再决定编辑器版本。

## 可衡量目标

1. 所有新建英文单词和短语都返回 `schema_version=3`，并保留真实 `kind=word | phrase`。
2. 单词和短语都使用同一个 V3-native wizard、Step 2 组件、保存/影响确认/校验和发布链路。
3. 短语完整支持 V3 的多个 base、同类型多词形、共享 group membership、多发音、词性级方言规则和稳定 UUID。
4. 相同输入在相同视口下，单词和短语 Step 2 仅因实际 POS/词形数据不同而变化，不因 `kind` 使用另一套 DOM/CSS。
5. 前端不再创建新的 V2 phrase 草稿，也不把 V2 phrase 转换成 V3 本地对象后提交。

## 目标端与用户

- 目标端：`apps/admin`。
- 用户：已有智能词库创建、编辑和发布权限的管理员。
- 权限、登录和 401/403 处理沿用现有 Admin 机制，不新增角色。

## 产品原则

### 类型不是版本

- `kind=word | phrase` 是词条分类。
- `schema_version=3` 是统一的当前编辑契约。
- 管理员不查看或选择 schema 版本。
- 输入分类仍按统一入口现有规则执行：归一化后含内部空格为 phrase，否则为 word；撇号和连字符不分词。

### Step 2 只有一套正式模型

单词和短语都使用以下 V3-native 结构：

- `forms.pos[]`
- `pos_id / pos / dialect_rules`
- `forms[]` 中 `base` 与其他 `form_type` 同级
- `form_groups[].members[].form_id`
- common 或完整 UK/US variants
- variant 下多条 pronunciation
- form、variant、pronunciation、group、membership 的稳定 UUID

禁止继续把短语建模为一个特殊 `base_form` 加派生 `slots`。

### UI 直接复用单词 V3 Step 2

- 短语进入与单词完全相同的 `V3FormsAndPronunciationStep`、POS tabs、变化组卡、词形行、英美面板和发音控件。
- 不复制一份 phrase 专用 V3 组件。
- 不通过 CSS 把 V2 phrase 页面画成类似 V3 的样子。
- 已确认的产品结构继续有效：词形类型窄列、完整地区面板、变化组层级、行内添加、稳定操作栏与响应式行为。

### 不推断、不降级

- 内置词典建议可以预填后端实际返回的 POS/forms；不存在的建议保持空骨架。
- 智能词库原形命中只提供检测上下文，不复制另一个词条的 forms、UUID、释义或关系。
- 不根据短语拼写自行推断 POS、form type、发音或词义。
- 前端不得把 V2 phrase 转成 V3、不得重新生成已保存节点身份。

## 用户故事

### 创建短语

管理员在统一入口输入 `take care of`：

1. 系统归一化并分类为 `kind=phrase`；
2. 使用 V3 detection 返回内置词典证据和智能词库原形命中；
3. 管理员显式创建后，后端返回 `schema_version=3, kind=phrase`；
4. 页面进入 `/words/:id/v3/wizard/forms`；
5. Step 2 与单词使用同一组件和结构。

### 编辑词形

短语可以像单词一样：

- 添加多个基本词性；
- 在同一 POS 下保留多个 base；
- 添加多个相同 form type；
- 让一个 concrete form 被多个变化组引用；
- 保存 UU、UD、DD 三种合法方言规则；
- 保存、刷新和继续编辑后保持节点 UUID、顺序和 membership。

### 保存和完成

- `intent=save` 允许不完整短语草稿。
- `intent=complete` 使用与单词相同的 V3 validation issue 和定位规则。
- 影响确认、surface 确认、revision 冲突和幂等行为不因 phrase 降级。

### 后续步骤

V3 aggregate 不能只在 Step 2 使用。创建为 V3 phrase 后，Step 3、预览、发布、历史、归档和恢复均继续走 V3-native 链路；页面可以按 `kind` 调整业务文案，但不得切回 V2 aggregate。

## 主流程

1. `/words/new` 输入并分类。
2. `POST /api/v1/admin/lexicon/detections` 使用 schema 3、真实 `kind` 和 surface。
3. 展示内置/智能原形、词性与 surface 确认。
4. `POST /api/v1/admin/lexicon/entries` 使用 schema 3、detection ID、真实 `kind`。
5. 返回 V3 aggregate，统一进入 `/v3/wizard/forms`。
6. Step 2 impact/save、Step 3 save、validate/publish 和 lifecycle 全部使用 V3 endpoints/discriminator。

## 错误流程

- 后端仍只接受 V3 word 时，前端必须 fail closed，不得回退创建 V2 phrase。
- 检测响应 kind 与输入分类不一致时停止创建。
- 创建返回 `schema_version!=3` 或 kind 不一致时停止导航并显示中文错误。
- V3 phrase detail 无法读取时不得切到 V2 wizard。
- 未识别 form type、非法方言规则、节点身份冲突、surface 政策变化继续使用现有 V3 problem/issue 机制。

## 范围内

- V3 wire 中 entry kind 扩展为 `word | phrase`。
- V3 detection/create/detail/list/forms/meanings/validate/publish/history/lifecycle 对 phrase 的正式支持。
- OpenAPI、`@tsz/types`、`@tsz/api-client`、runtime schema 与 contract tests 同步。
- 统一创建入口移除 V2 phrase create 分支。
- V3 wizard、列表路由和产品文案接受 phrase。
- phrase Step 2 直接复用 V3 单词 UI。
- 既有 V2 phrase 的处理方案和可审计数据边界。

## 明确不在范围内

- 自动从短语文本推断词性、派生形式、发音、释义或例句。
- 新建另一套 phrase V3 UI。
- V3 → V2 或 V2 → V3 的前端运行时转换层。
- 学习端短语展示、SEO 或 C 端复习算法调整。
- 将相同 surface 视为重复 entry；entry 身份继续由 ID 决定。
- 顺带重构无关的单词 V3 组件。

## 数据与兼容性要求

- 新写入短语一律 V3-native。
- V2 详情读取可以为历史数据暂时保留，但不得作为新建或编辑短语的 fallback。
- 若环境尚未正式上线且允许清空测试数据，推荐清理现有 V2 phrase 后按 V3 重建，不写长期兼容转换。
- 若必须保留线上 V2 phrase，需要独立、可回滚、可审计的后端 migration；迁移必须保持可对应的文本、排序、生命周期和发布历史，且为新 V3 节点生成一次性稳定身份映射。
- 未明确选择“清理”或“迁移”前，不修改现有 V2 phrase 数据。

## 性能与安全

- 统一 V3 不增加页面级重复请求；detail、impact、save 和 catalog 继续复用现有 Query/请求层。
- 最大节点数、body limit、surface locks、revision、idempotency 和 lifecycle lock 与 V3 word 相同。
- 不在 UI、日志或错误文案中暴露 UUID、token、snapshot ID 或策略代码。

## 验收标准

- [ ] `run` 与 `take care of` 新建后均为 schema 3，kind 分别为 word/phrase。
- [ ] 二者都进入 `/words/:id/v3/wizard/forms`。
- [ ] 相同视口下二者 Step 2 使用相同组件树、CSS 类和操作栏。
- [ ] phrase 支持多个 base、同类型多词形、共享 membership、多发音和稳定 UUID。
- [ ] phrase 的 forms save/refresh/complete/impact 与 word 使用相同请求结构和问题定位。
- [ ] phrase 的 Step 3、预览、发布、历史、归档和恢复不回退 V2。
- [ ] 列表“词汇”列只使用 entry 下全部 base surface，并按稳定顺序以 `/` 拼接。
- [ ] 智能词库原形命中不阻止创建另一个 entry，并保留二次确认。
- [ ] 不再产生新的 schema 2 phrase。
- [ ] V2 历史数据按批准的清理/迁移方案处理。
- [ ] 390/768/1024/1440 宽度下 word/phrase 都可完成核心 Step 2 操作，无非预期横向滚动。
- [ ] 前后端契约测试、Admin 单测/覆盖率、typecheck、lint、build 和真实浏览器验收通过。

## 待产品/后端确认

1. **现有 V2 phrase 数据：**本地及未上线环境是否允许直接清理重建？若存在需保留环境，是否批准独立迁移？
2. **旧路由：**`/words/:id/wizard/*` 对 V2 phrase 是保留只读/继续编辑，还是在迁移后重定向到 V3？
3. **发布历史：**若迁移 V2 phrase，是否必须把全部 publication history 转成 V3 snapshot，还是仅迁移当前草稿与当前 publication？
4. **上线门：**后端何时导出包含 V3 phrase 的正式 OpenAPI；前端在此之前不得实现假契约。
