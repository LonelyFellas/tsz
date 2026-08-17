# 部署来源 Manifest 测试用例矩阵

本矩阵在任何测试/实现代码之前定稿。P0 必须自动化；真实 `tshb-test` 项只在功能合并、CI-green 且另获部署授权后执行，不用本地测试冒充。

| ID  | 层          | 场景                       | 输入/前置                                                       | 预期                                                       | 优先级  |
| --- | ----------- | -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| N01 | Node 单元   | 目录摘要稳定               | 相同文件/符号链接，不同创建顺序                                 | sha256/file_count 完全相同                                 | P0      |
| N02 | Node 单元   | 内容、路径、链接变化可检测 | 分别修改文件内容、重命名、修改 symlink target                   | 每种变化均改变摘要                                         | P0      |
| N03 | Node 单元   | 元数据变化不影响摘要       | 只修改 mtime                                                    | 摘要不变                                                   | P0      |
| N04 | Node 单元   | 空目录与不支持节点         | 空 artifact；FIFO 等特殊节点                                    | 候选生成 fail closed                                       | P0      |
| N05 | Node 单元   | schema 严格校验            | 缺字段、额外字段、错误 component/kind/SHA/URL/run ID/conclusion | 全部拒绝                                                   | P0      |
| N06 | Node 单元   | candidate→accept→verify    | `accepted_at=null` 候选、匹配 artifact                          | accept 原子生成正式 manifest，正式 verify PASS             | P0      |
| N07 | Node 单元   | 陈旧/篡改制品              | 候选或正式 manifest生成后修改 artifact                          | candidate/正式 verify 均失败，旧正式文件不被覆盖           | P0      |
| N08 | Node 单元   | Next 运行缓存              | 修改固定排除的 `.next/cache`，再修改其他 release 文件           | cache 不影响摘要；其他文件仍改变摘要                       | P0      |
| S01 | Shell 集成  | 精确 main + CI success     | clean、HEAD=remote main、CI completed/success                   | 输出完整 SHA/tree/repo/run 元数据                          | P0      |
| S02 | Shell 集成  | checkout 状态不可用/dirty  | status 命令失败或输出非空                                       | 在 build/ssh/rsync 前失败                                  | P0      |
| S03 | Shell 集成  | main 前进                  | 初检或写前复核时 remote main != HEAD                            | fail closed                                                | P0      |
| S04 | Shell 集成  | CI 不可信                  | CI缺失/API失败/queued/failure/非 success                        | fail closed                                                | P0      |
| S05 | Shell 集成  | origin/run 元数据注入      | 非 GitHub origin、异常 repo/URL/run ID                          | fail closed，不执行输入                                    | P0      |
| S06 | Shell 集成  | ignored 构建环境文件       | Next/Vite 会读取的 ignored `.env*` 存在                         | build 前 fail closed                                       | P0      |
| S07 | Shell 集成  | build 环境 allowlist       | 父进程含未授权变量                                              | build 子进程看不到，仅显式变量保留                         | P0      |
| S08 | Shell 集成  | web 启动窗口 smoke         | 首次 502 后恢复 200；或持续 502                                 | 限定次数内重试；成功后继续，超限仍 fail closed             | P0      |
| P01 | Python 单元 | api manifest正常生成       | 合法 source/CI + 临时二进制                                     | 原子写正式 schema v1，sha256/file_count=1                  | P0      |
| P02 | Python 单元 | api 篡改检测               | manifest后修改二进制                                            | verify失败                                                 | P0      |
| P03 | Python 单元 | api schema/输入严格校验    | 缺失/额外字段、非法 SHA/URL/run/component/path                  | 全部拒绝                                                   | P0      |
| P04 | Python 单元 | 失败不覆盖旧 manifest      | 已有合法正式 manifest，随后以非法输入create                     | 旧文件字节保持不变                                         | P0      |
| D01 | 脚本静态    | shell语法                  | 三个部署 shell                                                  | `bash -n` PASS                                             | P0      |
| D02 | 前端质量门  | monorepo回归               | Node 24.19.0/pnpm 10.33.0                                       | lint/typecheck/test:cov/format check PASS                  | P0      |
| D03 | 后端质量门  | 后端回归                   | 锁定依赖、无应用代码变化                                        | Python测试及 fmt/check/clippy/test PASS                    | P0      |
| T01 | 真实部署    | web manifest               | exact CI-green main，授权部署                                   | 远端目录复算一致，页面/API/service smoke后 `web.json` PASS | 手测 P0 |
| T02 | 真实部署    | admin manifest             | web已PASS，授权部署                                             | 远端目录复算一致，页面/API/nginx smoke后 `admin.json` PASS | 手测 P0 |
| T03 | 真实部署    | api manifest               | exact CI-green main，授权部署                                   | 二进制复算一致，health/ready/auth smoke后 `api.json` PASS  | 手测 P0 |
| T04 | 真实部署    | 部分失败                   | web成功、admin smoke失败（受控演练或证据）                      | web前进、admin不前进，整体明确部分失败                     | 手测 P1 |
| T05 | 真实部署    | 后端回退                   | 成对备份二进制+manifest                                         | 回退后二者摘要一致；无旧manifest时明确UNKNOWN              | 手测 P1 |
| T06 | 安全审计    | 敏感信息                   | 检查三份manifest与命令输出                                      | 无DSN/密码/token/cookie/env内容                            | 手测 P0 |

## 真实验收清单

- [ ] 在任何服务器写入前再次确认两仓 exact CI-green `origin/main`。
- [ ] 严格按 `web → admin → api` 串行部署；前一项未验收不开始下一项。
- [ ] 分别运行正式 manifest verify，记录 Git SHA、Git tree、CI run ID/URL、artifact SHA-256/file_count。
- [ ] web/admin 页面 200、未认证 API 401、`tsz-web` active、`nginx -t` PASS。
- [ ] api health/ready 200、未认证 refresh 401、login→refresh→logout 200/200/204。
- [ ] 不输出任何认证材料；失败时保留精确 partial/正式 manifest状态并停止。
