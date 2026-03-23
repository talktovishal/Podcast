import { NextResponse } from "next/server";
import { isOAuthProviderConfigured } from "@/lib/auth";
import { oauthProviders, type OAuthProviderStatus } from "@/lib/oauth-providers";

export async function GET() {
  const providers = oauthProviders.reduce<OAuthProviderStatus>((acc, provider) => {
    acc[provider.id] = {
      configured: isOAuthProviderConfigured(provider.id)
    };
    return acc;
  }, {} as OAuthProviderStatus);

  return NextResponse.json({
    ok: true,
    providers
  });
}
