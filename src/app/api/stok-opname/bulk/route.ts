import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden: Akses tidak diizinkan" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { stockIds } = body;

    if (!stockIds || !Array.isArray(stockIds) || stockIds.length === 0) {
      return NextResponse.json({ error: "Pilih barang yang ingin dihapus" }, { status: 400 });
    }

    const now = new Date();
    const results = await prisma.$transaction(async (tx) => {
      // Get stock details for audit log
      const stocks = await tx.operationalStock.findMany({
        where: { id: { in: stockIds } },
        select: { id: true, name: true, outletId: true },
      });

      // Soft delete the selected operational stocks
      const count = await tx.operationalStock.updateMany({
        where: { id: { in: stockIds } },
        data: { deletedAt: now },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE_BULK",
          table: "operational_stocks",
          recordId: "BULK",
          details: JSON.stringify({
            count: count.count,
            deletedStocks: stocks,
          }),
        },
      });

      return count;
    });

    return NextResponse.json({
      success: true,
      message: `${results.count} barang perlengkapan berhasil dihapus`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus barang secara massal: " + error.message },
      { status: 500 }
    );
  }
}
