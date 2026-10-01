import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const user = req.nextauth.token;

    // Public auth routes
    if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    // Checkin and Partecipazione pages are accessible to all authenticated @jemore.it members
    if (
      pathname.startsWith("/checkin") ||
      pathname.startsWith("/partecipazione")
    ) {
      return NextResponse.next();
    }

    // Administrative routes (Dashboard, Eventi, Analytics) reserved for Board, Responsabili, Manager and IT
    const ruolo = (user?.ruolo as string)?.toLowerCase() || "";
    const area_lavoro = (user?.area_lavoro as string)?.toLowerCase() || "";
    const email = (user?.email as string)?.toLowerCase() || "";
    const name = (user?.name as string)?.toLowerCase() || "";

    const isBoardOrResponsabile = 
      ruolo.includes("board") || 
      ruolo.includes("responsabile") ||
      ruolo.includes("manager") ||
      ruolo.includes("co-manager") ||
      ruolo.includes("co manager") ||
      ruolo.includes("comanager") ||
      ruolo === "co" ||
      ruolo.includes("presidente") ||
      ruolo.includes("tesoriere") ||
      ruolo.includes("segretario") ||
      area_lavoro.includes("board") ||
      area_lavoro.includes("responsabile") ||
      area_lavoro === "it" ||
      area_lavoro.includes("it ") ||
      email === "board@jemore.it" || 
      email === "responsabili@jemore.it" ||
      email.includes("joachim") ||
      name.includes("joachim");

    if (!isBoardOrResponsabile) {
      return new NextResponse("403 Forbidden - Accesso riservato al Board/Responsabili", { status: 403 });
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Only login and NextAuth API are public; all other routes require a valid session token
        if (
          req.nextUrl.pathname.startsWith("/login") ||
          req.nextUrl.pathname.startsWith("/api/auth")
        ) {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

