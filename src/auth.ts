import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (user && user.id) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: "LOGIN",
              table: "users",
              recordId: user.id,
              details: JSON.stringify({ username: (user as any).username || user.email }),
            },
          });
        } catch (err) {
          console.error("Failed to log login audit:", err);
        }
      }
      return true;
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Username dan password harus diisi");
        }

        const user = await prisma.user.findFirst({
          where: {
            username: credentials.username as string,
            deletedAt: null,
          },
          include: {
            role: true,
            outlets: {
              where: {
                deletedAt: null,
              },
              include: {
                outlet: true,
              },
            },
          },
        });

        if (!user || user.status !== "ACTIVE") {
          throw new Error("Akun tidak ditemukan atau tidak aktif");
        }

        const isValid = await bcrypt.compare(credentials.password as string, user.password);
        if (!isValid) {
          throw new Error("Password salah");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.username, // keep email as username for compatibility
          username: user.username,
          role: user.role.name,
          outlets: user.outlets.map((uo) => ({
            id: uo.outlet.id,
            name: uo.outlet.name,
            address: uo.outlet.address,
          })),
        };
      },
    }),
  ],
});
