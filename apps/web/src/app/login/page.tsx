"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND_NAME } from "@listenlater/core/src/config/brand";

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
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ink)] text-sm font-bold text-white">AP</div>
            <p className="text-xl font-semibold tracking-tight">{BRAND_NAME}</p>
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <a className="rounded-full px-3 py-1.5 transition hover:bg-[#e8f5f0] hover:text-[var(--ink)]" href="#">
              Product
            </a>
            <a className="rounded-full px-3 py-1.5 transition hover:bg-[#e8f5f0] hover:text-[var(--ink)]" href="#">
              Resources
            </a>
            <a className="rounded-full px-3 py-1.5 transition hover:bg-[#e8f5f0] hover:text-[var(--ink)]" href="#">
              Pricing
            </a>
          </nav>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[1.12fr_1fr] lg:gap-10">
          <section className="space-y-6">
            <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
              Private Article Podcasts
            </p>

            <h1 className="max-w-2xl font-bold text-4xl leading-[1.05] sm:text-6xl">
              Learn continuously,
              <span className="mt-1 block text-[#246f62]">even when you are away from your screen.</span>
            </h1>

            <p className="max-w-xl text-base text-[var(--muted)] sm:text-lg">
              Convert saved reading into podcast episodes and keep up during commute time.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <article className="card border-[#d5e8e2] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">Capture</p>
                <p className="mt-1 text-sm text-[var(--ink)]">URL, PDF, extension</p>
              </article>
              <article className="card border-[#d5e8e2] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">Listen</p>
                <p className="mt-1 text-sm text-[var(--ink)]">Private RSS feed</p>
              </article>
              <article className="card border-[#d5e8e2] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">Scale</p>
                <p className="mt-1 text-sm text-[var(--ink)]">Daily to monthly summaries</p>
              </article>
            </div>
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
                {appleConfigured ? (
                  <a className="rounded-lg border px-3 py-2 text-center text-sm" href="/api/auth/apple/start">
                    Continue with Apple
                  </a>
                ) : (
                  <button className="rounded-lg border px-3 py-2 text-center text-sm text-[var(--muted)] opacity-60" disabled>
                    Apple unavailable
                  </button>
                )}
              </div>
              {!oauthProviders ? <p className="mt-2 text-xs text-[var(--muted)]">Checking provider availability…</p> : null}
            </div>
          </div>
          </section>
        </div>
      </div>
    </main>
  );
}
