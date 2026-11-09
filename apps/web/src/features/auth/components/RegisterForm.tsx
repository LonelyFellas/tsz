"use client";
import { webCommon, type WebNotice, localText } from "@/i18n/catalog";
import {
  passwordErrorMessage,
  passwordLengthError
} from "@/features/auth/shared";

import { useWebText } from "@/i18n/client";
import { webAuthAccess as webAuth } from "@/i18n/messages/auth/access";

import { HttpError } from "@tsz/api-client";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import {
  Button,
  FormField,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from "@tsz/ui/components";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthShell } from "./AuthShell";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import {
  AUTH_PASSWORD_HINT,
  completeAuthentication,
  persistSession,
  translateAuthError
} from "../shared";

const CODE_COUNTDOWN = 60;
const REGISTER_CODE_RE = /^\d{6}$/;

const REGISTER_ERRORS: Record<string, WebNotice> = {
  "invalid code": localText(
    webAuth,
    "webAuthAccess:incorrect_or_expired_code_request_a_new_one"
  ),
  "invalid email": localText(
    webAuth,
    "webAuthAccess:invalid_email_address_check_and_try_again"
  ),
  "invalid phone": localText(
    webAuth,
    "webAuthAccess:invalid_phone_number_check_and_try_again"
  ),
  "password is too short": localText(
    webCommon,
    "webCommon:shared_use_15_128_characters_case_sensitive_symbols_and_spaces_allowed"
  ),
  "password is too long": localText(
    webCommon,
    "webCommon:shared_use_15_128_characters_case_sensitive_symbols_and_spaces_allowed"
  ),
  "password must contain letters and digits only": localText(
    webCommon,
    "webCommon:shared_use_15_128_characters_case_sensitive_symbols_and_spaces_allowed"
  ),
  "otp unavailable": localText(
    webAuth,
    "webAuthAccess:verification_codes_are_unavailable_try_again_later"
  ),
  "too many requests": localText(
    webCommon,
    "webCommon:shared_too_many_code_requests_try_again_later"
  ),
  "service unavailable": localText(
    webAuth,
    "webAuthAccess:verification_codes_are_unavailable_try_again_later"
  )
};

export function RegisterForm({
  initialMethod = "phone",
  initialInviteCode = "",
  redirect
}: {
  initialMethod?: "phone" | "email";
  initialInviteCode?: string;
  redirect?: string;
}) {
  const uiText = useWebText(webAuth);
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [method, setMethod] = useState(initialMethod);
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<WebNotice>("");
  const pendingRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pendingRequest.current?.abort(), []);

  const router = useRouter();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const identifier =
    method === "email" ? contact.trim().toLowerCase() : contact.trim();
  const contactValid =
    method === "email" ? isEmail(identifier) : isPhone(identifier);
  const codeValid = REGISTER_CODE_RE.test(code);
  const passwordValid = isRegisterPassword(password);
  const contactError =
    contact && !contactValid
      ? method === "email"
        ? localText(webAuth, "webAuthAccess:invalid_email_address")
        : localText(webAuth, "webAuthAccess:invalid_phone_number")
      : undefined;
  const codeError =
    code && !codeValid
      ? localText(webAuth, "webAuthAccess:enter_the_6_digit_verification_code")
      : undefined;
  const passwordError = password
    ? (passwordLengthError(password) ?? undefined)
    : undefined;
  const canSendCode =
    contactValid && countdown === 0 && !sending && !loading && !registered;
  const canSubmit =
    (registered || (contactValid && codeValid && passwordValid)) &&
    !loading &&
    !sending;

  function translateError(value: unknown, fallback: WebNotice): WebNotice {
    if (value instanceof HttpError) {
      if (value.code === "invalid_invitation_code")
        return localText(
          webAuth,
          "webAuthAccess:invalid_invitation_code_change_it_or_clear_it_and_try_again"
        );
      const passwordMessage = passwordErrorMessage(value.code);
      if (passwordMessage) return passwordMessage;
    }
    const message = value instanceof Error ? value.message : "";
    if (
      (value instanceof HttpError &&
        ["user_already_exists", "phone_already_registered"].includes(
          value.code ?? ""
        )) ||
      (!(value instanceof HttpError && value.code) &&
        message.toLowerCase().trim() === "user already exists")
    )
      return localText(
        webAuth,
        "webAuthAccess:this_v0_is_already_registered_sign_in_instead",
        {
          v0: localText(
            webAuth,
            method === "email"
              ? "webAuthAccess:email"
              : "webAuthAccess:phone_number"
          )
        }
      );
    return translateAuthError(
      value instanceof Error ? value : "",
      {
        ...REGISTER_ERRORS
      },
      fallback
    );
  }

  function handleContactChange(nextContact: string) {
    if (nextContact === contact) return;
    const nextIdentifier =
      method === "email"
        ? nextContact.trim().toLowerCase()
        : nextContact.trim();
    setContact(nextContact);
    if (nextIdentifier !== identifier) {
      setCode("");
      setCountdown(0);
    }
    setError("");
  }

  function switchMethod(nextMethod: "phone" | "email") {
    if (method === nextMethod) return;
    setMethod(nextMethod);
    setContact("");
    setCode("");
    setCountdown(0);
    setError("");
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.sendCode(identifier, "register");
      setCountdown(CODE_COUNTDOWN);
    } catch (cause: unknown) {
      setError(
        translateError(
          cause,
          localText(
            webAuth,
            "webAuthAccess:could_not_send_the_code_try_again_later"
          )
        )
      );
    } finally {
      setSending(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    const { signal } = controller;
    setError("");
    setLoading(true);
    let accountCreated = registered;
    try {
      if (!accountCreated) {
        const auth = await api.auth.register(
          {
            ...(method === "email"
              ? { email: identifier }
              : { phone: identifier }),
            ...(inviteCode.trim() ? { invite_code: inviteCode.trim() } : {}),
            password: password,
            code
          },
          { signal }
        );
        if (signal.aborted) return;
        accountCreated = true;
        setRegistered(true);
        persistSession(auth);
      }
      await completeAuthentication(signal);
    } catch (cause: unknown) {
      if (signal.aborted) return;
      setError(
        accountCreated
          ? localText(
              webAuth,
              "webAuthAccess:registered_but_account_details_could_not_be_loaded_try_again"
            )
          : translateError(
              cause,
              localText(
                webAuth,
                "webAuthAccess:could_not_register_try_again_later"
              )
            )
      );
    } finally {
      if (!signal.aborted) setLoading(false);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  return (
    <AuthShell>
      <button
        type="button"
        disabled={sending || loading}
        onClick={() => {
          if (!sending && !loading) router.back();
        }}
        className="mb-6 inline-flex items-center gap-2.5 rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.5} />
        {uiText("webAuthAccess:back")}
      </button>
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-foreground">
        {uiText("webAuthAccess:create_account")}
      </h1>

      <Tabs
        value={method}
        onValueChange={(value) => switchMethod(value as typeof method)}
        activationMode="manual"
      >
        <TabsList
          className="mb-7"
          aria-label={uiText("webAuthAccess:registration_method")}
        >
          {(["phone", "email"] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              disabled={sending || loading || registered}
            >
              {value === "phone"
                ? uiText("webAuthAccess:phone")
                : uiText("webAuthAccess:email")}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* 保留非激活面板，保证两个标签的 aria-controls 都有目标。 */}
        <TabsContent value={method === "phone" ? "email" : "phone"} />
        <TabsContent value={method}>
          <form noValidate className="space-y-5" onSubmit={handleRegister}>
            <FormField
              htmlFor="register-contact"
              label={
                method === "email"
                  ? uiText("webAuthAccess:email")
                  : uiText("webAuthAccess:phone_number_2")
              }
              error={uiText(contactError)}
            >
              <Input
                id="register-contact"
                type={method === "email" ? "email" : "tel"}
                inputMode={method === "email" ? "email" : "tel"}
                autoComplete={method === "email" ? "email" : "tel"}
                placeholder={
                  method === "email"
                    ? uiText("webAuthAccess:enter_your_email")
                    : uiText("webAuthAccess:enter_a_phone_number")
                }
                value={contact}
                disabled={sending || loading || registered}
                onChange={(event) => handleContactChange(event.target.value)}
                aria-invalid={Boolean(contactError)}
                aria-describedby={
                  contactError ? "register-contact-message" : undefined
                }
              />
            </FormField>

            <FormField
              htmlFor="register-code"
              label={uiText("webAuthAccess:verification_code")}
              error={uiText(codeError)}
            >
              <div className="flex gap-3">
                <Input
                  id="register-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={uiText(
                    "webAuthAccess:enter_the_verification_code"
                  )}
                  value={code}
                  disabled={loading || registered}
                  onChange={(event) => setCode(event.target.value)}
                  className="min-w-0 flex-1"
                  aria-invalid={Boolean(codeError)}
                  aria-describedby={
                    codeError ? "register-code-message" : undefined
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSendCode}
                  onClick={handleSendCode}
                  className="shrink-0 px-4 font-medium"
                >
                  {sending
                    ? uiText("webAuthAccess:sending")
                    : countdown > 0
                      ? uiText("webAuthAccess:resend_in_v0_s", {
                          v0: countdown
                        })
                      : uiText("webAuthAccess:get_code")}
                </Button>
              </div>
            </FormField>

            <FormField
              htmlFor="register-password"
              label={uiText("webAuthAccess:password_2")}
              hint={uiText(AUTH_PASSWORD_HINT)}
              error={uiText(passwordError)}
            >
              <div className="relative">
                <Input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={uiText(
                    "webAuthAccess:enter_your_sign_in_password"
                  )}
                  value={password}
                  disabled={loading || registered}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-14"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby="register-password-message"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={loading || registered}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  aria-label={
                    showPassword
                      ? uiText("webAuthAccess:hide_password")
                      : uiText("webAuthAccess:show_password")
                  }
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </Button>
              </div>
            </FormField>

            <FormField
              htmlFor="register-invite"
              label={uiText("webAuthAccess:invitation_code_optional")}
            >
              <Input
                id="register-invite"
                value={inviteCode}
                placeholder={uiText("webAuthAccess:enter_an_invitation_code")}
                autoComplete="off"
                disabled={loading || registered}
                onChange={(event) => setInviteCode(event.target.value)}
              />
            </FormField>

            {error && (
              <p role="alert" className="mx-4 text-sm leading-5 text-danger">
                {uiText(error)}
              </p>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {loading
                ? registered
                  ? uiText("webAuthAccess:loading")
                  : uiText("webAuthAccess:creating_account")
                : registered
                  ? uiText("webAuthAccess:retry_loading")
                  : uiText("webAuthAccess:create_account_2")}
            </Button>

            <p className="pt-2 text-center text-sm text-foreground-muted">
              {uiText("webAuthAccess:already_have_an_account")}{" "}
              <button
                type="button"
                disabled={sending || loading}
                onClick={() => {
                  if (sending || loading) return;
                  const params = new URLSearchParams();
                  if (redirect) params.set("redirect", redirect);
                  if (inviteCode.trim())
                    params.set("invite", inviteCode.trim());
                  router.push(params.size ? `/login?${params}` : "/login");
                }}
                className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                aria-label={uiText(
                  "webAuthAccess:already_have_an_account_sign_in"
                )}
              >
                {uiText("webAuthAccess:sign_in")}
              </button>
            </p>
          </form>
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
}
