import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to ArticlePod or create your account. Turn saved articles and PDFs into a private podcast feed you can listen to anywhere.",
  alternates: { canonical: "/login" }
};

export default function LoginLayout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
