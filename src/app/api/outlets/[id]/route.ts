import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

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
    const { name, address, phone, email, status } = body;

    if (!name) {
      return NextResponse.json({ error: "Nama outlet wajib diisi" }, { status: 400 });
    }

    // Check unique name excluding self
    const existing = await prisma.outlet.findFirst({
      where: {
        name,
        id: { not: id },
        deletedAt: null,
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Nama outlet sudah digunakan" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOutlet = await tx.outlet.update({
        where: { id },
        data: {
          name,
          address: address || null,
          phone: phone || null,
          email: email || null,
          status: status || "ACTIVE",
        },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          table: "outlets",
          recordId: id,
          details: JSON.stringify({ name, address, phone, email, status }),
        },
      });

      return updatedOutlet;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui outlet: " + error.message },
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

  try {
    // Check if there are active userOutlet mapping or other things before deleting (we do soft delete)
    const result = await prisma.$transaction(async (tx) => {
      const deletedOutlet = await tx.outlet.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          table: "outlets",
          recordId: id,
          details: JSON.stringify({ name: deletedOutlet.name }),
        },
      });

      return deletedOutlet;
    });

    return NextResponse.json({ success: true, message: "Outlet berhasil dihapus" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus outlet: " + error.message },
      { status: 500 }
    );
  }
}
