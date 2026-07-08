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
  if (user.role !== "DEVELOPER" && user.role !== "OWNER" && user.role !== "KOORLAP") {
    return NextResponse.json({ error: "Forbidden: Akses tidak diizinkan" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { stockId, type, qty, notes, useBuyUnit, qtyPerUnit } = body; // type: 'INITIAL' | 'IN' | 'OUT'

    if (!stockId || !type || qty === undefined) {
      return NextResponse.json({ error: "Data penyesuaian stok tidak lengkap" }, { status: 400 });
    }

    const factor = useBuyUnit ? parseFloat(qtyPerUnit || 1) : 1;
    const adjustQty = parseFloat(qty) * factor;

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.operationalStock.findUnique({
        where: { id: stockId },
      });

      if (!stock) {
        throw new Error("Barang tidak ditemukan");
      }

      // Update qtyPerUnit in DB if useBuyUnit or if provided
      if (qtyPerUnit !== undefined) {
        await tx.operationalStock.update({
          where: { id: stockId },
          data: {
            qtyPerUnit: parseInt(qtyPerUnit),
          },
        });
      }

      let nextQty = stock.quantity;
      let mType: StockMovementType = StockMovementType.ADJUSTMENT;
      let logQty = adjustQty;

      if (type === "INITIAL") {
        const diff = adjustQty - stock.initialStock;
        nextQty = stock.quantity + diff;
        mType = StockMovementType.ADJUSTMENT;
        logQty = Math.abs(diff);
        await tx.operationalStock.update({
          where: { id: stockId },
          data: {
            initialStock: adjustQty,
            quantity: nextQty,
          },
        });
      } else if (type === "IN") {
        nextQty += adjustQty;
        mType = StockMovementType.IN;
        await tx.operationalStock.update({
          where: { id: stockId },
          data: {
            quantity: nextQty,
            stockIn: { increment: adjustQty },
          },
        });
      } else if (type === "OUT") {
        nextQty -= adjustQty;
        mType = StockMovementType.OUT;
        await tx.operationalStock.update({
          where: { id: stockId },
          data: {
            quantity: nextQty,
            stockOut: { increment: adjustQty },
          },
        });
      }

      const movement = await tx.operationalStockMovement.create({
        data: {
          operationalStockId: stockId,
          type: mType,
          quantity: logQty,
          notes: notes || (type === "INITIAL" ? "Penyesuaian Stok Awal" : type === "IN" ? "Penyesuaian Stok Masuk" : type === "OUT" ? "Penyesuaian Stok Keluar" : `Penyesuaian Manual (${type})`),
          userId: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          table: "operational_stocks",
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
