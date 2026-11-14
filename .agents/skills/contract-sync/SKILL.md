---
name: contract-sync
description: 同步 tsz 前端的 endpoint/runtime 快照、snake_case wire 类型与实际消费者；跨仓版本及发布顺序读取选定 tsz-rust 的契约流程。
---

# 前端契约与消费者

遵循 [AGENTS.md](../../../AGENTS.md)。本文件维护前端生成和验证；跨仓目标版本、Rust OpenAPI 导出、兼容顺序由所选 tsz-rust 的 `.agents/skills/contract-sync/SKILL.md` 维护，配套发布见 [入口](references/paired-release.md)。

先从任务目标、Git 身份及工作树列表核实本次前后端 checkout、SHA/脏差异与端点范围；相邻主仓只是候选。首次跨仓同步读取后端流程；已加载时直接沿用其版本和导出证据，不递归重跑。
只读核对不运行生成器。缺少配套 checkout/spec 时完成现有前端检查，明确契约或兼容证据缺项，不改用另一个主仓的快照。

## 前端生成

在所选前端 checkout 执行，`tsz_backend_root` 必须是已核实的 Rust checkout 绝对路径：

```bash
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE="$tsz_backend_root/docs/openapi.json" pnpm --filter @tsz/api-client sync:openapi
```

- 同输入已有有效生成证据就复用；先保护生成目标已有的用户改动。只要求核对请求时不执行生成。
- 清除继承的 `SYNC_OPENAPI_RUNTIME_ONLY`，避免遗漏 endpoint 快照。审查 `packages/api-client/src/openapi.snapshot.json` 和 `packages/api-client/src/admin-word-v3.runtime-schema.json` 的实际 diff，复用原生生成器，不手改生成字段。
- 核实 `_source` 与 runtime `_source_sha256` 对应选定 spec。路径元数据变化与契约变化分开判断，未提交输入标记 SHA + 工作区差异。
- 按变化更新 `@tsz/types` 的 snake_case wire 镜像、请求及实际消费者，不增加命名转换层。实现与文档不一致先定位，不用断言或扩大 PENDING 白名单掩盖漂移。

## 前端验证

检查本次 method/path、错误/状态码、字段可选性/nullable、枚举及权限分支；严格 runtime 可能拒绝新增响应字段，新客户端也可能无法接受旧 API 缺字段。
重点核对 `endpoints.contract.test.ts`、`runtime-schema.test.ts` 及相关业务契约测试。运行受影响契约文件；完成同步须有本次输入的 `pnpm --filter @tsz/api-client test` 和受影响类型检查证据。紧接 ship 时类型检查可由正常 hooks 承接，其余同状态证据共享，不另叠全量门。

兼容性组合使用后端公共流程；需要真实页面链路按 [真实后端验收](../test/references/real-backend-acceptance.md) 验证。报告 spec 来源/哈希、生成物、消费者、检查及缺项，不自动提交或部署。
