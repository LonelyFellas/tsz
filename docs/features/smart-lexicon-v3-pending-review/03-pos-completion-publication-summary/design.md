# Smart Lexicon V3 基本词性未填计数与发布问题汇总：技术设计

## 现状与复用判定

| 能力          | 最新 main                                                               | 原始混合 worktree                                                | 判定                                |
| ------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| 本地 POS 计数 | 无                                                                      | 新增 `posCompletion.ts`，只有 2 个纯函数测试；组件矩阵未完整落地 | 算法可复用，测试需补全              |
| 发布总数      | 用 `v3IssueMessages()` 去重后计数                                       | 改用原始 `issues.length`                                         | 可复用                              |
| POS/类型聚合  | 无                                                                      | 有 POS/ancestor 遍历、类型聚合和 scope label                     | 可复用并补“步骤子计数”              |
| issue 导航    | 已有 `navigateToV3Issue` / `navigateIssue`                              | 直接复用                                                         | 已合入，不重写                      |
| 字段错误      | 组件大多不消费 server issue                                             | 旧实现给发音、sub POS、frequency、definition、grammar 加状态     | 映射可复用                          |
| 状态来源边界  | `issues` 会被任何 validation error 设置，并在普通 canonical save 后清空 | 旧实现沿用同一状态                                               | **必须重做**，否则违反检查/发布边界 |
| layout 警告墙 | layout 逐条显示去重 issue，preview 又显示 Alert                         | 旧实现删除 layout 列表                                           | 可复用                              |

## 方案概述

把本地进度、操作错误和发布检查结果拆成三个事实源：

1. `posCompletion`：纯函数读取当前 local forms/meanings，供 Tab Badge 即时显示。
2. `problem`：保存、complete、revision、网络等当前操作错误，继续用现有问题展示，不自动变成字段发布错误。
3. `publicationIssues`：只由 `validate` 或 `publish` 结果更新，供 preview 摘要和字段状态；普通编辑/保存不清除。

后端合同不变，前端不新增 validate 请求。

## 本地计数设计

新增 `posCompletion.ts`：

- `countV3PosFormIncomplete(pos)`：empty group + incomplete form，form 最多计一次。
- `countV3PosMeaningIncomplete(pos, content)`：按需求口径统计 grammar/sense/sentence 未填单元。

Step 2 和 Step 3 在构造 Tabs items 时调用，`Badge count={0}` 由 antd 默认不显示。计数函数不读取 issues，避免发布结果影响本地进度。

测试应使用独立 fixture 覆盖 common/uk_us、多发音、空 group、多个 sense 和删除后的实时重算，不能只测一个从 1 到 0 的 happy path。

## 发布 issue 状态机

在 `V3WordCreationWizard` 会话中增加独立状态：

```ts
type PublicationCheckState = {
  validatedRevision: number;
  issues: V3DraftValidationIssue[];
};
```

更新规则：

- `actions.validate()` 成功：无论 valid 与否，使用响应整体替换 `publicationCheck`；valid 时 issues 为空。
- `actions.publish()` 返回 validation problem：使用 publish 响应 issues 替换；其他错误不覆盖最近检查结果。
- save forms/meanings、`intent=complete` 失败、输入和步骤切换：不更新 `publicationCheck`。
- save 成功的 `applyCanonical`：不清除 `publicationCheck`；保留提示直到下一次检查。
- entry ID 改变、会话卸载或发布成功结束：随组件生命周期重置。

现有 `problem` 仍负责向用户说明普通保存/complete 失败。若这些错误也含 field issues，只在 problem Alert 中展示，不传给 forms/meanings 的“最近发布检查”字段状态。

## 汇总模型

建议新增纯计算模块 `publicationIssueSummary.ts`，输出：

```ts
interface PublicationIssueSummary {
  total: number;
  positions: Array<{
    key: string;
    label: string;
    pos_id?: string;
    by_step: { forms: number; meanings: number };
    issues: V3DraftValidationIssue[];
  }>;
  types: Array<{
    code: V3ValidationIssueCode;
    label: string;
    count: number;
    scopes: string[];
    issues: V3DraftValidationIssue[];
  }>;
}
```

归属顺序：

1. `node_location.pos_id` 精确命中。
2. `node_id + ancestor_node_ids` 遍历 forms/meanings 实际结构，解析 POS。
3. 无法解析时按 `issue.step` 放入“词形与发音”或“词义与例句”通用组。

任何聚合只用于展示；原始 issues 数组完整保留。每个分组按钮把 `issues[0]` 交给现有导航链。

## UI 结构

preview 的唯一发布问题区域采用：

1. 总览：`还有 {issues.length} 项待完成`。
2. POS/步骤卡：基本词性、总数、forms/meanings 子计数、一个“去填写”。
3. 问题类型：code 对应产品文案、数量、受影响 POS/form type/step scope、一个“去填写”。

删除 `V3WordCreationLayout` 的逐条 `待完成项` 区域。forms/meanings 顶部只保留一条简短说明：“已按最近一次发布检查结果标出对应字段；修改后请重新检查以更新状态。”

字段映射至少覆盖：

- pronunciation `style` / `dict_phonetic` / `actual_pron`；
- sense `sub_pos` / `frequency`；
- definition content / `grammar_structure_id`；
- 已有可靠 DOM anchor 的 sentence 字段。

已纳入当前契约但尚无精确字段 anchor 的 code 不应崩溃：保留摘要和步骤导航，并使用现有安全产品文案。真正超出 runtime schema 的未知 code 继续 fail closed，不能在解析层静默吞掉。

## 前后端边界

### 后端

不改业务规则、API 或数据库。继续保证：

- `DraftValidationResponseV3.issues` 返回原始列表；
- 每个 issue 有 `step`、`node_id`、`field`、`code`、`node_location`；
- publish 重跑权威校验。

实施阶段只补/运行合同回归，证明主要 issue code 的 ancestor/pos 定位可用。若发现某个 code 无法定位，应先记录具体合同缺口；不能由前端猜 UUID。

### 前端

- 本地 badge 只做未填进度。
- publicationIssues 只消费检查/发布结果。
- summary/field state 不修改 canonical 数据，不影响请求 body。

## 代码影响范围

### 新增

- `apps/admin/src/features/dictionary/word-creation-v3/posCompletion.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/posCompletion.test.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/publicationIssueSummary.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/publicationIssueSummary.test.ts`

### 修改

- `components/V3FormsAndPronunciationStep.tsx` / `.test.tsx`
- `V3MeaningsAndExamplesStep.tsx` / `.test.tsx`
- `components/V3PronunciationList.tsx` / 对应测试
- `V3PreviewAndPublishStep.tsx` / `.test.tsx`
- `V3WordCreationWizard.tsx` / `.test.tsx`
- `V3WordCreationLayout.tsx` / `.test.tsx`
- `apps/admin/src/pages/WordWizardV3.tsx` / `.test.tsx`（只在 controller/slot 传递需要时）
- `v3-preview.css` 和现有表单 CSS（仅必要样式）

不改 `@tsz/types` / api-client / Rust，除非合同审查发现真实缺口并另行评审。

## 兼容与发布顺序

这是前端展示切片，可在当前后端合同上独立发布。建议在切片 2 后实施，因为两者都修改 V3 wizard/page tests。

1. 先锁定本地计数口径和发布状态边界测试。
2. 实现纯函数与状态机，再接 UI。
3. 跑 admin 聚焦/全量门。
4. 用真实测试草稿点击检查，验证 raw count、分组和导航；不靠 mock 证明后端 issue 数。

## 风险与回滚

| 风险                                 | 处置                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 本地徽标被误解为发布错误数           | 文案/title 明确“未填项”，设计上与红色发布问题分离                                                             |
| 普通保存清除或生成字段红框           | publicationIssues 独立状态机 + 专门负向测试                                                                   |
| 同文案去重导致总数错误               | total 只取原始 `issues.length`                                                                                |
| issue 缺 pos_id 导致归错             | ancestor/node 遍历；无法确定时回退 step，不猜 POS                                                             |
| 删除节点后旧 issue 指向不存在元素    | 汇总仍可显示；导航降级到 step/POS；下次检查清除                                                               |
| 大量 issues 导致 DOM 警告墙/测试超时 | 按组渲染，不逐 issue 渲染；测试避免大表格 `getByRole` 扫描                                                    |
| 当前枚举新增 code 或运行时未知 code  | 编译期 `Record<V3ValidationIssueCode, ...>` 强制补文案；OpenAPI/runtime schema 同步；真正未知响应 fail closed |

回滚为纯前端回滚，无数据影响；后端权威校验始终保留。
