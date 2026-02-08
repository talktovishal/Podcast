import Link from "next/link";
import { DashboardClient } from "@/components/dashboard-client";
import { getUserByShareToken } from "@/lib/auth";
import { getActiveFeedTokenForUser, getDashboardItems } from "@/lib/dashboard";
import { env } from "@/lib/env";

export default async function SharePage({ searchParams }: { searchParams: { token?: string } }) {
  const shareToken = searchParams.token;
  if (!shareToken) {
    return (
      <main className="container-shell py-8">
        <p>Missing share token.</p>
      </main>
    );
  }

  const user = await getUserByShareToken(shareToken);
  if (!user) {
    return (
      <main className="container-shell py-8">
        <p>Invalid or expired share token.</p>
      </main>
    );
  }

  const feedToken = await getActiveFeedTokenForUser(user.id);
  if (!feedToken) {
    return (
      <main className="container-shell py-8">
        <p>No active feed for this user.</p>
      </main>
    );
  }

  const items = await getDashboardItems(user.id);

  return (
    <main className="py-8">
      <div className="container-shell space-y-6">
        <header className="card p-5">
          <p className="text-sm text-[var(--muted)]">Read-only demo</p>
          <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">This shared view is read-only. You can listen, browse status, and validate podcast playback behavior.</p>
          <Link href="/login" className="mt-3 inline-block text-sm underline">
            Sign in to your own workspace
          </Link>
        </header>

        <DashboardClient
          readOnly
          feedUrl={`${env.appUrl}/rss/${feedToken}.xml`}
          feedToken={feedToken}
          initialItems={items.map((item) => ({
            id: item.id,
            title: item.title,
            sourceType: item.sourceType,
            status: item.status,
            errorCode: item.errorCode,
            errorMessage: item.errorMessage,
            createdAt: item.createdAt.toISOString(),
            episode: item.episode
              ? {
                  audioPath: item.episode.audioPath,
                  audioBytes: item.episode.audioBytes,
                  mimeType: item.episode.mimeType
                }
              : null
          }))}
        />
      </div>
    </main>
  );
}
