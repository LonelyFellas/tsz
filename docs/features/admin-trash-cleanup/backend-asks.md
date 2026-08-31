# 智能词库垃圾桶清理 —— 后端对接请求

> 前端要在 admin 智能词库的「垃圾桶」（`status = archived`）里做**永久删除**，支持批量。
> 盘查后发现前端删除链路已通（`DELETE /admin/lexicon/entries/{id}` 已封装并纳入契约测试），
> 但有 4 项后端依赖需要确认或补齐。按优先级排列，**第 1、2、3 项不解决则功能无法落地**。
>
> 产品规则：普通管理员（`role = admin`）只能永久删除**自己创建**的词条；
> 超级管理员（`role = super_admin`）不受此限制。

---

## 1.【阻塞】请澄清：`delete_draft` 对 `archived` 词条是否放行？

**问题**：`DELETE /api/v1/admin/lexicon/entries/{id}`（`operationId: delete_draft`）
对 `status = archived` 且**从未发布过**的草稿，是放行还是拒绝？

**为什么问**：契约里查不到答案，两处信号矛盾——

- `docs/openapi.json` 中该端点的 `409` 描述是「revision 冲突，或词条已有发布历史/被其他草稿引用」，
  **没有提到 archived**；
- 前端 mock 目前对 `status === "archived"` 一律返回 `409 entry_not_deletable`。

**影响**：这条直接决定前端实现路径。

- **放行** → 前端可以直接在垃圾桶里删，改动很小；
- **拒绝** → 前端只能走「先 `restore` 恢复 → 再 `delete`」两步，**非原子**：
  中途失败会让词条复活成 draft 并脱离垃圾桶，管理员还不知情。这个体验我们不打算做，
  届时会直接依赖第 4 项。

**顺带**：如果放行，建议在 OpenAPI 的 `204` / `409` 描述里补一句说明
（前端 mock 就是因为契约没写清而猜错了方向）。

---

## 2.【必需】请在列表行 `AdminWordListItem` 增加 `created_by`（UUID）

**现状**：

| Schema                        | 创建人字段                           |
| ----------------------------- | ------------------------------------ |
| `AdminWordListItem`（列表行） | 只有 `created_by_name`（姓名字符串） |
| `AdminWordV2`（详情）         | 有 `created_by`（UUID）              |

**问题**：产品规则要求「普通管理员只能删自己创建的词条」。
前端要判定归属，就得拿词条创建人 UUID 和当前登录管理员的 `profile.id` 比对。
但列表页只有姓名字符串——**重名就会误判**（把他人词条判成"我的"而放行，或反之）。
为每一行拉一次详情不可行（一页 100 行 = 100 次请求）。

**请求**：在 `AdminWordListItem` 增加 `created_by`（UUID，与 `AdminWordV2.created_by` 同源）。

**没有这个字段，「仅限本人创建」这条规则在列表页无法实现。**

---

## 3.【必需】请在删除接口强制校验创建人归属

**请求**：`delete_draft`（以及第 4 项的批量端点）加入归属校验：

| 调用方               | 条件                           | 结果                                      |
| -------------------- | ------------------------------ | ----------------------------------------- |
| `role = super_admin` | —                              | 放行（仍受「未发布 / 无引用」等既有限制） |
| `role = admin`       | `entry.created_by = 调用方 id` | 放行                                      |
| `role = admin`       | `entry.created_by ≠ 调用方 id` | **拒绝**                                  |

**为什么必须在后端**：前端的按钮置灰只是体验优化，不构成权限。
普通管理员绕过 UI 直接调 API 就能删他人词条。**后端不校验 = 这条规则不存在。**

**错误码建议**：越权返回 `403`，与现有 `409`（"这条本身不可删"）区分开——
两者对管理员的意味完全不同（"你没资格删" vs "这条谁都删不了"），前端需要给出不同文案。

---

## 4.【建议】请新增批量删除端点 `POST /admin/lexicon/entries/delete-batch`

**背景**：后端目前只有单条删除。前端循环调用能做出批量的样子，
但拿不到现有 `archive-batch` / `restore-batch` 承诺的「任意一条冲突时全部保持原状」。
永久删除不可逆，非原子的"删了一半"是最坏的失败模式——同一个页面里两种批量给出两种保证，
对管理员是误导。

**建议形状**（与现有生命周期批量端点完全一致，两侧都无需引入新概念）：

- **请求体**：直接复用 `EntryLifecycleBatchInput` 的结构 ——
  `{ entries: EntryLifecycleTarget[] }`，其中
  `EntryLifecycleTarget = { id, base_revision, base_lifecycle_revision }`。
  这个形状与 `DeleteDraftInput` 逐字段吻合，**无需新 schema**。
- **上限**：100 条，与 `archive-batch` / `restore-batch` 一致。
- **原子语义**：任意一条不满足条件则整批不执行。
- **幂等**：沿用 `Idempotency-Key` 头。
- **响应**：返回 `{ affected }` 即可。
  不宜复用 `EntryLifecycleBatchResponse`（它会回 `words: AdminWordV2[]`，
  但词条已删除，返回实体没有意义）。
- **错误**：`409` / `403` 需能**定位到具体是哪几条**导致整批失败及各自原因
  （有发布历史 / 被引用 / revision 冲突 / 越权）。
  否则管理员面对 100 条选择只能得到一句"失败"，无从下手。
  建议在 `ProblemDetails` 中带上冲突条目的 id 列表。

---

## 5.【可选】列表行增加 `deletable`（布尔）

前端目前只能靠 `published_revision` 是否缺省来推断「从未发布」，
但该字段的注释写明 **legacy 行也会缺省**，存在误判风险。

若后端能在 `AdminWordListItem` 上直接给出 `deletable`
（按真实规则计算：无发布历史 + 无入站引用），
前端就能准确置灰按钮，而不是让管理员点下去再吃 409。

---

## 附：本期不做的部分

「**发布过的**归档词条」的清理**不在本期范围**。
按 `docs/word-data-model.md`，已发布词条不物理删除、归档不释放 catalog 引用，
需要「显式清理 publication + 级联释放」的受审计能力，文档里写明是"未来"的事。
如果后端对这块已有排期或想法，也请同步一下，我们好规划。
