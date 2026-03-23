export const oauthProviders = [
  {
    id: "google",
    label: "Google",
    startPath: "/api/auth/google/start"
  },
  {
    id: "facebook",
    label: "Facebook",
    startPath: "/api/auth/facebook/start"
  },
  {
    id: "apple",
    label: "Apple",
    startPath: "/api/auth/apple/start"
  }
] as const;

export type OAuthProvider = (typeof oauthProviders)[number]["id"];

export type OAuthProviderStatus = Record<OAuthProvider, { configured: boolean }>;
