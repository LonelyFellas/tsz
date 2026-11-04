# 评估证据与局限

日期：2026-11-04。此文件用于复核方案中的现状判断，不是测试通过记录。主文档为 [需求](requirements.md) 与 [设计](design.md)。

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
