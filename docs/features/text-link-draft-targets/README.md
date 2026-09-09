# 例句正文关联允许指向草稿词条（指路）

本功能跨仓，评估与设计文档集中在后端仓：

- `tsz-rust/docs/features/text-link-draft-targets/requirements.md`
- `tsz-rust/docs/features/text-link-draft-targets/design.md`

前端改动范围（admin）见 design.md §2.6–2.7：`@tsz/types` 六处 `publication_id` 变可选、
api-client `sync:openapi`、`V3TargetCascader` 固定带 `include_drafts` 并渲染草稿标记、
`V3TextAssociationPicker` / `V3PhraseComponentUsagesCard` 的已选视图标「草稿」、`model.ts` 成分校验放宽。
成分用词已于 2026-09-09 确认一并放开。
