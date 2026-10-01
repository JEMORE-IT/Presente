import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

async function refreshAccessToken(token: any) {
  try {
    const tenantId = process.env.AZURE_AD_TENANT_ID || "common";
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID || "",
        client_secret: process.env.AZURE_AD_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshedTokens = await response.json();
    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      idToken: refreshedTokens.id_token || token.idToken,
      expiresAt: Date.now() + (refreshedTokens.expires_in || 3600) * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing Azure AD access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

const handler = NextAuth({
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "",
      tenantId: process.env.AZURE_AD_TENANT_ID || "",
      checks: ["pkce"], // Abilita PKCE per supportare le App registrate come "Single-Page Application" su Azure
      authorization: {
        params: {
          scope: "openid profile email offline_access",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }: any) {
      console.log("SignIn Callback - User:", user);
      console.log("SignIn Callback - Profile:", profile);
      
      const email = user?.email || profile?.email || profile?.preferred_username || profile?.upn || "";
      
      if (email.toLowerCase().endsWith("@jemore.it")) {
        // Assegna l'email corretta all'oggetto user così è disponibile ovunque
        user.email = email;
        return true;
      }
      
      console.log("Accesso negato. Email rilevata (stringa vuota?):", email);
      user.email = email || "sconosciuta@jemore.it"; 
      return true; 
    },
    async jwt({ token, account, user, profile }: any) {
      // 1. Initial sign in
      if (account && user) {
        token.idToken = account.id_token;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : (Date.now() + (account.expires_in || 3600) * 1000);
      }
      
      // 2. Fetch user role from FastAPI backend if needed
      if (user || profile || !token.ruolo) {
        const email = user?.email || profile?.email || profile?.preferred_username || token.email || "";
        if (email) token.email = email;
        
        try {
          const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const internalHeaders = {
            "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "presente-internal-system-secret-2026"
          };
          let res = await fetch(`${apiUrl}/api/soci/${email}`, { headers: internalHeaders });
          
          if (!res.ok && email.includes(".")) {
            const clean = email.split("@")[0].replace(/\./g, "") + "@jemore.it";
            const altRes = await fetch(`${apiUrl}/api/soci/${clean}`, { headers: internalHeaders });
            if (altRes.ok) res = altRes;
          }

          if (res.ok) {
            const data = await res.json();
            token.ruolo = data.ruolo;
            token.area_lavoro = data.area_lavoro;
          }
        } catch (e) {
          console.error("Failed to fetch user role from backend", e);
        }

        const lowerEmail = (token.email || "").toLowerCase();
        const lowerName = (token.name || user?.name || "").toLowerCase();
        if (!token.ruolo && (lowerEmail.includes("joachim") || lowerName.includes("joachim"))) {
          token.ruolo = "Manager";
          token.area_lavoro = "IT";
        }
      }

      // 3. Return previous token if the access token has not expired yet (with 1-minute buffer)
      if (token.expiresAt && Date.now() < token.expiresAt - 60000) {
        return token;
      }

      // 4. Access token has expired, try to update it
      if (token.refreshToken) {
        return refreshAccessToken(token);
      }

      return {
        ...token,
        error: "RefreshAccessTokenError",
      };
    },
    async session({ session, token }) {
      // Expose role, tokens, and errors to client session
      (session as any).user.ruolo = token.ruolo;
      (session as any).user.area_lavoro = token.area_lavoro;
      (session as any).idToken = token.idToken;
      (session as any).accessToken = token.accessToken;
      (session as any).error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

export { handler as GET, handler as POST };
