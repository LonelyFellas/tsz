# Smart Lexicon V3 Step 1 英美主词可编辑：需求评估

## 背景与目标

V3 检测结果应当是管理员录入的初始建议，不是最终不可修改的事实。管理员需要在创建草稿之前确认统一主词或英美主词，并由后端按最终确认值生成 V3 初始词形、展示投影和重复保护材料。

目标是让“检测建议”和“最终确认值”各自可审计：检测快照保留原始证据，V3 原生状态保存管理员最终确认值；创建、幂等、surface 确认和重复判断均绑定最终值。

## 目标端

- admin：Step 1 检测与创建草稿界面。
- `@tsz/types` / `@tsz/api-client`：V3 create wire 合同。
- `tsz-rust`：规范化、最终值物化、事务内重复保护、持久化和迁移。
- 数据库：`lexicon.v3_entry_state` 的 V3 原生初始主词事实。

## 用户故事

1. 管理员检测 `centre`，词典建议 `centre / center`，个人偏好为英式；英式建议保持偏好侧锁定，美式侧可改，创建时使用管理员最终确认的两侧拼写。
2. 管理员把区分模式切为统一模式；界面只显示一个可编辑统一主词，后端按该值生成各 POS 的 V3 base form 和 presentation。
3. 内置词典未命中或只命中已有 Smart Lexicon surface 时，管理员仍可确认合法英文主词；检测类别不限制最终模式或拼写。
4. 管理员修改最终值后遇到已有词条或并发创建；系统必须按最终值重新加锁、重查并要求确认或拒绝，不能继续使用检测时旧 surface。
5. 已有 V3 原生草稿在功能上线后不能成为重复保护盲区；迁移必须给出可审计的回填或明确隔离结果。

## 功能范围

### 本次做

- 区分模式按管理员个人方言偏好锁定一侧，另一侧可编辑；`source_dialect` 等于偏好侧。
- 统一模式只显示一个可编辑输入。
- 模式切换保留已确认值，不从词典来源侧或任意第一个 form 静默选值。
- 创建请求携带最终 `headwords`；后端再次做英文主词规范化与合法性校验。
- 后端按最终值重建初始 base forms、dialect rules、presentation 和 surface 查询键。
- 检测快照保留原始建议；最终值另存 `initial_headwords` 和 `initial_headword_keys`。
- 最终值进入幂等请求摘要、surface 确认绑定、事务锁、重复重查和 kind 范围。
- 给既有 native V3 数据提供 expand、回填验证和 harden 迁移路径。
- 保留已合入多维例句的 `initialPendingTarget` / 创建后导航，不改变句子关联行为。

### 本次不做

- 不允许创建后在 `V3BasicsStep` 修改初始主词；该页继续展示创建快照。若要支持创建后改主词，应另立“主词/基础词形重绑定”需求并评估下游影响。
- 不把 native V3 强转为 V2，不写 `lexicon.entry_headwords` 伪造 V2 canonical headword。
- 不改变现有 V3 词形后续编辑能力；Step 2 仍是修改当前词形的入口。
- 不重新实现或调整多维例句、分档翻译、句内目标发现。
- 不放宽检测过期、确认 token、权限、幂等和 feature flag。

## 规则与约束

- 合法输入必须通过后端唯一英文主词 parser；前端校验只做即时预检。
- `unified` 必须有非空 `common`；`distinguish` 必须有非空 `uk`、`us` 和 `source_dialect in {uk,us}`。
- 检测为 `not_found` 时最终值仍可编辑，但不放宽英文 parser、actor、kind、过期时间和 detection 消费绑定；不能借此提交非法词条或复用别人的 detection。
- 旧客户端与新客户端需要兼容窗口：后端先兼容旧请求，再部署发送 `headwords` 的前端，最后才把字段收紧为必填。
- native V3 的初始值与规范化键必须成对存在；migrated V2 是否保留为空由迁移规则明确，不得混成半套状态。
- 任何无法无损回填的既有 native V3 行必须进入阻断清单，不能猜值后继续 harden。

## 验收标准

- [ ] 英式偏好时英式侧锁定、美式侧可编辑；美式偏好时相反。
- [ ] unified 只显示一个可编辑输入，unified/distinguish 往返不丢管理员确认值。
- [ ] 创建载荷携带最终 `headwords`，并保留已合入的 pending sentence target 导航状态。
- [ ] 非法、空值、未知 mode/字段在写 entry 前被稳定拒绝，检测与幂等状态不被错误消费。
- [ ] 后端响应的 forms、presentation 和数据库 V3 节点使用最终确认值；detection snapshot 仍是原建议。
- [ ] `initial_headwords` / `initial_headword_keys` 可审计且满足形状约束。
- [ ] 最终值变化会改变幂等摘要；同 key 异 body 返回 `idempotency_conflict`。
- [ ] 最终值命中已有 surface、legacy-only 重复或无 surface 的 native 空壳时，按最终值确认或拒绝。
- [ ] 不同幂等键并发创建同一最终值时不会产生两个未被发现的空壳 entry。
- [ ] 既有 native V3 回填 dry-run、实际回填和 harden 前后计数一致；歧义行阻断而非猜测。
- [ ] 旧前端在兼容后端上仍可创建；新前端只在兼容后端部署后启用最终值提交。
- [ ] 多维例句创建后导航、建议词性、`SearchOutlined` 和 phrase 创建回归通过。

## 待评审开放问题

### O1：既有 native V3 的回填事实源

建议以永久保存的 `entries.detection_snapshot` 和功能上线前的不可编辑创建规则重建初始主词，不使用可能已被 Step 2 编辑过的当前 forms。若历史 snapshot 无法唯一重建，输出 entry ID 阻断 harden，不选第一个 base form。

需要确认：允许以该规则回填，还是只对新建 entry 写入并接受历史行长期为 `NULL`。后者会留下重复保护例外，不推荐。

### O2：兼容窗口长度

建议至少分三次发布：expand + 可选字段后端、发送字段的前端、字段必填 + DB harden。需要确认是否接受这个零停机顺序；若要求一次发布，只能安排明确维护窗口并接受前后端短暂不兼容风险。

### O3：创建后是否允许回到 basics 改主词

本评估按旧实现和 `initial_*` 命名理解为“创建草稿前可编辑，创建后只读”。若产品要求创建后修改，必须新增影响预览、surface 重绑、publication 历史和引用安全设计，不能夹带在本切片。
