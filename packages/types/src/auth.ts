export type ContactChannel = "phone" | "email";

export interface ContactVerificationCodeRequest {
  operation: "bind" | "unbind";
  contact: string;
  verification_channel: ContactChannel;
}

export interface BindContactRequest {
  contact: string;
  code: string;
  verification_channel: ContactChannel;
  verification_code: string;
}

export interface UnbindContactRequest {
  channel: ContactChannel;
  verification_channel: ContactChannel;
  verification_code: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export type RegisterPayload = {
  password: string;
  code: string;
} & ({ phone: string; email?: never } | { email: string; phone?: never });

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
