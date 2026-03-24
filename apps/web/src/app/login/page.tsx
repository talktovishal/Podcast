"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketingHeader } from "@/components/marketing-header";
import { marketingCopy } from "@/lib/marketing-content";
import { oauthProviders as oauthProviderDefinitions, type OAuthProviderStatus } from "@/lib/oauth-providers";

type Mode = "login" | "signup";

const oauthErrorMessages: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured in this environment.",
  google_state: "Google sign-in expired. Please try again.",
  google_token: "Google sign-in could not be completed. Please try again.",
  google_profile: "Google profile access failed. Please try again.",
  google_sub: "Google sign-in did not return a usable account identifier.",
  facebook_not_configured: "Facebook sign-in is not configured in this environment.",
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
  apple_sub: "Apple sign-in did not return a usable account identifier."
};

function buildEmptyProviderStatus(): OAuthProviderStatus {
  return oauthProviderDefinitions.reduce<OAuthProviderStatus>((acc, provider) => {
    acc[provider.id] = {
      configured: false
    };
    return acc;
  }, {} as OAuthProviderStatus);
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
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderStatus | null>(null);

  const oauthError = useMemo(() => searchParams.get("oauth_error"), [searchParams]);
  const oauthErrorMessage = oauthError ? oauthErrorMessages[oauthError] ?? "Social sign-in failed. Please try again." : null;
  const configuredProviders = useMemo(() => {
    if (!oauthProviders) {
      return [];
    }
    return oauthProviderDefinitions.filter((provider) => oauthProviders[provider.id]?.configured);
  }, [oauthProviders]);
  const primaryAuthActionClass =
    "w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-center text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60";

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
          oauthProviderDefinitions.reduce<OAuthProviderStatus>((acc, provider) => {
            acc[provider.id] = {
              configured: Boolean(payload.providers?.[provider.id]?.configured)
            };
            return acc;
          }, {} as OAuthProviderStatus)
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
          "content-type": "application/json"
        },
        body: JSON.stringify({ mode, email, password, name })
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json.error_message || "Authentication failed");
        return;
      }

      router.push(json.role === "ADMIN" ? "/admin" : "/app");
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

        <div className="grid items-start gap-6 lg:grid-cols-[1.12fr_1fr] lg:gap-10">
          <section className="space-y-6">
            <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
              {marketingCopy.heroBadge}
            </p>

            <h1 className="max-w-2xl font-bold text-4xl leading-[1.05] sm:text-6xl">
              {marketingCopy.heroHeadline}
            </h1>

            <p className="max-w-xl text-base text-[var(--muted)] sm:text-lg">
              {marketingCopy.heroSubheading}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {marketingCopy.heroChips.map((chip) => (
                <article key={chip} className="card border-[#d5e8e2] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">{chip}</p>
                </article>
              ))}
            </div>
            <p className="text-sm text-[var(--muted)]">{marketingCopy.heroSecondary}</p>
          </section>

          <section className="card border-[#cde5df] p-4 sm:p-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">Continue with one tap</p>
            <h2 className="text-lg font-semibold sm:text-xl">Continue to your feed</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              First time with Google, Facebook, or Apple? We&apos;ll create your account automatically.
            </p>

            <div className="space-y-3">
              <div className="pt-3">
                <div className="grid grid-cols-1 gap-2">
                  {configuredProviders.map((provider) => (
                    <a key={provider.id} className={primaryAuthActionClass} href={provider.startPath}>
                      Continue with {provider.label}
                    </a>
                  ))}
                </div>
                {!oauthProviders ? <p className="mt-2 text-xs text-[var(--muted)]">Checking sign-in options...</p> : null}
                {oauthProviders && configuredProviders.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">No social sign-in providers are configured here yet. Use email below.</p>
                ) : null}
              </div>

              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              {oauthErrorMessage ? <p className="text-sm text-[var(--danger)]">{oauthErrorMessage}</p> : null}

              <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                <span className="h-px flex-1 bg-[#d7e8e3]" />
                <span>Or use email</span>
                <span className="h-px flex-1 bg-[#d7e8e3]" />
              </div>

              <div className="rounded-2xl border border-[#d7e8e3] bg-[#f8fcfb] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">Use email instead</p>
                    <p className="text-xs text-[var(--muted)]">
                      {mode === "login" ? "Need a new account?" : "Already have an email account?"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      className={`font-medium ${mode === "login" ? "text-[var(--ink)] underline underline-offset-4" : "text-[var(--muted)]"}`}
                      onClick={() => setMode("login")}
                      type="button"
                    >
                      Log in
                    </button>
                    <button
                      className={`font-medium ${mode === "signup" ? "text-[var(--ink)] underline underline-offset-4" : "text-[var(--muted)]"}`}
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
                      <span className="mb-1 block text-sm font-medium">Name</span>
                      <input className="w-full rounded-lg border px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
                    </label>
                  ) : null}

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Email</span>
                    <input className="w-full rounded-lg border px-3 py-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Password</span>
                    <input className="w-full rounded-lg border px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </label>

                  <button className={primaryAuthActionClass} disabled={isLoading} onClick={submit}>
                    {isLoading ? "Please wait..." : mode === "login" ? "Log in with email" : "Create account with email"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
