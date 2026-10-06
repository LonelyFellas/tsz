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

export interface AccountDeletionRequest {
  id: string;
  status: "pending" | "cancelled" | "completed";
  requested_at: string;
  effective_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  confirmed_balance: string;
  waive_balance: boolean;
  consent_version: string;
  consent_text: string;
}
export interface AccountDeletionState {
  request: AccountDeletionRequest | null;
  coin_balance: string;
  consent_version: string;
  consent_text: string;
  server_time: string;
}
export interface CreateAccountDeletionRequest {
  channel: AccountDeletionChannel;
  code: string;
  expected_coin_balance: string;
  waive_balance: boolean;
  confirm_deletion: boolean;
  consent_version: string;
  idempotency_key: string;
}
