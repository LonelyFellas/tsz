/** 当前账号可用于注销验证的在档联系方式渠道。 */
export type AccountDeletionChannel = "phone" | "email";

/** POST /auth/account/deletion-code wire 请求体。 */
export interface AccountDeletionCodeRequest {
  channel: AccountDeletionChannel;
}

/** DELETE /auth/account wire 请求体。 */
export interface ConfirmAccountDeletionRequest {
  channel: AccountDeletionChannel;
  code: string;
}
