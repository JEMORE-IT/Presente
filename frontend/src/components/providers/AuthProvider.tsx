"use client";

import React, { useEffect } from "react";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

function SessionWatcher({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    // If Azure token refresh failed, automatically sign out and redirect to login
    if ((session as any)?.error === "RefreshAccessTokenError") {
      if (pathname !== "/login" && typeof window !== "undefined") {
        console.warn("Session token refresh failed. Signing out...");
        signOut({
          redirect: true,
          callbackUrl: `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        });
      }
    }
  }, [session, pathname]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={4 * 60} refetchOnWindowFocus={true}>
      <SessionWatcher>{children}</SessionWatcher>
    </SessionProvider>
  );
}

