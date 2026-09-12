# 独立多维例句：本地验收

全部操作位于本次独立工作树和本地隔离数据服务。没有操作测试服务器，没有推送、PR 或部署。前端基线 `c294e2c`、后端基线 `8a8e157`，均加本次未提交改动。

入口：[多维例句](http://localhost:3101/sentences)。保留 16 条短语词条、18 条单词、15 条共享例句、57 个已绑定句内标注、2 个待关联标记、21 条正式收录。辅助词条及配置通过真实 API 创建；下表例句均通过实际浏览器完成，未使用 UI mock 或假 API 响应。

| 来源短语                                                                                               | 例句                                                       | 已有目标                                        | 待关联/补建 | 重点                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- | ----------- | -------------------------------------- |
| [give up](http://localhost:3101/words/01a09551-02cd-7942-8ff8-52acfdec0821/v3/wizard/meanings)         | Do not give up hope when you run into trouble.             | give up、hope、run into                         | trouble     | 完成后刷新持久化；浏览器断网后重试     |
| [look after](http://localhost:3101/words/01a09551-057d-72d2-92c3-89eccd1d550a/v3/wizard/meanings)      | Please look after your friend before you take off.         | look after、friend、take off                    | —           | 完成后刷新持久化；取消未完成输入不落库 |
| [take off](http://localhost:3101/words/01a09551-0808-70a2-9df0-a1a1d41c148d/v3/wizard/meanings)        | The plane will take off after we put off the meeting.      | take off、plane、put off、meeting               | —           | 完成后刷新持久化                       |
| [put off](http://localhost:3101/words/01a09551-0a8d-7f33-8a5d-5f50699a1abf/v3/wizard/meanings)         | We put the meeting off and look forward to tomorrow.       | put off、meeting、look forward to               | tomorrow    | 完成后刷新持久化；非连续片段           |
| [run into](http://localhost:3101/words/01a09551-0d12-7b83-882e-e512e2a49386/v3/wizard/meanings)        | I ran into my teacher and came across an old book.         | run into、teacher、come across、book            | —           | 完成后刷新持久化                       |
| [come across](http://localhost:3101/words/01a09551-0f9f-7113-817b-63d4a529c741/v3/wizard/meanings)     | We come across a story that can bring up a question.       | come across、story、bring up、question          | —           | 完成后刷新持久化                       |
| [look forward to](http://localhost:3101/words/01a09551-1227-7890-aea5-9068e5834c83/v3/wizard/meanings) | I look forward to the holiday and get along with the team. | look forward to、holiday、get along with、team  | —           | 完成后刷新持久化                       |
| [get along with](http://localhost:3101/words/01a09551-14b6-7d00-a854-ac47cf50a995/v3/wizard/meanings)  | We get along with our friend and never give up hope.       | get along with、friend、give up、hope           | —           | 完成后刷新持久化                       |
| [make up](http://localhost:3101/words/01a09551-1747-7e81-9d8a-c751db933cf5/v3/wizard/meanings)         | She made the story up before the machine broke down.       | make up、story、break down、machine             | —           | 完成后刷新持久化；非连续片段           |
| [turn down](http://localhost:3101/words/01a09551-19d9-74b1-9ee1-2ffa63441568/v3/wizard/meanings)       | Do not turn the offer down before you look into it.        | turn down、offer                                | look into   | 完成后刷新持久化；非连续片段           |
| [bring up](http://localhost:3101/words/01a09551-1c6c-78c2-932b-e98c07c41950/v3/wizard/meanings)        | The teacher brings up a question in front of the house.    | bring up、teacher、question、in front of、house | —           | 完成后刷新持久化                       |
| [break down](http://localhost:3101/words/01a09551-1f06-7491-9b72-30b44bc7bbd8/v3/wizard/meanings)      | The machine broke down near an out of date report.         | break down、machine、out of date、report        | —           | 完成后刷新持久化                       |
| [in front of](http://localhost:3101/words/01a09551-2192-7451-a09f-21757cfe8572/v3/wizard/meanings)     | In front of the house we look after a friend.              | in front of、house、look after、friend          | —           | 完成后刷新持久化                       |
| [out of date](http://localhost:3101/words/01a09551-2418-7673-8aef-1d6911d7975f/v3/wizard/meanings)     | This out of date report asks us to carry on with hope.     | out of date、report、hope                       | carry on    | 完成后刷新持久化                       |

附加同名案例：`They make up after an argument, then make up a story.` 第一个 make up 人工选择“和解”，第二个选择“编造”，独立 GET 校验两个不同词条 UUID，并在“和解”词条人工确认收录。

补建 trouble、tomorrow 和 carry on 后，各自出现候选；人工勾选对应标记才绑定并收录。run into、hope 已明确标注的目标无需重新定目标，确认后才收录。保留 look into、argument 两个待关联标记供体验。

共享修改把 give up 案例等级改为 C1，随后刷新 give up、run into、hope、trouble 四个词条核对一致。另创建一条临时例句并在 hope 收录，删除确认显示两个引用，DELETE 返回 204，刷新两端只移除此临时句；最终仍保留 15 条业务样例。

已发现并修复：独立编辑弹窗缺少语音上下文；新词义模板仍生成旧空例句；未确认标注直接点完成可能漏保存选择；分页读取与删除竞态；目标状态检查与归档竞态；来源词条删除造成的反向锁；锁竞争的错误状态码；语音参数和主译文富文本校验；新结构回退的数据保护。

当前边界：标注片段不重叠，支持多段非连续短语；变形词面可人工选定原形词条。本次没有把 Azure 语音合成或对象存储上传当作已验收功能，独立环境尚未配置这些外部服务。短语/单词样例主要为真实草稿词条，例句完成后独立发布并可被收录，不要求外层词条先发布。

## 自动化验证

- Rust `cargo test --locked --all-features` 通过；最终增补共享/并发/回退测试 9 条通过；原生迁移回退测试 7 条通过。
- 前端 typecheck、lint、build 通过；`pnpm test:cov -- --maxWorkers=1 --testTimeout=30000` 完整通过：173 文件、2568 测试，另有 2 个原有跳过项。未调整 CI 配置或测试断言。
- OpenAPI 使用所选后端工作树原生导出，前端显式 OPENAPI_SOURCE 同步；严格运行时 schema 与端点测试已通过，最终生成物哈希已核对一致。

补充浏览器检查：分页按 10 + 5 条返回；正文关键词筛选和详情查看正确；尚未确认的句内选择会阻止完成，取消不产生写入。

详细 UUID、HTTP 结果、逐例刷新记录见 [local-acceptance.json](local-acceptance.json)。本地登录信息仅保存在本机权限 0600 的文件中，未写入仓库或报告。

## 原表单超时的控制复验

原用例为 `V3FormsAndPronunciationStep.test.tsx` 中“组内只剩一个原形时锁死类型，复制出第二个原形后才放开”。一次整套 coverage 中耗时 6438ms，触发默认 5000ms 上限。该轮其余 2567 个测试通过。没有失败瞬间的资源采样，不能直接断定唯一根因。

用户停止其他任务后，顺序单独复验同一用例，保持 `maxWorkers=1` 和原 `testTimeout=5000`：

| 条件          | 用例耗时 | 结果 |
| ------------- | -------: | ---- |
| coverage 开启 |    812ms | 通过 |
| coverage 关闭 |    549ms | 通过 |

复验前 CPU idle 约 51% / 48%，memory_pressure free 约 52% / 46%，不是严格空载。此次插桩约多 263ms，单项未复现此前超时；历史资源竞争与整套执行的累计开销未被分别排除。完整覆盖率结果和原 5 秒单项复验一并作为证据，不仅依赖提高等待上限。控制复验的 coverage 报告输出到单独的 `/tmp` 目录，未覆盖仓库完整报告。

## 最终运行状态

| 端   | 地址                            | 运行方式与来源                                                         | 监听 PID |
| ---- | ------------------------------- | ---------------------------------------------------------------------- | -------- |
| 后台 | http://localhost:3101/sentences | 新前端工作树 Vite，真实代理 8484；页面从侧栏进入并读取15条记录验证通过 | 97901    |
| Web  | http://localhost:3100           | 新工作树最终 `pnpm build` + `next start`                               | 46076    |
| API  | http://127.0.0.1:8484           | 新后端工作树最终编译二进制；healthz/readyz均200                        | 46065    |

构建后二次核对了进程 cwd、Web BUILD_ID、后端二进制哈希及两端代理。详细信息见同目录 JSON 的 final_runtime；运行/停止说明在 `/tmp/tsz-main-local-20260912-README.md`。原始两仓工作目录保持干净，其他分支服务未停止。最终 Rust fmt/clippy/build、前端 typecheck/lint/build 均通过。Web 定级页面仍是主线自带 mock，本次未改该功能。
