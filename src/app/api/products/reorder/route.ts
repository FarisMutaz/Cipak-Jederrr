import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// PUT /api/products/reorder - Batch update sortOrder for products
export async function PUT(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { items } = await req.json();
    // items: Array<{ id: string; sortOrder: number }>

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Data urutan tidak valid" }, { status: 400 });
    }

    // Batch update using prisma.$transaction
    await prisma.$transaction(
      items.map((item: { id: string; sortOrder: number }) =>
        prisma.product.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        table: "products",
        recordId: "batch-reorder",
        details: JSON.stringify({ count: items.length }),
      },
    });

    return NextResponse.json({ success: true, updated: items.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui urutan produk: " + error.message },
      { status: 500 }
    );
  }
}
