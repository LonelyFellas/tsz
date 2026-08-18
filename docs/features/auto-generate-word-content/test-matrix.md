# 词条内容自动生成与安全回填测试矩阵

## 后端单元 / 服务测试

| #   | 层          | 场景               | 输入/前置                                        | 预期                                                                       | 优先级 |
| --- | ----------- | ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- | ------ |
| B1  | 单元/数据库 | Kaikki 内容映射    | 固定多 POS、多 sense、带例句 JSONL/数据库记录    | 保留 source key、locator、POS、gloss 和 example                            | P0     |
| B2  | 单元        | 来源无正文         | 只有现有轻量 `dictionary.terms`                  | 分区为 `missing/source_not_found`，不生成假内容                            | P0     |
| B3  | 单元        | 结构化输出映射     | 合法 grammar/sense/definition/example 输出       | 服务端生成 UUID；grammar 引用与 focus link 闭包正确                        | P0     |
| B4  | 单元        | 非法模型输出       | 非法 CEFR、未知 POS、悬空引用、超数量            | 该分区 `failed/invalid_structured_output`，不落候选                        | P0     |
| B5  | 单元        | 方言证据           | 有英美证据 / 无差异证据                          | 前者可 distinguish，后者保持 common/unified                                | P0     |
| B6  | 单元        | 任务状态聚合       | completed/missing/failed 各种组合                | 精确得到 completed/partial/failed                                          | P0     |
| B7  | 服务        | 幂等创建           | 同 actor/key/payload 重复；同 key 不同 payload   | 前者复用 job，后者 409                                                     | P0     |
| B8  | 服务        | revision 冲突      | base_revision 旧于当前词条                       | 409，不建任务                                                              | P0     |
| B9  | 服务        | 权限与状态         | 未登录、非管理员、归档/只读词条                  | 401/403/422；无 provider 调用                                              | P0     |
| B10 | 服务        | 分区重试           | 仅 failed/missing keys；含 completed/未知 key    | 合法分区新 attempt；非法请求 422                                           | P0     |
| B11 | 服务        | worker 恢复        | running lease 过期、进程重启                     | 分区可重新领取，attempt 递增，不重复完成分区                               | P0     |
| B12 | 服务        | provider 错误映射  | 未配置、429、超时、安全拒绝、坏 JSON             | 稳定错误码，成功分区保留，任务可 partial                                   | P0     |
| B13 | 单元/HTTP   | 千问严格结构化输出 | qwen 配置、合法/非法 Chat Completions 响应       | 请求 `/chat/completions` 且携带 strict JSON Schema；合法解析，坏 JSON 拒绝 | P0     |
| B14 | 单元        | provider 选择      | 显式 openai/qwen、缺少所选配置、半配置           | 选择确定且 fail-closed，不静默跨 provider 降级                             | P0     |
| B13 | 服务        | 上限               | scope 空、过多 senses/examples、非法 fill policy | 422 或输出截断到契约上限并记录                                             | P0     |

## 后端 HTTP / OpenAPI

| #   | 层      | 场景     | 输入/前置                                | 预期                                              | 优先级 |
| --- | ------- | -------- | ---------------------------------------- | ------------------------------------------------- | ------ |
| H1  | HTTP    | 创建任务 | 已认证 admin、draft、有效 revision/key   | 202，响应符合 OpenAPI，任务可查询                 | P0     |
| H2  | HTTP    | 查询状态 | pending/running/completed/partial/failed | 封闭 enum 和 typed partitions，无密钥/内部 prompt | P0     |
| H3  | HTTP    | 重试     | partial job + 新 Idempotency-Key         | 202；只重置指定失败分区                           | P0     |
| H4  | HTTP    | 基础错误 | 401/403/404/409/422/429/503              | `application/problem+json` 与约定 code            | P0     |
| H5  | HTTP    | 重启恢复 | 建任务后重启真实服务                     | GET 仍可查询，worker 可继续                       | P1     |
| H6  | OpenAPI | 权威文档 | 由 utoipa 生成 `docs/openapi.json`       | path、header、schema、状态码齐全                  | P0     |

## 前端类型 / API / 纯逻辑

| #   | 层   | 场景                | 输入/前置                                                        | 预期                                         | 优先级 |
| --- | ---- | ------------------- | ---------------------------------------------------------------- | -------------------------------------------- | ------ |
| F1  | 契约 | 同步 OpenAPI        | 后端权威 spec 已更新                                             | 生成快照包含三端点和全部 schema，无手工编辑  | P0     |
| F2  | API  | create/get/retry    | snake_case DTO                                                   | method/path/header/body 原样正确             | P0     |
| F3  | 单元 | job 轮询判定        | 五种 job 状态                                                    | 仅 pending/running 继续轮询                  | P0     |
| F4  | 单元 | 空占位替换          | 初始化空 group/grammar/sense/definition/sentence                 | 候选整体应用，引用保持闭包                   | P0     |
| F5  | 单元 | 保护人工内容        | 任一非空人工字段/人工新增节点                                    | 原节点不覆盖；只追加不冲突候选并报告 skipped | P0     |
| F6  | 单元 | revision/dirty 阻断 | revision 改变或生成后本地编辑                                    | 禁止批量应用并给出原因                       | P0     |
| F7  | 单元 | 非法候选            | 未知 pos_id、重复 UUID、悬空 grammar、错误 focus link、非法 CEFR | 分区不应用，报告 failed                      | P0     |
| F8  | 单元 | 部分结果            | completed + failed/missing partitions                            | completed 可应用；其他可重试且不丢状态       | P0     |
| F9  | 单元 | readiness 联动      | 应用前不完整、应用后完整/仍部分缺失                              | 复用现有 readiness 得到对应状态与计数        | P0     |

## 前端组件集成

| #   | 层   | 场景              | 输入/前置                              | 预期                                                 | 优先级 |
| --- | ---- | ----------------- | -------------------------------------- | ---------------------------------------------------- | ------ |
| U1  | 集成 | 首次进入          | 空白 meanings、未生成                  | 只显示提示和“自动生成”，不自动发起计费请求           | P0     |
| U2  | 集成 | 任务进度          | create 202，轮询 running -> completed  | 展示进度，结束后预览来源与应用按钮                   | P0     |
| U3  | 集成 | 部分成功          | job partial                            | 成功分区可预览/应用；失败原因和重试入口可见          | P0     |
| U4  | 集成 | 应用候选          | missing-only report                    | 表单更新并 dirty；不调用 save API                    | P0     |
| U5  | 集成 | 明确保存          | 已应用候选后点击保存/完成              | 仅调用现有 saveMeaningsStep；revision/readiness 更新 | P0     |
| U6  | 集成 | 已有人工内容      | 非空表单                               | 提示将跳过已有内容；应用后原内容不变                 | P0     |
| U7  | 集成 | 并发/本地编辑     | 生成中编辑或服务端 revision 改变       | 结果标过期，不可一键应用，编辑不丢失                 | P0     |
| U8  | 集成 | provider/网络失败 | create 503、轮询失败、partition failed | 不清空表单；可重试或重新发起；错误可区分             | P0     |
| U9  | 集成 | 只读状态          | archived / published 非 edit           | 不显示可执行生成入口                                 | P0     |

## 真实数据源与浏览器验收

| #   | 层               | 场景                  | 输入/前置                                             | 预期                                                                     | 优先级                 |
| --- | ---------------- | --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| R1  | 真实数据         | Kaikki 小样与导入链路 | 官方 JSONL 小样 + 固定 SHA256；隔离数据库内容 fixture | 官方形状/行数校验通过，source key、locator、gloss/example 能进入任务快照 | P0                     |
| R2  | 真实 provider    | 受控词表 smoke        | 后端临时注入真实千问 provider 凭据                    | 返回非空结构、词义和多例句，provenance 标记 qwen/model；凭据不落盘/日志  | P0（无授权则 BLOCKED） |
| R3  | 真实 provider    | 部分失败              | 受控限流/超时或独立失败分区                           | job partial，成功结果保留，失败可重试                                    | P1                     |
| E1  | Codex 内置浏览器 | 主流程                | 本地真前后端、已认证 admin、空白 draft                | 点击生成、观察状态、预览、应用、readiness 变化、保存后刷新存在           | P1                     |
| E2  | Codex 内置浏览器 | 人工保护              | 先填写人工释义，再生成                                | 人工内容不变，跳过报告准确                                               | P1                     |
| E3  | Codex 内置浏览器 | partial/retry         | 制造一个失败分区                                      | 成功内容可用，失败项能重试                                               | P1                     |
| E4  | Codex 内置浏览器 | revision 过期         | 生成后另一请求保存新 revision                         | 旧结果不可一键应用且当前编辑不丢失                                       | P1                     |

## 验证报告规则

- 单元/mock、HTTP、真实 Kaikki、真实 provider、Codex 内置浏览器分别报告 PASS / FAIL / BLOCKED。
- fake provider 只可让 B/H/F/U 层通过，不得据此标记 R2/R3 PASS。
- 未经用户明确要求，不使用测试服数据库、测试服运行数据、用户 Chrome，不合并、不部署。
