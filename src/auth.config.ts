import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], // Empty array for Edge compatibility
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.role = (user as any).role;
        token.outlets = (user as any).outlets;
      }
      if (trigger === "update" && session?.activeOutletId) {
        token.activeOutletId = session.activeOutletId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).username = token.username as string;
        (session.user as any).role = token.role as string;
        (session.user as any).outlets = token.outlets as any[];
        (session.user as any).activeOutletId =
          (token.activeOutletId as string) ||
          ((token.outlets as any[]) && (token.outlets as any[])[0]?.id) ||
          null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "cipak-jederrr-secret-key-12345",
} satisfies NextAuthConfig;

export default authConfig;
