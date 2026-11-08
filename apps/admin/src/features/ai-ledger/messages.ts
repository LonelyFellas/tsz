export const aiMessages = {
  breadcrumb: ["面包屑", "麵包屑", "Breadcrumb"],
  continue_with_chatgpt: [
    "使用 ChatGPT 继续",
    "使用 ChatGPT 繼續",
    "Continue with ChatGPT"
  ],
  state_unavailable: ["状态不可用", "狀態無法使用", "Status unavailable"],
  reading: ["正在读取", "正在讀取", "Loading"],
  not_enabled: ["未启用", "未啟用", "Not enabled"],
  plan_authorised: ["已授权套餐", "已授權方案", "Plan authorised"],
  signed_in_no_plan: [
    "已登录，未授权套餐",
    "已登入，未授權方案",
    "Signed in, plan not authorised"
  ],
  signed_out: ["未登录", "未登入", "Signed out"],
  chatgpt_account: ["ChatGPT 账号", "ChatGPT 帳號", "ChatGPT account"],
  login_unavailable: ["登录暂不可用", "暫時無法登入", "Sign-in unavailable"],
  awaiting_auth: ["等待授权", "等待授權", "Awaiting authorisation"],
  chatgpt_plan: [
    "使用 ChatGPT 套餐",
    "使用 ChatGPT 方案",
    "Use a ChatGPT plan"
  ],
  chatgpt_refresh: [
    "刷新 ChatGPT 账号状态",
    "重新整理 ChatGPT 帳號狀態",
    "Refresh ChatGPT account status"
  ],
  chatgpt_continue: [
    "继续登录 ChatGPT",
    "繼續登入 ChatGPT",
    "Continue signing in to ChatGPT"
  ],
  chatgpt_manage: ["管理 ChatGPT", "管理 ChatGPT", "Manage ChatGPT"],
  chatgpt_login: ["登录 ChatGPT", "登入 ChatGPT", "Sign in to ChatGPT"],
  continue_login: ["继续登录", "繼續登入", "Continue sign-in"],
  manage: ["管理", "管理", "Manage"],
  login: ["登录", "登入", "Sign in"],
  close: ["关闭", "關閉", "Close"],
  local_login: [
    "请在运行 Agent 的电脑上登录。",
    "請在執行 Agent 的電腦上登入。",
    "Sign in on the computer running the Agent."
  ],
  account_signed_out: ["（已退出）", "（已登出）", " (signed out)"],
  login_again: ["重新登录", "重新登入", "Sign in again"],
  add_account: ["添加其他账号", "新增其他帳號", "Add another account"],
  chatgpt_logout: ["退出 ChatGPT", "登出 ChatGPT", "Sign out of ChatGPT"],
  chatgpt_usage: [
    "管理 ChatGPT 用量",
    "管理 ChatGPT 用量",
    "Manage ChatGPT usage"
  ],
  setup_failed: [
    "无法确认登录方式，请刷新状态后重试。",
    "無法確認登入方式，請重新整理狀態後再試。",
    "Could not confirm the sign-in method. Refresh the status and try again."
  ],
  computer_login: ["在电脑上登录", "在電腦上登入", "Sign in on your computer"],
  ssh_host: ["SSH 主机", "SSH 主機", "SSH host"],
  ssh_required: ["请填写 SSH 主机", "請填寫 SSH 主機", "Enter an SSH host"],
  ssh_invalid: [
    "请使用 SSH 配置名称或 user@主机名",
    "請使用 SSH 設定名稱或 user@主機名稱",
    "Use an SSH configuration name or user@hostname"
  ],
  ssh_example: ["例如 tshb-test", "例如 tshb-test", "For example, tshb-test"],
  ssh_run: [
    "在电脑的 tsz-agent 目录运行：",
    "在電腦的 tsz-agent 目錄執行：",
    "Run in the tsz-agent directory on your computer:"
  ],
  refresh_accounts: ["刷新账号", "重新整理帳號", "Refresh accounts"],
  chatgpt_disabled: [
    "此 Agent 尚未启用 ChatGPT 登录，请先在本机启用后刷新。",
    "此 Agent 尚未啟用 ChatGPT 登入，請先在本機啟用後重新整理。",
    "ChatGPT sign-in is not enabled on this Agent. Enable it locally, then refresh."
  ],
  chatgpt_read_failed: [
    "无法读取 ChatGPT 账号状态，请刷新重试。",
    "無法讀取 ChatGPT 帳號狀態，請重新整理後再試。",
    "Could not load ChatGPT account status. Refresh and try again."
  ],
  chatgpt_action_failed: [
    "ChatGPT 账号操作未完成，请刷新状态后重试；若已有登录正在进行，请先完成或取消。",
    "ChatGPT 帳號操作未完成，請重新整理狀態後再試；若已有登入正在進行，請先完成或取消。",
    "The ChatGPT account action did not complete. Refresh the status and try again; complete or cancel any sign-in already in progress first."
  ],
  plan_required: [
    "该账号尚未授权套餐使用，请重新登录并授权后再选择模型。",
    "此帳號尚未授權方案使用，請重新登入並授權後再選擇模型。",
    "This account has not authorised plan usage. Sign in again and authorise it before choosing a model."
  ],
  revocation_unconfirmed: [
    "本地已退出，远端撤销未确认。请前往 ChatGPT 用量设置断开此应用。",
    "本機已登出，遠端撤銷未確認。請前往 ChatGPT 用量設定中斷此應用程式。",
    "Signed out locally; remote revocation is unconfirmed. Disconnect this app in ChatGPT usage settings."
  ],
  chatgpt_wait: [
    "等待完成 ChatGPT 授权",
    "等待完成 ChatGPT 授權",
    "Waiting for ChatGPT authorisation"
  ],
  chatgpt_auth_help: [
    "在官方页面登录并授权，完成后自动刷新账号与模型。授权链接有效至 {{time}}。",
    "在官方頁面登入並授權，完成後自動重新整理帳號與模型。授權連結有效至 {{time}}。",
    "Sign in and authorise on the official page. Accounts and models refresh automatically when complete. The link expires at {{time}}."
  ],
  chatgpt_authorise: [
    "前往 ChatGPT 授权",
    "前往 ChatGPT 授權",
    "Authorise with ChatGPT"
  ],
  chatgpt_cancel: [
    "取消 ChatGPT 登录",
    "取消 ChatGPT 登入",
    "Cancel ChatGPT sign-in"
  ],
  chatgpt_result_failed: [
    "暂时无法确认 ChatGPT 授权结果，请刷新结果或取消登录后重试。",
    "暫時無法確認 ChatGPT 授權結果，請重新整理結果或取消登入後再試。",
    "Could not confirm the ChatGPT authorisation result. Refresh the result or cancel sign-in and try again."
  ],
  refresh_auth: [
    "刷新授权结果",
    "重新整理授權結果",
    "Refresh authorisation result"
  ],
  chatgpt_cancel_failed: [
    "取消 ChatGPT 登录失败，请重试。",
    "取消 ChatGPT 登入失敗，請再試。",
    "Could not cancel ChatGPT sign-in. Try again."
  ],
  chatgpt_denied: [
    "你已取消 ChatGPT 授权，可重新登录。",
    "你已取消 ChatGPT 授權，可重新登入。",
    "You cancelled ChatGPT authorisation. You can sign in again."
  ],
  chatgpt_incomplete: [
    "ChatGPT 授权未完成，请重新登录。",
    "ChatGPT 授權未完成，請重新登入。",
    "ChatGPT authorisation did not complete. Sign in again."
  ],
  chatgpt_expired: [
    "ChatGPT 登录链接已过期，请重新登录。",
    "ChatGPT 登入連結已過期，請重新登入。",
    "The ChatGPT sign-in link has expired. Sign in again."
  ],
  chatgpt_complete: [
    "已登录，可在出题模型中选择使用。",
    "已登入，可在出題模型中選擇使用。",
    "Signed in. You can select it as the question model."
  ],
  understood: ["知道了", "知道了", "Got it"],
  plan_notice: [
    "出题和模型测试会使用 ChatGPT 额度，可在“管理 ChatGPT 用量”中设置限额。",
    "出題和模型測試會使用 ChatGPT 額度，可在「管理 ChatGPT 用量」中設定限額。",
    "Question generation and model tests use ChatGPT allowance. Set limits in “Manage ChatGPT usage”."
  ],
  not_configured: ["未配置", "未設定", "Not configured"],
  connected: ["已连接", "已連線", "Connected"],
  not_connected: ["未连接", "未連線", "Not connected"],
  opencode_account: ["OpenCode 账号", "OpenCode 帳號", "OpenCode account"],
  auth_or_key: [
    "登录授权或 API Key",
    "登入授權或 API Key",
    "Sign-in authorisation or API Key"
  ],
  opencode_refresh: [
    "刷新 OpenCode 连接状态",
    "重新整理 OpenCode 連線狀態",
    "Refresh OpenCode connection status"
  ],
  opencode_continue: [
    "继续登录 OpenCode",
    "繼續登入 OpenCode",
    "Continue signing in to OpenCode"
  ],
  opencode_manage: ["管理 OpenCode", "管理 OpenCode", "Manage OpenCode"],
  opencode_connect: ["连接 OpenCode", "連接 OpenCode", "Connect OpenCode"],
  connect: ["连接", "連接", "Connect"],
  connection_failed: [
    "连接状态读取失败，请刷新。",
    "連線狀態讀取失敗，請重新整理。",
    "Could not load connection status. Refresh."
  ],
  opencode_not_configured: [
    "OpenCode 服务未配置。",
    "OpenCode 服務未設定。",
    "The OpenCode service is not configured."
  ],
  key_only: [
    "此服务不支持登录授权，可添加 API Key。",
    "此服務不支援登入授權，可新增 API Key。",
    "This service does not support sign-in authorisation. You can add an API Key."
  ],
  auth_login: ["登录授权", "登入授權", "Sign-in authorisation"],
  login_failed: [
    "登录未能开始，请重试。",
    "登入未能開始，請再試。",
    "Sign-in could not start. Try again."
  ],
  opencode_wait: [
    "等待你完成 OpenCode 授权",
    "等待你完成 OpenCode 授權",
    "Waiting for you to authorise OpenCode"
  ],
  link_expiry: [
    "链接于 {{time}} 过期。",
    "連結於 {{time}} 過期。",
    "The link expires at {{time}}."
  ],
  opencode_login: [
    "前往 OpenCode 登录",
    "前往 OpenCode 登入",
    "Sign in to OpenCode"
  ],
  cancel_login: ["取消登录", "取消登入", "Cancel sign-in"],
  auth_read_failed: [
    "授权结果读取失败",
    "授權結果讀取失敗",
    "Could not load authorisation result"
  ],
  cancel_failed: [
    "取消登录失败，请重试。",
    "取消登入失敗，請再試。",
    "Could not cancel sign-in. Try again."
  ],
  opencode_auth_failed: [
    "OpenCode 授权失败，请重新连接。",
    "OpenCode 授權失敗，請重新連接。",
    "OpenCode authorisation failed. Reconnect."
  ],
  link_expired: [
    "登录链接已过期，请重新连接。",
    "登入連結已過期，請重新連接。",
    "The sign-in link has expired. Reconnect."
  ],
  opencode_complete: [
    "OpenCode 授权已完成。",
    "OpenCode 授權已完成。",
    "OpenCode authorisation is complete."
  ],
  add_key: ["添加 API Key", "新增 API Key", "Add API Key"],
  external_auth: ["外部授权", "外部授權", "External authorisation"],
  env: ["环境变量", "環境變數", "Environment variable"],
  credentials: [
    "模型供应商凭据",
    "模型供應商憑證",
    "Model provider credentials"
  ],
  credentials_help: [
    "同一供应商使用一份当前凭据。切换会影响后续调用，可能改变计费账户。",
    "同一供應商使用一份目前憑證。切換會影響後續呼叫，可能變更計費帳號。",
    "Each provider uses one active credential. Switching affects subsequent calls and may change the billing account."
  ],
  connections_loading: [
    "正在读取连接…",
    "正在讀取連線…",
    "Loading connections…"
  ],
  providers_failed: [
    "无法读取供应商连接，请重试。",
    "無法讀取供應商連線，請再試。",
    "Could not load provider connections. Try again."
  ],
  retry: ["重试", "重試", "Retry"],
  current: ["当前使用", "目前使用", "Currently in use"],
  switch_confirm: [
    "切换到这份凭据？",
    "切換至這份憑證？",
    "Switch to this credential?"
  ],
  switch_help: [
    "该供应商的后续请求将使用这份凭据，切换后需要重新探测模型。",
    "此供應商的後續請求將使用這份憑證，切換後需要重新測試模型。",
    "Subsequent requests to this provider will use this credential. Test the models again after switching."
  ],
  switch: ["确认切换", "確認切換", "Confirm switch"],
  cancel: ["取消", "取消", "Cancel"],
  use_credential: ["使用此凭据", "使用此憑證", "Use this credential"],
  use_credential_label: [
    "使用 {{provider}} {{name}}",
    "使用 {{provider}} {{name}}",
    "Use {{provider}} {{name}}"
  ],
  disconnect_confirm: [
    "登出这份{{method}}？",
    "登出這份{{method}}？",
    "Sign out of this {{method}}?"
  ],
  disconnect_fallback: [
    "仅删除这份凭据。OpenCode 将自动使用剩余凭据，可能改变计费账户；可先取消并切换到你想使用的凭据。",
    "僅刪除這份憑證。OpenCode 將自動使用剩餘憑證，可能變更計費帳號；可先取消並切換至你想使用的憑證。",
    "Only this credential will be deleted. OpenCode will automatically use a remaining credential, which may change the billing account. You can cancel and switch to your preferred credential first."
  ],
  disconnect_help: [
    "仅删除这份凭据，其他凭据会保留。使用它的后续请求可能失败。",
    "僅刪除這份憑證，其他憑證會保留。使用它的後續請求可能失敗。",
    "Only this credential will be deleted. Other credentials will remain. Subsequent requests using it may fail."
  ],
  disconnect: ["确认登出", "確認登出", "Confirm sign-out"],
  logout: ["登出", "登出", "Sign out"],
  disconnect_label: [
    "登出 {{provider}} {{name}}",
    "登出 {{provider}} {{name}}",
    "Sign out {{provider}} {{name}}"
  ],
  server_managed: [
    "需在服务器侧管理",
    "須在伺服器端管理",
    "Manage on the server"
  ],
  no_providers: [
    "暂无已连接的模型供应商。",
    "尚無已連線的模型供應商。",
    "No model providers are connected."
  ],
  credential_unconfirmed: [
    "未能确认凭据操作完成，请刷新连接后重试。",
    "無法確認憑證操作完成，請重新整理連線後再試。",
    "Could not confirm that the credential action completed. Refresh connections and try again."
  ],
  credential_switched: [
    "当前凭据已切换，请重新探测模型。",
    "目前憑證已切換，請重新測試模型。",
    "The active credential has changed. Test the models again."
  ],
  credential_disconnected: [
    "这份凭据已登出，其他凭据已保留；当前使用项以列表为准。",
    "這份憑證已登出，其他憑證已保留；目前使用項目以清單為準。",
    "This credential is signed out. Other credentials remain; the list shows which is active."
  ],
  available: ["可用", "可用", "Available"],
  checking: ["测试中", "測試中", "Testing"],
  unverified: ["未测试", "未測試", "Not tested"],
  timeout: ["测试超时", "測試逾時", "Test timed out"],
  interrupted: ["已中断", "已中斷", "Interrupted"],
  invalid_response: ["返回异常", "回應異常", "Invalid response"],
  runtime_failed: ["调用失败", "呼叫失敗", "Call failed"],
  http_unavailable: [
    "不可用（HTTP {{status}}）",
    "無法使用（HTTP {{status}}）",
    "Unavailable (HTTP {{status}})"
  ],
  unavailable: ["不可用", "無法使用", "Unavailable"],
  model_unavailable_option: [
    "{{model}}（{{provider}}，不可用）",
    "{{model}}（{{provider}}，無法使用）",
    "{{model}} ({{provider}}, unavailable)"
  ],
  read_failed: ["读取失败", "讀取失敗", "Could not load"],
  reading_ellipsis: ["正在读取…", "正在讀取…", "Loading…"],
  current_model: ["当前出题模型", "目前出題模型", "Current question model"],
  new_tasks_only: [
    "仅影响新任务。",
    "僅影響新任務。",
    "Only affects new tasks."
  ],
  question_model: ["出题模型", "出題模型", "Question model"],
  choose_model: ["选择模型", "選擇模型", "Choose a model"],
  save_model: ["保存模型", "儲存模型", "Save model"],
  checking_progress: [
    "测试中 {{done}}/{{total}}",
    "測試中 {{done}}/{{total}}",
    "Testing {{done}}/{{total}}"
  ],
  test_models: ["测试模型", "測試模型", "Test models"],
  refresh_models: ["刷新模型", "重新整理模型", "Refresh models"],
  refresh: ["刷新", "重新整理", "Refresh"],
  test_cost_notice: [
    "测试可能消耗服务商额度。",
    "測試可能消耗服務商額度。",
    "Tests may use provider allowance."
  ],
  model_saved: [
    "出题模型已保存。",
    "出題模型已儲存。",
    "Question model saved."
  ],
  model_save_failed: [
    "模型保存失败，请刷新后重试。",
    "模型儲存失敗，請重新整理後再試。",
    "Could not save the model. Refresh and try again."
  ],
  probe_failed: [
    "测试未能开始，请重试。",
    "測試未能開始，請再試。",
    "Tests could not start. Try again."
  ],
  current_failed: [
    "当前模型读取失败，请刷新。",
    "目前模型讀取失敗，請重新整理。",
    "Could not load the current model. Refresh."
  ],
  catalog_failed: [
    "模型列表读取失败，请刷新。",
    "模型清單讀取失敗，請重新整理。",
    "Could not load the model list. Refresh."
  ],
  connection_changed: [
    "连接已变化，请重新测试。",
    "連線已變更，請重新測試。",
    "The connection has changed. Test again."
  ],
  probe_interrupted: [
    "测试已中断，请重试。",
    "測試已中斷，請再試。",
    "Tests were interrupted. Try again."
  ],
  current_unavailable: [
    "当前模型不可用，请重新测试或选择。",
    "目前模型無法使用，請重新測試或選擇。",
    "The current model is unavailable. Test again or choose another."
  ],
  no_models: [
    "没有可选模型，请刷新。",
    "沒有可選模型，請重新整理。",
    "No models are available to select. Refresh."
  ],
  probe_results: [
    "查看测试结果（{{count}}）",
    "檢視測試結果（{{count}}）",
    "View test results ({{count}})"
  ],
  provider: ["模型服务商", "模型服務商", "Model provider"],
  provider_required: ["请选择服务商", "請選擇服務商", "Choose a provider"],
  choose_provider: ["选择服务商", "選擇服務商", "Choose a provider"],
  key_required: ["请输入 API Key", "請輸入 API Key", "Enter an API Key"],
  key_too_long: ["API Key 过长", "API Key 過長", "API Key is too long"],
  paste_key: ["粘贴 API Key", "貼上 API Key", "Paste API Key"],
  key_cost_notice: [
    "费用由服务商收取，保存后仍需选择模型。",
    "費用由服務商收取，儲存後仍須選擇模型。",
    "The provider charges for usage. You still need to choose a model after saving."
  ],
  save_key: ["保存 API Key", "儲存 API Key", "Save API Key"],
  provider_read_failed: [
    "服务商读取失败",
    "服務商讀取失敗",
    "Could not load providers"
  ],
  key_failed: [
    "保存失败，请重新输入。",
    "儲存失敗，請重新輸入。",
    "Could not save. Enter the key again."
  ],
  key_saved: ["API Key 已保存。", "API Key 已儲存。", "API Key saved."],
  unknown: ["未知", "未知", "Unknown"],
  seconds: ["{{value}} 秒", "{{value}} 秒", "{{value}} s"],
  response: ["已响应", "已回應", "Responded"],
  error: ["失败", "失敗", "Failed"],
  cancelled: ["已取消", "已取消", "Cancelled"],
  call_time: ["调用时间", "呼叫時間", "Call time"],
  purpose: ["用途", "用途", "Purpose"],
  model_phase: ["模型 / 阶段", "模型 / 階段", "Model / phase"],
  generate: ["生成", "產生", "Generate"],
  review: ["复查", "複查", "Review"],
  phase_missing: ["阶段未记录", "階段未記錄", "Phase not recorded"],
  result: ["结果", "結果", "Result"],
  unobserved_help: [
    "可能尚未完成、进程中断或属于历史记录",
    "可能尚未完成、程序中斷或屬於歷史記錄",
    "May be incomplete, interrupted or a historical record"
  ],
  unobserved: ["未观测", "未觀測", "Unobserved"],
  io_tokens: [
    "输入 / 输出 token",
    "輸入 / 輸出 token",
    "Input / output tokens"
  ],
  io: ["输入 / 输出", "輸入 / 輸出", "Input / output"],
  cache_hit: ["缓存命中", "快取命中", "Cache hit"],
  cache_tooltip: [
    "命中 {{hit}} / 未命中 {{miss}} token",
    "命中 {{hit}} / 未命中 {{miss}} token",
    "Hit {{hit}} / miss {{miss}} tokens"
  ],
  duration: ["耗时", "耗時", "Duration"],
  estimated_cost: ["预估费用", "預估費用", "Estimated cost"],
  missing_pricing: [
    "缺少完整用量或计价依据",
    "缺少完整用量或計價依據",
    "Complete usage or pricing basis is missing"
  ],
  super_only: [
    "仅超级管理员可查看 AI 账本",
    "僅超級管理員可檢視 AI 帳本",
    "Only super administrators can view AI usage"
  ],
  title: ["AI 账本", "AI 帳本", "AI usage"],
  system_settings: ["系统设置", "系統設定", "System settings"],
  subtitle: [
    "模型用量、缓存与响应耗时",
    "模型用量、快取與回應耗時",
    "Model usage, cache and response duration"
  ],
  statistics_basis: ["统计口径", "統計口徑", "Statistics basis"],
  summary_help: [
    "汇总覆盖当前筛选的全部调用，不限当前页。",
    "彙總涵蓋目前篩選的所有呼叫，不限目前頁面。",
    "Summaries cover all calls matching the current filters, across all pages."
  ],
  cache_help: [
    "缓存命中率按已知 token 加权计算；平均耗时包含失败和取消的已观测调用。",
    "快取命中率按已知 token 加權計算；平均耗時包含失敗和取消的已觀測呼叫。",
    "Cache hit rate is weighted by known tokens. Average duration includes observed failed and cancelled calls."
  ],
  response_help: [
    "未知表示尚未取得有效回执。已响应仅表示模型返回，不代表题目审核通过。",
    "未知表示尚未取得有效回執。已回應僅表示模型回傳，不代表題目審核通過。",
    "Unknown means no valid receipt has been received. Responded means the model returned a response; it does not mean the question passed review."
  ],
  pricing_help: [
    "费用按实际 token 和发起调用时冻结的官方单价估算，区分缓存与高峰/空闲时段，不是供应商实际账单。历史记录缺少计价依据时保持未知。",
    "費用按實際 token 和發起呼叫時凍結的官方單價估算，區分快取與尖峰/離峰時段，並非供應商實際帳單。歷史記錄缺少計價依據時保持未知。",
    "Costs are estimated from actual tokens and official rates frozen at call time, including cache and peak/off-peak rates. They are not the provider’s actual bill. Historical records without a pricing basis remain unknown."
  ],
  refresh_ledger: ["刷新 AI 账本", "重新整理 AI 帳本", "Refresh AI usage"],
  call_overview: ["调用概览", "呼叫概覽", "Call overview"],
  call_records: ["调用记录", "呼叫記錄", "Call records"],
  observed_calls: [
    "已观测 {{value}} 次",
    "已觀測 {{value}} 次",
    "Observed calls: {{value}}"
  ],
  input_tokens: ["输入 token", "輸入 token", "Input tokens"],
  output_receipts: [
    "输出 {{tokens}} · {{calls}} 次回执",
    "輸出 {{tokens}} · {{calls}} 次回執",
    "Output {{tokens}} · receipts: {{calls}}"
  ],
  cache_rate: ["缓存命中率", "快取命中率", "Cache hit rate"],
  cache_receipts: [
    "{{value}} 次缓存回执 · 按 token 加权",
    "{{value}} 次快取回執 · 按 token 加權",
    "Cache receipts: {{value}} · weighted by tokens"
  ],
  average_duration: ["平均调用耗时", "平均呼叫耗時", "Average call duration"],
  total_duration: [
    "总耗时 {{value}}",
    "總耗時 {{value}}",
    "Total duration {{value}}"
  ],
  filtered_cost: [
    "当前筛选预估费用：{{value}}",
    "目前篩選預估費用：{{value}}",
    "Estimated cost for current filters: {{value}}"
  ],
  priced_calls: [
    "· 已计价 {{priced}}/{{total}} 次",
    "· 已計價 {{priced}}/{{total}} 次",
    "· Priced calls: {{priced}}/{{total}}"
  ],
  unknown_cost_calls_one: [
    "· {{count}} 次费用未知",
    "· {{count}} 次費用未知",
    "· {{count}} call with unknown cost"
  ],
  unknown_cost_calls_other: [
    "· {{count}} 次费用未知",
    "· {{count}} 次費用未知",
    "· {{count}} calls with unknown cost"
  ],
  partial_cost: [
    "，金额仅含已知部分",
    "，金額僅含已知部分",
    "; amount includes known costs only"
  ],
  call_details: ["调用明细", "呼叫明細", "Call details"],
  filtered: ["已筛选", "已篩選", "Filtered"],
  all_calls: ["全部调用", "全部呼叫", "All calls"],
  all_purposes: ["全部用途", "全部用途", "All purposes"],
  purpose_unsupported: [
    "当前服务不支持用途筛选",
    "目前服務不支援用途篩選",
    "This service does not support filtering by purpose"
  ],
  run_id: ["任务 ID", "任務 ID", "Task ID"],
  uuid_required: [
    "请输入完整的任务 UUID",
    "請輸入完整的任務 UUID",
    "Enter the full task UUID"
  ],
  run_placeholder: [
    "输入完整任务 ID",
    "輸入完整任務 ID",
    "Enter the full task ID"
  ],
  search: ["查询", "查詢", "Search"],
  reset: ["重置", "重設", "Reset"],
  ledger_unavailable: [
    "AI 账本暂时不可用",
    "AI 帳本暫時無法使用",
    "AI usage is temporarily unavailable"
  ],
  ledger_failed_help: [
    "可能尚未开通服务、会话权限已变化或服务连接异常。请刷新重试。",
    "可能尚未開通服務、登入權限已變更或服務連線異常。請重新整理後再試。",
    "The service may not be enabled, session permissions may have changed, or the connection may have failed. Refresh and try again."
  ],
  empty_calls: [
    "暂无符合条件的模型调用记录",
    "尚無符合條件的模型呼叫記錄",
    "No model calls match these filters"
  ],
  call_id: ["调用 ID", "呼叫 ID", "Call ID"],
  no_run: ["不关联命题任务", "不關聯命題任務", "Not linked to a question task"],
  request_id: ["委托 ID", "委託 ID", "Request ID"],
  pricing_basis: ["计价依据", "計價依據", "Pricing basis"],
  pricing_detail: [
    "{{version}} · {{tariff}}时段（人民币预估）",
    "{{version}} · {{tariff}}時段（人民幣預估）",
    "{{version}} · {{tariff}} period (CNY estimate)"
  ],
  peak: ["高峰", "尖峰", "Peak"],
  off_peak: ["空闲", "離峰", "Off-peak"],
  cache_tokens: [
    "缓存命中 / 未命中 token",
    "快取命中 / 未命中 token",
    "Cache hit / miss tokens"
  ],
  total_calls_one: [
    "共 {{count}} 次调用",
    "共 {{count}} 次呼叫",
    "{{count}} call in total"
  ],
  total_calls_other: [
    "共 {{count}} 次调用",
    "共 {{count}} 次呼叫",
    "{{count}} calls in total"
  ],
  purpose_question_generation: ["命题", "命題", "Question generation"],
  purpose_assistant: ["词库问答", "詞庫問答", "Lexicon Q&A"],
  purpose_form_candidates: ["词形候选", "詞形候選", "Form candidates"],
  purpose_reference_extract: ["参考整理", "參考整理", "Reference extraction"]
} as const satisfies Record<string, readonly [string, string, string]>;
