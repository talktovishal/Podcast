import { NextResponse } from "next/server";
import { isOAuthProviderConfigured } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: {
      google: {
        configured: isOAuthProviderConfigured("google")
      },
      apple: {
        configured: isOAuthProviderConfigured("apple")
      }
    }
  });
}
