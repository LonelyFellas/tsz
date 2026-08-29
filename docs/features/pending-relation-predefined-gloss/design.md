# 未入库关联词预定义词义：技术设计

## 方案

在现有 pending relation 形态上增加可选 `pending_target_gloss`，而不是另建 pending sense
对象。它是一次性物化参数：草稿期间持久化；目标草稿创建后写入默认中文定义并清空；
relation 最终只保留稳定 target IDs。

选择字符串而非 RichText：产品只要求一条预定义中文词义；物化时由后端构造规范
`RichText::plain/empty`，避免客户端伪造 annotation UUID 或扩展本轮范围。

## 拒绝方案

- 仅前端本地保存：刷新丢失且发布无法消费。
- 写入只读 `target_gloss`：请求层会过滤，且语义上会伪造已绑定快照。
- 输入时立即建目标草稿：恢复已废弃方案，会让试填污染词库并引入查重/同形确认副作用。
- 命中已有词条时覆盖第一条词义：跨词条破坏性写入，明确禁止。

## Wire 与持久化

以下 V2/V3 relation read/write DTO 均增加：

```ts
pending_target_gloss?: string;
```

合法形态：

```text
bound  = target_word_id + target_sense_id
pending = pending_target_headword + optional pending_target_gloss
```

数据库 `lexicon.relations` 增加 nullable `pending_target_gloss TEXT`。迁移同时更新
`lexicon_relations_target_shape_check`：gloss 只能随 pending headword 出现，bound 形态必须
为 NULL。entry editor JSON 投影与关系表读写必须 round-trip 该字段。

## 后端改动

建议文件（以当前 tsz-rust 为准，实施时再按实际模块收窄）：

- `src/lexicon/dto/aggregate.rs`：V2 relation 字段与 schema 文档。
- `src/lexicon/dto/v3.rs`：V3 read/write relation 字段。
- `src/lexicon/repository/projections.rs`：关系表 insert/read。
- `src/lexicon/service/publishing.rs`：pending 归一化、锁内冲突、stub materialization。
- `src/lexicon/v3_contract.rs`、meanings 校验路径：形态/长度/NUL field issue。
- migration：列与 check constraint。
- `src/openapi.rs` / 生成脚本：重新生成 `docs/openapi.json`，禁止手改。

发布物化：

1. 按现有 `NormalizedHeadword::parse` 去重 pending 目标。
2. 同一词面被多条 relation 引用时：若多个非空 gloss 归一后不一致，返回
   `relation_pending_gloss_conflict`，不得任选一个。
3. 若同名目标不存在，`build_relation_target_stub` 创建既有骨架，再把 gloss 写入默认
   sense 第一条 `ZhDefinition.content`。
4. 若同名目标已存在且 gloss 非空，返回
   `relation_pending_gloss_target_exists`（field=`pending_target_gloss`），要求管理员选择已有
   具体词义；不得静默丢弃或覆盖。
5. 成功绑定/物化后清空 `pending_target_headword` 与 `pending_target_gloss`。

长度使用 `MAX_RICH_TEXT_CODEPOINTS=5000`；NUL 与正文共同 fail closed。错误使用现有
`DraftValidationIssue`，node_id 指 relation UUID。

## 前端改动

- `packages/types/src/admin-word-v3.ts` 与 V2 类型镜像增加字段。
- 同步后端生成的 `packages/api-client/src/openapi.snapshot.json`、runtime schema 和合同测试。
- `word-creation-v3/meaningsModel.ts` 保留/提交字段；read-only target snapshots 仍不进写 DTO。
- V2 model/validation 同步 relation shape，避免两代编辑器口径分叉。
- `V3MeaningsAndExamplesStep.tsx`：复用第三列“匹配词义”的位置；pending 行在该位置
  直接显示“预定义词义（可选）”单行输入，bound 行显示具体词义下拉，不额外增加下一行
  TextArea。绑定已有词义时清空 pending 字段；输入不重铸 relation UUID。
- preview/history：pending 行显示词面与预定义词义；bound 行不显示 pending 信息。
- 前端码点预检复用 5000 上限，但后端继续权威校验。

## 数据流

```text
输入未入库词面 -> pending_target_headword
填写预定义词义 -> pending_target_gloss
保存 meanings -> DB/JSON round-trip
发布锁内：
  已存在 + gloss -> field issue，不覆盖
  不存在 -> 创建 V2 stub -> 写默认 A1 zh_definition -> 回填 target IDs -> 清 pending
```

## 测试策略

- Rust DTO serde/OpenAPI snapshot：V2/V3 read/write 可选字段。
- Rust unit：形态、空白、5000/5001、NUL、同词面 gloss 一致/冲突。
- Rust integration：save/GET round-trip；发布物化正文；旧无 gloss 兼容；并发同名锁；已有目标
  不覆盖。
- 前端 unit：model mapping 与提交互斥形态。
- 前端 component：输入/清空/绑定已有词义清除 pending；UUID 不变；错误定位。
- Contract：OpenAPI runtime schema、snake_case、后端生成快照。
- Manual：localhost 真 API 保存刷新、发布后目标草稿 read-back。

## 部署顺序与回滚

1. 后端 expand migration + DTO/OpenAPI +兼容读写；部署后旧前端继续工作。
2. 前端同步合同并启用 UI。
3. 回滚前端安全；回滚后端前先确认没有非 NULL 新字段，否则旧二进制/约束无法消费。

## 风险

- 同词面多 gloss 冲突：必须结构化报错，不能按数组顺序取值。
- 已有同名目标：不能覆盖或吞掉管理员文本。
- 双仓当前均有未提交并发改动，实施必须逐文件保留并跑完整合同/覆盖率门。
- `feature` skill 只授权前端实现；后端实施需要单独批准其合同与修改范围。
