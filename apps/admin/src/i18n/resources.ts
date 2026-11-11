// 稳定语义键；三列分别为简体、繁体、基础英文。业务正文不进入此目录。
export const adminShellMessages = {
  loading: ["加载中...", "載入中...", "Loading…"],
  nav_home: ["首页", "首頁", "Home"],
  nav_users: ["用户管理", "使用者管理", "Users"],
  nav_admins: ["管理员管理", "管理員管理", "Administrators"],
  nav_permissions: ["权限管理", "權限管理", "Permissions"],
  nav_classes: ["班级管理", "班級管理", "Classes"],
  nav_dictionary: ["词库管理", "詞庫管理", "Lexicon"],
  nav_lexicon_next: ["新词库", "新詞庫", "New lexicon"],
  nav_words: ["智能词库", "智慧詞庫", "Entries"],
  nav_trash: ["垃圾桶", "垃圾桶", "Trash"],
  nav_parts: ["词性配置", "詞性設定", "Parts of speech"],
  nav_custom_dictionary: ["自定义词库", "自訂詞庫", "Custom dictionaries"],
  nav_voice: ["配音中心", "配音中心", "Speech"],
  nav_dubbing: ["分组配音", "分組配音", "Voice groups"],
  nav_voices: ["音色库", "音色庫", "Voice library"],
  nav_examples: ["例句管理", "例句管理", "Examples"],
  nav_sentences: ["多维例句", "多維例句", "Sentences"],
  nav_wordlists: ["词表管理", "詞表管理", "Word lists"],
  nav_wordlists_entries: ["智能词表", "智慧詞表", "Word lists"],
  nav_wordlist_reviews: ["词表审核", "詞表審核", "Word list reviews"],
  nav_custom_wordlists: ["自定义词表", "自訂詞表", "Custom word lists"],
  nav_tasks: ["任务管理", "任務管理", "Tasks"],
  nav_reviews: ["审核管理", "審核管理", "Reviews"],
  nav_teacher_reviews: ["教师申请审核", "教師申請審核", "Teacher applications"],
  nav_comments: ["评论审核", "評論審核", "Comment reviews"],
  nav_system: ["系统设置", "系統設定", "System settings"],
  nav_ai: ["AI 账本", "AI 帳本", "AI usage"],
  nav_coins: ["天生币", "天生幣", "Coins"],
  nav_my_coins: ["我的天生币", "我的天生幣", "My coins"],
  nav_coin_management: ["天生币管理", "天生幣管理", "Coin management"],
  nav_categories: ["导航分类", "導覽分類", "Navigation categories"],
  nav_unavailable: ["暂未开放", "尚未開放", "Not available yet"],
  nav_menu: ["后台导航", "後台導覽", "Navigation"],
  nav_close: ["收起后台导航", "收起後台導覽", "Close navigation"],
  nav_brand_home: ["天生会背首页", "天生会背首頁", "天生会背 home"],
  nav_platform: ["平台后台", "平台後台", "Platform admin"],
  account_admin: ["管理员", "管理員", "Administrator"],
  account_standard_admin: ["普通管理员", "一般管理員", "Administrator"],
  account_super_admin: ["超级管理员", "超級管理員", "Super administrator"],
  account_menu: ["账户菜单", "帳戶選單", "Account menu"],
  account_settings: ["个人设置", "個人設定", "Personal settings"],
  account_change_password: ["修改密码", "修改密碼", "Change password"],
  account_sign_out: ["退出登录", "登出", "Sign out"],
  account_sign_out_all: [
    "退出所有设备",
    "登出所有裝置",
    "Sign out all devices"
  ],
  account_sign_out_all_confirm: [
    "将吊销你在全部设备上的登录会话，包括当前这台——确认后需要重新登录。确认退出？",
    "將撤銷你在所有裝置上的登入狀態，包括目前這台。確認後須重新登入。確定登出？",
    "This ends your sessions on every device, including this one. You will need to sign in again. Continue?"
  ],
  account_confirm_sign_out_all: ["全部退出", "全部登出", "Sign out everywhere"],
  account_sign_out_all_failed: [
    "未能确认所有设备已退出，请重试。",
    "無法確認所有裝置已登出，請重試。",
    "Could not confirm that all devices were signed out. Try again."
  ],
  settings_preferences: ["使用偏好", "使用偏好", "Preferences"],
  settings_preferences_tab: ["偏好设置", "偏好設定", "Preferences"],
  settings_security: ["账号安全", "帳號安全", "Account security"],
  settings_model_accounts: ["模型账号", "模型帳號", "Model accounts"],
  settings_question_model: ["出题模型", "出題模型", "Question model"],
  settings_language: ["界面语言", "介面語言", "Interface language"],
  settings_browser: ["跟随浏览器", "依照瀏覽器", "Use browser language"],
  settings_language_unavailable: [
    "当前不可用",
    "目前無法使用",
    "Currently unavailable"
  ],
  settings_language_fallback: [
    "所选语言暂不可用，当前显示{{language}}。",
    "所選語言暫時無法使用，目前顯示{{language}}。",
    "The selected language is unavailable. Currently using {{language}}."
  ],
  settings_language_error: [
    "暂时无法读取语言设置",
    "暫時無法讀取語言設定",
    "Language settings are unavailable"
  ],
  settings_save_failed: [
    "保存失败，请重试",
    "儲存失敗，請重試",
    "Could not save. Try again."
  ],
  settings_saved: ["已保存", "已儲存", "Saved"],
  settings_save_error: [
    "保存失败：{{detail}}",
    "儲存失敗：{{detail}}",
    "Could not save: {{detail}}"
  ],
  settings_session_changed: [
    "当前会话已变化，请重试",
    "目前的登入狀態已變更，請重試",
    "Your session has changed. Try again."
  ],
  settings_session_expired: [
    "当前会话已失效，请重新登录",
    "目前的登入狀態已失效，請重新登入",
    "Your session is no longer valid. Sign in again."
  ],
  settings_english: ["英语偏好", "英語偏好", "English preference"],
  settings_english_help: [
    "用于录入、查看和试听。",
    "用於輸入、檢視和試聽。",
    "Used for editing, viewing and audio previews."
  ],
  settings_british: ["英式英语", "英式英語", "British English"],
  settings_american: ["美式英语", "美式英語", "American English"],
  settings_british_label: [
    "英式（BrE）",
    "英式（BrE）",
    "British English (BrE)"
  ],
  settings_american_label: [
    "美式（AmE）",
    "美式（AmE）",
    "American English (AmE)"
  ],
  login_platform: ["内容管理平台", "內容管理平台", "Content management"],
  login_title: ["管理员登录", "管理員登入", "Administrator sign-in"],
  login_phone: ["手机号", "手機號碼", "Phone number"],
  login_phone_placeholder: [
    "请输入手机号",
    "請輸入手機號碼",
    "Enter your phone number"
  ],
  login_password: ["登录密码", "登入密碼", "Password"],
  login_password_placeholder: [
    "请输入密码",
    "請輸入密碼",
    "Enter your password"
  ],
  login_code: ["短信验证码", "簡訊驗證碼", "Verification code"],
  login_code_placeholder: ["请输入验证码", "請輸入驗證碼", "Enter the code"],
  login_countdown: [
    "{{seconds}}s 后重发",
    "{{seconds}}秒後重傳",
    "Resend in {{seconds}}s"
  ],
  login_sending: ["发送中...", "傳送中...", "Sending…"],
  login_send_code: ["获取验证码", "取得驗證碼", "Get code"],
  login_submitting: ["登录中...", "登入中...", "Signing in…"],
  login_submit: ["登录", "登入", "Sign in"],
  auth_credentials: [
    "账号、密码或验证码错误，请重新输入",
    "帳號、密碼或驗證碼錯誤，請重新輸入",
    "Incorrect account, password or code. Try again."
  ],
  auth_disabled: [
    "该账号已被禁用，请联系超级管理员",
    "此帳號已停用，請聯絡超級管理員",
    "This account is disabled. Contact a super administrator."
  ],
  auth_feature_unavailable: [
    "该功能暂未开放，敬请期待",
    "此功能尚未開放，敬請期待",
    "This feature is not available yet."
  ],
  auth_code_failed: [
    "验证码发送失败，请稍后重试",
    "驗證碼傳送失敗，請稍後重試",
    "Could not send the code. Try again later."
  ],
  auth_profile_failed: [
    "登录成功但加载账号信息失败，请重试",
    "登入成功但無法載入帳號資料，請重試",
    "Signed in, but account details could not be loaded. Try again."
  ],
  auth_locked: [
    "账号已被锁定，请约 15 分钟后再试",
    "帳號已鎖定，請約15分鐘後再試",
    "This account is locked. Try again in about 15 minutes."
  ],
  auth_login_failed: [
    "登录失败，请稍后重试",
    "登入失敗，請稍後重試",
    "Could not sign in. Try again later."
  ],
  auth_expired: [
    "登录已过期，请重新登录",
    "登入已過期，請重新登入",
    "Your session has expired. Sign in again."
  ],
  auth_upgrade: [
    "当前后台版本不支持权限设置，请升级后台服务后再登录",
    "目前後台版本不支援權限設定，請升級後台服務後再登入",
    "Update the backend service to support permissions before signing in."
  ],
  auth_service_unavailable: [
    "后台服务暂不可用",
    "後台服務暫時無法使用",
    "The admin service is unavailable"
  ],
  password_forced_title: [
    "请先修改初始密码",
    "請先修改初始密碼",
    "Change your initial password"
  ],
  password_forced_help: [
    "你的密码由管理员重置，请用临时密码设置新密码后重新登录后台。",
    "你的密碼已由管理員重設，請使用臨時密碼設定新密碼後重新登入後台。",
    "An administrator reset your password. Use the temporary password to set a new one, then sign in again."
  ],
  password_help: [
    "为账号设置一个新的登录密码。",
    "為帳號設定新的登入密碼。",
    "Set a new password for your account."
  ],
  password_temporary: ["临时密码", "臨時密碼", "Temporary password"],
  password_current: ["当前密码", "目前密碼", "Current password"],
  password_current_required: [
    "请输入当前密码",
    "請輸入目前密碼",
    "Enter your current password"
  ],
  password_temporary_placeholder: [
    "管理员发给你的临时密码",
    "管理員提供的臨時密碼",
    "Temporary password from your administrator"
  ],
  password_current_placeholder: [
    "当前登录密码",
    "目前的登入密碼",
    "Current sign-in password"
  ],
  password_new: ["新密码", "新密碼", "New password"],
  password_new_required: [
    "请输入新密码",
    "請輸入新密碼",
    "Enter a new password"
  ],
  password_confirm: ["确认新密码", "確認新密碼", "Confirm new password"],
  password_confirm_required: [
    "请再次输入新密码",
    "請再次輸入新密碼",
    "Enter the new password again"
  ],
  password_confirm_placeholder: [
    "再次输入新密码",
    "再次輸入新密碼",
    "Enter the new password again"
  ],
  password_mismatch: [
    "两次输入的密码不一致",
    "兩次輸入的密碼不一致",
    "The passwords do not match"
  ],
  password_unchanged: [
    "新密码不能与当前密码相同",
    "新密碼不能與目前密碼相同",
    "The new password must differ from the current password"
  ],
  password_temporary_wrong: [
    "临时密码不正确",
    "臨時密碼不正確",
    "The temporary password is incorrect"
  ],
  password_current_wrong: [
    "当前密码不正确",
    "目前密碼不正確",
    "The current password is incorrect"
  ],
  password_hint: [
    "{{min}}–{{max}} 个字符，区分大小写，支持符号和空格",
    "{{min}}–{{max}}個字元，區分大小寫，支援符號和空格",
    "{{min}}–{{max}} characters; case-sensitive; symbols and spaces allowed"
  ],
  password_too_short: [
    "密码至少需要 {{min}} 个字符",
    "密碼至少需要{{min}}個字元",
    "Use at least {{min}} characters"
  ],
  password_too_long: [
    "密码不能超过 {{max}} 个字符",
    "密碼不能超過{{max}}個字元",
    "Use no more than {{max}} characters"
  ],
  password_weak: [
    "该密码过于常见或容易猜测，请换一个",
    "此密碼過於常見或容易猜測，請更換",
    "This password is too common or easy to guess. Choose another."
  ],
  password_compromised: [
    "该密码已出现在泄露记录中，请换一个",
    "此密碼已出現在外洩紀錄中，請更換",
    "This password has appeared in a data breach. Choose another."
  ],
  password_hash_unavailable: [
    "密码服务暂不可用，请稍后再试",
    "密碼服務暫時無法使用，請稍後重試",
    "The password service is unavailable. Try again later."
  ],
  password_failed: [
    "修改失败，请稍后重试",
    "修改失敗，請稍後重試",
    "Could not change the password. Try again later."
  ],
  password_success: [
    "密码修改成功，请重新登录",
    "密碼修改成功，請重新登入",
    "Password changed. Sign in again."
  ],
  password_submitting: ["提交中...", "提交中...", "Submitting…"],
  password_submit: ["确认修改", "確認修改", "Change password"],
  recovery_login_pending: [
    "登录状态待确认",
    "登入狀態待確認",
    "Sign-in status is unconfirmed"
  ],
  recovery_retrying: ["正在重试…", "正在重試…", "Retrying…"],
  recovery_unavailable: [
    "连接暂不可用",
    "連線暫時無法使用",
    "Connection unavailable"
  ],
  recovery_uncertain: [
    "会话刷新结果尚未确认，请重新登录；当前操作请先查看结果",
    "無法確認登入更新結果，請重新登入；目前操作請先確認結果",
    "Could not confirm the session refresh. Sign in again and check the result of your last action."
  ],
  recovery_disconnected: [
    "连接暂时中断，联网后将自动恢复；当前内容已保留",
    "連線暫時中斷，連線後將自動恢復；目前內容已保留",
    "Connection lost. Your content is preserved; reconnection will be automatic."
  ],
  recovery_connecting: [
    "正在恢复连接，联网后将自动继续",
    "正在恢復連線，連線後將自動繼續",
    "Reconnecting. Work will resume when the connection returns."
  ],
  recovery_sign_in: ["重新登录", "重新登入", "Sign in again"],
  recovery_retry: ["重试", "重試", "Retry"],
  recovery_retry_connection: ["重试连接", "重試連線", "Reconnect"],
  error_permission_title: ["没有访问权限", "沒有存取權限", "Access denied"],
  error_permission_help: [
    "请联系超级管理员开通权限。你仍可查看首页和个人设置。",
    "請聯絡超級管理員開通權限。你仍可檢視首頁和個人設定。",
    "Contact a super administrator for access. Home and personal settings remain available."
  ],
  error_resource_title: [
    "页面资源加载失败",
    "頁面資源載入失敗",
    "Page resources could not be loaded"
  ],
  error_resource_help: [
    "页面资源加载失败，请检查网络或刷新重试。编辑备份可在原页面恢复。",
    "頁面資源載入失敗，請檢查網路或重新整理。編輯備份可在原頁面恢復。",
    "Check your connection or reload. Editing backups can be restored on the original page."
  ],
  error_page_title: ["页面出错了", "頁面發生錯誤", "Something went wrong"],
  error_page_help: [
    "页面暂时无法显示，请刷新后重试。",
    "暫時無法顯示頁面，請重新整理後再試。",
    "This page cannot be displayed. Reload and try again."
  ],
  error_detail: ["错误信息：", "錯誤資訊：", "Error details: "],
  error_reload: ["刷新重试", "重新整理", "Reload"],
  error_home: ["返回首页", "返回首頁", "Go to home"],
  error_not_found: ["页面不存在", "找不到頁面", "Page not found"],
  error_not_found_help: [
    "你访问的地址有误或该页面已被移除。",
    "網址有誤或該頁面已移除。",
    "The address is incorrect or the page has been removed."
  ]
} as const satisfies Record<string, readonly [string, string, string]>;

export type AdminShellKey = keyof typeof adminShellMessages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(adminShellMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<AdminShellKey, string>;
export const adminShellResources = {
  "zh-Hans": { adminShell: bundle(0) },
  "zh-Hant": { adminShell: bundle(1) },
  en: { adminShell: bundle(2) }
};

declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminShell: Record<AdminShellKey, string>;
  }
}
