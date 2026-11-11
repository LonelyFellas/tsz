const fixedAccessMessages = {
  disable: ["禁用", "停用", "Disable"],
  enable: ["启用", "啟用", "Enable"],
  disabled: ["已禁用", "已停用", "Disabled"],
  enabled: ["已启用", "已啟用", "Enabled"],
  operation_failed: ["操作失败", "操作失敗", "Operation failed"],
  reset_failed: ["重置失败", "重設失敗", "Reset failed"],
  phone_number: ["手机号", "手機號碼", "Phone number"],
  display_name: ["昵称", "暱稱", "Display name"],
  business_permissions: ["业务权限", "業務權限", "Business permissions"],
  all_permissions: ["全部权限", "全部權限", "All permissions"],
  configure_permissions: ["设置权限", "設定權限", "Configure permissions"],
  access_level: ["权限等级", "權限等級", "Access level"],
  created_by: ["创建人", "建立者", "Created by"],
  system_legacy_data: [
    "系统 / 历史数据",
    "系統 / 歷史資料",
    "System / legacy data"
  ],
  status: ["状态", "狀態", "Status"],
  active: ["正常", "正常", "Active"],
  created_at: ["创建时间", "建立時間", "Created at"],
  actions: ["操作", "操作", "Actions"],
  super_administrators_cannot_be_modified: [
    "超级管理员不可操作",
    "無法操作超級管理員",
    "Super administrators cannot be modified"
  ],
  edit: ["编辑", "編輯", "Edit"],
  handle_the_previous_temporary_password_first: [
    "请先处理上一条临时密码",
    "請先處理上一個臨時密碼",
    "Handle the previous temporary password first"
  ],
  reset_password: ["重置密码", "重設密碼", "Reset password"],
  reset: ["重置", "重設", "Reset"],
  cancel: ["取消", "取消", "Cancel"],
  resetting_revokes_all_of_this_administrator_s_sessions_and_genera: [
    "重置会立即吊销该管理员的全部登录会话，并生成一个只显示一次的临时密码，对方下次登录须改密。确认重置？",
    "重設會立即撤銷該管理員的全部登入工作階段，並產生只顯示一次的臨時密碼，對方下次登入須變更密碼。確認重設？",
    "Resetting revokes all of this administrator’s sessions and generates a temporary password shown only once. They must change it on their next sign-in. Reset the password?"
  ],
  disabling_prevents_this_administrator_from_signing_in_or_accessin: [
    "禁用后该管理员无法再登录后台，已有登录态也不能继续访问后台数据。确认禁用？",
    "停用後該管理員無法再登入後台，現有工作階段也無法繼續存取後台資料。確認停用？",
    "Disabling prevents this administrator from signing in or accessing admin data through existing sessions. Disable the account?"
  ],
  enabling_lets_this_administrator_sign_in_again_enable_the_account: [
    "启用后该管理员可以重新登录后台。确认启用？",
    "啟用後該管理員可以重新登入後台。確認啟用？",
    "Enabling lets this administrator sign in again. Enable the account?"
  ],
  administrators: ["管理员管理", "管理員管理", "Administrators"],
  user_management: ["用户管理", "使用者管理", "User management"],
  phone_number_contains: [
    "手机号包含",
    "手機號碼包含",
    "Phone number contains"
  ],
  display_name_contains: ["昵称包含", "暱稱包含", "Display name contains"],
  all: ["全部", "全部", "All"],
  search: ["搜索", "搜尋", "Search"],
  could_not_load_administrators: [
    "管理员列表加载失败",
    "無法載入管理員列表",
    "Could not load administrators"
  ],
  try_again: ["重试", "重試", "Try again"],
  create_administrator: ["新建管理员", "新增管理員", "Create administrator"],
  no_administrators_yet: ["暂无管理员", "尚無管理員", "No administrators yet"],
  edit_administrator: [
    "编辑管理员资料",
    "編輯管理員資料",
    "Edit administrator"
  ],
  save: ["保存", "儲存", "Save"],
  administrator_updated: [
    "管理员资料已更新",
    "管理員資料已更新",
    "Administrator updated"
  ],
  could_not_update_the_administrator_try_again: [
    "更新管理员资料失败，请重试",
    "無法更新管理員資料，請重試",
    "Could not update the administrator. Try again."
  ],
  enter_a_display_name: ["请输入昵称", "請輸入暱稱", "Enter a display name"],
  display_names_must_be_at_most_50_characters: [
    "昵称最多 50 个字符",
    "暱稱最多 50 個字元",
    "Display names must be at most 50 characters"
  ],
  display_names_cannot_contain_special_or_control_characters: [
    "昵称不能包含特殊或控制字符",
    "暱稱不能包含特殊或控制字元",
    "Display names cannot contain special or control characters"
  ],
  a_verification_code_was_sent_to_the_current_super_administrator_s: [
    "验证码已发送至当前超级管理员手机号",
    "驗證碼已傳送至目前超級管理員的手機號碼",
    "A verification code was sent to the current super administrator’s phone"
  ],
  too_many_requests_try_again_later: [
    "请求过于频繁，请稍后再试",
    "請求過於頻繁，請稍後再試",
    "Too many requests. Try again later."
  ],
  could_not_send_the_verification_code: [
    "验证码发送失败",
    "驗證碼傳送失敗",
    "Could not send the verification code"
  ],
  this_phone_number_is_already_in_use: [
    "该手机号已被占用",
    "該手機號碼已被使用",
    "This phone number is already in use"
  ],
  the_verification_code_is_invalid_or_has_expired: [
    "验证码无效或已过期",
    "驗證碼無效或已過期",
    "The verification code is invalid or has expired"
  ],
  creation_failed: ["创建失败", "建立失敗", "Creation failed"],
  create: ["创建", "建立", "Create"],
  enter_a_phone_number: [
    "请输入手机号",
    "請輸入手機號碼",
    "Enter a phone number"
  ],
  phone_numbers_must_be_5_20_characters: [
    "手机号 5–20 位",
    "手機號碼 5–20 位",
    "Phone numbers must be 5–20 characters"
  ],
  phone_number_for_sign_in: [
    "登录用手机号",
    "登入用手機號碼",
    "Phone number for sign-in"
  ],
  at_most_50_characters: [
    "最长 50 字符",
    "最多 50 個字元",
    "At most 50 characters"
  ],
  display_names_cannot_contain_or_control_characters: [
    "昵称不能包含 < > 或控制字符",
    "暱稱不能包含 < > 或控制字元",
    "Display names cannot contain < > or control characters"
  ],
  administrator_display_name: [
    "管理员昵称",
    "管理員暱稱",
    "Administrator display name"
  ],
  super_administrator_s_verification_code: [
    "超管手机验证码",
    "超級管理員手機驗證碼",
    "Super administrator’s verification code"
  ],
  enter_the_verification_code: [
    "请输入验证码",
    "請輸入驗證碼",
    "Enter the verification code"
  ],
  enter_the_6_digit_verification_code: [
    "请输入 6 位数字验证码",
    "請輸入 6 位數字驗證碼",
    "Enter the 6-digit verification code"
  ],
  "6_digit_code_sent_to_the_current_super_administrator_s_phone": [
    "当前超管手机号收到的 6 位验证码",
    "目前超級管理員手機收到的 6 位驗證碼",
    "6-digit code sent to the current super administrator’s phone"
  ],
  get_code: ["获取验证码", "取得驗證碼", "Get code"],
  temporary_password_copied: [
    "已复制临时密码",
    "已複製臨時密碼",
    "Temporary password copied"
  ],
  could_not_copy_select_and_copy_the_password_below_manually: [
    "复制失败，请手动选中下方密码复制",
    "複製失敗，請手動選取下方密碼複製",
    "Could not copy. Select and copy the password below manually."
  ],
  temporary_password_generated: [
    "临时密码已生成",
    "臨時密碼已產生",
    "Temporary password generated"
  ],
  i_have_copied_it: ["我已复制", "我已複製", "I have copied it"],
  this_password_is_shown_only_once: [
    "此密码仅显示一次",
    "此密碼僅顯示一次",
    "This password is shown only once"
  ],
  this_administrator: ["该管理员", "該管理員", "this administrator"],
  copy_password: ["复制密码", "複製密碼", "Copy password"],
  remove_role_dashboard_access_only: [
    "收回角色（降为仅首页）",
    "收回角色（降為僅首頁）",
    "Remove role (dashboard access only)"
  ],
  role_removed: ["已收回角色", "已收回角色", "Role removed"],
  role_assigned: ["已指派角色", "已指派角色", "Role assigned"],
  assignment_failed: ["指派失败", "指派失敗", "Assignment failed"],
  assign_role: ["指派角色", "指派角色", "Assign role"],
  assign: ["指派", "指派", "Assign"],
  the_current_role_is_not_recorded_here_this_action_assigns_the_sel: [
    "后台不记录管理员当前所属角色，此处为单向操作：选定后把该管理员设为所选角色，或收回为仅首页。被改管理员的菜单在其下次进入后台时生效。",
    "後台不記錄管理員目前所屬角色，此處為單向操作：選定後將該管理員設為所選角色，或收回為僅首頁。被修改管理員的選單在下次進入後台時生效。",
    "The current role is not recorded here. This action assigns the selected role or removes it to leave dashboard access only. The administrator’s menu updates when they next enter the admin app."
  ],
  administrator: ["管理员", "管理員", "Administrator"],
  select_an_administrator: [
    "请选择管理员",
    "請選擇管理員",
    "Select an administrator"
  ],
  select_a_standard_administrator: [
    "选择一名普通管理员",
    "選擇一名一般管理員",
    "Select a standard administrator"
  ],
  loading: ["加载中...", "載入中...", "Loading..."],
  no_standard_administrators: [
    "暂无普通管理员",
    "尚無一般管理員",
    "No standard administrators"
  ],
  role: ["角色", "角色", "Role"],
  select_a_role_or_remove_the_role: [
    "请选择角色或收回",
    "請選擇角色或收回",
    "Select a role or remove the role"
  ],
  assign_or_remove_a_role: [
    "设为某角色，或收回",
    "設為某角色，或收回",
    "Assign or remove a role"
  ],
  saved: ["已保存", "已儲存", "Saved"],
  role_created: ["角色已创建", "角色已建立", "Role created"],
  this_role_name_already_exists: [
    "角色名已存在",
    "角色名稱已存在",
    "This role name already exists"
  ],
  some_permissions_are_no_longer_valid_refresh_the_permission_catal: [
    "有权限项已失效，请刷新权限目录后重试",
    "有權限項目已失效，請重新整理權限目錄後重試",
    "Some permissions are no longer valid. Refresh the permission catalog and try again."
  ],
  invalid_parameters: ["参数不合法", "參數無效", "Invalid parameters"],
  could_not_save: ["保存失败", "儲存失敗", "Could not save"],
  create_role: ["新建角色", "新增角色", "Create role"],
  role_name: ["角色名", "角色名稱", "Role name"],
  enter_a_role_name: ["请输入角色名", "請輸入角色名稱", "Enter a role name"],
  e_g_lexicon_administrator: [
    "如：词库管理员",
    "例如：詞庫管理員",
    "e.g. Lexicon administrator"
  ],
  description_optional: [
    "描述（可选）",
    "描述（選填）",
    "Description (optional)"
  ],
  what_this_role_can_do: [
    "这个角色能做什么",
    "這個角色能做什麼",
    "What this role can do"
  ],
  menu_permissions: ["菜单权限", "選單權限", "Menu permissions"],
  select_the_admin_menus_this_role_can_access_selecting_none_leaves: [
    "勾选该角色可访问的后台菜单；不勾任何项 = 仅可见首页。「未上线」项可先勾选，对应菜单落地前仍为置灰。",
    "勾選此角色可存取的後台選單；不勾選任何項目表示僅可檢視首頁。「未上線」項目可先勾選，對應選單推出前仍會停用。",
    "Select the admin menus this role can access. Selecting none leaves dashboard access only. Unreleased menus can be selected but remain disabled until available."
  ],
  could_not_load_the_permission_catalog: [
    "权限目录加载失败",
    "無法載入權限目錄",
    "Could not load the permission catalog"
  ],
  unreleased: ["未上线", "未上線", "Unreleased"],
  deleted: ["已删除", "已刪除", "Deleted"],
  could_not_delete: ["删除失败", "刪除失敗", "Could not delete"],
  all_features: ["全部功能", "全部功能", "All features"],
  dashboard_only: ["仅首页", "僅首頁", "Dashboard only"],
  system: ["系统", "系統", "System"],
  description: ["描述", "描述", "Description"],
  permissions: ["权限", "權限", "Permissions"],
  members: ["成员数", "成員數", "Members"],
  updated_at: ["更新时间", "更新時間", "Updated at"],
  system_roles_cannot_be_edited_or_deleted: [
    "系统角色不可编辑或删除",
    "系統角色無法編輯或刪除",
    "System roles cannot be edited or deleted"
  ],
  delete: ["删除", "刪除", "Delete"],
  delete_this_role: [
    "确认删除该角色？",
    "確認刪除此角色？",
    "Delete this role?"
  ],
  roles_and_permissions: [
    "角色权限管理",
    "角色權限管理",
    "Roles and permissions"
  ],
  could_not_load_roles: [
    "角色列表加载失败",
    "無法載入角色列表",
    "Could not load roles"
  ],
  refresh: ["刷新", "重新整理", "Refresh"],
  no_roles_yet: ["暂无角色", "尚無角色", "No roles yet"],
  grant_access_to: ["授权对象", "授權對象", "Grant access to"],
  selected_permissions_label: ["已选权限", "已選權限", "Selected permissions"],
  permission_tags: ["权限标签", "權限標籤", "Permission tags"],
  tag_pool: ["标签池", "標籤池", "Tag pool"],
  selected_permission_tags: [
    "已选权限标签",
    "已選權限標籤",
    "Selected permission tags"
  ],
  no_tags_available: ["暂无可用标签", "尚無可用標籤", "No tags available"],
  no_tags_selected: ["未选择标签", "未選擇標籤", "No tags selected"],
  permissions_a96992: ["权限项", "權限項目", "Permissions"],
  permission_modules: ["权限模块", "權限模組", "Permission modules"],
  permission_details: ["权限明细", "權限明細", "Permission details"],
  pending_changes: ["待提交变更", "待提交變更", "Pending changes"],
  no_changes: ["无变更", "無變更", "No changes"],
  preview_changes: ["预览变更", "預覽變更", "Preview changes"],
  confirm_selection: ["确认选择", "確認選擇", "Confirm selection"],
  search_tags: ["搜索标签", "搜尋標籤", "Search tags"],
  available_tags: ["可用标签", "可用標籤", "Available tags"],
  no_matching_tags: ["无匹配标签", "無相符標籤", "No matching tags"],
  configure_permissions_2ee440: [
    "权限配置",
    "權限設定",
    "Configure permissions"
  ],
  could_not_load_permissions: [
    "无法读取权限",
    "無法讀取權限",
    "Could not load permissions"
  ],
  permissions_saved: ["权限已保存", "權限已儲存", "Permissions saved"],
  none: ["无", "無", "None"],
  automatically_added: ["自动补齐", "自動補齊", "Automatically added"],
  automatically_removed: ["自动取消", "自動取消", "Automatically removed"],
  preview_permission_changes: [
    "权限变更预览",
    "權限變更預覽",
    "Preview permission changes"
  ],
  return_to_review: ["返回查看", "返回檢視", "Return to review"],
  save_changes: ["保存变更", "儲存變更", "Save changes"],
  checking_current_permissions_do_not_save_again: [
    "正在确认当前权限，请勿重复保存。",
    "正在確認目前權限，請勿重複儲存。",
    "Checking current permissions. Do not save again."
  ],
  current_permissions_have_been_reloaded_review_them_then_return_to: [
    "已重新读取当前权限。请核对后返回，重新选择需要的调整。",
    "已重新讀取目前權限。請核對後返回，重新選擇需要的調整。",
    "Current permissions have been reloaded. Review them, then return to select the changes again."
  ],
  the_save_result_cannot_be_confirmed_reload_before_making_changes: [
    "暂时无法确认是否保存成功，请重新查看后再操作",
    "暫時無法確認是否儲存成功，請重新檢視後再操作",
    "The save result cannot be confirmed. Reload before making changes."
  ],
  reload: ["重新查看", "重新檢視", "Reload"],
  current_permissions: ["当前权限", "目前權限", "Current permissions"],
  grant: ["开通", "開通", "Grant"],
  page: ["页面", "頁面", "Page"],
  scope: ["范围", "範圍", "Scope"],
  low: ["低", "低", "Low"],
  medium: ["中", "中", "Medium"],
  high: ["高", "高", "High"],
  default: ["默认", "預設", "Default"],
  blue: ["蓝色", "藍色", "Blue"],
  cyan: ["青色", "青色", "Cyan"],
  green: ["绿色", "綠色", "Green"],
  yellow: ["黄色", "黃色", "Yellow"],
  orange: ["橙色", "橙色", "Orange"],
  red: ["红色", "紅色", "Red"],
  purple: ["紫色", "紫色", "Purple"],
  administrators_with_access: [
    "管理员名单",
    "管理員名單",
    "Administrators with access"
  ],
  no_administrators_have_access: [
    "暂无已授权管理员",
    "尚無已授權管理員",
    "No administrators have access"
  ],
  account_id: ["账号 ID", "帳號 ID", "Account ID"],
  permission_version: ["权限版本", "權限版本", "Permission version"],
  grant_access_in_bulk_select_administrators: [
    "批量授权 · 选择管理员",
    "批次授權 · 選擇管理員",
    "Grant access in bulk · Select administrators"
  ],
  revoke_access_select_administrators: [
    "撤销授权 · 选择管理员",
    "撤銷授權 · 選擇管理員",
    "Revoke access · Select administrators"
  ],
  next_confirm_permission_changes: [
    "下一步：确认权限变更",
    "下一步：確認權限變更",
    "Next: confirm permission changes"
  ],
  search_administrator_names: [
    "搜索管理员名称",
    "搜尋管理員名稱",
    "Search administrator names"
  ],
  no_administrators_available: [
    "暂无可选管理员",
    "尚無可選管理員",
    "No administrators available"
  ],
  permission_and_tag_change_history: [
    "权限与标签变更记录",
    "權限與標籤變更記錄",
    "Permission and tag change history"
  ],
  administrator_id: ["管理员 ID", "管理員 ID", "Administrator ID"],
  permission_key: ["权限标识", "權限識別碼", "Permission key"],
  no_changes_recorded: ["暂无变更记录", "尚無變更記錄", "No changes recorded"],
  time: ["时间", "時間", "Time"],
  actor: ["操作者", "操作者", "Actor"],
  target: ["对象", "對象", "Target"],
  request: ["请求", "請求", "Request"],
  change_details: ["调整内容", "調整內容", "Change details"],
  this_tag_name_already_exists_use_another_name: [
    "标签名称已存在，请使用其他名称",
    "標籤名稱已存在，請使用其他名稱",
    "This tag name already exists. Use another name."
  ],
  this_tag_has_changed_reload_it_before_saving: [
    "标签已被更新，请重新查看后再保存",
    "標籤已更新，請重新檢視後再儲存",
    "This tag has changed. Reload it before saving."
  ],
  this_tag_has_been_deleted_select_another_tag: [
    "标签已被删除，请重新选择",
    "標籤已刪除，請重新選擇",
    "This tag has been deleted. Select another tag."
  ],
  permissions_added_to_tag: [
    "权限已加入标签",
    "權限已加入標籤",
    "Permissions added to tag"
  ],
  permissions_removed_from_tag: [
    "权限已从标签移除",
    "權限已從標籤移除",
    "Permissions removed from tag"
  ],
  permission_management: ["权限管理", "權限管理", "Permission management"],
  keyword: ["关键词", "關鍵字", "Keyword"],
  permission_name_description: [
    "权限名称 / 说明",
    "權限名稱 / 說明",
    "Permission name / description"
  ],
  module: ["所属板块", "所屬模組", "Module"],
  could_not_load_permissions_9d864c: [
    "权限列表加载失败",
    "無法載入權限列表",
    "Could not load permissions"
  ],
  grant_access_in_bulk: ["批量授权", "批次授權", "Grant access in bulk"],
  revoke_access: ["撤销授权", "撤銷授權", "Revoke access"],
  manage_tags: ["标签管理", "標籤管理", "Manage tags"],
  change_history: ["变更记录", "變更記錄", "Change history"],
  no_permissions: ["暂无权限", "尚無權限", "No permissions"],
  permission_name: ["权限名称", "權限名稱", "Permission name"],
  description_b110d4: ["详细说明", "詳細說明", "Description"],
  required_permissions_label: ["前置权限", "前置權限", "Required permissions"],
  risk: ["风险", "風險", "Risk"],
  tags: ["标签", "標籤", "Tags"],
  administrators_with_access_845c88: [
    "已授权管理员",
    "已授權管理員",
    "Administrators with access"
  ],
  view_administrators: ["查看管理员", "檢視管理員", "View administrators"],
  tags_only_categorize_permissions_and_do_not_change_administrator_: [
    "标签仅用于权限分类，不影响管理员授权。",
    "標籤僅用於權限分類，不影響管理員授權。",
    "Tags only categorize permissions and do not change administrator access."
  ],
  select_then_confirm: ["勾选后确认", "勾選後確認", "Select, then confirm"],
  tags_183f96: ["标签列表", "標籤列表", "Tags"],
  create_tag: ["新建标签", "新增標籤", "Create tag"],
  no_tags_yet: ["暂无标签", "尚無標籤", "No tags yet"],
  tag_name: ["标签名称", "標籤名稱", "Tag name"],
  confirm_adding_to_tag: [
    "确认添加至标签",
    "確認加入標籤",
    "Confirm adding to tag"
  ],
  confirm_removal_from_tag: [
    "确认从标签移除",
    "確認從標籤移除",
    "Confirm removal from tag"
  ],
  confirm_addition: ["确认添加", "確認新增", "Confirm addition"],
  confirm_removal: ["确认移除", "確認移除", "Confirm removal"],
  delete_this_tag_assigned_administrator_permissions_are_unaffected: [
    "删除标签？管理员已分配的权限不受影响。",
    "刪除標籤？管理員已分配的權限不受影響。",
    "Delete this tag? Assigned administrator permissions are unaffected."
  ],
  tag_deleted_administrator_permissions_are_unchanged: [
    "标签已删除，管理员权限未改变",
    "標籤已刪除，管理員權限未變更",
    "Tag deleted. Administrator permissions are unchanged."
  ],
  edit_tag: ["编辑标签", "編輯標籤", "Edit tag"],
  tag_saved: ["标签已保存", "標籤已儲存", "Tag saved"],
  tag_color: ["标签颜色", "標籤顏色", "Tag color"],
  custom: ["自定义", "自訂", "Custom"],
  custom_color: ["自定义颜色", "自訂顏色", "Custom color"],
  access_denied: ["无权限", "無權限", "Access denied"],
  only_super_administrators_can_manage_administrators: [
    "管理员管理仅超级管理员可访问。",
    "管理員管理僅超級管理員可存取。",
    "Only super administrators can manage administrators."
  ],
  back_to_dashboard: ["返回首页", "返回首頁", "Back to dashboard"],
  only_super_administrators_can_manage_roles_and_permissions: [
    "角色权限管理仅超级管理员可访问。",
    "角色權限管理僅超級管理員可存取。",
    "Only super administrators can manage roles and permissions."
  ],
  standard_administrator: [
    "普通管理员",
    "一般管理員",
    "Standard administrator"
  ],
  super_administrator: ["超级管理员", "超級管理員", "Super administrator"],
  super_administrators_cannot_be_enabled_or_disabled: [
    "不能启禁用超级管理员",
    "無法啟用或停用超級管理員",
    "Super administrators cannot be enabled or disabled"
  ],
  super_administrator_passwords_cannot_be_reset: [
    "不能重置超级管理员的密码",
    "無法重設超級管理員的密碼",
    "Super administrator passwords cannot be reset"
  ],
  this_administrator_does_not_exist_or_has_been_deleted: [
    "该管理员不存在，可能已被删除",
    "該管理員不存在，可能已刪除",
    "This administrator does not exist or has been deleted"
  ],
  invalid_request_parameters: [
    "请求参数不合法",
    "請求參數無效",
    "Invalid request parameters"
  ],
  role_names_cannot_contain_or_control_characters: [
    "角色名不能包含 < > 或控制字符",
    "角色名稱不能包含 < > 或控制字元",
    "Role names cannot contain < > or control characters"
  ],
  you_cannot_perform_this_action_on_a_system_role_or_super_administ: [
    "无权限执行此操作（系统角色或超管不可操作）",
    "無權限執行此操作（無法操作系統角色或超級管理員）",
    "You cannot perform this action on a system role or super administrator"
  ],
  the_role_or_administrator_does_not_exist_or_has_been_deleted: [
    "角色或管理员不存在，可能已被删除",
    "角色或管理員不存在，可能已刪除",
    "The role or administrator does not exist or has been deleted"
  ],
  word_list_management: ["词表管理", "詞表管理", "Word list management"],
  coin_management: ["天生币管理", "天生幣管理", "Coin management"],
  lexicon_management: ["词库管理", "詞庫管理", "Lexicon management"],
  sentence_management: ["例句管理", "例句管理", "Sentence management"],
  teacher_management: ["教师管理", "教師管理", "Teacher management"],
  parts_of_speech_and_forms: [
    "词性词形管理",
    "詞性詞形管理",
    "Parts of speech and forms"
  ],
  speech_synthesis_management: [
    "语音合成管理",
    "語音合成管理",
    "Speech synthesis management"
  ],
  class_management: ["班级管理", "班級管理", "Class management"],
  lexicon: ["智能词库", "智慧詞庫", "Lexicon"],
  custom_dictionaries: ["自定义词库", "自訂詞庫", "Custom dictionaries"],
  sentence_library: ["多维例句", "多維例句", "Sentence library"],
  word_lists: ["智能词表", "智慧詞表", "Word lists"],
  custom_word_lists: ["自定义词表", "自訂詞表", "Custom word lists"],
  task_management: ["任务管理", "任務管理", "Task management"],
  word_list_reviews: ["词表审核", "詞表審核", "Word list reviews"],
  teacher_application_reviews: [
    "教师申请审核",
    "教師申請審核",
    "Teacher application reviews"
  ],
  comment_reviews: ["评论审核", "評論審核", "Comment reviews"],
  set_word_list_visibility: [
    "设置词表公开状态",
    "設定詞表公開狀態",
    "Set word list visibility"
  ],
  recommend_word_lists: ["推荐词表", "推薦詞表", "Recommend word lists"],
  delete_word_lists: ["删除词表", "刪除詞表", "Delete word lists"],
  view_word_lists: ["词表查看", "檢視詞表", "View word lists"],
  withdraw_word_lists: ["词表下架", "詞表下架", "Withdraw word lists"],
  view_coin_records: ["天生币查询", "天生幣查詢", "View coin records"],
  credit_coins_manually: ["人工入账", "人工入帳", "Credit coins manually"],
  reverse_manual_credits: [
    "人工入账冲正",
    "人工入帳沖正",
    "Reverse manual credits"
  ],
  view_entries: ["查看词条", "檢視詞條", "View entries"],
  view_all_platform_entries_including_published_entries_and_drafts: [
    "查看平台所有词条，包含已发布词条和草稿。",
    "檢視平台所有詞條，包含已發布詞條和草稿。",
    "View all platform entries, including published entries and drafts."
  ],
  create_entries: ["创建词条", "建立詞條", "Create entries"],
  create_entries_in_the_lexicon_using_the_built_in_dictionary_to_id: [
    "在智能词库V1中创建新词条，利用内置辞典识别基本词性和英美拼写，同时检测词库中是否已存在同名词条。",
    "在智慧詞庫V1中建立新詞條，利用內建辭典辨識基本詞性和英美拼寫，同時檢測詞庫是否已有同名詞條。",
    "Create entries in the lexicon using the built-in dictionary to identify parts of speech and British and American spellings, and check for existing entries with the same headword."
  ],
  edit_entry_text_and_pronunciation: [
    "编辑词条文本和发音",
    "編輯詞條文字和發音",
    "Edit entry text and pronunciation"
  ],
  edit_text_and_manage_synthesis_sources_for_entries_you_created_li: [
    "编辑自己创建的词条文本相关内容，管理语音合成来源；关联操作需另行授权。",
    "編輯自己建立的詞條文字相關內容，管理語音合成來源；關聯操作須另行授權。",
    "Edit text and manage synthesis sources for entries you created. Linking requires separate permission."
  ],
  link_words_or_phrases_in_entries: [
    "为词条关联单词或短语",
    "為詞條關聯單字或片語",
    "Link words or phrases in entries"
  ],
  link_entry_text_to_other_words_or_phrases_to_support_british_and_: [
    "将词条内的文本内容关联至其他单词或短语，使该文本能够正确切换英美拼写，并建立起词条与例句之间的关系；词条编辑操作需另行授权。",
    "將詞條內的文字關聯至其他單字或片語，以正確切換英美拼寫並建立詞條與例句的關係；編輯詞條須另行授權。",
    "Link entry text to other words or phrases to support British and American spellings and relationships with sentences. Editing entries requires separate permission."
  ],
  extend_entry_access_to_other_creators: [
    "有权编辑其他人创建的词条",
    "可編輯其他人建立的詞條",
    "Extend entry access to other creators"
  ],
  extend_granted_entry_editing_linking_and_history_restoration_perm: [
    "将已获授权的词条编辑、关联、恢复至历史版本等权限，扩展至其他人创建的词条；若仅仅获得本权限还无法编辑词条，需搭配编辑相关权限才能真正实现编辑操作。",
    "將已授權的詞條編輯、關聯、歷史版本恢復等權限擴展至其他人建立的詞條；僅有此權限仍無法編輯，須搭配對應的編輯權限。",
    "Extend granted entry editing, linking and history restoration permissions to entries created by others. This scope alone does not grant editing actions."
  ],
  publish_entries: ["发布词条", "發布詞條", "Publish entries"],
  publish_entries_you_created_so_users_can_view_and_use_them: [
    "发布自己创建的词条，使其变为公开状态，可以被用户看到并使用。",
    "發布自己建立的詞條，讓使用者可以檢視及使用。",
    "Publish entries you created so users can view and use them."
  ],
  delete_entries: ["删除词条", "刪除詞條", "Delete entries"],
  move_entries_you_created_to_trash_to_make_them_unavailable_withou: [
    "将自己创建的词条删除至垃圾桶，使其变为不可用状态，但该词条的数据不会完全消失。",
    "將自己建立的詞條移至垃圾桶，使其無法使用，但不會完全移除詞條資料。",
    "Move entries you created to trash to make them unavailable without permanently erasing their data."
  ],
  restore_entries_from_trash: [
    "从垃圾桶恢复词条",
    "從垃圾桶恢復詞條",
    "Restore entries from trash"
  ],
  restore_trashed_entries_to_the_lexicon_as_editable_drafts_without: [
    "将已删入垃圾桶的词条恢复到智能词库V1，重返草稿状态，可以被编辑，但不会自动公开。",
    "將垃圾桶中的詞條恢復至智慧詞庫V1的草稿狀態，可供編輯但不會自動公開。",
    "Restore trashed entries to the lexicon as editable drafts without publishing them automatically."
  ],
  restore_entry_history: [
    "恢复词条至历史版本",
    "恢復詞條至歷史版本",
    "Restore entry history"
  ],
  restore_a_draft_entry_you_created_to_a_historical_revision: [
    "将自己创建的草稿词条，恢复至它的某个历史版本。",
    "將自己建立的草稿詞條恢復至某個歷史版本。",
    "Restore a draft entry you created to a historical revision."
  ],
  view_all_sentences: ["查看全部例句", "檢視全部例句", "View all sentences"],
  view_all_platform_sentences_including_drafts_and_published_senten: [
    "查看平台全部例句，包括草稿和已发布状态",
    "檢視平台全部例句，包括草稿和已發布狀態",
    "View all platform sentences, including drafts and published sentences"
  ],
  view_published_sentences: [
    "查看已发布例句",
    "檢視已發布例句",
    "View published sentences"
  ],
  view_all_published_platform_sentences: [
    "查看平台全部已发布例句",
    "檢視平台全部已發布例句",
    "View all published platform sentences"
  ],
  create_sentences: ["创建例句", "建立例句", "Create sentences"],
  create_sentences_you_can_edit: [
    "创建自己可以编辑的例句",
    "建立自己可以編輯的例句",
    "Create sentences you can edit"
  ],
  edit_sentence_text_and_pronunciation: [
    "编辑例句文本和发音",
    "編輯例句文字和發音",
    "Edit sentence text and pronunciation"
  ],
  edit_sentence_text_and_obtain_synthesized_audio_linking_words_and: [
    "只有权编辑例句的文本并获取语音合成音频；关联单词和短语需另行授权",
    "僅可編輯例句文字及取得語音合成音訊；關聯單字和片語須另行授權",
    "Edit sentence text and obtain synthesized audio. Linking words and phrases requires separate permission"
  ],
  link_words_and_phrases_in_sentences: [
    "为例句关联单词和短语",
    "為例句關聯單字和片語",
    "Link words and phrases in sentences"
  ],
  link_words_and_phrases_in_sentences_editing_sentence_text_and_pro: [
    "只有权为例句关联单词和短语；编辑例句文本和发音需另行授权",
    "僅可為例句關聯單字和片語；編輯例句文字和發音須另行授權",
    "Link words and phrases in sentences. Editing sentence text and pronunciation requires separate permission"
  ],
  extend_sentence_access_to_other_creators: [
    "有权编辑他人的例句",
    "可編輯他人的例句",
    "Extend sentence access to other creators"
  ],
  extend_granted_sentence_editing_permissions_to_sentences_created_: [
    "将已获授权的例句编辑权限扩展至他人的例句；需搭配编辑权限才能获取实际编辑能力",
    "將已授權的例句編輯權限擴展至他人的例句；須搭配編輯權限才可編輯",
    "Extend granted sentence editing permissions to sentences created by others. Editing permission is also required"
  ],
  publish_sentences: ["发布公开例句", "發布公開例句", "Publish sentences"],
  publish_draft_sentences_for_public_access: [
    "将草稿状态的例句发布成公开状态",
    "將草稿例句發布為公開狀態",
    "Publish draft sentences for public access"
  ],
  withdraw_sentences: ["撤回例句", "撤回例句", "Withdraw sentences"],
  withdraw_published_sentences_to_draft_status: [
    "将已发布的公开例句撤回至草稿状态",
    "將已發布的公開例句撤回至草稿狀態",
    "Withdraw published sentences to draft status"
  ],
  restore_sentence_history: [
    "恢复例句至历史版本",
    "恢復例句至歷史版本",
    "Restore sentence history"
  ],
  restore_draft_sentences_to_a_historical_revision_published_senten: [
    "将草稿状态的例句恢复至某个历史版本；已发布例句须先撤回",
    "將草稿例句恢復至某個歷史版本；已發布例句須先撤回",
    "Restore draft sentences to a historical revision. Published sentences must be withdrawn first"
  ],
  view_all_users: ["查看全部用户名单", "檢視全部使用者名單", "View all users"],
  view_display_names_and_registration_times_for_all_users: [
    "查看平台内所有用户的昵称和注册时间",
    "檢視平台所有使用者的暱稱和註冊時間",
    "View display names and registration times for all users"
  ],
  view_basic_user_information: [
    "查看用户基本信息",
    "檢視使用者基本資訊",
    "View basic user information"
  ],
  view_user_ids_avatars_display_names_roles_certifications_and_acco: [
    "查看用户 ID、头像、昵称、角色、认证和账号状态",
    "檢視使用者 ID、頭像、暱稱、角色、認證和帳號狀態",
    "View user IDs, avatars, display names, roles, certifications and account status"
  ],
  view_user_coin_balances: [
    "查看用户天生币余额",
    "檢視使用者天生幣餘額",
    "View user coin balances"
  ],
  view_current_user_coin_balances: [
    "查看用户当前天生币余额",
    "檢視使用者目前天生幣餘額",
    "View current user coin balances"
  ],
  view_user_coin_transactions: [
    "查看用户天生币账单",
    "檢視使用者天生幣帳單",
    "View user coin transactions"
  ],
  view_user_coin_transactions_per_transaction_balances_require_bala: [
    "查看用户天生币收支账单；逐笔余额另需余额权限",
    "檢視使用者天生幣收支帳單；每筆餘額另須餘額權限",
    "View user coin transactions. Per-transaction balances require balance permission"
  ],
  view_user_identity_documents: [
    "查看用户身份证件",
    "檢視使用者身分證件",
    "View user identity documents"
  ],
  view_both_sides_of_the_identity_document_from_the_latest_teacher_: [
    "查看用户最近一次教师认证申请中的身份证正反面",
    "檢視使用者最近一次教師認證申請中的身分證正反面",
    "View both sides of the identity document from the latest teacher application"
  ],
  view_user_registration_regions: [
    "查看用户注册地区",
    "檢視使用者註冊地區",
    "View user registration regions"
  ],
  view_the_city_associated_with_the_registration_ip_without_exposin: [
    "查看注册 IP 对应的城市，不包含原始 IP 地址",
    "檢視註冊 IP 對應的城市，不包含原始 IP 位址",
    "View the city associated with the registration IP without exposing the IP address"
  ],
  view_user_phone_numbers_and_email_addresses: [
    "查看用户电话和邮箱",
    "檢視使用者電話和電子郵件",
    "View user phone numbers and email addresses"
  ],
  edit_user_profiles: ["编辑用户资料", "編輯使用者資料", "Edit user profiles"],
  ban_users: ["封禁用户", "封鎖使用者", "Ban users"],
  ban_or_unban_user_accounts: [
    "封禁或解除封禁用户账号",
    "封鎖或解除封鎖使用者帳號",
    "Ban or unban user accounts"
  ],
  view_teacher_applications: [
    "查看教师资格申请列表",
    "檢視教師資格申請列表",
    "View teacher applications"
  ],
  view_all_teacher_applications_including_names_contact_details_app: [
    "查看平台所有申请教师认证的名单，包括姓名、联系方式、认证说明、申请时间及审核和撤销结果",
    "檢視所有教師認證申請，包括姓名、聯絡方式、認證說明、申請時間及審核和撤銷結果",
    "View all teacher applications, including names, contact details, application notes and times, review outcomes and revocations"
  ],
  review_teacher_qualifications: [
    "审核教师资格",
    "審核教師資格",
    "Review teacher qualifications"
  ],
  approve_or_reject_teacher_qualification_applications: [
    "有权审核教师资格，通过或驳回教师资格申请",
    "可審核教師資格，通過或駁回教師資格申請",
    "Approve or reject teacher qualification applications"
  ],
  revoke_teacher_qualifications: [
    "撤销教师资格",
    "撤銷教師資格",
    "Revoke teacher qualifications"
  ],
  revoke_approved_teacher_qualifications: [
    "有权撤销已通过认证的教师资格",
    "可撤銷已通過認證的教師資格",
    "Revoke approved teacher qualifications"
  ],
  view_teacher_certificates: [
    "查看教师资格证书",
    "檢視教師資格證書",
    "View teacher certificates"
  ],
  view_education_and_language_certificates_uploaded_during_teacher_: [
    "有权查看教师认证过程中上传的学历和语言资格证书",
    "可檢視教師認證期間上傳的學歷和語言資格證書",
    "View education and language certificates uploaded during teacher certification"
  ],
  view_personal_identity_documents: [
    "查看个人身份证",
    "檢視個人身分證",
    "View personal identity documents"
  ],
  view_both_sides_of_personal_identity_documents_supplied_during_te: [
    "有权查看教师认证过程中提供的个人身份证正反面",
    "可檢視教師認證期間提供的個人身分證正反面",
    "View both sides of personal identity documents supplied during teacher certification"
  ],
  view_part_of_speech_settings: [
    "查看全部词性配置",
    "檢視全部詞性設定",
    "View part-of-speech settings"
  ],
  view_all_configured_parts_of_speech_subcategories_and_form_types: [
    "可以查看平台已经配置好的全部词性，包括基本词性、细分词性和词形变化",
    "可檢視平台全部已設定的基本詞性、細分詞性和詞形變化",
    "View all configured parts of speech, subcategories and form types"
  ],
  edit_parts_of_speech: [
    "编辑基本词性配置",
    "編輯基本詞性設定",
    "Edit parts of speech"
  ],
  create_and_edit_basic_parts_of_speech: [
    "可以新增和编辑平台的基本词性配置",
    "可新增和編輯平台的基本詞性設定",
    "Create and edit basic parts of speech"
  ],
  edit_part_of_speech_subcategories: [
    "编辑细分词性配置",
    "編輯細分詞性設定",
    "Edit part-of-speech subcategories"
  ],
  create_and_edit_part_of_speech_subcategories: [
    "可以新增和编辑平台的细分词性配置",
    "可新增和編輯平台的細分詞性設定",
    "Create and edit part-of-speech subcategories"
  ],
  edit_form_types: ["编辑词形变化配置", "編輯詞形變化設定", "Edit form types"],
  create_and_edit_form_types: [
    "可以新增和编辑平台的词形变化配置",
    "可新增和編輯平台的詞形變化設定",
    "Create and edit form types"
  ],
  delete_parts_of_speech_or_form_types: [
    "删除词性或词形",
    "刪除詞性或詞形",
    "Delete parts of speech or form types"
  ],
  delete_configured_part_of_speech_subcategories_and_form_types_onl: [
    "可以删除平台已经配置好的细分词性和词形变化；基本词性仅超级管理员可删除",
    "可刪除平台已設定的細分詞性和詞形變化；基本詞性僅超級管理員可刪除",
    "Delete configured part-of-speech subcategories and form types. Only super administrators can delete basic parts of speech"
  ],
  speech_synthesis_upload_audio: [
    "语音合成 上传音频",
    "語音合成 上傳音訊",
    "Speech synthesis: upload audio"
  ],
  upload_audio_for_entry_text_when_the_available_pronunciation_vers: [
    "为词条选择语音来源时，若不满现有发音版本，可以直接上传音频给文本配音。",
    "為詞條選擇語音來源時，可直接上傳音訊作為文字配音。",
    "Upload audio for entry text when the available pronunciation versions do not meet your needs."
  ],
  preview_new_speech: ["预览新语音", "預覽新語音", "Preview new speech"],
  generate_new_synthesized_audio_for_preview_this_incurs_speech_ser: [
    "有权请求生成新的语音合成音频，以供预览，该操作会产生语音服务费用。",
    "可請求產生新的語音合成音訊供預覽，此操作會產生語音服務費用。",
    "Generate new synthesized audio for preview. This incurs speech service charges."
  ],
  global_dubbing: ["全局配音", "全域配音", "Global dubbing"],
  maintain_shared_chinese_introductions_and_global_dubbing_settings: [
    "维护音色库中共享的中文介绍与全局配音设置。",
    "維護音色庫中共用的中文介紹與全域配音設定。",
    "Maintain shared Chinese introductions and global dubbing settings in the voice library."
  ]
} as const satisfies Record<string, readonly [string, string, string]>;

export const accessMessages = {
  revoke: ["取消", "取消", "Revoke"],
  permission_kind_action: ["操作", "操作", "Action"],
  ...fixedAccessMessages,
  reset_admin_title: [
    "重置「{{name}}」的密码",
    "重設「{{name}}」的密碼",
    "Reset the password for ‘{{name}}’"
  ],
  disable_admin_title: [
    "禁用管理员「{{name}}」",
    "停用管理員「{{name}}」",
    "Disable administrator ‘{{name}}’"
  ],
  enable_admin_title: [
    "启用管理员「{{name}}」",
    "啟用管理員「{{name}}」",
    "Enable administrator ‘{{name}}’"
  ],
  records_count: ["共 {{count}} 条", "共 {{count}} 筆", "{{count}} records"],
  records_count_one: ["共 {{count}} 条", "共 {{count}} 筆", "{{count}} record"],
  records_count_other: [
    "共 {{count}} 条",
    "共 {{count}} 筆",
    "{{count}} records"
  ],
  password_handoff: [
    "请复制后线下转交「{{name}}」，对方下次登录须修改。关闭后无法再次查看。",
    "請複製後以線下方式交給「{{name}}」，對方下次登入須變更密碼。關閉後無法再次檢視。",
    "Copy this password and pass it to ‘{{name}}’ offline. They must change it on their next sign-in. It cannot be viewed after closing."
  ],
  password_handoff_unnamed: [
    "请复制后线下转交该管理员，对方下次登录须修改。关闭后无法再次查看。",
    "請複製後以線下方式交給該管理員，對方下次登入須變更密碼。關閉後無法再次檢視。",
    "Copy this password and pass it to the administrator offline. They must change it on their next sign-in. It cannot be viewed after closing."
  ],
  system_role_option: [
    "{{name}}（系统）",
    "{{name}}（系統）",
    "{{name}} (system)"
  ],
  admin_option: [
    "{{name}}（{{phone}}）",
    "{{name}}（{{phone}}）",
    "{{name}} ({{phone}})"
  ],
  edit_role_title: [
    "编辑角色：{{name}}",
    "編輯角色：{{name}}",
    "Edit role: {{name}}"
  ],
  role_name_max: [
    "角色名最长 {{max}} 字符",
    "角色名稱最多 {{max}} 個字元",
    "Role names must be at most {{max}} characters"
  ],
  max_characters: [
    "最长 {{max}} 字符",
    "最多 {{max}} 個字元",
    "At most {{max}} characters"
  ],
  delete_role_title: [
    "删除角色「{{name}}」",
    "刪除角色「{{name}}」",
    "Delete role ‘{{name}}’"
  ],
  delete_role_members: [
    "该角色下有 {{count}} 名管理员，删除后他们将被解绑、降级为仅可见首页。确认删除？",
    "此角色有 {{count}} 名管理員，刪除後將解除指派，降為僅可檢視首頁。確認刪除？",
    "Deleting this role removes it from {{count}} administrators, leaving dashboard access only. Delete the role?"
  ],
  delete_role_members_one: [
    "该角色下有 {{count}} 名管理员，删除后他们将被解绑、降级为仅可见首页。确认删除？",
    "此角色有 {{count}} 名管理員，刪除後將解除指派，降為僅可檢視首頁。確認刪除？",
    "Deleting this role removes it from {{count}} administrator, leaving dashboard access only. Delete the role?"
  ],
  delete_role_members_other: [
    "该角色下有 {{count}} 名管理员，删除后他们将被解绑、降级为仅可见首页。确认删除？",
    "此角色有 {{count}} 名管理員，刪除後將解除指派，降為僅可檢視首頁。確認刪除？",
    "Deleting this role removes it from {{count}} administrators, leaving dashboard access only. Delete the role?"
  ],
  view_tag_permissions: [
    "{{name}}：查看权限",
    "{{name}}：檢視權限",
    "{{name}}: view permissions"
  ],
  remove_tag_permissions: [
    "{{name}}：移除权限",
    "{{name}}：移除權限",
    "{{name}}: remove permissions"
  ],
  remove_tag_permissions_title: [
    "移除{{name}}权限",
    "移除{{name}}權限",
    "Remove permissions from {{name}}"
  ],
  changes_summary: [
    "开通 {{grant}} 项 · 取消 {{revoke}} 项",
    "開通 {{grant}} 項 · 取消 {{revoke}} 項",
    "Grant: {{grant}} · Revoke: {{revoke}}"
  ],
  selected_count: [
    "已选 {{count}} 项",
    "已選 {{count}} 項",
    "{{count}} items selected"
  ],
  selected_count_one: [
    "已选 {{count}} 项",
    "已選 {{count}} 項",
    "{{count}} item selected"
  ],
  selected_count_other: [
    "已选 {{count}} 项",
    "已選 {{count}} 項",
    "{{count}} items selected"
  ],
  selected_permissions_ratio: [
    "已选 {{selected}} / {{total}} 项",
    "已選 {{selected}} / {{total}} 項",
    "{{selected}} / {{total}} permissions selected"
  ],
  tag_permission_count: [
    "{{name}}，{{count}} 项权限",
    "{{name}}，{{count}} 項權限",
    "{{name}}, {{count}} permissions"
  ],
  tag_permission_count_one: [
    "{{name}}，{{count}} 项权限",
    "{{name}}，{{count}} 項權限",
    "{{name}}, {{count}} permission"
  ],
  tag_permission_count_other: [
    "{{name}}，{{count}} 项权限",
    "{{name}}，{{count}} 項權限",
    "{{name}}, {{count}} permissions"
  ],
  permission_count: [
    "{{count}} 项权限",
    "{{count}} 項權限",
    "{{count}} permissions"
  ],
  permission_count_one: [
    "{{count}} 项权限",
    "{{count}} 項權限",
    "{{count}} permission"
  ],
  permission_count_other: [
    "{{count}} 项权限",
    "{{count}} 項權限",
    "{{count}} permissions"
  ],
  people_count: ["共 {{count}} 人", "共 {{count}} 人", "{{count}} people"],
  people_count_one: ["共 {{count}} 人", "共 {{count}} 人", "{{count}} person"],
  people_count_other: [
    "共 {{count}} 人",
    "共 {{count}} 人",
    "{{count}} people"
  ],
  selected_people_limit: [
    "已选 {{count}} 人（单次最多选择 100 人）",
    "已選 {{count}} 人（每次最多選擇 100 人）",
    "{{count}} people selected (up to 100 at a time)"
  ],
  selected_people_limit_one: [
    "已选 {{count}} 人（单次最多选择 100 人）",
    "已選 {{count}} 人（每次最多選擇 100 人）",
    "{{count}} person selected (up to 100 at a time)"
  ],
  selected_people_limit_other: [
    "已选 {{count}} 人（单次最多选择 100 人）",
    "已選 {{count}} 人（每次最多選擇 100 人）",
    "{{count}} people selected (up to 100 at a time)"
  ],
  selected_permissions: [
    "所选权限：{{permissions}}",
    "所選權限：{{permissions}}",
    "Selected permissions: {{permissions}}"
  ],
  required_permissions: [
    "前置权限：{{permissions}}",
    "前置權限：{{permissions}}",
    "Required permissions: {{permissions}}"
  ],
  automatic_permissions: [
    "{{action}}：{{permissions}}",
    "{{action}}：{{permissions}}",
    "{{action}}: {{permissions}}"
  ],
  remove_permission_tag: [
    "从{{tag}}移除{{permission}}",
    "從{{tag}}移除{{permission}}",
    "Remove {{permission}} from {{tag}}"
  ],
  remove_permission_tag_title: [
    "仅从“{{permission}}”移除“{{tag}}”标签",
    "僅從「{{permission}}」移除「{{tag}}」標籤",
    "Remove only the ‘{{tag}}’ tag from ‘{{permission}}’"
  ],
  remaining_permission_tags: [
    "查看{{permission}}其余{{count}}个标签",
    "檢視{{permission}}其餘{{count}}個標籤",
    "View {{count}} other tags for {{permission}}"
  ],
  remaining_permission_tags_one: [
    "查看{{permission}}其余{{count}}个标签",
    "檢視{{permission}}其餘{{count}}個標籤",
    "View {{count}} other tag for {{permission}}"
  ],
  remaining_permission_tags_other: [
    "查看{{permission}}其余{{count}}个标签",
    "檢視{{permission}}其餘{{count}}個標籤",
    "View {{count}} other tags for {{permission}}"
  ],
  configure_permission_tags: [
    "设置{{permission}}标签",
    "設定{{permission}}標籤",
    "Configure tags for {{permission}}"
  ],
  configure_tags_title: [
    "设置标签 · {{permission}}",
    "設定標籤 · {{permission}}",
    "Configure tags · {{permission}}"
  ],
  selected_permission_count: [
    "已选 {{count}} 项权限",
    "已選 {{count}} 項權限",
    "{{count}} permissions selected"
  ],
  selected_permission_count_one: [
    "已选 {{count}} 项权限",
    "已選 {{count}} 項權限",
    "{{count}} permission selected"
  ],
  selected_permission_count_other: [
    "已选 {{count}} 项权限",
    "已選 {{count}} 項權限",
    "{{count}} permissions selected"
  ],
  add_to_tag_confirmation: [
    "将{{permissions}}添加至“{{tag}}”标签？",
    "將{{permissions}}加入「{{tag}}」標籤？",
    "Add {{permissions}} to the ‘{{tag}}’ tag?"
  ],
  remove_from_tag_confirmation: [
    "将{{permissions}}从“{{tag}}”标签移除？",
    "將{{permissions}}從「{{tag}}」標籤移除？",
    "Remove {{permissions}} from the ‘{{tag}}’ tag?"
  ],
  quoted_permission: [
    "“{{permission}}”",
    "「{{permission}}」",
    "‘{{permission}}’"
  ],
  delete_tag_confirmation: [
    "确认删除“{{tag}}”标签？",
    "確認刪除「{{tag}}」標籤？",
    "Delete the ‘{{tag}}’ tag?"
  ],
  list_separator: ["、", "、", ", "]
} as const satisfies Record<string, readonly [string, string, string]>;

export const accessLabelKeys = Object.fromEntries(
  Object.entries(fixedAccessMessages).map(([key, values]) => [values[0], key])
) as Readonly<Record<string, keyof typeof accessMessages>>;
