import { defineWebMessages } from "../catalog";
export const webInvitations = /* @__PURE__ */ defineWebMessages(
  "webInvitations",
  {
    invitation_link_copied: [
      "邀请链接已复制",
      "邀請連結已複製",
      "Invitation link copied"
    ],
    could_not_copy_copy_your_invitation_code_and_ask_your_friend_to_enter_it: [
      "复制失败，请复制邀请码并让好友在注册时填写。",
      "複製失敗，請複製邀請碼並讓好友在註冊時填寫。",
      "Could not copy. Copy your invitation code and ask your friend to enter it when registering."
    ],
    back_to_account: ["返回个人中心", "返回個人中心", "Back to account"],
    account: ["个人中心", "個人中心", "Account"],
    invite_friends: ["邀请好友", "邀請好友", "Invite friends"],
    refresh: ["刷新", "重新整理", "Refresh"],
    my_invitations: ["我的邀请", "我的邀請", "My invitations"],
    could_not_load_invitations_or_the_feature_is_unavailable_reload_and_try: [
      "邀请信息加载失败或功能暂不可用，请刷新重试。",
      "邀請資訊載入失敗或功能暫不可用，請重新整理重試。",
      "Could not load invitations, or the feature is unavailable. Reload and try again."
    ],
    loading_invitations: [
      "正在读取邀请信息…",
      "正在讀取邀請資訊…",
      "Loading invitations…"
    ],
    my_invitation_code: ["我的邀请码", "我的邀請碼", "My invitation code"],
    copy_invitation_link: [
      "复制邀请链接",
      "複製邀請連結",
      "Copy invitation link"
    ],
    generating: ["正在生成…", "正在生成…", "Generating…"],
    generate_my_invitation_code: [
      "生成我的邀请码",
      "生成我的邀請碼",
      "Generate my invitation code"
    ],
    the_result_is_unconfirmed_try_again_repeated_requests_return_the_same_in: [
      "邀请码生成结果未确认，请重试；重复操作会返回同一个邀请码。",
      "邀請碼生成結果未確認，請重試；重複操作會返回同一個邀請碼。",
      "The result is unconfirmed. Try again; repeated requests return the same invitation code."
    ],
    invitation_rewards_are_disabled_friends_can_still_register_with_your_cod: [
      "邀请奖励暂未开启。好友仍可使用邀请码注册，邀请关系会被记录，本次不发奖，之后不会自动补发。",
      "邀請獎勵暫未開啟。好友仍可使用邀請碼註冊，邀請關係會被記錄，本次不發獎，之後不會自動補發。",
      "Invitation rewards are disabled. Friends can still register with your code and the invitation will be recorded, but no reward is issued or paid retrospectively."
    ],
    when_a_friend_registers_with_your_code_binds_a_phone_number_and_first_me: [
      "好友通过你的邀请码注册，绑定手机号并首次学习达标后，你可获得",
      "好友透過你的邀請碼註冊，繫結手機號並首次學習達標後，你可獲得",
      "When a friend registers with your code, binds a phone number and first meets the learning threshold, you receive"
    ],
    each_invited_friend_earns_you_one_reward_they_receive_no_extra_invitatio: [
      "。每位受邀者仅奖励一次；受邀者没有额外邀请奖励，仍可正常获得每日登录与学习奖励。",
      "。每位受邀者僅獎勵一次；受邀者沒有額外邀請獎勵，仍可正常獲得每日登入與學習獎勵。",
      ". Each invited friend earns you one reward. They receive no extra invitation reward, but can receive normal daily login and learning rewards."
    ],
    your_account_cannot_currently_receive_rewards_if_it_cannot_receive_rewar: [
      "你的账户当前不可接收奖励。注册或达标结算时账户不可收奖，会记录为未发放，之后不会自动补发。",
      "你的賬戶當前不可接收獎勵。註冊或達標結算時賬戶不可收獎，會記錄為未發放，之後不會自動補發。",
      "Your account cannot currently receive rewards. If it cannot receive rewards during registration or settlement, the reward is recorded as unpaid and will not be paid retrospectively."
    ],
    to_qualify_complete_daily_tasks_and_reach_the_daily_learning_reward_thre: [
      "学习达标指完成每日任务，累计达到当日学习奖励门槛（当前为 10 道不同题目）。好友可在注册前修改或清空邀请码；注册成功后不能补绑或改绑。已有账号登录不会产生邀请奖励。",
      "學習達標指完成每日任務，累計達到當日學習獎勵門檻（當前為 10 道不同題目）。好友可在註冊前修改或清空邀請碼；註冊成功後不能補綁或改綁。已有賬號登入不會產生邀請獎勵。",
      "To qualify, complete daily tasks and reach the daily learning reward threshold (currently 10 different questions). Friends can change or clear the code before registering, but cannot add or change it afterwards. Signing in to an existing account does not generate an invitation reward."
    ],
    invitation_history: ["邀请记录", "邀請記錄", "Invitation history"],
    could_not_load_invitation_history_reload_and_try_again: [
      "邀请记录加载失败，请刷新重试。",
      "邀請記錄載入失敗，請重新整理重試。",
      "Could not load invitation history. Reload and try again."
    ],
    loading_invitation_history: [
      "正在读取邀请记录…",
      "正在讀取邀請記錄…",
      "Loading invitation history…"
    ],
    no_invitations_yet: ["暂无邀请记录", "暫無邀請記錄", "No invitations yet"],
    deleted_user: ["已注销用户", "已登出使用者", "Deleted user"],
    issued_v0: ["已发放 {{v0}}", "已發放 {{v0}}", "Issued {{v0}}"],
    pending_your_friend_must_bind_a_phone_number_and_first_meet_the_learning: [
      "待达标：好友需绑定手机号并首次学习达标",
      "待達標：好友需繫結手機號並首次學習達標",
      "Pending: your friend must bind a phone number and first meet the learning threshold"
    ],
    unpaid_rewards_are_disabled: [
      "未发放：奖励未开启",
      "未發放：獎勵未開啟",
      "Unpaid: rewards are disabled"
    ],
    unpaid_the_inviter_cannot_receive_rewards: [
      "未发放：邀请人账户不可收奖",
      "未發放：邀請人賬戶不可收獎",
      "Unpaid: the inviter cannot receive rewards"
    ],
    view_balance_and_transactions: [
      "查看天生币余额与流水 →",
      "檢視天生币餘額與流水 →",
      "View 天生币 balance and transactions →"
    ],
    when_a_friend_registers_with_your_code_binds_a_phone_number_and_first_me_2:
      [
        "好友通过你的邀请码注册，绑定手机号并首次学习达标后，你可获得 {{v0}}。每位受邀者仅奖励一次；受邀者没有额外邀请奖励，仍可正常获得每日登录与学习奖励。",
        "好友透過你的邀請碼註冊，繫結手機號並首次學習達標後，你可獲得 {{v0}}。每位受邀者僅獎勵一次；受邀者沒有額外邀請獎勵，仍可正常獲得每日登入與學習獎勵。",
        "When a friend registers with your code, binds a phone number and first meets the learning threshold, you receive {{v0}}. Each friend earns you one reward. They receive no extra invitation reward but remain eligible for daily login and learning rewards."
      ]
  } as const,
  {},
  {}
);
