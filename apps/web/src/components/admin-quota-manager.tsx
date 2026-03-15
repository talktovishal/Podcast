"use client";

import { useEffect, useMemo, useState } from "react";

type SubmissionQuotaSnapshot = {
  isPaid: boolean;
  submissionCount: number;
  freeTrialSubmissionLimit: number;
  extraSubmissionCredits: number;
  totalFreeSubmissionAllowance: number;
  remainingFreeSubmissions: number | null;
};

type BillingSnapshot = {
  planCode: "STARTER" | "PRO_MONTHLY";
  status: "NONE" | "ACTIVE" | "GRACE_PERIOD" | "CANCELED" | "INCOMPLETE";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  complimentaryPro: boolean;
  hasPaidAccess: boolean;
  accessReason: "billing" | "complimentary" | null;
};

type AdminQuotaUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  complimentaryPro: boolean;
  isPaid: boolean;
  submissionCount: number;
  extraSubmissionCredits: number;
  billing: BillingSnapshot;
  quota: SubmissionQuotaSnapshot;
};

type QuotaDraft = {
  complimentaryPro: boolean;
  extraSubmissionCredits: number;
};

function quotaLabel(user: AdminQuotaUser): string {
  if (user.billing.accessReason === "complimentary") {
    return "Complimentary Pro access (manual override)";
  }

  if (user.isPaid) {
    const endLabel = user.billing.currentPeriodEnd ? ` until ${new Date(user.billing.currentPeriodEnd).toLocaleDateString()}` : "";
    return `Paid plan via billing (${user.billing.status.toLowerCase()})${endLabel}`;
  }

  return `${user.submissionCount}/${user.quota.totalFreeSubmissionAllowance} used, ${user.quota.remainingFreeSubmissions ?? 0} remaining`;
}

export function AdminQuotaManager() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminQuotaUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, QuotaDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const hasUsers = users.length > 0;

  async function loadUsers(activeQuery: string) {
    setLoading(true);
    setStatusMessage(null);

    try {
      const searchParams = new URLSearchParams();
      if (activeQuery.trim()) {
        searchParams.set("q", activeQuery.trim());
      }
      const url = searchParams.size > 0 ? `/api/admin/users/quota?${searchParams.toString()}` : "/api/admin/users/quota";
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        users?: AdminQuotaUser[];
        error_message?: string;
      };

      if (!response.ok || !payload.ok || !payload.users) {
        setStatusMessage(payload.error_message || "Unable to load user quota data.");
        return;
      }

      setUsers(payload.users);
      const nextDrafts: Record<string, QuotaDraft> = {};
      for (const user of payload.users) {
        nextDrafts[user.id] = {
          complimentaryPro: user.complimentaryPro,
          extraSubmissionCredits: user.extraSubmissionCredits
        };
      }
      setDrafts(nextDrafts);
    } catch {
      setStatusMessage("Unable to load user quota data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers("");
  }, []);

  const dirtyUsers = useMemo(() => {
    return users.filter((user) => {
      const draft = drafts[user.id];
      if (!draft) {
        return false;
      }
      return draft.complimentaryPro !== user.complimentaryPro || draft.extraSubmissionCredits !== user.extraSubmissionCredits;
    }).length;
  }, [drafts, users]);

  function updateDraft(userId: string, updater: (current: QuotaDraft) => QuotaDraft) {
    setDrafts((current) => {
      const existing = current[userId] ?? { complimentaryPro: false, extraSubmissionCredits: 0 };
      return {
        ...current,
        [userId]: updater(existing)
      };
    });
  }

  async function saveUser(user: AdminQuotaUser) {
    const draft = drafts[user.id];
    if (!draft) {
      return;
    }

    setSavingUserId(user.id);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/users/quota", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          userId: user.id,
          complimentaryPro: draft.complimentaryPro,
          extraSubmissionCredits: draft.extraSubmissionCredits
        })
      });

      const payload = (await response.json()) as {
        ok: boolean;
        user?: AdminQuotaUser;
        error_message?: string;
      };

      if (!response.ok || !payload.ok || !payload.user) {
        setStatusMessage(payload.error_message || `Could not update quota for ${user.email}.`);
        return;
      }

      setUsers((current) => current.map((candidate) => (candidate.id === payload.user!.id ? payload.user! : candidate)));
      setDrafts((current) => ({
        ...current,
        [payload.user!.id]: {
          complimentaryPro: payload.user!.complimentaryPro,
          extraSubmissionCredits: payload.user!.extraSubmissionCredits
        }
      }));
      setStatusMessage(`Updated quota settings for ${payload.user.email}.`);
    } catch {
      setStatusMessage(`Could not update quota for ${user.email}.`);
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Submission quota controls</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Free users get a limited number of submissions. Use this table to grant extra tries or add complimentary Pro access.
          </p>
        </div>
        <div className="text-xs text-[var(--muted)]">Unsaved rows: {dirtyUsers}</div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Search users by email or name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          disabled={loading}
          onClick={() => {
            void loadUsers(query);
          }}
        >
          {loading ? "Loading..." : "Search"}
        </button>
      </div>

      {statusMessage ? <p className="mt-3 text-sm text-[var(--muted)]">{statusMessage}</p> : null}

      <div className="mt-4 space-y-3">
        {!hasUsers ? <p className="text-sm text-[var(--muted)]">No users found for this query.</p> : null}

        {users.map((user) => {
          const draft = drafts[user.id] ?? {
            complimentaryPro: user.complimentaryPro,
            extraSubmissionCredits: user.extraSubmissionCredits
          };
          const isDirty = draft.complimentaryPro !== user.complimentaryPro || draft.extraSubmissionCredits !== user.extraSubmissionCredits;
          return (
            <article key={user.id} className="rounded-xl border p-3 sm:p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{user.name || user.email}</h3>
                  <p className="text-xs text-[var(--muted)]">
                    {user.email} · role: {user.role}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{quotaLabel(user)}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Billing plan: {user.billing.planCode === "PRO_MONTHLY" ? "Pro" : "Starter"} · status:{" "}
                    {user.billing.status.toLowerCase()}
                  </p>
                </div>
                {isDirty ? <span className="text-xs text-[#8a5a00]">Unsaved changes</span> : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.complimentaryPro}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      updateDraft(user.id, (current) => ({
                        ...current,
                        complimentaryPro: checked
                      }));
                    }}
                  />
                  Complimentary Pro
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-[var(--muted)]" htmlFor={`extra-quota-${user.id}`}>
                    Extra free tries
                  </label>
                  <input
                    id={`extra-quota-${user.id}`}
                    className="w-24 rounded-lg border px-2 py-1 text-sm"
                    type="number"
                    min={0}
                    value={draft.extraSubmissionCredits}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      updateDraft(user.id, (current) => ({
                        ...current,
                        extraSubmissionCredits: Number.isFinite(value) && value > 0 ? value : 0
                      }));
                    }}
                  />
                  <button
                    className="rounded-lg border px-2 py-1 text-xs"
                    type="button"
                    onClick={() => {
                      updateDraft(user.id, (current) => ({
                        ...current,
                        extraSubmissionCredits: current.extraSubmissionCredits + 1
                      }));
                    }}
                  >
                    +1
                  </button>
                  <button
                    className="rounded-lg border px-2 py-1 text-xs"
                    type="button"
                    onClick={() => {
                      updateDraft(user.id, (current) => ({
                        ...current,
                        extraSubmissionCredits: current.extraSubmissionCredits + 5
                      }));
                    }}
                  >
                    +5
                  </button>
                </div>

                <button
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={!isDirty || savingUserId === user.id}
                  onClick={() => {
                    void saveUser(user);
                  }}
                >
                  {savingUserId === user.id ? "Saving..." : "Save"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
