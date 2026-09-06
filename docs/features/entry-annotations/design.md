# 词条标注前端设计

状态：已对齐后端稳定契约 v1，正式实现和验收完成。既有产品已批准。

## 依赖和关键路径

- 已有可复用：UnifiedCreateEntryStep 检测、真实 base 展示、分页 snapshot、幂等冻结请求、surface token 重确认、WordCreatePage 真实跳转。
- 小改动：types 词条/列表及创建入参；API 契约和运行时响应校验；SmartDictionary 主词列和刷新。
- 新增：正式两列表格标注弹窗、最小编辑入口、并发/校验错误处理和风险测试。
- 后端已同步方向：create 校验最终 headwords/token 后发现真实 base 分组，以 409 annotation_conflict 返回完整 groups 和旧 annotation/revision，按 entry_id 去重；失败不落库、不消费幂等结果，携带标注重试。不增加预检请求、不依赖普通 surface warning。
- 已冻结：create annotation/annotation_updates；409 meta.annotation_conflict（reason/entries/groups）；PATCH /admin/lexicon/entries/{id}/annotation，body annotation/base_annotation_revision，返回 EntryAnnotationResponse。契约 → types/API → 创建事务 → 列表编辑 → 验证与独立只读审查。估计契约稳定后 60–90 分钟，超出 50% 报告修订路径。

## 文件及数据流

packages/types/src/admin-word*.ts、index.ts 镜像 snake_case。packages/api-client/src 同步创建字段、标注编辑方法、operation 契约和响应 runtime schema。

UnifiedCreateEntryStep.tsx 保留首次真实 create，409 原型分组打开标注弹窗；完整新旧标注一次重试 create，成功沿用 onCreated。网络结果未知时冻结 payload/幂等键，不允许修改 payload 后重用键。surface 变化继续既有重确认链路；annotation revision 变化按权威分组重确认。baseFormDetection 仅辅助展示，不替代最终分组。

EntryAnnotationPreview.tsx 已批准布局迁移为正式组件，移除模拟词条和假 forms。弹窗编辑态独立，取消丢弃本轮修改，失败保留输入。SmartDictionary.tsx 移除 preview，展示真实标注，编辑成功使列表/详情查询失效。WordCreate.tsx 移除 preview state 和 onPreviewCreate；删除 entryAnnotationListPreview.ts。

仅 antd，不引入 tailwind/@tsz/ui；V2/V3 按正式契约兼容，不创建无必要共享抽象。

## 工作树与契约来源

唯一 writer：/Users/darwish/Dev/tsz-core/tsz-dev-worktree，分支 codex/dev-worktree-20260906，基线 a030f75a2fcfd2cd79a9cf2dc78cc20ed2811563。后端只读契约，不修改实现/数据库。

sync:openapi 明确 OPENAPI_SOURCE=/Users/darwish/Dev/tsz-core/tsz-rust-dev-worktree/docs/openapi.json，禁止默认读取旧 tsz-rust。交付记录最终 SHA256。现有 admin 3201、代理 8583，不重启、不操控用户右侧。

## 测试设计（先于测试代码）

| 风险                              | 最小有效证据                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| 普通词形误判、最终主词变化        | create 集成：仅 authoritative conflict 打开弹窗，无冲突直接创建   |
| 多原型重复行、第三条旧旧/旧新重复 | 弹窗：entry_id 去重，空白/大小写/长度校验，禁用保存，trim 后提交  |
| 取消恢复、失败丢输入              | 弹窗与 create 集成：取消无写入，重开恢复服务端值；失败保留输入    |
| 部分更新、重复创建                | 请求集成：一次 create 包含完整标注，未知结果按原 key/payload 重试 |
| revision/token 并发变化           | create 集成：权威分组重确认、禁止静默覆盖、surface 链路回归       |
| 假步骤残留                        | 页面：真实 id 导航 forms，无第二次创建/结果弹窗                   |
| 列表/查询/详情不同步              | 列表：词名下方标注、编辑成功失效查询、失败保留输入                |
| wire 与 runtime 脱节              | API 契约、显式来源同步、运行时响应测试                            |

定向 Vitest/types/API/admin lint 后，完整实现近完成时运行一次 test:cov 和适度最终构建。失败最小范围修复，独立只读审查完整 diff；不为覆盖数字制造镜像测试。

## 风险和回滚

OpenAPI 已从指定后端工作树同步，最终来源哈希与验证结果见 verification.md。重点为未知创建结果、并发更新、最终主词变化。仅回滚本功能 diff，保留用户其他变更，不整树 reset。

判重限定直接 groups；groups 中现有 entry_ids 不含新条，新条隐式属于每组。校验拒绝控制字符、trim 后 Array.from 长度不超过20、Unicode lowercase 判重，不做 NFKC。PATCH 非分组可清空；返回冲突时邻居只读，目标使用最新 revision 重确认。

## 基线契约差异

指定后端基线已包含关系预绑定（WordRelationWritableV3 三分支、WordRelationV3 四分支），前端基线原快照为两分支。主协调任务核实后批准最小契约收敛：保留真实生成快照，更新旧测试验证三种关系形状互斥、响应只读字段及预绑定状态，不实现关系UI、不重写关系逻辑。该差异不来自标注修改。
