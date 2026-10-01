import { signOut } from "next-auth/react";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Universal fetch wrapper that automatically attaches bearer tokens 
 * and immediately redirects to login if the server returns 401 Unauthorized (expired token).
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
  session?: any
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  
  // Extract token if not already in headers
  if (!headers.has("Authorization")) {
    const token =
      (session as any)?.idToken ||
      (session as any)?.accessToken ||
      session?.user?.email ||
      "";
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && typeof window !== "undefined") {
    console.warn("API returned 401 Unauthorized. Redirecting to login...");
    const currentPath = window.location.pathname + window.location.search;
    if (!window.location.pathname.startsWith("/login")) {
      signOut({
        redirect: true,
        callbackUrl: `/login?callbackUrl=${encodeURIComponent(currentPath)}`,
      });
    }
  }

  return response;
}

