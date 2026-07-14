import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { StockMovementType } from "@prisma/client";

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
    const { stockId, type, qty, notes } = body; // type: 'IN' | 'OUT' | 'OPNAME'

    if (!stockId || !type || qty === undefined) {
      return NextResponse.json({ error: "Data penyesuaian stok tidak lengkap" }, { status: 400 });
    }

    const adjustQty = parseInt(qty);

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: { id: stockId },
        include: { product: true },
      });

      if (!stock) {
        throw new Error("Stok tidak ditemukan");
      }

      let nextQty = stock.quantity;
      let mType: StockMovementType = StockMovementType.ADJUSTMENT;
      let logQty = adjustQty;

      if (type === "INITIAL") {
        const diff = adjustQty - stock.initialStock;
        nextQty = stock.quantity + diff;
        mType = StockMovementType.ADJUSTMENT;
        logQty = Math.abs(diff);
        await tx.stock.update({
          where: { id: stockId },
          data: {
            initialStock: adjustQty,
            quantity: nextQty,
          },
        });
      } else if (type === "IN") {
        nextQty += adjustQty;
        mType = StockMovementType.IN;
        await tx.stock.update({
          where: { id: stockId },
          data: {
            quantity: nextQty,
            stockIn: { increment: adjustQty },
          },
        });
      } else if (type === "OUT") {
        nextQty -= adjustQty;
        mType = StockMovementType.OUT;
        await tx.stock.update({
          where: { id: stockId },
          data: {
            quantity: nextQty,
            stockOut: { increment: adjustQty },
          },
        });
      }

      // Per user request, manual stock adjustments are not recorded in the Stock Movement log/history
      const movement = null;

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          table: "stocks",
          recordId: stockId,
          details: JSON.stringify({ type, oldQty: stock.quantity, nextQty, logQty }),
        },
      });

      return { movement, nextQty };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Gagal menyesuaikan stok" },
      { status: 500 }
    );
  }
}
