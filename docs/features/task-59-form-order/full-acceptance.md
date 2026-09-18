# TASK59 全场景真实验收（2026-09-18）

## 结论

本轮已完成用户列出的**所有适用入口**的真实浏览器/API验收，未发现需修改产品代码的 TASK59 排序缺陷。发布不再被旧最小 fixture 的 422 阻塞：真实发布 A、未发布调序 B 隔离、重新发布 B 生效均通过。

边界必须保留：跨组复用同一 form_id 被当前写入契约拒绝，列为不适用，未改库绕过；历史未入组读取兼容仅以本轮重跑单测为证据，**不宣称浏览器通过**。本轮验证 admin Vite 同源代理，不覆盖生产构建/部署。没有修改仓库产品代码、提交、推送或部署。

## 简明验收矩阵（先建矩阵，逐项执行后的最终状态）

| 场景                        | 结果                                                                                                            | 真实证据（均位于 `/tmp/task59-full-evidence/`，单测日志除外）                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 多维释义                    | 通过：六项组序/成员序、同拼写分离、原形不置顶、选过去分词、页面保存200                                          | `meaning-order.json/png`、`meaning-network.json`、`final-identity-proof.json`                                                                    |
| 多维例句                    | 通过：页面创建、同拼写两词形按 A 排序、选过去分词、POST200、再次进入词义页回显                                  | `sentence-order.json/png`、`sentence-create.json`、`sentence-network.json`、`sentence-reloaded.png`                                              |
| 共享例句独立入口            | 通过：独立 `/sentences` 编辑，B顺序已生效；清除重选过去分词、PUT200、重新打开编辑器                             | `shared-order-B.json/png`、`shared-saved.json`、`shared-network.json`、`shared-reloaded-identity.png`                                            |
| 短语成分                    | 通过：真实短语catalog/fixture，六项B顺序，选过去分词、页面保存200、重载、独立GET                                | `phrase-order-B.json/png`、`phrase-saved.json`、`phrase-reloaded.png`、`phrase-network.json`、`phrase-identity.json`                             |
| 关联词独立入口              | 通过：添加近义词→搜索目标词条→选词义→保存200→刷新；只存word/sense，不强加form层                                 | `relation-selected.png`、`relation-reloaded.png`、`relation-saved.json`、`relation-network.json`、`relation-identity.json`                       |
| 发布快照隔离                | 通过：发布A；逆转组序和组内序后保存B；候选matches与A严格相等；再发布B后严格为B                                  | `published-A.json`、`snapshot-draft-B.json`、`published-B.json`、`snapshot-candidates-{A,unpublished-B,published-B}.json`、`snapshot-proof.json` |
| 英美变体筛选                | 通过：真实个人偏好PATCH uk/us，页面分别只显示英式/美式词形；各自选过去分词、保存并刷新，variant_id精确匹配      | `variant-{uk,us}-order.json/png`、`variant-{uk,us}-reloaded.png`、`variant-{uk,us}-identity.json`、`variant-{uk,us}-network.json`                |
| 同拼写不同词形              | 通过：taskhung 的过去式/过去分词均保留；taskcoloured/taskcolored 两词形各自保留，选中的是past_participle        | 上述下拉数组及独立身份断言                                                                                                                       |
| 调序及刷新身份稳定          | 通过：单纯保存调序、重新发布均不改原释义/例句绑定；最终核对word/entry、pos、base、form、variant、sense及dialect | `snapshot-proof.json`、`final-independent-get.json`、`final-identity-proof.json`；四词条直连8359与代理3059返回深度相等                           |
| 当前词义快捷入口            | 通过：同拼写taskhung有歧义时不自动猜选；唯一taskhanging可快捷关联、保存200、刷新回显                            | `shortcut-ambiguous-no-auto.png`、`shortcut-created.json`、`shortcut-reloaded.png`、`final-identity-proof.json`                                  |
| 跨组重复form_id             | 不适用：本轮真实PUT再次422，原forms完全不变                                                                     | `cross-group-duplicate-rejected.json`，code `form_group_membership_invalid`                                                                      |
| 历史未入组/首次去重读取兼容 | 单测通过，不是浏览器证据                                                                                        | `/tmp/task59-full-unit-backend.log` 1项；`/tmp/task59-full-unit-frontend.log` 2文件21项                                                          |

## 实际顺序与操作要点

目标 forms 原始数组：[taskhang base, taskhung past_tense, taskhung past_participle, taskhanging present_participle, taskhangother base, taskhungother past_tense]。

- A：组2前置且每组逆序。页面为「过去式 taskhungother → 原形 taskhangother → 现在分词 taskhanging → 过去分词 taskhung → 过去式 taskhung → 原形 taskhang」。原形不会自动置顶。
- B：对A的组序、每组成员序同时逆转并真实保存。发布前候选仍A；发布后为「原形 taskhang → 过去式 taskhung → 过去分词 taskhung → 现在分词 taskhanging → 原形 taskhangother → 过去式 taskhungother」。短语成分页面六项严格数组断言通过。
- 例句正文为 taskhung，候选按正文拼写过滤。因此A显示「过去分词→过去式」，B显示「过去式→过去分词」，不是展示不匹配正文的全部六词形。两次均明确选过去分词。
- UK：过去分词 taskcoloured → 过去式 taskcoloured → 原形 taskcolour；US：过去分词 taskcolored → 过去式 taskcolored → 原形 taskcolor。相同拼写不同 form_id 未折叠。
- 英美偏好切换后原UK关联摘要仍可见，未被切换偏好静默重选；随后主动清除并选US才改变 variant_id。偏好本身不是产品调序。
- 页面清除后重选会新建关联自身ID，是预期用户编辑行为；不把它说成调序改了目标身份。
- 原释义最初绑定草稿目标；后续宿主保存会补上已发布的 `target_publication_id`（B）。最终对比明确区分该发布解析元数据与不变的word/pos/base/form/variant/sense身份；没有把整个对象始终逐字不变作为最终结论。单纯调序/重新发布阶段的整对象不变另有snapshot-proof证据。

## Fixture 与可复核页面

均为本轮通过真实API新建，不假定旧fixture/会话存在。

- 目标：`01a0b3c7-42b3-7dc1-9269-44433359a512`，taskhang / taskhangother，已发布B。
- 宿主：`01a0b3c7-433e-7642-b227-3e3fc1514446`，taskhost。
- 英美变体：`01a0b3c7-43a2-78b3-9c39-30fffdc04280`，taskcolour / taskcolor。
- 短语：`01a0b3d7-9d8e-7840-87b1-2f60e6f4983a`，taskhang together。
- 共享例句：`2e32eb2c-9d50-4f2f-bac8-bc48bdc5374e`。
- 宿主页：`http://127.0.0.1:3059/words/01a0b3c7-433e-7642-b227-3e3fc1514446/v3/wizard/meanings`。
- 目标编辑页：`http://127.0.0.1:3059/words/01a0b3c7-42b3-7dc1-9269-44433359a512/v3/wizard/meanings?mode=edit`。
- 共享例句页：`http://127.0.0.1:3059/sentences`。

发布必填数据参考后端fixture和真实catalog，补齐语义区间、grammar_structure、grammar_structure_id、V-T子词性、frequency、sense_group_id等。短语catalog初始无项目，使用真实POST `/settings/parts-of-speech` 新建 `phrase_task59`，未直接修改数据库。

## 环境、归属与保留说明

- 前端 `/Users/darwish/Dev/tsz-core/tsz-task-59`：HEAD `03e88e4be35e0306f041c40e8e9e4c299fec57d1` + 既有工作区修改。
- 后端 `/Users/darwish/Dev/tsz-core/tsz-rust-task-59`：HEAD `df925192e9ce54211bbf9d691f1a1e5461a81b5c` + 既有工作区修改。
- 本轮在后端checkout重新 `SQLX_OFFLINE=true cargo build --bin tsz-rust --bin seed`，成功后复制 `/tmp/task59-full-api` 和seed；构建日志 `/tmp/task59-full-build.log`。
- API二进制与当前 `/Users/darwish/.cargo-target/debug/tsz-rust` SHA256一致：`45bc1f0173a3ccfcd3e22036786b5186ecc58b8fde9624b46a11b7ba2c9f0d2e`。
- 排序源码 `src/lexicon/service/sentence_association.rs` SHA256：`273d23c61a90d79e628e17d7c79f9263bc9efc7f0742a7f79630579c963b9631`。
- API PID **85917**，监听 **127.0.0.1:8359**，运行 `/tmp/task59-full-api`；启动17:08:09。
- Vite launcher PID **85918**，实际 Vite PID **85920**，监听 **127.0.0.1:3059**，cwd为指定前端checkout的apps/admin。
- 新建PG容器 **tsz-task59-pg**，`postgres:16-alpine`，**127.0.0.1:55459→5432**，ID `a92a8e85c08bb273a860f105029ea17b2d1c382067084b9b59345399de2c8ab9`。
- 新建Redis容器 **tsz-task59-redis**，`redis:7-alpine`，**127.0.0.1:56459→6379**，ID `b4994fedb18cd185df5331c0550cb4522e885a3f4e70e2a5e23264a7082902ae`。
- 两容器所有权标签：`task59.owner=9524d60db93bc0491f3f7746`。未操作其他任务容器，未连接共享库/生产。
- 句柄集中在 `/tmp/task59-full-handles.json`；主agent清理前须再次核对PID、cwd、容器ID/标签，防止PID复用。
- `BACKEND_API_URL=http://127.0.0.1:8359/api/v1`；`VITE_ADMIN_WORDS_MOCK=false`、`VITE_ADMIN_PART_OF_SPEECH_MOCK=false`、`VITE_ADMIN_TTS_MOCK=false`。真实Chromium，无page.route；serviceWorkers blocked。
- 随机seed账号/密码及JWT/PG/Redis凭据未公开。`/tmp/task59-full-runtime.json`、`/tmp/task59-env.sh`、`/tmp/task59-browser-state.json` 均核对为600，**不可作为公开附件**。现存会话及个人偏好US保留供复核。
- 主 agent 已核对上述 PID/cwd、容器 ID/所有权标签，停止本轮 API/Vite，删除两专属容器及匿名卷（含 fixture），并删除 runtime、连接配置和浏览器会话凭据。8359/3059/55459/56459 均无监听；未触碰其他任务资源。上文环境和页面地址仅为历史验收记录。日志 `/tmp/task59-full-api.log`、`/tmp/task59-full-admin.log` 仅供本地排查，不作为脱敏附件分发。

## 网络与身份证据范围

`api-network.json`及各入口`*-network.json`只记录method/path/status，不记录headers、token、密码。业务搜索、GET、保存均200；词条创建201；共享例句创建200。发布两次成功已保存返回word。最终独立GET证明四词条直连/代理内容一致；身份断言覆盖释义、短语、普通例句、快捷例句、US变体全部7个坐标。

本轮脚本探查失败并未隐瞒：曾遇OTP冷却、refresh状态未持久化、已发布页面需mode=edit、控件aria名称与POST200预期、短语sense必填空sub_pos、GET附带target_headword/target_gloss只读字段不能原样PUT。这些均修正一次性fixture/脚本后重新执行；没有修改产品代码或跳过业务断言。其中短语失败尝试409是误重建已有forms导致下游确认保护，后改为复用当前ID；不存在绕过确认强删数据。失败截图可能仍在目录，不能单独认定为产品缺陷。

## 兼容单测（本轮重跑）

- 后端：在指定后端仓库运行 `SQLX_OFFLINE=true cargo test --lib v3_snapshot_derives_form_group_bases_for_candidate_inventory`，1 passed。日志 `/tmp/task59-full-unit-backend.log`。
- 前端：`pnpm --filter @tsz/admin exec vitest run src/features/sentences/associationModel.test.ts src/features/dictionary/word-creation-v3/components/V3TargetCascader.spelling.test.tsx`，2文件21 passed。日志 `/tmp/task59-full-unit-frontend.log`。
- 这些是单测，不伪装成真实写入跨组重复/历史未入组的浏览器证据。

## 产品问题与交付边界

本轮未复现需要修改产品代码的新增缺陷；无待修产品文件建议。design.md已记载的专用组快捷关联既存问题不在本轮general组fixture覆盖范围，不将本轮结果外推为其修复。

所有新增验收脚本均在 `/tmp/task59-full-*.cjs`、相关临时Python文件；报告与截图不写入仓库。两仓既有修改原样保留，最终status记录在证据目录`frontend-final-status.txt`、`backend-final-status.txt`。本报告为验收交接，不含任何提交/推送/部署动作。
