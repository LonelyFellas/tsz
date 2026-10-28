export interface OpenCodeConnection {
  configured: boolean;
  connected: boolean;
  login_available: boolean;
}

export interface OpenCodeLogin {
  attempt_id: string;
  authorization_url: string;
  expires_at: string;
}

export interface OpenCodeLoginStatus {
  status: "pending" | "complete" | "failed" | "expired";
  expires_at: string;
}
