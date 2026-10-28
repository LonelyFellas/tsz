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

export interface OpenCodeModel {
  provider_id: string;
  model_id: string;
  name: string;
  enabled: boolean;
}
export interface OpenCodeModelList {
  models: OpenCodeModel[];
}
export interface OpenCodeProvider {
  id: string;
  name: string;
  connected: boolean;
}
export interface OpenCodeProviderList {
  providers: OpenCodeProvider[];
}
export interface OpenCodeModelSelection {
  source: "direct" | "opencode";
  provider_id: string;
  model_id: string;
}
