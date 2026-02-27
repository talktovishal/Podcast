"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketingHeader } from "@/components/marketing-header";
import { marketingCopy } from "@/lib/marketing-content";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<{ google: boolean; apple: boolean } | null>(null);

  const oauthError = useMemo(() => searchParams.get("oauth_error"), [searchParams]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/providers");
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          providers?: {
            google?: { configured?: boolean };
            apple?: { configured?: boolean };
          };
        };
        if (!active) {
          return;
        }
        setOauthProviders({
          google: Boolean(payload.providers?.google?.configured),
          apple: Boolean(payload.providers?.apple?.configured)
        });
      } catch {
        // Keep local auth usable even if provider status probe fails.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const googleConfigured = oauthProviders?.google ?? false;
  const appleConfigured = oauthProviders?.apple ?? false;

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

      router.push("/app");
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">Welcome back</p>
            <h2 className="mb-5 text-lg font-semibold sm:text-xl">Log in to your feed</h2>
            <div className="mb-5 flex gap-2">
              <button className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "login" ? "bg-[var(--ink)] text-white" : "bg-[var(--accent-soft)]"}`} onClick={() => setMode("login")}>
                Login
              </button>
              <button className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "signup" ? "bg-[var(--ink)] text-white" : "bg-[var(--accent-soft)]"}`} onClick={() => setMode("signup")}>
                Sign up
              </button>
            </div>

            <div className="space-y-3">
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

              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              {oauthError ? <p className="text-sm text-[var(--danger)]">OAuth failed: {oauthError}</p> : null}

              <button disabled={isLoading} onClick={submit} className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {isLoading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
              </button>

              <div className="pt-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Sign in with</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {googleConfigured ? (
                    <a className="rounded-lg border px-3 py-2 text-center text-sm" href="/api/auth/google/start">
                      Continue with Google
                    </a>
                  ) : (
                    <button className="rounded-lg border px-3 py-2 text-center text-sm text-[var(--muted)] opacity-60" disabled>
                      Google unavailable
                    </button>
                  )}
                  {/* Apple Sign-In — hidden until Apple Developer account is configured
                  {appleConfigured ? (
                    <a className="rounded-lg border px-3 py-2 text-center text-sm" href="/api/auth/apple/start">
                      Continue with Apple
                    </a>
                  ) : (
                    <button className="rounded-lg border px-3 py-2 text-center text-sm text-[var(--muted)] opacity-60" disabled>
                      Apple unavailable
                    </button>
                  )}
                  */}
                </div>
                {!oauthProviders ? <p className="mt-2 text-xs text-[var(--muted)]">Checking provider availability...</p> : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
