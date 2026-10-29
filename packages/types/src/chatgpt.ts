export interface ChatGPTAccount {
  client_id: string;
  email: string;
  signed_in: boolean;
  plan_enabled: boolean;
}

export interface ChatGPTAccounts {
  configured: boolean;
  active: string | null;
  accounts: ChatGPTAccount[];
  pending_login: ChatGPTLogin | null;
}

export interface ChatGPTLogin {
  attempt_id: string;
  authorization_url: string;
  expires_at: string;
}

export interface ChatGPTLoginStatus {
  status: "pending" | "complete" | "failed" | "expired" | "cancelled";
  expires_at: string;
  error: "denied" | "identity_invalid" | "unavailable" | null;
}

export interface ChatGPTLogout {
  remote_revoked: boolean;
}
