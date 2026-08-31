# 智能词库「词条被引用次数」评估

> 起因：垃圾桶清理上线后，管理员在列表里看不出一条词条是否被别处引用，
> 只能点了删除才被后端告知。需求是把「被引用次数」提到智能词库里可见。
>
> 本文基于 2026-08-31 对 tsz-rust `dev` 分支与本地库 schema 的实查，
> 不是纸面推演。

## 1. 引用来源全景

先把"被引用"穷举清楚——这是整个评估的地基，漏一类就会出现
「显示 0 引用却删不掉」的自相矛盾。

以下 6 类是 `lexicon` schema 中所有指向词条的引用列（由
`information_schema.columns` 全量筛出，非人工回忆）：

| #   | 来源                   | 表.列                                                | 业务语义                                                 | 删除时是否检查 | DB 外键   |
| --- | ---------------------- | ---------------------------------------------------- | -------------------------------------------------------- | -------------- | --------- |
| 1   | 关联词（已绑定）       | `relations.target_sense_id` / `target_entry_id`      | 别的词条把本词条的某个词义设为**近义/反义/派生词**       | ✅             | RESTRICT  |
| 2   | 关联词（预绑定待物化） | `relations.prebound_target_entry_id`                 | 别的词条填关联词时该词还没建条，本词条建出来后被自动绑上 | ✅             | RESTRICT  |
| 3   | 例句关联（已生效）     | `sentence_links.target_entry_id`                     | 别的词条的**例句**把本词条标为 `focus` / `context`       | ✅             | ❌ **无** |
| 4   | 发布内容词义引用       | `entry_publication_sense_refs.target_entry_id`       | 已发布内容引用本词条词义                                 | ✅             | RESTRICT  |
| 5   | **例句关联（待认领）** | `sentence_associations.target_entry_id`              | 例句里标注了指向本词条的位置，尚未认领/物化              | ❌ **漏**      | RESTRICT  |
| 6   | **V3 短语成分**        | `v3_phrase_variant_component_usages.target_entry_id` | **短语把本单词作为成分**（短语 ↔ 单词的引用）            | ❌ **漏**      | RESTRICT  |

关联类型枚举确认为 `RelationTypeV2 = synonym | antonym | derivative`，
与产品语义一一对应。

## 2. 现状暴露的两个缺口

### 缺口 A：删除被 5/6 引用的词条会返回 500（真实缺陷）

删除时的入站引用检查（`repository/entries.rs:759` 的四路 UNION）只覆盖 1–4。
第 5、6 类走不到应用层判定，会一路走到 `DELETE FROM lexicon.entries`，
撞上数据库的 `ON DELETE RESTRICT`。

而 `map_entry_write_error`（`repository/entries.rs:6`）只映射了 4 个约束名：

```
lexicon_relations_target_fkey
lexicon_sentence_links_target_fkey
lexicon_publication_sense_refs_target_fkey
lexicon_publication_sense_refs_target_node_fkey
```

**不含** `lexicon_sentence_associations_target_fkey`、
`lexicon_v3_phrase_components_{base,form,pos}_fkey`、
`lexicon_relations_prebound_target_fkey`。外键冲突因此落到
`LexiconRepositoryError::Database(error)` —— 对管理员表现为**系统错误**，
而不是「该词条被 X 个短语引用，不能删除」。

**数据不会坏**（RESTRICT 拦住了，不会产生悬挂引用），坏的是体验与可诊断性。

顺带注意第 3 类：`sentence_links` 的 target **没有外键**，
唯一防线就是应用层那路检查——它不能被削弱。

### 缺口 B：引用信息在列表里完全不可见

管理员在垃圾桶（乃至整个智能词库）看到的按钮是亮的，
点下去才知道删不掉。这正是本需求要解决的。

## 3. 方案

### 3.1 计数口径（需产品确认，建议如下）

| 问题                           | 建议                 | 理由                                                                                                 |
| ------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| 数"引用条数"还是"引用方词条数" | **按引用方词条去重** | 管理员真正关心的是"有几个词条依赖我"。同一个词条在 3 个词义里都设了近义词，对决策而言仍是 1 个依赖方 |
| 草稿里的引用算不算             | **算**               | `relations` 等表不分状态，草稿引用同样阻止删除。不算就会出现「显示 0 却删不掉」——比不显示更糟        |
| 自引用                         | **不算**             | 各路查询统一加 `source.entry_id <> 目标.entry_id`，与删除检查口径一致                                |
| 是否按类型拆分                 | **拆**               | 「被 3 个短语当成分」和「被 3 个近义词指向」对管理员是不同的信息                                     |

### 3.2 数据形状

后端已有 `RelationReferenceSummaryV2`（`total` / `by_type` / `previews[≤5]` / `truncated`），
但只覆盖第 1 类，且目前只挂在检测重名的 `MatchedEntryContextV2/V3` 上。

建议**新增一个覆盖 6 类的汇总**，而不是硬扩旧结构（旧结构的 `by_type`
是关联词三分类，语义上塞不进例句/短语）：

```
EntryReferenceSummary {
  total: u32,                    // 去重后的引用方词条总数
  by_source: {
    relation_bound: u32,         // 1 关联词（已绑定）
    relation_prebound: u32,      // 2 关联词（预绑定待物化）
    sentence_link: u32,          // 3 例句关联（已生效）
    publication_sense_ref: u32,  // 4 发布内容词义引用
    sentence_association: u32,   // 5 例句关联（待认领）
    phrase_component: u32,       // 6 短语成分
  }
}
```

列表行加 `reference_summary`；详情/悬浮再给 `previews`（复用现有
`RelationReferencePreviewV2` 的 `{source_word_id, source_headword, source_status}` 形状）。

### 3.3 性能

列表页每页最多 100 行，需要为每行算 6 类。已实测执行计划（本地 PG16）：

- 第 1 类**必须直接用 `relations.target_entry_id`**，不要像删除检查那样
  JOIN `nodes` 取 `entry_id`——JOIN 写法会退化成 `Seq Scan on relations`；
  直接用则走 `Index Scan using lexicon_relations_target_idx`。
- 第 2 类走 `lexicon_relations_prebound_target_idx`（Index Only Scan）。
- 第 3 类走 `lexicon_sentence_links_target_idx`。
- 第 5、6 类需确认 `target_entry_id` 上有可用索引，缺则补。

即每类都能走索引。但 100 行 × 6 子查询仍是 600 次索引探查，
**建议实施时用一次 `LATERAL` 或按 `entry_id IN (...)` 批量聚合后回填**，
而不是逐行标量子查询；并在有真实数据量的环境下测一次 P95。

### 3.4 顺带修掉缺口 A（建议纳入同一批）

1. 把第 5、6 类补进删除时的入站引用检查（与计数共用同一套口径，避免两处漂移）；
2. `map_entry_write_error` 补齐遗漏的约束名，作为兜底——即使将来又新增引用表，
   也应撞出可读的 409 而不是 500。

这两条与计数功能天然同源：**计数口径就是删除拦截口径**，
一处实现两处使用，才不会出现「显示 0 引用却删不掉」。

## 4. 工作量与风险

| 项                            | 规模 | 说明                                              |
| ----------------------------- | ---- | ------------------------------------------------- |
| 后端计数聚合 + DTO + 列表出参 | 中   | 6 路聚合 + 批量回填；新增 `EntryReferenceSummary` |
| 后端补删除检查（5、6 类）     | 小   | 复用同一聚合口径                                  |
| 后端补错误映射                | 小   | 加约束名                                          |
| 前端列表展示 + 明细           | 中   | 新增「引用」列；与删除按钮置灰联动                |
| 测试                          | 中   | 每类引用各造一条数据验证计数与拦截                |

**风险**

- **口径漂移**：计数与删除拦截若各写一套 SQL，迟早不一致 → 必须共用。
- **性能**：逐行标量子查询在数据量上来后会退化 → 用批量聚合，并实测。
- **V3 短语成分的语义确认**：短语引用单词时，`target_entry_id` 指向单词。
  需确认「短语被删」与「单词被短语引用」两个方向的展示措辞，别让管理员误读。
- **计数与实际可删性的一致性**：若计数排除了某类而删除仍拦截，会出现
  「0 引用但删不掉」——这是本评估最需要守住的不变量。

## 5. 待定

1. 计数口径按上文建议（引用方词条去重、含草稿、拆类型）是否认可？
2. 展示位置：只在列表加一列，还是列表 + 词条详情都展示？
3. 缺口 A 的修复是否纳入同一批（建议纳入）？
4. 是否需要「被谁引用」的下钻明细（点数字弹出引用方列表）？
