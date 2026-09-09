# 词形变化配置：技术复评

状态：已按用户批准方案实施；验证见 verification.md。日期：2026-09-09。
前端 `/Users/darwish/Dev/tsz-feature-20260909/tsz`，dev 基线 `999b134`。
后端 `/Users/darwish/Dev/tsz-feature-20260909/tsz-rust`，dev 基线 `1fcaf32`。
工作分支均为 `codex/feature-20260909`。

## 结论、依赖与工程量

采用完整全局词形目录 CRUD，沿用基本词性的稳定字符串编码模式。保留原 8 个 code 与词条 JSON 结构，无需重写历史词形内容。
主要工作是替换固定类型校验、补齐引用保护及消费者，不重做词形组模型。

| 部分                                     | 分类         | 最小处理                                                |
| ---------------------------------------- | ------------ | ------------------------------------------------------- |
| 页面、五名称表单、编码生成、自动追加排序 | 可复用       | 新增词形面板，复用 PartOfSpeechNameFields 和默认值逻辑  |
| 权限、revision、审计、目录版本           | 可复用       | 扩展后端 catalog 模块，不另建通用配置框架               |
| allowed/default 目录消费                 | 已有，小改动 | 所有 POS 共用全局目录，替换后端固定数组                 |
| 配置 CRUD 与发布词形引用                 | 新工作       | 目录表、引用回填、外键及事务内校验                      |
| 枚举、前端校验与名称                     | 必须联动     | V2/V3 及仍活跃的共享消费者同步调整                      |
| 联调环境                                 | 未准备       | worktree 只有代码隔离，验收前隔离端口、数据库和测试数据 |

关键路径：目录/引用迁移及后端校验 → OpenAPI/类型/运行时契约 → 页面及消费者 → 集成验收。
完整实施验证粗估 3–5 个工程日，主要变量是历史引用回填和测试适配；这是静态审计估计，不是会话时限，不含部署。
超过估计 50% 时先报告实际阻碍及最小剩余步骤。共享类型和生成产物集中修改，不按每个词形或每条接口独立跑完整流程。

## 目录与接口

在现有 src/catalog 中新增 catalog.form_types：id、唯一稳定 code、五个名称字段、sort_order、revision、审计字段。
沿用基本词性名称标准化、长度和唯一性规则；迁移种入现有 8 个 code，base 增加后端/数据库删除保护。
种子英文名称、缩写实施时整理成可审阅表，不能直接把 snake_case code 当作展示文案。

已实现接口：

| 方法   | 路径                                                | 行为                           |
| ------ | --------------------------------------------------- | ------------------------------ |
| GET    | `/admin/settings/form-types`                        | 超管分页列表，q/page/page_size |
| POST   | `/admin/settings/form-types`                        | 创建配置                       |
| PATCH  | `/admin/settings/form-types/{id}`                   | 更新，必填 base_revision       |
| DELETE | `/admin/settings/form-types/{id}?base_revision=...` | 未引用且非 base 才可删         |

扩展现有 `/admin/settings/parts-of-speech/catalog`，顶层增加 form_types 名称列表，复用一次只读目录请求。
每个 POS 的 allowed/default 从同一目录非 base 项按序派生；同一响应须对应一致的目录版本。
CRUD 递增现有 catalog metadata version；前端同时失效目录、基本词性列表及词形管理查询。
错误沿用 Problem Details，增加词形冲突、不存在、已引用、原形不可删的明确错误；revision_conflict 复用。

## 活跃契约与校验

后端 WordFormTypeV2、WordFormTypeV3、WordFormTypeWithoutBase 改为受编码格式约束的字符串契约，业务写入再验证目录存在。
机械的枚举转字符串、V2/V3 转换改为编码传递；base 的业务判断保留。
解码前固定值检查和保存/发布允许集合检查都必须调整，不能仅改 DTO。
非原形字段显式拒绝 base，不能用 TypeScript Exclude<string, "base"> 假装完成此约束。

代码依据（后端相对路径）：

- src/lexicon/dto/operations.rs:157、dto/v3.rs:185：固定枚举。
- src/lexicon/handler/commands.rs:231：V2/V3 分流仍活跃。
- src/lexicon/service/v3_surface.rs:1958、2316：V3 匹配也解析 V2 类型，不能跳过 V2。
- src/lexicon/v3_contract.rs:213、1228：固定能力/请求解码检查；原形规则保留。
- src/lexicon/form_types.rs：所有 POS 共用固定数组，没有可复用的可写词形配置。

前端 packages/types 中 admin-word、admin-word-v3、part-of-speech 同步 wire 约束。
word-creation-v3/model.ts 的 FORM_TYPES 同时限制词形及短语目标类型，需要替换，结构校验与目录存在校验分开。
V2 恢复/预览路由仍存在，更新候选和名称消费，不重构其他旧编辑器能力。

## 存储与删除保护

新增迁移替换最终生效的枚举 CHECK，不编辑历史迁移；主词形表增加目录 code 外键，保留非词形形状、nullable 和 base 约束。

| 表/数据                                                   | 处理                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| lexicon.v3_concrete_forms.form_type                       | 当前主数据，格式约束和目录 FK                                                   |
| lexicon.form_slots.form_type                              | V2 仍有写入分支，允许合法目录编码并保留 non-base 限制                           |
| lexicon.surface_sources                                   | 替换最终 V2/V3 共用形状 CHECK 中的枚举部分；旧迁移中已被替换的 CHECK 不重复计入 |
| lexicon.sentence_associations.resolved_form_type          | 放开目录编码，保留关联状态/目标校验                                             |
| lexicon.v3_phrase_sense_component_usages.target_form_type | 当前短语释义成分写入同步支持                                                    |
| 旧 variant 成分表                                         | 保留历史读取/迁移兼容，确认可到达写入后处理，不算另一套新业务                   |
| 历史 publication JSON                                     | 不改内容；回填新的发布词形引用表，后续发布同事务维护                            |

usage_count 按 distinct entry 合并有效 V2/V3 草稿及全部保留发布引用；附属关联若独立保留也要阻止删除。
不能用当前 surface 投影代替历史引用统计。归档但可恢复的词条仍受保护，迁移遗留草稿按实际生命周期判断。
发布引用表使用目录 FK，回填读取历史 JSON 实际 form_type 及目标引用字段；发现未知 code 报告，不静默丢弃。

并发复用现有模式：保存/发布在同事务按稳定顺序读取目录并持有 FOR KEY SHARE；删除 FOR UPDATE 后检查 revision、base、引用，FK 兜底。
依据是 src/lexicon/repository/dictionary.rs:227、src/catalog/repository/commands.rs:123 及现有 publication refs；不新增全局互斥锁。
目录行锁必须保持到引用写入完成，不能在校验和保存之间释放。

## 建议生成与前端

保留 dictionary_suggestions.rs:528 的词典标签映射，输出与目录取交集；自定义类型人工录入，不自动发明语法映射。
检测、自动补全与保存都服从同一目录存在约束，防止删除后生成悬空编码。
前端新增词形面板、api-client 请求及 mock 方法，复用现有 dataSource 选择，不增加独立开关。
候选及名称集中由目录 lookup 解析，按需传给消费者，不把业务函数改成隐式读取全局状态。
覆盖 V2/V3 下拉、基本信息、预览、发布历史、surfaceSnapshot、目标选择、问题定位。
内置名称或未知 code 只作展示兜底；目录失败时保留编辑数据、不猜测候选，写入由后端校验。

## 契约、发布与回退

严格 runtime schema 会拒绝新类型，必须同步 OpenAPI、types、endpoint 快照、runtime schema 和实际消费者，不能只改 TS string。
已显式用 OPENAPI_SOURCE 指向本 worktree 后端导出文件执行仓库生成器，runtime 来源哈希已核对。
发布顺序：先发布接受动态 code、兼容旧 catalog 缺 form_types 的前端；目录未提供能力时管理入口明确不可用。再后端迁移与接口，开放配置。
新前端接旧后端仍使用旧 allowed 候选；验收需覆盖新旧组合及旧浏览器刷新，不承诺旧前端无需刷新就能读新类型。
若要求已打开旧页面无刷新继续使用，需要另定客户端版本策略。
产生自定义类型前可回退；产生后旧枚举后端无法读回，需保留兼容层或先处理数据，不能直接恢复旧 CHECK。

## 验证计划与证据边界

核心场景：新增自定义类型 → 词形保存 → 发布 → surface/关联读回；仅历史 publication 引用也禁止删除。
补充未引用删除、base 拒删、并发保存/删除、revision 冲突、目录失败、名称一致性、字典建议过滤及既有原形/复用规则。

后续后端定向测试（先准备隔离数据库）：
`cargo test --locked --all-features --test catalog_handler --test catalog_schema --test lexicon_v3_storage_schema --test lexicon_v3_relation_consumers`

后续前端接口测试：`pnpm --filter @tsz/api-client test`。
以上目标已存在，但需补充新能力场景，不代表当前已覆盖该功能；定向验证后统一运行仓库最终质量门。
真实联调核实服务来源及数据库隔离，不能用 mock 通过代替真实验收。
实现和验证已完成；初次全量检查发现的旧断言及测试依赖已修复并定向复验，详见 verification.md。

后续前端定向验收命令：`pnpm --filter @tsz/admin exec vitest run src/features/dictionary/part-of-speech src/features/dictionary/word-creation-v3 src/features/dictionary/word-creation`
