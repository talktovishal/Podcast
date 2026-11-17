"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildOAuthStartHref,
  normalizePostAuthRedirect,
} from "@/lib/auth-redirect";
import { marketingCopy } from "@/lib/marketing-content";
import {
  oauthProviders as oauthProviderDefinitions,
  type OAuthProviderStatus,
} from "@/lib/oauth-providers";

type Mode = "login" | "signup";
type AuthField = "name" | "email" | "password";
type AuthFieldErrors = Partial<Record<AuthField, string>>;

const oauthErrorMessages: Record<string, string> = {
  google_not_configured:
    "Google sign-in is not configured in this environment.",
  google_state: "Google sign-in expired. Please try again.",
  google_token: "Google sign-in could not be completed. Please try again.",
  google_profile: "Google profile access failed. Please try again.",
  google_sub: "Google sign-in did not return a usable account identifier.",
  facebook_not_configured:
    "Facebook sign-in is not configured in this environment.",
  facebook_state: "Facebook sign-in expired. Please try again.",
  facebook_access_denied: "Facebook sign-in was canceled. Please try again.",
  facebook_token: "Facebook sign-in could not be completed. Please try again.",
  facebook_profile: "Facebook profile access failed. Please try again.",
  facebook_id: "Facebook sign-in did not return a usable account identifier.",
  apple_not_configured: "Apple sign-in is not configured in this environment.",
  apple_state: "Apple sign-in expired. Please try again.",
  apple_token: "Apple sign-in could not be completed. Please try again.",
  apple_id_token: "Apple sign-in did not return an ID token.",
  apple_id_token_invalid: "Apple sign-in returned an invalid ID token.",
  apple_sub: "Apple sign-in did not return a usable account identifier.",
};
const noSocialProvidersMessage =
  "No social sign-in providers are configured here yet. Use email below.";
const fieldErrorIds: Record<AuthField, string> = {
  name: "auth-name-error",
  email: "auth-email-error",
  password: "auth-password-error",
};

function buildEmptyProviderStatus(): OAuthProviderStatus {
  return oauthProviderDefinitions.reduce<OAuthProviderStatus>(
    (acc, provider) => {
      acc[provider.id] = {
        configured: false,
      };
      return acc;
    },
    {} as OAuthProviderStatus,
  );
}

function resolveAuthErrorState(
  message: string,
  mode: Mode,
): {
  fieldErrors: AuthFieldErrors;
  formError: string | null;
  invalidFields: AuthField[];
} {
  const trimmed = message.trim();
  const fieldMatch = trimmed.match(/^(name|email|password):\s*(.+)$/i);

  if (fieldMatch) {
    const field = fieldMatch[1].toLowerCase() as AuthField;
    return {
      fieldErrors: {
        [field]: fieldMatch[2],
      },
      formError: null,
      invalidFields: [field],
    };
  }

  if (trimmed === "Invalid email or password.") {
    return {
      fieldErrors: {
        password: trimmed,
      },
      formError: null,
      invalidFields: ["email", "password"],
    };
  }

  if (
    mode === "signup" &&
    trimmed ===
      "Unable to create account. Please check your details or try logging in."
  ) {
    return {
      fieldErrors: {
        email: trimmed,
      },
      formError: null,
      invalidFields: ["email"],
    };
  }

  return {
    fieldErrors: {},
    formError: trimmed,
    invalidFields: [],
  };
}

export function AuthLandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<AuthField[]>([]);
  const [oauthProviders, setOauthProviders] =
    useState<OAuthProviderStatus | null>(null);

  const oauthError = useMemo(
    () => searchParams.get("oauth_error"),
    [searchParams],
  );
  const nextPath = useMemo(
    () => normalizePostAuthRedirect(searchParams.get("next")),
    [searchParams],
  );
  const oauthErrorMessage = oauthError
    ? (oauthErrorMessages[oauthError] ??
      "Social sign-in failed. Please try again.")
    : null;
  const configuredProviders = useMemo(() => {
    if (!oauthProviders) {
      return [];
    }
    return oauthProviderDefinitions.filter(
      (provider) => oauthProviders[provider.id]?.configured,
    );
  }, [oauthProviders]);
  const primaryAuthActionClass =
    "w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60";
  const inputBaseClass =
    "w-full rounded-xl border border-[rgba(31,122,90,0.16)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(31,122,90,0.12)]";
  const emailSubmitLabel =
    mode === "login" ? "Log in with email" : "Create account with email";

  function clearEmailAuthErrors() {
    setFieldErrors({});
    setFormError(null);
    setInvalidFields([]);
  }

  function handleModeChange(nextMode: Mode) {
    if (nextMode === mode) {
      return;
    }
    setMode(nextMode);
    clearEmailAuthErrors();
  }

  function fieldHasError(field: AuthField): boolean {
    return invalidFields.includes(field);
  }

  function inputClassName(field: AuthField): string {
    return `${inputBaseClass} ${
      fieldHasError(field)
        ? "border-[rgba(169,50,50,0.38)] bg-[rgba(255,244,244,0.98)] focus:border-[var(--danger)] focus:ring-[rgba(169,50,50,0.16)]"
        : ""
    }`;
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/providers");
        if (!response.ok) {
          if (active) {
            setOauthProviders(buildEmptyProviderStatus());
          }
          return;
        }
        const payload = (await response.json()) as {
          providers?: Partial<OAuthProviderStatus>;
        };
        if (!active) {
          return;
        }
        setOauthProviders(
          oauthProviderDefinitions.reduce<OAuthProviderStatus>(
            (acc, provider) => {
              acc[provider.id] = {
                configured: Boolean(
                  payload.providers?.[provider.id]?.configured,
                ),
              };
              return acc;
            },
            {} as OAuthProviderStatus,
          ),
        );
      } catch {
        if (active) {
          setOauthProviders(buildEmptyProviderStatus());
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setIsLoading(true);
    clearEmailAuthErrors();

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode, email, password, name, next: nextPath }),
      });

      const json = await response.json();
      if (!response.ok) {
        const nextErrorState = resolveAuthErrorState(
          json.error_message || "Authentication failed",
          mode,
        );
        setFieldErrors(nextErrorState.fieldErrors);
        setFormError(nextErrorState.formError);
        setInvalidFields(nextErrorState.invalidFields);
        return;
      }

      router.push(
        json.redirectTo || (json.role === "ADMIN" ? "/admin" : "/app"),
      );
      router.refresh();
    } catch {
      setFormError("Unexpected error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleEmailAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    void submit();
  }

  function handleEmailAuthEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (isLoading) {
      return;
    }
    void submit();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <section className="card border-[rgba(31,122,90,0.14)] bg-[rgba(255,255,255,0.96)] p-5 sm:p-6 lg:sticky lg:top-24">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-[2.15rem]">
            Log in to your private podcast feed
          </h1>
          <p className="max-w-md text-sm leading-6 text-[var(--muted)]">
            Continue with social sign-in or email to save articles, upload PDFs,
            and hear the finished episodes in your regular podcast app.
          </p>
        </div>

        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Continue with one tap
        </p>
        <p className="max-w-xs text-sm text-[var(--muted)]">
          First time? We&apos;ll create your account automatically.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="grid grid-cols-1 gap-2">
              {configuredProviders.map((provider) => (
                <a
                  className={primaryAuthActionClass}
                  href={buildOAuthStartHref(provider.startPath, nextPath)}
                  key={provider.id}
                >
                  Continue with {provider.label}
                </a>
              ))}
            </div>
            {!oauthProviders ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Checking sign-in options...
              </p>
            ) : null}
            {oauthProviders && configuredProviders.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {noSocialProvidersMessage}
              </p>
            ) : null}
          </div>

          {oauthErrorMessage ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {oauthErrorMessage}
            </p>
          ) : null}

          <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            <span className="h-px flex-1 bg-[rgba(31,122,90,0.14)]" />
            <span>OR</span>
            <span className="h-px flex-1 bg-[rgba(31,122,90,0.14)]" />
          </div>

          <div className="rounded-3xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.92)] p-4 sm:p-5">
            <div className="flex justify-end">
              <div className="inline-flex rounded-full bg-[rgba(223,243,236,0.92)] p-1 text-sm">
                <button
                  className={`rounded-full px-3 py-1.5 font-medium transition ${
                    mode === "login"
                      ? "bg-white text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                  onClick={() => handleModeChange("login")}
                  type="button"
                >
                  Log in
                </button>
                <button
                  className={`rounded-full px-3 py-1.5 font-medium transition ${
                    mode === "signup"
                      ? "bg-white text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                  onClick={() => handleModeChange("signup")}
                  type="button"
                >
                  Create account
                </button>
              </div>
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleEmailAuthSubmit}>
              {mode === "signup" ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Name</span>
                  <input
                    autoComplete="name"
                    aria-describedby={
                      fieldErrors.name ? fieldErrorIds.name : undefined
                    }
                    aria-invalid={fieldHasError("name")}
                    className={inputClassName("name")}
                    value={name}
                    onChange={(event) => {
                      clearEmailAuthErrors();
                      setName(event.target.value);
                    }}
                    onKeyDown={handleEmailAuthEnter}
                  />
                  {fieldErrors.name ? (
                    <p
                      className="mt-1 text-sm text-[var(--danger)]"
                      id={fieldErrorIds.name}
                      role="alert"
                    >
                      {fieldErrors.name}
                    </p>
                  ) : null}
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Email</span>
                <input
                  autoComplete="email"
                  aria-describedby={
                    fieldErrors.email ? fieldErrorIds.email : undefined
                  }
                  aria-invalid={fieldHasError("email")}
                  className={inputClassName("email")}
                  type="email"
                  value={email}
                  onChange={(event) => {
                    clearEmailAuthErrors();
                    setEmail(event.target.value);
                  }}
                  onKeyDown={handleEmailAuthEnter}
                />
                {fieldErrors.email ? (
                  <p
                    className="mt-1 text-sm text-[var(--danger)]"
                    id={fieldErrorIds.email}
                    role="alert"
                  >
                    {fieldErrors.email}
                  </p>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Password</span>
                <input
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  aria-describedby={
                    fieldErrors.password ? fieldErrorIds.password : undefined
                  }
                  aria-invalid={fieldHasError("password")}
                  className={inputClassName("password")}
                  type="password"
                  value={password}
                  onChange={(event) => {
                    clearEmailAuthErrors();
                    setPassword(event.target.value);
                  }}
                  onKeyDown={handleEmailAuthEnter}
                />
                {fieldErrors.password ? (
                  <p
                    className="mt-1 text-sm text-[var(--danger)]"
                    id={fieldErrorIds.password}
                    role="alert"
                  >
                    {fieldErrors.password}
                  </p>
                ) : null}
              </label>

              {formError ? (
                <p
                  className="rounded-xl border border-[rgba(169,50,50,0.16)] bg-[rgba(255,244,244,0.94)] px-3 py-2 text-sm text-[var(--danger)]"
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}

              <button
                className={primaryAuthActionClass}
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? "Please wait..." : emailSubmitLabel}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="max-w-[34rem] space-y-4 lg:pt-2">
        <h2 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {marketingCopy.heroHeadline}
        </h2>

        <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
          {marketingCopy.heroSubheading}
        </p>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {marketingCopy.heroHighlights.map((item) => (
            <article
              key={item.title}
              className="rounded-[22px] border border-[rgba(31,122,90,0.1)] bg-[rgba(255,255,255,0.86)] p-4 shadow-[0_12px_30px_rgba(20,38,30,0.05)]"
            >
              <p className="text-sm font-semibold text-[var(--ink)]">
                {item.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {item.description}
              </p>
            </article>
          ))}
        </div>

        <section className="border-t border-[rgba(31,122,90,0.14)] pt-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Security
            </p>
            <h3 className="text-lg font-semibold text-[var(--ink)]">
              Private by design
            </h3>
            <p className="text-sm leading-6 text-[var(--muted)]">
              {marketingCopy.securityIntro}
            </p>
          </div>

          <ul className="mt-3 space-y-2.5">
            {marketingCopy.securityBullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-3 text-sm leading-6 text-[var(--muted)]"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                <p>{bullet}</p>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </div>
  );
}
