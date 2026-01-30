// Requirements: E.T.4, E.A.6, E.A.7
export const authGoogleConfig = {
  clientId:
    "100365225505-2hnhs5iihioqfkg2ochgclfl3octgfp7.apps.googleusercontent.com",
  scopes: ["openid", "email", "profile"],
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
};

export const getGoogleAuthUrl = (clientId: string, port: number): string => {
  const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
  const url = new URL(authGoogleConfig.authEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", authGoogleConfig.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
};
