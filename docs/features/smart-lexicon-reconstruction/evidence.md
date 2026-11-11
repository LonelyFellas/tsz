# 评估证据与局限

初始评估：2026-11-04；语言基础验证：2026-11-11。第 1–6 节为历史评估，第 7 节为本次实际交付证据。主文档为 [需求](requirements.md) 与 [设计](design.md)。

## 1. 取证方式和版本

三仓执行 `git fetch origin` 后固定 `origin/main` SHA，使用 `git show <ref>:<path>` / `git grep <ref>` 检查内容。以下 GitHub 链接均固定此次本地读取的 commit，不使用会漂移的 main 链接；仓库权限不足时可在对应本地仓库用相同 ref 查看。

| 仓库      | origin/main                                | 本地主 checkout HEAD                       | 本轮处置                                                |
| --------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| tsz       | `13b0e43ffcf9288407ce094878618c50239cd381` | `7c571c7506399d51ed3e45edd1b1a50e8308fef8` | 按精确主线读代码；复用任务 worktree，其 HEAD 为 13b0e43 |
| tsz-rust  | `fb0575d019e6eb98d722ee85279805deeb034a56` | `d6a3dabc70a178fc2559e8cff44e232360772c5b` | 只读，未修改 checkout                                   |
| tsz-agent | `dbe5936585708d0e7d8095d2a947edd8722f0a7d` | `1463bdfa947ec0d650d28e8b89c178808caa9433` | 只读，未修改 checkout                                   |

文档位于 `/Users/darwish/.codex/worktrees/50f0/tsz/docs/features/smart-lexicon-reconstruction/`，分支 `codex/smart-lexicon-reconstruction-design`。进入时目录仅包含两份未跟踪主文档，无其他已跟踪改动；复用既有任务 worktree，不创建重复分支。修改前副本保存在本机 `/tmp/tsz-agent-platform-assessment-20261104/`，不作为另一套正式方案。

未读取 `.env`、生产凭据、业务数据库或实际运行账本。未启动 API/worker、未发起模型请求、未执行迁移、未创建测试 OSS 文件。源码事实不证明已部署或实际使用。

## 2. Agent 审计：调用链、可复用性与缺口

### E01 运行并非跨业务能力分发

[worker.py L11](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/worker.py#L11) 直接导入 `capabilities.vocabulary_mcq.workflow.execute`；L30–94 领取 Run 后按模型来源构造命题模型，并调用该 execute。L120–145 是租约心跳、失租取消和关闭模型逻辑。

[schemas.py L8–12](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/schemas.py#L8) 将 Capability 固定为 `vocabulary_mcq_zh_en`；L32–68 的 SourceRef/Candidate/GenerationContext 必填发布词义、词性、等级、英美 answer_profile。结论：可借鉴 worker 壳与版本化严格模型，但没有通用注册框架，不能仅改枚举就宣称平台化。

### E02 存储可靠性具有实际实现，领域耦合仍在

[storage.py L332](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/storage.py#L332) 是任务创建/幂等入口；L589 取消清除租约；L602–636 使用数据库时间、SKIP LOCKED 领取 queued 或过期 running；L638–699 校验租约、写检查点及终态。不是只有几个“lease”字段名。

[worker 稳定性测试 L49](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/tests/test_worker_stability.py#L49) 明确断言过期 worker 不能 complete、renew、checkpoint；L18/L32 检查进程与数据库时钟偏差。此处是已读断言，本轮未运行测试。新业务步骤级恢复、并行、公平调度和人工等待不能据这些测试推断已经存在。

### E03 账本、预算和未知成本可复用

[models/budget.py](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/models/budget.py) 的 StoreBudget 调用持久化 reserve/record；BudgetedModel 包裹模型请求，包含模型修复重试计量。[storage.py L701](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/storage.py#L701) 预留调用；L743 起已知用量记账不依赖旧 worker 继续持有租约；L480–523 的费用视图将未知成本保留 None。

[test_model_accounting.py L24](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/tests/test_model_accounting.py#L24) 起分别检验取消后迟到回执、跨租约保留未知预留、超时计数、取消后禁止新预留、并发只能取得剩余一次额度。结论：这些机制有回归价值，需迁到统一 gateway；不等于调用结果严格 exactly-once，也不等于已有平台级金额硬预算。

### E04 模型接口仍带命题职责，两条词库路径绕过它

[deepseek.py L31–34](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/models/deepseek.py#L31) 的 QuestionModel.generate/review 返回 Proposal/SemanticReview；worker L59–80 对不同模型适配，但业务协议相同。

[lexicon_assistant.py L134](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/lexicon_assistant.py#L134) 在调用前写 service ledger，L216–228 与 L386–396 直接使用配置的 DeepSeek endpoint/model；[form_candidates.py L113](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/form_candidates.py#L113) 同样先预留，再直接调用 DeepSeek。结论：不是“助手完全没账本”，真正缺口是统一模型协议、任务预算与可恢复执行路径。

### E05 人工案例检索存在，参数训练未发现

[workflow.py L25–49](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/capabilities/vocabulary_mcq/workflow.py#L25)：先查 examples，逐个通过 tsz.check_sources 校验，来源变化跳过，最多选择 4 条。L137–148 在生成前刷新有效反馈，放入 `reviewed_examples`；不是无界聊天历史。

[storage.py L817–930](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/storage.py#L817)：event_id 和 review revision 去重，校验对应成功 Run/题目；拒绝反馈可从真实题目构造负例；L861 直接导入命题 valid_pool；L893–902 旧 revision 不覆盖新决定，revoked 令 active=false；L905 起按固定命题 capability、词性/题级/英美筛选，同义项优先，先最多取12条。结论：有可撤销经验机制，但仍是命题专用。

[test_feedback.py L40](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/tests/test_feedback.py#L40) 断言撤销后迟到事件不会复活例子；L58 的负例来自实际题目；L88 检查过期来源不检索。不是仅凭文档“支持反馈”得出结论。

本轮查看全部 src 文件清单、能力实现、evaluate、依赖、迁移及 CI，并搜索 fine-tuning/distill/training/SFT/DPO 等实现线索，未发现训练任务、训练数据发布或参数制品流水线。搜索曾命中 endpoint 等无关子串，已结合实现排除，结论限定于本次固定源码范围，不声称外部团队绝无训练活动。

### E06 评测是命题专用显式付费工具

[evaluate.py](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/evaluate.py) 要求独立标注 fixture，包含 forbidden_candidate_refs 与期望复审结果；执行路径生成并复审题目，记录 usage。L88–109 没有 `--live` 仅校验结构并报告 model_calls=0，开启后才调用 DeepSeek。本轮没有运行该工具。其能力不包括新词库多语种评测、跨业务质量门、SFT 或蒸馏。

### E07 认证与启动

[app.py L58–96](https://github.com/LonelyFellas/tsz-agent/blob/dbe5936585708d0e7d8095d2a947edd8722f0a7d/src/tsz_agent/app.py#L58) 的 lifespan 是运行/清理，不执行数据库迁移；authorized 比较服务 bearer token。L148 起助手、词形、账户/探测、账本及 runs 路由存在。结论：可复用服务接口基础；服务认证本身没有业务用户/资源 scope 委托语义，需要新平台补齐。

## 3. Rust 与前端审计：真正边界在哪里

### E08 词库问答的循环在 Rust，工具也由 Rust 执行

[lexicon/router.rs L66](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/lexicon/router.rs#L66) 暴露 assistant/form-candidates 路由；[assistant.rs L608](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/lexicon/assistant.rs#L608) 的 run 控制循环；L24/L25 上限是3次模型调用、6次工具；L651–779 逐步请求 Agent、执行工具并把结果作为不可信数据拼回消息。L980 的 execute_tool 负责允许工具与业务查询。结论：新平台应迁入“何时继续模型循环”的职责，Rust 保持工具授权与事实查询。

[assistant_candidates.rs L204–256](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/lexicon/assistant_candidates.rs#L204) 在请求前 editable/catalog，调用后再次 editable、取目录并 validate_output，返回 requires_human_review=true，没有保存草稿。这个“模型候选不等于业务写入”的边界值得保留。

### E09 旧题库生成不能默认当作当前主业务

[question_bank/handler.rs L4–25](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/question_bank/handler.rs#L4) 当前 router 仅返回学习题型 capability；[question_bank/worker.rs](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/question_bank/worker.rs) 主要保留 AgentConfig，而非旧题目生成 worker。

[retire_question_bank.up.sql](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/migrations/20261030030000_retire_question_bank.up.sql) 明确检查 remote Agent 在途任务须排空，退役旧生成、禁用旧草稿/批准题库记录并保留学习证据。这里只读取迁移文本，未执行，不能据此判断某环境已退役。

[learning_tasks/question.rs](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/learning_tasks/question.rs) 首行描述确定性的 publication-to-question 投影，L58 使用 PublishedContentV3；[question_bank/learning.rs](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/question_bank/learning.rs) 使用 algorithm/source 和固定答案快照。结论：当前源码学习路径不应被误写成“每题调用旧 Agent”；未来模型辅助出题属于有条件新增能力。

### E10 发布约束有积累，旧存储不是新模型的模板

[service/publishing.rs L45](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/lexicon/service/publishing.rs#L45) 直接处理 DraftMeaningsStepContentV3 的引用解析；[v3_publication.rs](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/lexicon/service/v3_publication.rs) 包含发布/回退事务与批量控制。结论：事务、不变快照、有效引用等原则可复用；新库需新的数据约束与发布领域实现，不能称“仅扩展几个字段”。

[shared_sentences/publication.rs](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/lexicon/shared_sentences/publication.rs) 与 router 中独立句子 publish/history/rollback/withdraw 路由证明共享句子已有自身生命周期。新库继续采用该业务概念，不意味着复用旧句子身份或迁移数据。

### E11 下游必须显式接入新来源

[wordlists/projection.rs L13–19](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/wordlists/projection.rs#L13) 直接从 snapshot 反序列化 AdminWordV3，且明确要求白名单投影；学习源也依赖 PublishedContentV3。故“不迁移旧数据”不消除新 source adapter 的工作量，但也不需要把所有旧数据转换为新模型。

[wordlists/review.rs](https://github.com/LonelyFellas/tsz-rust/blob/fb0575d019e6eb98d722ee85279805deeb034a56/src/wordlists/review.rs) 的 submit 在事务内锁用户/词表，校验 revision、幂等键，保存 item_snapshots 与音频审核引用；已有人工审核业务不应由 Agent 重新建一套。评论模块在本次文件清单/相关关键字调查未发现明确独立领域入口；这是待核实范围，不是完整仓库业务不存在的绝对证明。

### E12 前端可借鉴但不直接沿用 V3 表单

[assistant/context.ts](https://github.com/LonelyFellas/tsz/blob/13b0e43ffcf9288407ce094878618c50239cd381/apps/admin/src/features/dictionary/assistant/context.ts) 使用 AdminWordV3/FormsStepRepresentationV3 等旧类型，并脱去音频/内部元数据后组织有界输入；[FormCandidates.tsx](https://github.com/LonelyFellas/tsz/blob/13b0e43ffcf9288407ce094878618c50239cd381/apps/admin/src/features/dictionary/assistant/FormCandidates.tsx) 比较 forms/catalog snapshot、base_revision 与 entry_id 判旧候选。可借鉴候选失效交互，不可将旧 DTO 当新领域。

[Web reading.ts](https://github.com/LonelyFellas/tsz/blob/13b0e43ffcf9288407ce094878618c50239cd381/apps/web/src/features/dictionary/reading.ts) 的 dictionaryDefinition 按绝对等级距离排序，平局取低，再偏中文；新原型优先可读等级，不是同一规则。新读模型与共享选择函数是新增工作，原有字段顺序不能代表新政策。

## 4. 最新原型静态证据

原型路径：`/Users/darwish/Downloads/智能词库重新设计(第2版)/智能词库重新设计(第2版).html`。大小 9,948,097 字节，SHA-256 `2c5eda79e4c566e5ab62ac2fb0bc32fe452779f7fb302727cf0ba9c933ef4d65`。本轮重新计算一致。标题含 v16，但后段仍有 v14/v15/v17 命名；以实际后置定义和包装链判断，不按标题推断全部行为。

| 功能           | 最终相关位置/调用                                                                                      | 生产处理                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 自由度         | L962–972 translationFreedom/translationCategory；L2580 替换类别，L2666 后置 prepareGeneration 输出要求 | 新库只保留 freedom，不复制演示兼容 restoration 的逻辑              |
| 译文随机/切换  | L2165–2208 会话 scope、ddTranslationState、ddNextTranslation、freedom stops                            | 保留会话选择；生产加稳定身份和版本隔离；随机不是每次渲染重抽       |
| 释义等级       | L2239–2247 ddDefinitionSelection                                                                       | 可读优先；缺失时最近较高，再未知；同级多条滑块停点                 |
| 来源           | L2599–2605 generationV11Source 将模型返回资料标 verified=false；L2658 说明引用/原创                    | 核验来自真实工具回执，不能因模型 access_status=verified 就确认来源 |
| 组合生成       | L2639 重写 openGeneration 默认 sense_bundle；L2654 起重写 prepareGeneration；L2723/L2733 校验组合条数  | 版本化能力、有限步骤、coverage；“无限条数”不进生产预算             |
| 语法 tokens    | L2615–2616 generationV11Tokens，L2661 后置生成规则                                                     | 类型限制、拼接等于原文、至少一个 target_lexeme                     |
| 六级例句       | L2626 generationV11Plan，L2666 六级/数量/长句译文要求                                                  | 区分覆盖目标、数量建议和质量约束，不为数量扭曲义项                 |
| 追加修订       | L2743 generationV11AppendDefinition                                                                    | 创建新记录并记录修订来源，保留已确认原文                           |
| 语义区间词元   | L2619 links 校验；L2798 resolveAll，L2803 变体显示，L2810 最终 renderSemantic                          | 待关联保留原文；新业务服务解析真实已发布新库目标                   |
| 例句等级与排序 | L2833–2840 计算可读档/回退/稳定排序；L2841 重写 ddExamples；L2848 重写 ddExampleRows                   | 六级单页签，过滤→选级→排序，补稳定业务 ID tie-break                |
| 连读及最终展示 | L2885 偏好；L2930 应用；L2942 包装 renderDictionaryDetail；L3119 再包装示例切换/界面语言               | 最后的包装仍调用旧包装，保留连读逻辑；演示 fixture 不当音频验证    |
| Pre-A1         | L833 通用枚举，六级控件 A1–C2                                                                          | 标为产品决策差异；新库无历史 Pre-A1 迁移负担                       |

后段界面翻译、示例载入和 locale 同步包装仍需实现时做真实页面验收。本次仅静态追踪代表性最终逻辑，没有运行 HTML；不宣称全部 JS 运行时路径已验证。此前导出的甲方图反映旧范围，不应继续作为本版平台/新数据方案的依据；新业务图与本目录主文档同步。

## 5. 官方技术资料核查

检索日期：2026-11-04。只用于明确技术边界，不把文档列出的全部能力视为项目已具备，也不据此选定供应商。

| 官方一手资料                                                                                                       | 对本方案的影响                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [Pydantic AI Durable Execution](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/)             | 支持与耐久引擎集成；运行恢复不是仅安装模型库即自动成立；不在本次升级依赖 |
| [Pydantic AI Deferred Tools](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/)                          | 人工批准与外部执行有接口；文档明确批准不是抵御不可信客户端的授权边界     |
| [Temporal Activity Definition](https://docs.temporal.io/activity-definition)                                       | 外部 Activity 需要幂等设计；引擎不会取消业务采纳与外部调用账本的必要性   |
| [Hugging Face TRL SFT Trainer](https://huggingface.co/docs/trl/sft_trainer)                                        | 监督训练真正更新模型/adapter，输入示范和评测要独立；不等于提示检索       |
| [Hugging Face TRL DPO Trainer](https://huggingface.co/docs/trl/dpo_trainer)                                        | 偏好数据应有同输入 chosen/rejected；普通点赞或未采纳不能直接替代偏好对   |
| [PyTorch Knowledge Distillation](https://docs.pytorch.org/tutorials/beginner/knowledge_distillation_tutorial.html) | 教师软目标蒸馏与文本输出蒸馏应区分，API 只有文本时不能假定拥有 logits    |

## 6. 验证状态

- 已完成：三仓主线 fetch 与 SHA 核对；关键调用链/约束/测试断言静态阅读；最新原型哈希与最终覆盖分析；官方资料查证；本目录文档更新。
- 本轮文档验收：4 份 Markdown 的结构与范围一致性检查通过；13 个相对链接有效；31 个固定提交源码链接已用本地精确 ref 核实文件及行号范围；2 份 SVG 通过 XML 解析；2 张 PNG 已逐图视觉检查，无文本遮挡；确认项、估算算术及旧迁移范围清除已复核。Mermaid 保留为可编辑图源，未声称经过浏览器渲染验收。
- 未执行：业务代码测试、真实服务联调、浏览器页面验收、付费模型质量/性能评测、数据库/OSS 操作、训练、提交推送和部署。
- 仍需后续验证：生产使用盘点、吞吐/SLO、许可清单、人工审核耗时、真实模型质量、第二场景业务入口；这些未知已进入阶段依赖和估算置信度。

格式验证使用仓库实际共享 Prettier 配置。任务 worktree 没有安装 workspace 依赖，根配置无法解析 `@tsz/config`；因此直接指定同仓 `packages/config/prettier.config.js`，使用本机主 checkout 已安装的 Prettier，仅检查本目录文档，未安装依赖或修改配置。

## 7. 语言基础独立切片（2026-11-11）

### 范围、版本与原工作区保护

用户收窄为“先把目标语言和媒介语言推进完就提交”。本次终点是前后端独立可用切片的本地 commit；不含 push/PR/合并/部署、生产迁移和付费调用。第五批线程确认安全停靠后才开始写入。worktree 工具无响应且 Git 清单确认未创建，停止等待后用 Git 原生 worktree 创建隔离分支。

- 前端：`/Users/darwish/.codex/worktrees/lexicon-language-foundation/tsz`，分支 `codex/lexicon-language-foundation`；fetch 固定基线 `df33adf2356032951c4e83cbea6d7728e56f417f`。
- 后端：`/Users/darwish/.codex/worktrees/lexicon-language-foundation/tsz-rust`，同名分支；基线 `8838c4f065f30d42b88256b30501f9f911a37098`。
- 原前端 `/Users/darwish/.codex/worktrees/13a2/tsz`、原后端 `/Users/darwish/.codex/worktrees/lexicon-next-data/tsz-rust`、Agent `/Users/darwish/.codex/worktrees/lexicon-next-candidates-agent/tsz-agent` 保持全部未提交成果。未对它们执行 reset/stash/clean 或提交。

提取第一/二批可复用的语言模型、能力、独立草稿表、权限、创建/读取/保存/视图及 Admin 手工编辑器。明确排除审核发布与公开 reader、GenerationPanel、Agent 候选/账本、后端 workflow/generation/morphology 模块及对应三组后续迁移。原完整方案与多批实施证据仍在原工作树，本提交只带语言方案及这里的实际结果。

### 精确切片的代码验证

全部命令在上述隔离 checkout 执行，未沿用更大工作树的通过结果：

- `SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi`；前端显式 `OPENAPI_SOURCE` 指向该文件并清除 `SYNC_OPENAPI_RUNTIME_ONLY`，运行 `pnpm --filter @tsz/api-client sync:openapi`。spec/runtime SHA-256 为 `d11a875c3ce45b6eb97f3fa0c3c5431300020d743777d3d5fe5edc9c3a4b57c6`，快照 264 路径、runtime 426 schemas。未手改生成 JSON 或扩大 PENDING。
- `cargo test --locked --all-features --test lexicon_next`：5 项通过，真实独立 PostgreSQL＋鉴权 router。证明四组合存储/重开、显式通用回退与缺口、并发 409 原子性、稳定 ID 防跨词条/义项重用、当前权限/所有权与撤权、拒绝原地改语种/未开放语言、迁移 down/up 保留旧库记录。
- `cargo test --locked --all-features --lib lexicon_next`：2 项通过；`--lib admin::authorization`：2 项通过；后端及 seed build 通过。CI 原生 `ops/ci_test_modules.py list` 将新增 target 唯一归入 lexicon，沿用 `lexicon_*` 分区，不添加重复清单。
- `pnpm --filter @tsz/api-client test`：39 文件、698 项通过。首次运行仅旧 OpenAPI 哈希 canary 失败，核对原生生成输入后更新为上述哈希，完整重跑通过。
- Admin 定向测试 `LexiconNext.test.tsx`、`model.test.ts`、`BusinessPermissionGuard.test.tsx`、`ConsoleSidebar.test.tsx`、`adminAuthorization.test.ts`、`resources.test.ts`：6 文件、72 项通过。覆盖未保存四 locale、403/409 保留、离开保护、pending 锁定和能力不可用。jsdom 伪元素 getComputedStyle 提示不影响断言，实际布局另验。
- `pnpm typecheck`：7 任务成功；`pnpm --filter @tsz/admin build` 成功。`pnpm check:admin-ui`：41 份样式及 4 项脚本测试通过；变更 MJS lint、两仓 diff 检查通过。代码 TS/TSX lint/格式由正常提交 hooks 承接。

### 真实页面、代理与持久化

run-id `tsz-language-20261111-a1`。两个专属 `--rm` Docker 容器均带同批标签：PostgreSQL 18 `127.0.0.1:53084/language_foundation` 使用 tmpfs，Redis 7 `127.0.0.1:53086/0` 关闭持久化。未使用未知 .env/共享数据库。账号是本批新建普通管理员，显式授予 words.access/create/edit；后端既有 OTP sender 使用固定 Mock 码，仅认证发送模拟，登录/会话/权限/词库/数据库均真实。

后端从本批临时目录中的独立制品启动，SHA-256 `9c7649e3478863ddf6bf03c73b2e285cf878073ff25c5f2f1b85352b4ded53b8`，源为上述后端基线＋本次切片。监听 59843，初始 PID 84431；为验证界面语言独立性，仅在本批环境开启既有 `I18N_ADMIN_SUPPORTED_LOCALES=zh-Hans,zh-Hant,en-US` 并重启同一制品，最终 PID 87097。`DEPLOYMENT_SMOKE_ONLY=true`、本地 HTTP `COOKIE_SECURE=false`，无 OSS/外部模型配置。

Admin Vite `http://127.0.0.1:59844` 代理到 `http://127.0.0.1:59843/api/v1`，四项 words/parts/TTS/local-speech mock 全为 false。Web 本次未改/未启动，未使用 next dev。

内置浏览器返回 `Browser is not available: iab`，明确说明后按用户规则降级到 Chrome 专用标签。实际操作及 Network/SQL 证据：

1. 创建 centre：POST 201；同一词条录入英式 centre、美式 center、两条英文释义及简繁解释/译词。切换英简→美简→美繁→英繁时未保存内容保留；初次繁体显示缺口，不复制简体。
2. PUT 200 保存为 revision 2。独立 SQL 确认一个 entry、一个 sense、九个永久 nodes、两 forms、四 definitions（各 locale 一条）、两 equivalents；不是四套词条。
3. 离开后按 ID 打开，GET 200 读取 revision 2；四组合分别点击已保存预览，四个真实 GET view 均 200，正文/实际 locale 正确且不回写。
4. 第二标签保存为 revision 3。第一标签保存旧 revision 返回 409，本地词头保留；比较展示完整两版本，显式二次确认才重载服务器。
5. 精确撤销专属账号 words.edit，第二标签保存真实 403，profile 重新读取后转只读；切换语言、尝试离开并取消，未保存词头仍保留。独立 SQL 仍 revision 3，拒绝稿未入库；随后恢复原授权。
6. 临时账号改用英文界面，再重开词条，仍为 revision 3、原英文与中文内容/选择独立；恢复“跟随浏览器”后继续核验。
7. 1440/768/390px 的 scrollWidth 均等于 innerWidth；列宽分别 520＋520、320＋320、单列326px。桌面/窄屏截图位于 `/Users/darwish/.codex/visualizations/2026/11/11/lexicon-language-foundation/{1440,390}.png`。viewport 覆盖已恢复。

浏览器已退出账号，测试 origin 的 localStorage/sessionStorage 独立复查为 0，自建标签全部关闭。localhost 的两个 `_ga` 统计 Cookie 来源不明，未作测试数据删除；无本批认证 Cookie 残留。数据库/Redis和进程在提交 hooks 完成后统一清理，下节记录实际结果。

### 清理、兼容与提交状态

本批后端/Admin 进程均已按身份停止；带精确 run-id 标签的两容器已删除，匿名卷残留 0，53084/53086/59843/59844 全部关闭，既有其他任务六个容器仍运行。清理前只有本批一个管理员、一个词条、九个节点、三版草稿；这些账号、会话、权限、内容、全部历史与缓存均随独立环境彻底删除。临时目录中的凭据、制品副本、日志和脚本已移除；只保留两张界面截图及脱敏 `cleanup-receipt.json`。无 OSS、付费调用或业务数据变更。

与主线 OpenAPI 比对：既有路径没有变化，既有 schema 仅 ErrorCode 增加 capability_unavailable；其他模型均为新增。候选前端访问旧后端时能力请求 404 的关闭行为已由契约/组件测试验证；实际已部署前端/后端组合未知，未做线上混合版本或部署验收。回退数据库会丢失新库数据，禁止把本地 down/up 测试理解为生产回退授权。

后端提交 `88611753ede0aeee0e70ad9a56c7ed9d28d940af`，正常 pre-commit 的 SQLx prepare 与全目标 Clippy 均通过，.sqlx 无差异；提交后 fmt 通过。前端本记录随语言切片提交，最终 SHA 由本聊天交付。没有执行 push、PR、CI、合并或部署。

前端首次提交正常 pre-commit 的 Prettier、ESLint 及 commit-msg 的 commitlint 全部通过，hook 未改变源码。此次只 commit，不执行前端技能的 pre-push 审查流程。

后端按 ship 提交章节执行独立只读审查，精确范围 `8838c4f065f30d42b88256b30501f9f911a37098..88611753ede0aeee0e70ad9a56c7ed9d28d940af`，未发现 P0–P2 阻断；未重跑已有有效测试。审查：1 轮；确认缺陷 0；证据排除误报 0；关联回归/回退：未知。补充回退限制：后端启动严格校验 SQLx 迁移，不能仅凭旧表未变推断旧二进制可在新增迁移后启动；线上组合与回退仍未验收。

### PR 准备与共享控件修正

用户已授权推送并创建配套 PR。后端保持 `88611753ede0aeee0e70ad9a56c7ed9d28d940af`，正常 pre-push fmt 通过，PR 为 https://github.com/LonelyFellas/tsz-rust/pull/394。

前端首次独立 pre-push 审查发现新词库引入 AntD、增加 ESLint 例外并禁止使用共享控件，违反当前 Admin 规范。此前只有上游 Agent 交接文字要求 AntD，没有人类授权覆盖项目规则。本次改为 `@tsz/ui/admin/*` 和 Lucide，删除局部 AntProvider，恢复原 ESLint 门禁，移除两项新增依赖及其锁文件增量。业务模型、接口及请求时机未变。

修正后：两文件 9 项语言编辑/模型测试、Admin typecheck、Admin production build、41 份样式及 4 项检查脚本测试通过。原 5 项真实 PostgreSQL 集成及真实代理验收的后端、契约和业务状态逻辑未变，沿用其证据，不声称本轮重跑数据库联调。

本轮内置浏览器已可用，使用临时独立界面 fixture（模拟请求、无 token/真实账号或持久化）验证共享控件：四组合正确显示，繁体输入切换后保留，显式保存变为版本 2，已保存预览弹窗正确显示当前组合；1440px、390px 均无横向溢出。截图保存在 `/Users/darwish/.codex/visualizations/2026/11/11/language-shared-controls/{1440,390}.png`。fixture 是 UI 回归，不能替代既有真实后端验收。临时入口文件已移除，Vite 服务停止，视口覆盖已恢复，自建标签已关闭；未创建数据库/缓存/OSS/外部模型资源。

## 8. 复用原词库布局与名称对齐（2026-11-11）

用户确认新版完整沿用原版列表及分步编辑布局，再接入新版数据；新版名称为「智能词库」，原版为「智能词库V1」。本轮前后端分支均为 `codex/lexicon-ui-alignment`；前端基线 `5787be19d2b7c610cd21f725791b699d7aad3a5a`，后端基线 `1218d612af44ac9b6cb0bdb9267dedfadb1095e2`。原先已完成的语言基础发布与本轮未提交改动分开，不把本地界面当作线上结果。

新版直接复用 `WordListTable`、`WordCreationLayout` 和 `V3ProductProgressList`，包含列设置、固定列、分页、步骤条、词条摘要、完成情况及窄屏抽屉。共用组件仅加入数据行泛型、显示名称/返回路径及步骤文案参数；原版继续其原有路由和数据接口。新版接入独立 `lexicon_next` 模型，步骤及语言切换保留完整草稿；列表可按词头和类型筛选，从列表创建/重开，保留已有 ID 直链。导航、原版页面标题、面包屑及返回文案统一版本命名。

后端新增 `GET /api/v1/admin/lexicon-next/entries`，沿用 `words.access`；摘要来自当前持久化版本，提供字面子串搜索、类型筛选、稳定排序及 1 基分页。计数与列表共享只读快照，每页上限 100，不返回整个草稿，不读取旧词库。没有新增迁移、发布、生成、音频调用或旧数据迁移。OpenAPI 及严格 runtime 契约由原生生成链同步，未增加 PENDING 或手写生成结果。

验证结果：

- `DATABASE_URL=<本批独立PG18> SQLX_OFFLINE=true cargo test --locked --all-features --test lexicon_next`：6 项通过，覆盖四组合存储/权限/并发、列表筛选/分页/字面百分号、当前版本摘要与旧库隔离。`cargo clippy --locked --all-targets --all-features -- -D warnings`、fmt 和 diff 检查通过。
- `pnpm --filter @tsz/api-client test`：39 文件、700 项通过。`pnpm typecheck`：7 任务通过；Admin production build、受影响 ESLint、`pnpm check:admin-ui` 通过。
- 原版列表/创建/向导、共享布局、导航及新版定向回归：11 文件、147 项通过；最后的小范围变更再跑新版 8 项通过。jsdom 的伪元素 getComputedStyle 提示不影响断言，实际布局另由浏览器核实。
- Codex 内置浏览器通过独立 origin `http://lexicon-ui.localhost:59854`，经实际同源代理到后端 `127.0.0.1:59853/api/v1`；words/词性/TTS/local-speech mock 全关闭。测试使用本批独立 PG18 `55509/lexicon_ui` 与 Redis7 `55510/0`，没有接共享库或测试服。
- 真实页面创建 centre，分步录入 centre/center、两条英文释义及简繁解释/译词；完整保存为 revision 2，返回列表可见已保存摘要，筛选无结果/重置、每页 10 条实际请求、列表重新打开与四个已保存 view 请求均 200。独立 SQL 确认为 1 entry、9 nodes、2 revisions，当前版本 2。
- 1440/768/390px 的整页 scrollWidth 不超过 viewport；窄屏沿用完成情况抽屉，明细能展开，表格滚动限制在表格内。截图和脱敏请求证据在 `/Users/darwish/.codex/visualizations/2026/11/11/lexicon-ui-alignment/`。
- 已退出测试账号并清理专用 origin 的浏览器存储，认证 Cookie 为 0；本批后端和 Vite 进程、两个容器、唯一匿名卷及私有凭据全部清理，四个测试端口关闭，既有六个容器仍运行。无 OSS 或付费调用，清理回执为上述目录 `cleanup-receipt.json`。

实施收尾后，用户已授权提交、开 PR、检查通过后合并及部署；实时提交/PR/发布回执由本任务继续维护。配套发布须先发 API 的列表能力，再发 Admin；新 Admin 遇到旧 API 的列表 404 时显示错误，不借用旧词库填充。新版已有 ID 的编辑、保存及语言预览仍使用原生新版接口。原版完整发布/语音等业务继续由 V1 保持，不能将复用布局理解为新增这些业务能力。
