# 智能词库垃圾桶清理 技术设计文档

## 0. 先说结论

前端的**删除链路其实已经全部打通了**，缺的只是垃圾桶里的入口和批量。
真正的拦路石有两块，都在后端：

1. **归档态词条能不能删，契约没写清**——OpenAPI 的 409 描述只提「已有发布历史 / 被其他草稿引用」，
   没提 archived；但前端 mock 对 archived 一律拒绝。两者矛盾，**这一条决定实现路径**，必须先确认。
2. **后端没有批量删除端点**——只有单条 `delete_draft`。前端循环可以做出"批量"的样子，
   但拿不到现有 `archive-batch` / `restore-batch` 那种「要么全成、要么全不动」的原子性。

因此本设计给出**分档方案**：能立刻做的（A）、值得请后端补的（B，推荐目标态）、
建议本期不做的（C）。

## 1. 现状盘点（已验证）

### 1.1 前端删除链路：已通，只差 UI

| 层                | 位置                                                                 | 状态                                                                            |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `@tsz/api-client` | `packages/api-client/src/admin.ts:645` `deleteDraft()`               | ✅ 已封装，走 `http.del`                                                        |
| 契约测试          | `packages/api-client/src/endpoints.contract.test.ts`                 | ✅ `delete /admin/lexicon/entries/{id}` **不在 PENDING 白名单**，已纳入正式校验 |
| dataSource        | `apps/admin/src/features/dictionary/dataSource.ts:266`               | ✅ 已接                                                                         |
| hook              | `apps/admin/src/features/dictionary/api.ts:182` `useDeleteWordDraft` | ✅ 已实现，含删除后缓存处理                                                     |
| mock              | `apps/admin/src/features/dictionary/mock/adminWordsMock.ts:4313`     | ✅ 已实现，含各拒绝分支                                                         |
| **UI 入口**       | `SmartDictionary.tsx`                                                | ❌ **只有创建向导 `WordCreationWizard.tsx:113` 在用，垃圾桶列表没有任何入口**   |

`useDeleteWordDraft` 的缓存处理已经踩过坑并解决了（`api.ts:199` 注释）：删除后先
`removeQueries` 掉该详情缓存再 invalidate 集合，否则全量 invalidate 会重取已删资源、
按默认策略重试 404、阻塞跳转。批量删除必须沿用这个顺序。

### 1.2 垃圾桶现有交互

- 「垃圾桶」= `status = archived`（标签 `labels.ts:28`）。
- 行操作（`SmartDictionary.tsx:605-635`）：归档行只有「恢 复」，正常行是「移入垃圾桶」，
  二者共用一个按钮位，靠 `record.status === "archived"` 切换。
- 批量（`SmartDictionary.tsx:771`）：同一个按钮在「恢 复 / 移入垃圾桶」间切换，
  由 `restoringSelection`（选中项**全部**为 archived）决定。
- 混选保护（`SmartDictionary.tsx:397-402`）：选中项同时含归档与正常时，
  提示「垃圾桶与正常词条不能在同一批次处理」并中止。
- 能力开关：`adminWordsDataSourceCapabilities.archive` / `.batchArchive` 控制按钮是否渲染。
- 并发保护：`runLifecycleCommandOnce`（`lifecycleCommand.ts:9`）确保一次命令只发一个写请求；
  幂等键用 `newWordNodeId()`。
- 上限：前端**没有**显式的 100 条校验，靠分页 `pageSizeOptions` 最大 100 天然封顶。

### 1.3 乐观锁的两种既有取值方式（重要）

- **归档批量**（`SmartDictionary.tsx:404`）：直接用列表行上的 `revision` / `lifecycle_revision`
  （经 `lifecycleInput(record)` 提取），不重新拉取。
- **恢复批量**（`SmartDictionary.tsx:219-262`）：先逐条 `adminWordsAnyDataSource.getAny(id)`
  拉最新，再校验 `status` 仍为 `archived`，才组装 targets。多这一步是因为恢复要处理
  surface-match 冲突确认。

删除属于**不可逆终止操作**，建议采用**恢复那一档**的严格取值：先拉最新、校验状态，再提交。
用陈旧 revision 提交只会换来 409，多一次往返换来的是"提交前就发现状态已变"。

### 1.4 后端契约（`tsz-rust/docs/openapi.json`）

`DELETE /api/v1/admin/lexicon/entries/{id}`，`operationId: delete_draft`：

- **请求体必填**：`DeleteDraftInput { base_revision, base_lifecycle_revision }`（均 int64，min 1）
- `204` — 「从未发布的草稿已永久删除并释放词头」
- `409` — revision 冲突，或**词条已有发布历史 / 被其他草稿引用**
- `404` / `400` / `401` / `403` / `422`（`base_revision` 取值非法）
- **没有批量端点**；没有 purge；没有保留期自动清理。

数据模型侧（`tsz-rust/docs/word-data-model.md`）：

- `:1046` 已发布词条删除方式 = **归档，不物理删除**；
- `:1054` 归档**不释放** catalog 引用，「只有未来显式清理 publication 时才级联释放」；
- `:329` 「从未发布且没有引用的草稿节点连同 registry 行一起物理删除」。

### 1.5 【阻塞】归档态草稿到底能不能删

| 来源                               | 结论                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| 后端 OpenAPI 409 描述              | 只列「revision 冲突 / 已有发布历史 / 被其他草稿引用」，**未提 archived** |
| 前端 mock `adminWordsMock.ts:4345` | `status === "archived"` → `409 entry_not_deletable`，**一律拒绝**        |

两者矛盾。mock 是前端自己写的模拟，不是后端事实——本项目已有先例（记忆：节点 ID 绑定不变量
mock 未实现，只能真机发现）。这次是反向：**mock 可能比后端更严**。

**必须先确认**，两种结果导向不同实现：

- **若后端允许删 archived 未发布草稿** → 方案 A 直接可行，纯前端，改动很小；
- **若后端也拒绝** → 前端只能走「先 restore 恢复 → 再 deleteDraft」两步，**非原子**，
  中途失败会把词条"复活"成 draft 并从垃圾桶消失，这是明显的体验倒退，
  此时应直接推方案 B（请后端放开或加批量端点）。

确认方式（二选一，成本都很低）：

1. 问后端；
2. 在测试服拿一条归档的未发布草稿实测一次 DELETE，看返回 204 还是 409。

### 1.6 权限判定的现状与缺口

产品规则（已定稿）：普通管理员只能删自己创建的词条，超管不受限。

**能拿到的**：当前管理员身份在 `useAuthStore` 的 `profile` 里，
含 `id`（UUID）与 `role`（`super_admin` / `admin`），
门禁保证受保护页内 `profile` 必有值
（参考既有用法 `features/settings/useDialectPreference.ts:29`）。
admin 侧已有成熟的 `super_admin` 分支惯例（`features/admins`、`features/roles` 整块都是超管专属）。

**拿不到的**：**列表行没有创建人 UUID**。
`AdminWordListItem` 只有 `created_by_name`（姓名字符串），
UUID 只存在于详情 `AdminWordV2.created_by`。

姓名字符串不能用于权限判定（重名即误判），逐行拉详情不可行（一页 100 行 = 100 次请求）。
**结论：列表行必须补 `created_by`，否则「仅限本人创建」这条规则在列表页无法实现。**
见 §4.3。

同时，前端判定只是体验层；**权限必须由后端强制**，见 §4.4。

## 2. 方案

### 方案 A —— 纯前端，复用现有单条端点（可立刻做）

**做法**：垃圾桶行加「永久删除」按钮；批量 = 前端受控并发循环调用 `deleteDraft`。

- 提交前逐条 `getAny(id)` 拉最新，校验仍为 `archived` 且判定为「从未发布」；
- 逐条调用 `useDeleteWordDraft`，收集每条的成功 / 失败与原因；
- 汇总结果：`成功 N 条，失败 M 条`，失败项列出具体词条与原因。

**前提**：后端允许删 archived（见 §1.5）。若不允许，A 需退化为
「restore → delete」两步，**不推荐**（见下方风险）。

**优点**：零后端依赖、零契约变更，能立刻落地。
**缺点**：

- **无原子性**——N 条里删了 3 条第 4 条失败，前 3 条已经永久没了，回不去。
  这与现有 `archive-batch` / `restore-batch` 承诺的「任意一条冲突时全部保持原状」不一致，
  同一个页面里两种批量给出两种保证，容易误导管理员；
- N 次网络往返，100 条就是 100 次；
- 需要自己写并发控制与结果聚合。

### 方案 B —— 请后端加批量删除端点（推荐目标态）

**做法**：后端补 `POST /admin/lexicon/entries/delete-batch`，形状**完全对齐**现有
`archive-batch` / `restore-batch`，前端改动量随之降到最小。

**优点**：原子语义与现有批量一致；一次往返；前端实现基本是照抄 `archiveBatch` 那条路径。
**缺点**：需要后端排期。

**过渡策略**：B 落地前，用 A 的单条删除先把「垃圾桶里删一条误建草稿」这个高频刚需解决掉，
批量入口等 B 就绪再开。这样不会为了凑批量而先造一个无原子性的循环、回头再拆掉。

### 方案 C —— 清理「发布过」的归档词条（建议本期不做）

需要后端提供「显式清理 publication + 级联释放 catalog 引用」的受审计能力，
数据模型里写明这是「未来」的事（`word-data-model.md:1054`）。

这类删除会销毁发布历史、可能影响学习端已消费的数据、并释放 catalog 引用，
是真正意义上不可逆的破坏性操作。**建议本期明确划到范围外**；
若将来要做，至少需要：限超管、输入词条名二次确认、完整审计留痕、后端侧的引用前置校验。

### 选型建议

**B 为目标态，A 的单条部分作为过渡先行，C 不做。**

理由：

1. **最坏失败模式正是需求要防的那个。** 前端循环删 20 条、第 8 条失败，前 7 条已永久消失且无法回退——
   requirements.md 明确写了「绝不出现删了一半的中间态」。归档 / 恢复失败可以重来，永久删除没有这个待遇。
2. **权限规则让循环批量更站不住。** 「仅限本人创建」要求逐条判创建人，
   而列表行连 `created_by` 都没有（§1.6）——批量还没开工就先欠了一个后端字段。
3. **反正要转达后端**：`delete-batch`（§4.2）、`created_by`（§4.3）、
   归属校验（§4.4）三件事一次排期解决，比先造一套循环再拆掉划算。
4. **循环那套代码是一次性的**：并发控制、结果聚合、部分失败 UI，B 落地后要整个删掉。

**何时该改选 A 的循环批量**：若垃圾桶已积压数百条且后端排期很远，
单条点几百次不现实，此时过渡批量才有价值。取决于实际积压量
（requirements.md 开放问题 6）。

前置动作仍是把 §1.5 问清楚——它可能直接让 A 变得毫无必要（若后端拒绝 archived 删除，
A 就只剩不体面的两步走，不如直接等 B）。

## 3. 代码影响范围

以下按方案 A（单条）+ B（批量）合并列出；只做 A 时批量相关项跳过。

### 前端 `apps/admin`

| 文件                                         | 改动                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/dictionary/SmartDictionary.tsx`    | 归档行增加「永久删除」danger 按钮；批量按钮区在 `restoringSelection` 时增加「永久删除」；新增删除确认与执行逻辑（对齐 `executeRestore` 的取最新 + 校验模式）；沿用 `runLifecycleCommandOnce` 与混选保护；**按 `profile.role` + `created_by` 决定按钮可用性**（超管全放行；普通管理员仅本人创建），越权项置灰并给出原因 |
| **权限判定（新增小模块）**                   | 建议抽成纯函数（如 `features/dictionary/deletePermission.ts`）：入参 `(profile, row)` → 出参可删与否 + 不可删原因。纯函数便于覆盖 90% 门槛，也避免判定逻辑散落在 JSX 里                                                                                                                                                |
| `features/dictionary/dataSource.ts`          | 能力开关新增 `deleteDraft` / `batchDelete`（对齐现有 `archive` / `batchArchive`）；方案 B 时新增 `deleteBatch` 方法                                                                                                                                                                                                    |
| `features/dictionary/api.ts`                 | 复用 `useDeleteWordDraft`；方案 B 新增 `useDeleteWordBatch`，缓存失效沿用 `removeQueries` → `invalidateQueries` 顺序                                                                                                                                                                                                   |
| `features/dictionary/labels.ts`              | 若需要「不可删除」的原因文案，在此集中                                                                                                                                                                                                                                                                                 |
| `features/dictionary/mock/adminWordsMock.ts` | **需修正**：确认后端语义后，让 mock 与后端对齐（当前对 archived 一律拒绝，可能过严）；方案 B 补 `deleteBatch` mock                                                                                                                                                                                                     |
| 对应 `*.test.tsx` / `*.test.ts`              | 补测：成功、revision 冲突、后端拒绝、部分失败、混选拦截、双击防重                                                                                                                                                                                                                                                      |

### `packages/api-client`

- 方案 A：**无改动**（`deleteDraft` 已就位）。
- 方案 B：新增 `deleteBatch()`，并从 `endpoints.contract.test.ts` 的 PENDING 白名单流程走
  （新端点若尚未进 spec，需先入白名单，后端落地后按「台账保鲜」断言要求移除）。

### `packages/types`

- 方案 A：`DeleteDraftInput` 已有，无需新增；
  但**列表行类型 `AdminWordListItem` 需在后端补字段后同步增加 `created_by`**
  （snake_case，1:1 镜像后端；见 §4.3）——这是权限规则的前提。
- 方案 B：新增批量删除的 wire 类型；若复用 `EntryLifecycleBatchInput` 则无需新增（见下）。

## 4. 后端对接建议（需用户转达后端）

### 4.1 【优先】澄清 `delete_draft` 对 archived 的语义

请后端明确：**`status = archived` 且从未发布过的草稿，`DELETE /admin/lexicon/entries/{id}` 是否放行？**

- 若放行：建议在 OpenAPI 的 204 / 409 描述里补一句，避免前端各自猜测（当前前端 mock 已猜错方向）；
- 若拒绝：请说明理由，并直接考虑 4.2（否则垃圾桶将永远无法清理，归档只进不出）。

### 4.2 建议新增批量删除端点

建议 `POST /admin/lexicon/entries/delete-batch`，与现有生命周期批量端点保持完全一致的形状，
这样前后端两侧都几乎零新概念：

- **请求体**：直接复用 `EntryLifecycleBatchInput` 的结构
  —— `{ entries: EntryLifecycleTarget[] }`，其中
  `EntryLifecycleTarget = { id, base_revision, base_lifecycle_revision }`。
  这个形状与 `DeleteDraftInput` 逐字段吻合，无需新 schema。
- **上限**：100 条，与 `archive-batch` / `restore-batch` 一致。
- **原子语义**：任意一条不满足条件则整批不执行（与现有批量端点的承诺一致）。
- **幂等**：沿用 `Idempotency-Key` 头。
- **响应**：成功可返回 `{ affected }`；因为词条已删除，不宜返回 `words`
  （现有 `EntryLifecycleBatchResponse` 会回 `words: AdminWordV2[]`，此处不适用）。
- **错误**：`409` 需能定位到**具体是哪几条**导致整批失败及各自原因
  （有发布历史 / 被引用 / revision 冲突），否则管理员面对 100 条选择无从下手。
  建议在 `ProblemDetails` 中带上冲突条目的 id 列表。

### 4.3 【必需】列表行补 `created_by`，并建议补 `deletable`

**`created_by`（UUID）—— 权限规则的硬依赖，缺了做不了。**

产品已定：普通管理员只能删自己创建的词条，超管不受限（见 requirements.md）。
前端要判定「这条是不是我建的」，就得拿词条创建人的 UUID 和当前
`profile.id` 比对。但现状是：

| Schema                        | 创建人字段                               | 能否用于权限判定  |
| ----------------------------- | ---------------------------------------- | ----------------- |
| `AdminWordListItem`（列表行） | 只有 `created_by_name`（**姓名字符串**） | ❌ 重名即误判     |
| `AdminWordV2`（详情）         | 有 `created_by`（UUID）                  | ✅ 但列表页拿不到 |

靠姓名字符串比对不可接受（重名直接误判成"我的"或"别人的"）；
为每行拉一次详情更不可行（一页 100 行就是 100 次请求）。

**请后端在 `AdminWordListItem` 增加 `created_by`（UUID，与详情 `AdminWordV2.created_by` 同源）。**
这是本功能权限规则能否落地的前提。

**`deletable`（布尔）—— 建议，非必需。**

前端目前只能靠 `published_revision` 是否缺省来推断「从未发布」，
但该字段的类型注释写明 **legacy 行也会缺省**，存在误判风险
（`packages/types/src/admin-word.ts:73`）。

建议后端在 `AdminWordListItem` 上增加一个明确的布尔判据（如 `deletable`），
由后端按真实规则（无发布历史 + 无入站引用）计算。这样前端能准确置灰按钮，
而不是让管理员点下去再吃 409。

### 4.4 【必需】后端强制校验删除者归属

产品规则：普通管理员（`role = admin`）只能永久删除**自己创建**的词条，
超管（`role = super_admin`）不受限。

**这条必须在后端强制。** 前端的按钮置灰只是体验优化，不构成权限——
普通管理员绕过 UI 直接调 `DELETE /admin/lexicon/entries/{id}` 就能删他人词条。

请后端在 `delete_draft`（以及将来的 `delete-batch`）中加入校验：

- 调用方 `role = super_admin` → 放行（仍受「未发布 / 无引用」等既有限制）；
- 调用方 `role = admin` 且 `entry.created_by = 调用方 id` → 放行；
- 调用方 `role = admin` 且 `entry.created_by ≠ 调用方 id` → **拒绝**。

建议拒绝时返回 `403`（语义是"你没资格删这条"），与现有的 `409`
（"这条本身不可删"）区分开——两者对管理员的意味完全不同，
前端也需要按此给出不同文案。批量端点同理，且需能指出是哪几条越权。

## 5. 复用与约定

- 类型 → `@tsz/types`（snake_case wire）；请求 → `@tsz/api-client`；admin UI → antd v6
  （禁 tailwind / `@tsz/ui`）。
- 鉴权走 `@tsz/shared/auth` 内核，页面不散落逻辑。
- 沿用词典模块既有模式：`adminWordsDataSourceCapabilities` 能力开关、
  `runLifecycleCommandOnce` 命令锁、`newWordNodeId()` 幂等键、
  `lifecycleInput(record)` 提取乐观锁。
- antd v6 注意点：两字按钮文案中间插空格（现有代码写作 `恢 复`）；
  jsdom 测试需 `matchMedia` / `ResizeObserver` 垫片；大表格测试避免 `getByRole`；
  测按钮禁用态改用 `container.querySelector`（loading 图标在 jsdom 退场滞留）。

## 6. 数据流 / 时序

**单条永久删除（方案 A）**

```
点击「永久删除」
  → getAny(id) 拉最新           // 拿准 revision / lifecycle_revision，并确认仍在垃圾桶
  → 校验 status === archived 且判定可删；否则提示并刷新列表
  → modal.confirm 二次确认（说明不可逆 + 释放词头）
  → runLifecycleCommandOnce 锁内执行
  → DELETE /admin/lexicon/entries/{id}  body: { base_revision, base_lifecycle_revision }
  → 204: removeQueries(detail) → invalidate(lists, stats) → 成功提示
  → 409/404: 按 code 分流提示（revision_conflict / entry_not_deletable / word_not_found）并刷新
```

**批量永久删除（方案 B）**

```
勾选 N 条（全部为 archived）
  → 混选校验 → 逐条取最新并校验 → 汇总不可删项，若有则提交前拦截并列出
  → modal.confirm（不可逆 + 影响 N 条）
  → POST /admin/lexicon/entries/delete-batch  { entries: [{id, base_revision, base_lifecycle_revision}] }
  → 200: 清空选中 → removeQueries 各 detail → invalidate(lists, stats) → 「已永久删除 N 个词条」
  → 409: 展示冲突条目清单，整批未执行，刷新列表
```

## 7. 测试策略（概览）

具体用例在动工阶段用 **test skill** 落地，此处只定方向：

- **单测（admin，门槛 90%）**
  - 垃圾桶行渲染「永久删除」；非归档行不渲染；不可删条目置灰
  - 确认弹窗文案含「不可恢复」与条数
  - 成功路径：调用参数正确（id + 两个 revision）、缓存失效顺序正确
  - 冲突路径：409 `revision_conflict` / `entry_not_deletable` / 404 各自的提示与刷新
  - 混选拦截、超限提示
  - 双击 / 并发：只发一个写请求（`runLifecycleCommandOnce`）
  - 方案 A 的循环批量：部分成功时的结果聚合
  - **权限判定纯函数**：超管删他人 → 放行；普通管理员删自己 → 放行；
    普通管理员删他人 → 拒绝并给出原因；`profile` 缺失时的兜底（不放行）
  - **权限相关 UI**：越权行按钮置灰 + 原因文案；普通管理员批量选中含他人词条时提交前拦截
  - **403 路径**：后端返回越权时的提示与刷新（与 409 的文案必须不同）
- **mock 对齐**：mock 的 archived 行为必须与后端确认结果一致，否则单测全绿、真机翻车
- **契约测试**：方案 B 的新端点按 PENDING 白名单流程纳入
- **手测（测试服）**：真机验证「删除后词头释放、可用同名重新创建」——
  这一条 mock 测不出来，且本项目已有「mock 与后端语义偏差只能真机发现」的先例
- **e2e**：本功能属破坏性操作，不建议纳入 e2e 自动跑

## 8. 风险与回滚

| 风险                              | 说明                                                                                                                | 应对                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **mock 与后端语义不一致**         | mock 拒绝 archived 删除，后端可能放行（或反之）。单测全绿但真机行为不同                                             | 动工前先确认 §1.5；确认后立刻修正 mock；关键路径必须真机手测                                                  |
| **「先恢复再删」非原子**          | 若后端拒绝 archived 删除而仍要纯前端实现，restore 成功、delete 失败会让词条复活成 draft、脱离垃圾桶，且管理员不知情 | 不采纳该路径；直接推方案 B                                                                                    |
| **循环批量无原子性**              | 方案 A 批量删到一半失败，已删的回不来；与页面上其他批量的「全成或全不动」承诺不一致                                 | 方案 A 只做单条，批量等 B；若必须做，结果提示必须逐条明示                                                     |
| **`published_revision` 判定误判** | legacy 行也缺省，可能把发布过的词条误判为可删                                                                       | 不依赖前端判定做最终决策，以后端 409 为准；请后端加 `deletable` 字段（§4.3）                                  |
| **误操作代价不可逆**              | 永久删除无回收站兜底                                                                                                | 二次确认 + 明确文案 + 不做一键清空；必要时限超管                                                              |
| **删除后缓存重取 404**            | 已知坑，`api.ts:199` 有注释                                                                                         | 沿用 `removeQueries` → `invalidateQueries` 顺序，批量同理                                                     |
| **权限只做在前端 = 没有权限**     | 若后端不校验归属，普通管理员绕过 UI 直接调 API 即可删他人词条                                                       | §4.4 必须由后端落地；前端置灰只算体验。后端未落地前，「仅限本人创建」这条**实质上不成立**，需在验收时明确说明 |
| **列表缺 `created_by` 导致误判**  | 只有姓名字符串，重名会把他人词条判成「我的」（放行）或反之（错误置灰）                                              | 不用姓名兜底实现；等后端补 `created_by`（§4.3）。在此之前普通管理员一侧的入口建议整体不放开                   |

**回滚**：功能由 `adminWordsDataSourceCapabilities` 能力开关控制入口渲染，
出问题关掉开关即可隐藏入口，不影响归档 / 恢复等既有流程。代码层面单个 PR 可整体 revert。
已经执行的永久删除**无法回滚**——这正是要把二次确认和可删性判定做扎实的原因。
