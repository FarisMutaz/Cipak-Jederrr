import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        outlets: {
          where: { deletedAt: null },
          select: {
            outlet: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role.name,
      roleId: u.role.id,
      outlets: u.outlets.map((uo) => uo.outlet),
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat pengguna: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, username, password, roleName, outletIds } = body; // outletIds is array of strings

    if (!name || !username || !password || !roleName) {
      return NextResponse.json({ error: "Kolom wajib harus diisi" }, { status: 400 });
    }

    // Check unique username
    const existing = await prisma.user.findFirst({
      where: { username, deletedAt: null },
    });
    if (existing) {
      return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // Find Role ID
      const role = await tx.role.findUnique({
        where: { name: roleName },
      });

      if (!role) {
        throw new Error(`Role ${roleName} tidak ditemukan`);
      }

      // Create User
      const newUser = await tx.user.create({
        data: {
          name,
          username,
          password: hashedPassword,
          roleId: role.id,
        },
      });

      // Link UserOutlets if outlets provided
      if (outletIds && outletIds.length > 0) {
        for (const oId of outletIds) {
          await tx.userOutlet.create({
            data: {
              userId: newUser.id,
              outletId: oId,
            },
          });
        }
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          table: "users",
          recordId: newUser.id,
          details: JSON.stringify({ name, username, roleName }),
        },
      });

      return newUser;
    });

    return NextResponse.json({
      id: result.id,
      name: result.name,
      username: result.username,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal membuat pengguna: " + error.message },
      { status: 500 }
    );
  }
}
