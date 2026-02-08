"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

  const oauthError = useMemo(() => searchParams.get("oauth_error"), [searchParams]);

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
    <main className="min-h-screen py-16">
      <div className="container-shell grid gap-8 md:grid-cols-[1.1fr_1fr] items-start">
        <section className="space-y-6">
          <p className="inline-block rounded-full bg-[var(--accent-soft)] px-4 py-1 text-sm font-semibold text-[var(--accent)]">RSS-First Personal Podcast Feed</p>
          <h1 className="font-bold text-5xl leading-tight">ListenLater</h1>
          <p className="max-w-xl text-lg text-[var(--muted)]">
            Turn URLs and PDFs into private podcast episodes, subscribe from your favorite app, and demo instantly with seeded content.
          </p>
          <div className="card p-6">
            <h2 className="font-semibold">Demo-friendly defaults</h2>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>• Local TTS via macOS <code>say</code> is supported.</li>
              <li>• Media endpoint supports <code>HEAD</code> and byte ranges.</li>
              <li>• Feed token rotation invalidates old URLs.</li>
            </ul>
          </div>
        </section>

        <section className="card p-6">
          <div className="mb-5 flex gap-2">
            <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === "login" ? "bg-[var(--ink)] text-white" : "bg-[var(--accent-soft)]"}`} onClick={() => setMode("login")}>
              Login
            </button>
            <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === "signup" ? "bg-[var(--ink)] text-white" : "bg-[var(--accent-soft)]"}`} onClick={() => setMode("signup")}>
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
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">OAuth</p>
              <div className="grid grid-cols-2 gap-2">
                <a className="rounded-lg border px-3 py-2 text-center text-sm" href="/api/auth/google/start">
                  Continue with Google
                </a>
                <a className="rounded-lg border px-3 py-2 text-center text-sm" href="/api/auth/apple/start">
                  Continue with Apple
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
