# 例句正文关联允许指向草稿词条（指路）

本功能跨仓，评估与设计文档集中在后端仓：

- `tsz-rust/docs/features/text-link-draft-targets/requirements.md`
- `tsz-rust/docs/features/text-link-draft-targets/design.md`

前端改动范围（admin）见 design.md §2.6–2.7：`@tsz/types` 六处 `publication_id` 变可选、
api-client `sync:openapi`、`V3TargetCascader` 固定带 `match: "exact"` 与 `include_drafts` 并渲染草稿标记、
`V3TextAssociationPicker` 的已关联视图标「草稿」、`model.ts` 成分校验放宽。
成分用词已于 2026-09-09 确认一并放开（共用同一级联，卡片本身无改动）。

回退限制：前端一旦写入过草稿关联，就不能单独回退到本功能之前的版本——旧 runtime schema 仍把
`TextLinkV3.target_publication_id` 列为必填，含草稿关联的词条会被 `assertRuntimeContract` 拒掉、整条打不开。
