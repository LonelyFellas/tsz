# 后端对接待办清单 —— 新建单词流程「词形与发音」

> **来源**：2026-08-20 智能词库系统测试报告（测试服 `http://47.121.142.19:8081/`，测试词
> `testability`，报告编号 TSZ-LEX-001 / TSZ-LEX-002）。
>
> **前端已处理的部分**（PR #146，已合入 main）：英美模式来回切换时不再重新生成词形变体的节点
> ID，词形编辑区常驻提示缺少某侧发音人。本清单只列**前端修不了、需要后端或运维介入**的部分。
>
> 结论先说：**后端的节点身份校验行为是对的，不要放宽**。问题出在「已退役的稳定槽位身份没有
> 任何渠道能被前端知道」，以及测试环境缺 `en-GB` 发音人。

结果速览：

- 🔴 **#1 草稿响应需要暴露已退役的稳定槽位节点身份** —— 阻断，前端无法单独修复。
- 🟡 **#2 节点身份类错误响应需要可定位字段** —— 体验问题，用户当前看到的是内部规则文案。
- 🟡 **#3 补接口回归：拆分再合并（含保存后重开）** —— 防回归。
- 🟠 **#4 运维：测试环境 `speech.voices` 缺 `en-GB`** —— 英式「获取语音」不可用的主因。

---

## #1 草稿响应需要暴露已退役的稳定槽位节点身份

### 现状与证据

词形变体的节点角色把方言编了进去，且稳定槽位在库层面是**永久唯一**的：

- `src/lexicon/node_identity.rs:18` —— `form_variant_role` 产出 `forms.form_variant:<dialect>`。
- `migrations/20260812100000_add_lexicon_node_bindings.up.sql` ——
  `CREATE UNIQUE INDEX lexicon_nodes_stable_slot_key ON lexicon.nodes (entry_id, parent_node_id, node_role) WHERE stable_slot;`
  **没有** `removed_from_draft_at IS NULL` 的偏索引条件。
- `src/lexicon/repository/publications.rs` —— `node_identities()` 查询是
  `WHERE entry_id = $1 OR id = ANY($2)`，同样不过滤已移除节点。
- `src/lexicon/validation/structure.rs` —— `existing_stable_slots` 因此把已退役节点也算进来，
  提交新 ID 时报 `stable_node_id_changed`。
- `src/lexicon/repository/entries.rs` —— `replace_entry_content()` 的注释写得很清楚：
  「registry 节点保留并先标记移除，重新出现的稳定 ID 会被激活」。

也就是说：**(词条, 槽位, 方言) 一旦保存过，那个节点 ID 就永久占着这个槽位，重新出现时必须
沿用它。** 这个设计本身没问题，前端也已经按这个口径改了。

问题在于，前端拿不到「曾经保存过、现在已退役」的那些 ID：

1. 管理员把某个词性从「英美共用」切成「英美区分」，`common` 变体消失、`uk`/`us` 出现。
2. **保存草稿**。后端把 `common` 节点标 `removed_from_draft_at`，`lexicon.form_variants` 里
   对应行被 `delete_current_content()` 删掉。
3. 管理员刷新页面（或换台机器打开）。此时 `GET` 草稿只返回 `uk`/`us` 两条变体，
   原来那个 `common` 节点 ID **不在响应里的任何位置**。
4. 管理员再切回「英美共用」。前端只能生成一个新的 `common` ID → 422 `stable_node_id_changed`。

这一步在界面上无法自愈：管理员唯一的出路是删掉整个基本词性重建，连带丢掉已录内容。

> 前端 PR #146 用一本「节点身份账本」记住了当前向导实例里出现过的方言节点，覆盖了
> 「切换 → 保存 → 返回上一步 → 再切换」；但账本活不过页面刷新，**跨刷新这条路径必须后端补**。
> 边界已写在 `apps/admin/src/features/dictionary/word-creation/formVariantIdentity.ts` 的模块注释里。

### 建议（二选一，倾向方案 A）

**方案 A（推荐）：草稿响应带上该词条已退役的稳定槽位身份。**

`AdminWordV2` 新增一个数组字段，例如：

```jsonc
{
  "retired_stable_slots": [
    {
      "id": "0198f3c2-....",
      "parent_node_id": "0198f3b7-....",
      "node_role": "forms.form_variant:common"
    }
  ]
}
```

- 取值：该词条下 `stable_slot = TRUE AND removed_from_draft_at IS NOT NULL` 的节点。
- 数量有界：每个槽位最多 `common` / `uk` / `us` 三条，不会膨胀。
- 前端拿到后直接播种身份账本，槽位重新出现时沿用原 ID，跨刷新、跨设备都成立。
- 需要重新导出 `docs/openapi.json`，前端重跑 `sync:openapi`。

**方案 B（更省事，但只能覆盖一半）：对「从未发布过」的已退役稳定槽位节点做真删。**

在 `replace_entry_content()` 里，标记移除之后补一条：

```sql
DELETE FROM lexicon.nodes
WHERE entry_id = $1
  AND stable_slot
  AND removed_from_draft_at IS NOT NULL
  AND first_published_at IS NULL;
```

- 不改 wire 契约，不用重跑 `sync:openapi`。
- 但**已发布过的词条仍然卡住**：`common` 曾随发布上线过 → `first_published_at` 非空 → 保留 →
  再合并回共用仍然 422。对「发布后回来改英美口径」这条路径无效。

### 无论选哪个

1. 请把「共用 ↔ 英美拆分/合并」的节点身份转换契约写进
   `tsz-rust/docs/frontend-integration.md` §10（现在只有第 3、4 行两句提示，没说清楚
   已退役身份怎么找回）。
2. 契约确定后前端会跟一个改动：把账本的播种来源从「当前草稿内容」换成后端给的退役身份，
   并删掉模块注释里的边界说明。

### 影响前端

- 代码锚点：`apps/admin/src/features/dictionary/word-creation/formVariantIdentity.ts`、
  同目录 `FormsAndPronunciationStep.tsx` 的 `loadFormsWithIdentities()`。

---

## #2 节点身份类错误响应需要可定位字段

### 现状

`stable_node_id_changed`、`node_binding_changed`、`node_binding_unknown` 三个 issue 目前只带
`node_id` + 一句面向实现的中文：「已有内容槽位必须保留原节点 ID」。

测试报告里管理员看到的是**两条一模一样的这句话**，页面进度却全是「已完成」，无法判断是哪个
词性、哪个词形出的问题，也没有任何可操作的修复入口。

### 建议

`DraftValidationIssue` 里已经有 `reference_location: Option<DraftReferenceLocation>` 这个
可选子对象的先例（`src/lexicon/dto/operations.rs`），照同样的形状再加一个即可，不影响存量
issue 的序列化。名字可自定，要点是能还原到界面位置：

```jsonc
{
  "step": "forms",
  "code": "stable_node_id_changed",
  "node_id": "...",
  "locator": {
    "pos": "verb",
    "form_group_index": 0,
    "form_type": "third_person_singular",
    "dialect": "common",
    "slot_path": "forms.pos[1].form_groups[0].slots[0].variants[0]"
  }
}
```

- 旧 ID / 新 ID 这类内部值**只写服务端日志**，不要下发给前端展示。
- 前端会据此把提示改写成「动词 · 第三人称单数：词形模式切换后数据状态不一致，请恢复后重试」，
  并支持点击定位到具体字段。

### 影响前端

- 现在 `handleFormsFieldIssues()` 直接把 `issue.message` 原样展示。
- 代码锚点：`apps/admin/src/features/dictionary/word-creation/FormsAndPronunciationStep.tsx`
  的 `handleFormsFieldIssues`、`useWordValidationIssueFocus.ts`。

---

## #3 补接口回归：拆分再合并（含保存后重开）

现有集成测试（`tests/lexicon_handler.rs`）只覆盖了「把已有稳定槽位换成新 ID 应当拒绝」这个
反向用例，没有覆盖**合法的**拆分再合并。建议补：

1. 保存一份含原形 + 至少一个派生词形的 `unified` 草稿，记下各槽位 `common` 变体的节点 ID。
2. 提交拆分（`uk`/`us`，新 ID）→ 预期 200。
3. **重新 `GET` 草稿**，按 #1 落地的方案取回 `common` 的原 ID，提交合并 → **预期 200**。
   （方案 B 的话，这一步是提交全新的 `common` ID 也应当 200。）
4. 已有槽位换新 ID 仍应 422，且错误里带 #2 的定位字段。

第 3 步是关键：它正是当前线上会 422、而契约上应该允许的那条路径。

---

## #4 运维：测试环境 `speech.voices` 缺 `en-GB`

### 现状与证据

- 英式「获取语音」按钮全部禁用，对应美式按钮可用；英式按钮悬停显示
  `en-GB 暂无可用发音人`（稳定复现 2/2：动词原形、第三人称单数）。
- 前端对明确标了方言的内容**故意不做降级**（否则英式词形会用美式口音朗读），
  找不到匹配 locale 的 voice 就禁用按钮。这个行为不改。
- `src/speech/preview/repository.rs` 的 `list_voices()` 只返回 `WHERE enabled` 的记录；
  仓库里（migrations / ops）**没有任何发音人种子**，`speech.voices` 全靠手工数据。
- 前端 mock（`apps/admin/src/features/dictionary/voice-editor/mock.ts`）里 `en-GB` 和 `en-US`
  都有，所以本地永远绿、只有真机能发现。

### 处理

先看现有目录，照抄 en-US 那行的 `provider` / `provider_version`：

```bash
psql "$DATABASE_URL" -c "SELECT alias, provider, provider_voice_id, locale, gender, provider_version, enabled FROM speech.voices ORDER BY alias;"
```

再补一条 `en-GB`（provider 是 Azure）：

```bash
psql "$DATABASE_URL" -c "INSERT INTO speech.voices (id, alias, provider, provider_voice_id, locale, gender, styles, provider_version, enabled) VALUES (gen_random_uuid(), 'en-gb-sonia', 'azure', 'en-GB-SoniaNeural', 'en-GB', 'female', '[]'::jsonb, '<照抄 en-US 行>', TRUE);"
```

验收：

1. `GET /api/v1/admin/speech/voices` 响应里同时出现 `en-GB` 与 `en-US`。
2. 用该 alias 调一次试听合成，确认返回**真实音频**而不是 Mock。
3. 词形与发音页切到英美区分，原形和至少一个派生词形的两侧按钮都可用、都能播放。

### 建议一并做的

把发音人初始化纳入可重复执行的环境种子或部署检查（现在只要重建库就会再丢一次）。

---

## 不在本清单内

- **关联词不存在时创建草稿并关联**：测试报告里的「大功能待办」，属于新功能而非缺陷，
  优先级待产品确认，前后端共同评估后另开需求。
- **前端侧的提示与账本改动**：已在 PR #146 落地。
