import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, username, password, roleName, outletIds } = body;

    // Check username uniqueness excluding self
    if (username) {
      const existing = await prisma.user.findFirst({
        where: {
          username,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (existing) {
        return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Find Role
      const role = await tx.role.findUnique({
        where: { name: roleName },
      });

      if (!role) {
        throw new Error(`Role ${roleName} tidak ditemukan`);
      }

      // Prepare update fields
      const updateData: any = {
        name,
        username,
        roleId: role.id,
      };

      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      // Update User
      const updatedUser = await tx.user.update({
        where: { id },
        data: updateData,
      });

      // Clear old UserOutlet mappings
      await tx.userOutlet.updateMany({
        where: { userId: id },
        data: { deletedAt: new Date() },
      });

      // Write new UserOutlet mappings
      if (outletIds && outletIds.length > 0) {
        for (const oId of outletIds) {
          await tx.userOutlet.create({
            data: {
              userId: id,
              outletId: oId,
            },
          });
        }
      }

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          table: "users",
          recordId: id,
          details: JSON.stringify({ name, username, roleName }),
        },
      });

      return updatedUser;
    });

    return NextResponse.json({
      id: result.id,
      name: result.name,
      username: result.username,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui pengguna: " + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent deleting self
  if (user.id === id) {
    return NextResponse.json({ error: "Anda tidak dapat menghapus akun Anda sendiri" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const deletedUser = await tx.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await tx.userOutlet.updateMany({
        where: { userId: id },
        data: { deletedAt: new Date() },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          table: "users",
          recordId: id,
          details: JSON.stringify({ name: deletedUser.name, username: deletedUser.username }),
        },
      });

      return deletedUser;
    });

    return NextResponse.json({ success: true, message: "Pengguna berhasil dihapus" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus pengguna: " + error.message },
      { status: 500 }
    );
  }
}
