export const coinMessages = {
  breadcrumb: ["面包屑", "麵包屑", "Breadcrumb"],
  forbidden: [
    "你没有操作权限，或正在操作自己的账号，请核对后重试",
    "你沒有操作權限，或正在操作自己的帳號，請核對後重試",
    "You do not have permission, or you are targeting your own account. Check and try again."
  ],
  coin_wallet_unavailable: [
    "该账号的天生币账户已暂停或关闭，暂时无法发放或撤销",
    "此帳號的天生幣帳戶已暫停或關閉，暫時無法發放或撤銷",
    "This coin wallet is suspended or closed. Credits and reversals are unavailable."
  ],
  coin_account_unavailable: [
    "该账号暂时不可用",
    "此帳號暫時無法使用",
    "This account is unavailable."
  ],
  coin_source_conflict: [
    "这笔业务已发放，或这笔发放已撤销，请查看发放记录",
    "此筆業務已發放，或此筆發放已撤銷，請查看發放記錄",
    "This transaction has already been credited or reversed. Check the credit history."
  ],
  coin_idempotency_conflict: [
    "本次提交与之前的内容不一致，请关闭窗口后重新核对",
    "本次提交與先前內容不一致，請關閉視窗後重新核對",
    "This submission differs from the previous one. Close the dialog and check the details again."
  ],
  coin_insufficient_balance: [
    "该账号余额不足，无法扣回这笔天生币",
    "此帳號餘額不足，無法扣回此筆天生幣",
    "This account has insufficient coins to reverse this credit."
  ],
  coin_invalid_amount: [
    "请输入 1 至 9,223,372,036,854,775,807 之间的整数",
    "請輸入 1 至 9,223,372,036,854,775,807 之間的整數",
    "Enter an integer from 1 to 9,223,372,036,854,775,807."
  ],
  coin_reversal_invalid: [
    "只能撤销手动发放的天生币",
    "只能撤銷手動發放的天生幣",
    "Only manual credits can be reversed."
  ],
  rejected: [
    "操作被拒绝，请核对输入或重试",
    "操作遭拒，請核對輸入或重試",
    "The operation was rejected. Check the input or try again."
  ],
  uncertain: [
    "暂时无法确认操作结果，请先查看发放记录；也可保持内容不变后重试，不会重复处理",
    "暫時無法確認操作結果，請先查看發放記錄；也可保持內容不變後重試，不會重複處理",
    "The result is unconfirmed. Check the credit history first, or retry without changing the details; it will not be processed twice."
  ],
  no_access: [
    "没有天生币管理查询权限",
    "沒有天生幣管理查詢權限",
    "You do not have permission to view coin management."
  ],
  credited: ["天生币已发放", "天生幣已發放", "Coins credited"],
  reversed: [
    "已撤销发放，天生币已扣回",
    "已撤銷發放，天生幣已扣回",
    "Credit reversed and coins deducted"
  ],
  owner_type: ["账号类型", "帳號類型", "Account type"],
  user: ["用户", "使用者", "User"],
  admin: ["管理员", "管理員", "Administrator"],
  account_search: ["账户查找", "帳戶查找", "Find account"],
  search_required: [
    "请输入姓名、账号编号、完整手机号或邮箱",
    "請輸入姓名、帳號編號、完整手機號碼或電郵",
    "Enter a name, account ID, full phone number or email address."
  ],
  search_placeholder: [
    "姓名 / 账号编号 / 完整手机号或邮箱",
    "姓名 / 帳號編號 / 完整手機號碼或電郵",
    "Name / account ID / full phone number or email"
  ],
  find: ["查找", "查找", "Find"],
  accounts_failed: [
    "账户查询失败，请重试",
    "帳戶查詢失敗，請重試",
    "Could not find accounts. Try again."
  ],
  account: ["账号", "帳號", "Account"],
  balance: ["余额", "餘額", "Balance"],
  status: ["状态", "狀態", "Status"],
  closed: ["天生币账户已关闭", "天生幣帳戶已關閉", "Coin wallet closed"],
  suspended: ["天生币账户已暂停", "天生幣帳戶已暫停", "Coin wallet suspended"],
  active: ["正常", "正常", "Active"],
  unavailable: ["账号不可用", "帳號無法使用", "Account unavailable"],
  action: ["操作", "操作", "Actions"],
  view_account: ["查看账户", "查看帳戶", "View account"],
  selected: ["已选账户", "已選帳戶", "Selected account"],
  name: ["姓名", "姓名", "Name"],
  account_id: ["账号编号", "帳號編號", "Account ID"],
  credit_unavailable: [
    "当前账号状态或你的权限不允许发放天生币",
    "目前帳號狀態或你的權限不允許發放天生幣",
    "The account status or your permissions do not allow credits."
  ],
  credit_type: ["发放类型", "發放類型", "Credit type"],
  manual_purchase: ["购买入账", "購買入帳", "Purchase credit"],
  manual_reward: ["手动奖励", "手動獎勵", "Manual reward"],
  amount: ["天生币数量", "天生幣數量", "Coin amount"],
  category_required: [
    "请选择发放类型",
    "請選擇發放類型",
    "Select a credit type."
  ],
  event_required: [
    "请填写业务单号",
    "請填寫業務單號",
    "Enter a transaction reference."
  ],
  reason_required: [
    "请填写发放原因",
    "請填寫發放原因",
    "Enter a reason for the credit."
  ],
  positive_required: [
    "请输入正整数",
    "請輸入正整數",
    "Enter a positive integer."
  ],
  event_id: ["业务单号", "業務單號", "Transaction reference"],
  event_help: [
    "每笔发放使用独立单号，例如付款单号或奖励发放单号；重试同一笔时沿用原单号。",
    "每筆發放使用獨立單號，例如付款單號或獎勵發放單號；重試同一筆時沿用原單號。",
    "Use a unique reference for each credit, such as a payment or reward reference. Keep the same reference when retrying."
  ],
  credit_reason: ["发放原因", "發放原因", "Reason for credit"],
  reason_help: [
    "仅管理员可见，请说明为什么发放。",
    "僅管理員可見，請說明發放原因。",
    "Explain why these coins are being credited. Only administrators can see this."
  ],
  evidence_optional: [
    "凭据备注（选填）",
    "憑據備註（選填）",
    "Evidence note (optional)"
  ],
  evidence_help: [
    "可填写凭证编号或说明，仅管理员可见。",
    "可填寫憑證編號或說明，僅管理員可見。",
    "Enter an evidence reference or note. Only administrators can see this."
  ],
  review_credit: ["核对并发放", "核對並發放", "Review credit"],
  entries: ["收支明细", "收支明細", "Account entries"],
  entries_failed: [
    "收支明细查询失败",
    "收支明細查詢失敗",
    "Could not load account entries."
  ],
  operations_failed: [
    "发放记录加载失败，请重试查询",
    "發放記錄載入失敗，請重試查詢",
    "Could not load credit history. Try the query again."
  ],
  management: ["天生币管理", "天生幣管理", "Coin management"],
  management_help: [
    "查找账号、发放天生币，或查看和撤销手动发放记录。",
    "查找帳號、發放天生幣，或查看和撤銷手動發放記錄。",
    "Find accounts, credit coins, or view and reverse manual credits."
  ],
  refresh_records: ["刷新记录", "重新整理記錄", "Refresh records"],
  accounts_tab: ["账户与发放", "帳戶與發放", "Accounts and credits"],
  history: ["发放记录", "發放記錄", "Credit history"],
  confirm_credit_title: [
    "确认发放天生币",
    "確認發放天生幣",
    "Confirm coin credit"
  ],
  confirm_credit: ["确认发放", "確認發放", "Confirm credit"],
  back: ["返回修改", "返回修改", "Back to edit"],
  credit_warning: [
    "确认后将增加该账号的天生币余额。购买入账前请先核实付款，本操作不会收款或退款。",
    "確認後將增加此帳號的天生幣餘額。購買入帳前請先核實付款，本操作不會收款或退款。",
    "Confirming will increase this account’s coin balance. Verify payment before recording a purchase credit. This action does not collect or refund money."
  ],
  credit_amount: ["发放数量", "發放數量", "Amount to credit"],
  reason: ["原因", "原因", "Reason"],
  confirm_reverse_title: [
    "确认撤销发放",
    "確認撤銷發放",
    "Confirm credit reversal"
  ],
  confirm_reverse: ["确认扣回", "確認扣回", "Confirm deduction"],
  cancel: ["取消", "取消", "Cancel"],
  original: ["原发放记录", "原發放記錄", "Original credit"],
  deduct_amount: ["将扣回", "將扣回", "Amount to deduct"],
  reverse_reason: ["撤销原因", "撤銷原因", "Reason for reversal"],
  reverse_placeholder: [
    "请说明撤销原因，例如发错账号或数量（必填）",
    "請說明撤銷原因，例如發錯帳號或數量（必填）",
    "Explain the reversal, for example an incorrect account or amount (required)."
  ],
  reverse_warning: [
    "撤销会扣回这笔发放的全部天生币，原记录仍会保留，不涉及退款。每笔只能撤销一次；余额不足或账户暂停时无法撤销。",
    "撤銷會扣回此筆發放的全部天生幣，原記錄仍會保留，不涉及退款。每筆只能撤銷一次；餘額不足或帳戶暫停時無法撤銷。",
    "Reversing deducts the full credit and keeps the original record. It does not refund money. Each credit can only be reversed once; insufficient balance or a suspended wallet prevents reversal."
  ],
  my_coins: ["我的天生币", "我的天生幣", "My coins"],
  coins: ["天生币", "天生幣", "Coins"],
  my_help: [
    "查看当前管理员账号的天生币余额与收支记录。",
    "查看目前管理員帳號的天生幣餘額與收支記錄。",
    "View the current administrator’s coin balance and account entries."
  ],
  wallet_balance: ["账户余额", "帳戶餘額", "Account balance"],
  refresh: ["刷新", "重新整理", "Refresh"],
  wallet_failed: [
    "余额加载失败，当前余额未知",
    "餘額載入失敗，目前餘額未知",
    "Could not load the balance. The current balance is unknown."
  ],
  wallet_loading: ["正在读取余额…", "正在讀取餘額…", "Loading balance…"],
  wallet_closed: [
    "钱包已暂停或关闭",
    "錢包已暫停或關閉",
    "Wallet suspended or closed"
  ],
  my_entries: ["收支记录", "收支記錄", "Account history"],
  my_entries_failed: [
    "流水加载失败，请重试",
    "流水載入失敗，請重試",
    "Could not load entries. Try again."
  ],
  invitation_reward: ["邀请奖励", "邀請獎勵", "Invitation reward"],
  learning_reward: ["每日学习奖励", "每日學習獎勵", "Daily learning reward"],
  daily_login_reward: ["每日登录奖励", "每日登入獎勵", "Daily sign-in reward"],
  manual_reversal: ["撤销发放", "撤銷發放", "Reverse credit"],
  account_closure: [
    "注销余额作废",
    "註銷餘額作廢",
    "Balance forfeited on account closure"
  ],
  no_entries: ["暂无账户流水", "暫無帳戶流水", "No account entries yet"],
  time: ["时间", "時間", "Time"],
  source: ["来源", "來源", "Source"],
  coin_entry: ["天生币收支", "天生幣收支", "Coin entry"],
  change: ["变动", "變動", "Change"],
  balance_after: ["记账后余额", "記帳後餘額", "Balance after entry"],
  deducted: ["已扣回", "已扣回", "Deducted"],
  status_reversed: ["已撤销", "已撤銷", "Reversed"],
  status_credited: ["已发放", "已發放", "Credited"],
  owner_placeholder: [
    "输入姓名或账号编号",
    "輸入姓名或帳號編號",
    "Enter a name or account ID"
  ],
  type: ["类型", "類型", "Type"],
  all_types: ["全部类型", "全部類型", "All types"],
  complete_time: [
    "请选择完整的开始和结束时间",
    "請選擇完整的開始和結束時間",
    "Select both a valid start and end time."
  ],
  query: ["查询", "查詢", "Search"],
  reset: ["重置", "重設", "Reset"],
  fewer_filters: ["收起筛选", "收起篩選", "Fewer filters"],
  more_filters: ["更多筛选", "更多篩選", "More filters"],
  actor: ["操作人", "操作人", "Operator"],
  actor_placeholder: [
    "输入姓名或操作人编号",
    "輸入姓名或操作人編號",
    "Enter a name or operator ID"
  ],
  all_accounts: ["全部账号", "全部帳號", "All accounts"],
  no_operations: ["暂无发放记录", "暫無發放記錄", "No credits yet"],
  history_help: [
    "查看手动发放和撤销记录，完整单号与凭据可在详情中查看。",
    "查看手動發放和撤銷記錄，完整單號與憑據可在詳情中查看。",
    "View manual credits and reversals. Open the details for full references and evidence."
  ],
  coin_adjustment: ["天生币调整", "天生幣調整", "Coin adjustment"],
  view_details: ["查看详情", "查看詳情", "View details"],
  detail_title: ["发放记录详情", "發放記錄詳情", "Credit details"],
  operation_time: ["操作时间", "操作時間", "Operation time"],
  operation_balance: ["变动后余额", "變動後餘額", "Balance after change"],
  evidence: ["凭据备注", "憑據備註", "Evidence note"],
  not_provided: ["未填写", "未填寫", "Not provided"],
  original_id: ["原发放记录编号", "原發放記錄編號", "Original credit ID"],
  record_id: ["记录编号", "記錄編號", "Record ID"],
  reversal_id: ["撤销记录编号", "撤銷記錄編號", "Reversal ID"],
  reverse_help: [
    "发错账号或数量时，可撤销这笔发放。撤销会扣回全部数量，不涉及退款。",
    "發錯帳號或數量時，可撤銷此筆發放。撤銷會扣回全部數量，不涉及退款。",
    "Reverse a credit sent to the wrong account or for the wrong amount. Reversal deducts the full amount and does not refund money."
  ],
  account_missing: [
    "账号资料不可用",
    "帳號資料無法使用",
    "Account details unavailable"
  ],
  unit_one: ["天生币", "天生幣", "coin"],
  unit_other: ["天生币", "天生幣", "coins"],
  total_one: ["共 {{count}} 条", "共 {{count}} 筆", "{{count}} record"],
  total_other: ["共 {{count}} 条", "共 {{count}} 筆", "{{count}} records"]
} as const satisfies Record<string, readonly [string, string, string]>;
