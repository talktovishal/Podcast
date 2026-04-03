import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Log in to ArticlePod",
  description:
    "Log in to ArticlePod or create your account to save articles, generate private podcast episodes, and manage your private RSS feed.",
  path: "/login",
  noIndex: true
});

export default function LoginLayout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
