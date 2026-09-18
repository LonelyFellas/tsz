# form-group-base-optional：设计

## 现有能力与依赖

- 前端 `addFormGroup`（`apps/admin/src/features/dictionary/word-creation-v3/operations.ts:882`）无条件 `addConcreteForm(..., "base")`，每组新组自带原形，拼写沿用规则来源组原形。
- 前端 `components/V3FormGroupCard.tsx:54` `BASE_REQUIRED_HINT` + `:120-133` `lockedBaseFormIds`/`soleBaseMembershipId`：锁每组唯一原形的删除与改类型。
- 前端 `model.ts:795-825` `validateFormsContent`：complete 时每组必须有 base，否则 `base_form_required_in_group`（与后端同口径）；`presentationErrors.ts:24` 映射 UI 文案。
- 后端 `src/lexicon/v3_contract.rs:250-263`：complete 时每组必须有 base，否则 `BaseFormRequiredInGroup`。
- 后端 `src/lexicon/service/sentence_association.rs:405-424`：候选 `base_form_ids` = 同组所有 base；为空且自身非 base 时保持空（`:420` 只对 base 自身兜底）；`:539` 候选按 `base_form_ids` 展开，空则无候选。

## 选定方案（A：真放宽，仅第 1 组必须有原形）

- 后端：校验循环带 `group_index`，仅 `index == 0` 缺 base 时报 `BaseFormRequiredInGroup`。
- 前端 `addFormGroup`：仅 `pos.form_groups` 为空（第 1 组）时塞原形；否则返回空组。
- 前端 `V3FormGroupCard`：`lockedBaseFormIds` 只看 `pos.form_groups[0]`；`soleBaseMembershipId` 仅在 `groupIndex === 0` 时计算。
- 前端 `model.ts`：校验循环带 `groupIndex`，仅 `index === 0` 缺 base 时报 `base_form_required_in_group`；`presentationErrors.ts` 文案同步为“第 1 组”。

## 文件/接口影响

- 后端 `src/lexicon/v3_contract.rs`（校验逻辑 + 测试 `complete_requires_the_first_form_group_to_keep_a_base_form`）。
- 前端 `apps/admin/src/features/dictionary/word-creation-v3/operations.ts`（`addFormGroup`）、`components/V3FormGroupCard.tsx`、`model.ts`（`validateFormsContent`）、`presentationErrors.ts`，及测试 `operations.test.ts`、`model.test.ts`、`V3FormsAndPronunciationStep.test.tsx`、`reviewModel.test.ts`（注释）。

## 兼容与发布顺序

- 后端放宽向后兼容：旧前端仍每组建原形，发布不受影响。前端删除第 2 组原形依赖后端放宽，故**后端先发、前端后发**（或同批，后端先合并）。

## 风险验证

- 第 2 组无原形 → 屈折形关联候选消失（既定代价），需人工验证不 panic、返回空。
- 删第 1 组后原第 2 组升为 index 0，后端重新要求它有原形、前端锁删跟随 index 0，行为一致。
