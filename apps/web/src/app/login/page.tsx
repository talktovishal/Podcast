"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketingHeader } from "@/components/marketing-header";
import { buildOAuthStartHref, normalizePostAuthRedirect } from "@/lib/auth-redirect";
import { marketingCopy } from "@/lib/marketing-content";
import {
  oauthProviders as oauthProviderDefinitions,
  type OAuthProviderStatus,
} from "@/lib/oauth-providers";

type Mode = "login" | "signup";

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const inputClass =
    "w-full rounded-xl border border-[rgba(31,122,90,0.16)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(31,122,90,0.12)]";
  const emailSubmitLabel =
    mode === "login" ? "Log in with email" : "Create account with email";

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
    setError(null);

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
        setError(json.error_message || "Authentication failed");
        return;
      }

      router.push(json.redirectTo || (json.role === "ADMIN" ? "/admin" : "/app"));
      router.refresh();
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader />

        <div className="grid gap-8 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] lg:items-start lg:gap-12">
          <section className="card border-[rgba(31,122,90,0.14)] bg-[rgba(255,255,255,0.96)] p-5 sm:p-6 lg:sticky lg:top-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Continue with one tap
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[2rem]">
              Continue to your feed
            </h1>
            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
              First time with Google, Facebook, or Apple? We&apos;ll create your
              account automatically.
            </p>

            <div className="mt-5 space-y-4">
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

              {error ? (
                <p className="text-sm text-[var(--danger)]">{error}</p>
              ) : null}
              {oauthErrorMessage ? (
                <p className="text-sm text-[var(--danger)]">
                  {oauthErrorMessage}
                </p>
              ) : null}

              <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                <span className="h-px flex-1 bg-[rgba(31,122,90,0.14)]" />
                <span>Or use email</span>
                <span className="h-px flex-1 bg-[rgba(31,122,90,0.14)]" />
              </div>

              <div className="rounded-3xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.92)] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      Use email instead
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {mode === "login"
                        ? "Need a new account?"
                        : "Already have an email account?"}
                    </p>
                  </div>
                  <div className="inline-flex rounded-full bg-[rgba(223,243,236,0.92)] p-1 text-sm">
                    <button
                      className={`rounded-full px-3 py-1.5 font-medium transition ${
                        mode === "login"
                          ? "bg-white text-[var(--ink)] shadow-sm"
                          : "text-[var(--muted)]"
                      }`}
                      onClick={() => setMode("login")}
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
                      onClick={() => setMode("signup")}
                      type="button"
                    >
                      Create account
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {mode === "signup" ? (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Name
                      </span>
                      <input
                        autoComplete="name"
                        className={inputClass}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                  ) : null}

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Email
                    </span>
                    <input
                      autoComplete="email"
                      className={inputClass}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Password
                    </span>
                    <input
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      className={inputClass}
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>

                  <button className={primaryAuthActionClass} disabled={isLoading} onClick={submit}>
                    {isLoading ? "Please wait..." : emailSubmitLabel}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 lg:pt-4">
            <p className="inline-block rounded-full border border-[rgba(31,122,90,0.18)] bg-[var(--accent-soft)] px-4 py-1 text-xs font-semibold text-[var(--accent)] sm:text-sm">
              {marketingCopy.heroBadge}
            </p>

            <h2 className="max-w-2xl text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl xl:text-6xl">
              {marketingCopy.heroHeadline}
            </h2>

            <p className="max-w-xl text-base text-[var(--muted)] sm:text-lg">
              {marketingCopy.heroSubheading}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {marketingCopy.heroChips.map((chip) => (
                <article
                  key={chip}
                  className="card border-[rgba(31,122,90,0.12)] bg-[rgba(255,255,255,0.88)] p-4"
                >
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {chip}
                  </p>
                </article>
              ))}
            </div>

            <p className="max-w-2xl rounded-3xl border border-[rgba(31,122,90,0.1)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm text-[var(--muted)]">
              {marketingCopy.heroSecondary}
            </p>
          </section>
        </div>

        <section className="mt-8 rounded-[28px] border border-[rgba(31,122,90,0.12)] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_18px_45px_rgba(20,38,30,0.06)] backdrop-blur sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-start">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Security
              </p>
              <h3 className="text-lg font-semibold text-[var(--ink)]">
                Private by default
              </h3>
              <p className="text-sm text-[var(--muted)]">
                Sessions, extension pairing, and episode delivery all keep
                podcast access scoped and private.
              </p>
            </div>

            <ul className="grid gap-3 md:grid-cols-3">
              {marketingCopy.securityBullets.map((bullet) => (
                <li
                  key={bullet}
                  className="rounded-2xl border border-[rgba(31,122,90,0.12)] bg-white/85 px-4 py-3 text-sm leading-6 text-[var(--muted)]"
                >
                  <span className="mb-2 block h-2 w-2 rounded-full bg-[var(--accent)]" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
