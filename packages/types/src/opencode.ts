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

export interface OpenCodeModelProbe extends OpenCodeModelSelection {
  name: string;
  enabled: boolean;
  status: "unverified" | "checking" | "available" | "unavailable";
  checked_at?: string | null;
  duration_ms?: number | null;
  http_status?: number | null;
  error?:
    | "disabled"
    | "not_configured"
    | "timeout"
    | "request_failed"
    | "invalid_response"
    | "interrupted"
    | "runtime_failed"
    | null;
  cost?: string | null;
}
export interface OpenCodeModelProbeReport {
  batch_id?: string | null;
  state: "idle" | "running" | "completed" | "interrupted";
  started_at?: string | null;
  finished_at?: string | null;
  models: OpenCodeModelProbe[];
}
