import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

const handler = NextAuth({
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "",
      tenantId: process.env.AZURE_AD_TENANT_ID || "",
      checks: ["pkce"], // Abilita PKCE per supportare le App registrate come "Single-Page Application" su Azure
      authorization: {
        params: {
          scope: "openid profile email",
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
      // Rimuovo il blocco temporaneamente per farti entrare e vedere cosa manca
      user.email = email || "sconosciuta@jemore.it"; 
      return true; 
    },
    async jwt({ token, account, user, profile }: any) {
      if (account) {
        token.idToken = account.id_token;
        token.accessToken = account.access_token;
      }
      
      // Quando l'utente fa il login per la prima volta, user e profile sono definiti
      if (user || profile) {
        const email = user?.email || profile?.email || profile?.preferred_username || token.email || "";
        token.email = email;
        
        // Fetch user role from FastAPI backend
        try {
          const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const res = await fetch(`${apiUrl}/api/soci/${email}`);
          if (res.ok) {
            const data = await res.json();
            token.ruolo = data.ruolo;
            token.area_lavoro = data.area_lavoro;
          }
        } catch (e) {
          console.error("Failed to fetch user role from backend", e);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Expose role and access token to the client
      (session as any).user.ruolo = token.ruolo;
      (session as any).user.area_lavoro = token.area_lavoro;
      (session as any).idToken = token.idToken;
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

export { handler as GET, handler as POST };
