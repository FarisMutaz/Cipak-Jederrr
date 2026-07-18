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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { stockId, type, qty, notes, adjustments, notes: batchNotes } = body; // type: 'IN' | 'OUT' | 'OPNAME'

    if (!adjustments && (!stockId || !type || qty === undefined)) {
      return NextResponse.json({ error: "Data penyesuaian stok tidak lengkap" }, { status: 400 });
    }

    const items = adjustments || [{ stockId, type, qty, notes }];

    const result = await prisma.$transaction(async (tx) => {
      const results = [];
      const batchId = "batch_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);

      const outletsMap = new Map();
      const productMap = new Map();

      for (const item of items) {
        const { stockId: sId, type: t, qty: q, notes: n } = item;
        const adjustQty = parseInt(q);

        // Skip 0 adjustments in batch
        if (adjustments && adjustQty === 0) continue;

        const stock = await tx.stock.findUnique({
          where: { id: sId },
          include: { product: true, outlet: true },
        });

        if (!stock) {
          throw new Error("Stok tidak ditemukan");
        }

        let nextQty = stock.quantity;
        let logQty = adjustQty;

        if (t === "INITIAL") {
          const diff = adjustQty - stock.initialStock;
          nextQty = stock.quantity + diff;
          logQty = Math.abs(diff);
          await tx.stock.update({
            where: { id: sId },
            data: {
              initialStock: adjustQty,
              quantity: nextQty,
            },
          });
        } else if (t === "IN") {
          nextQty += adjustQty;
          await tx.stock.update({
            where: { id: sId },
            data: {
              quantity: nextQty,
              stockIn: { increment: adjustQty },
            },
          });
        } else if (t === "OUT") {
          nextQty -= adjustQty;
          await tx.stock.update({
            where: { id: sId },
            data: {
              quantity: nextQty,
              stockOut: { increment: adjustQty },
            },
          });
        }

        // Audit log
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            table: "stocks",
            recordId: sId,
            details: JSON.stringify({
              type: t,
              oldQty: stock.quantity,
              nextQty,
              logQty,
              notes: n,
              batchId,
              oldInitialStock: t === "INITIAL" ? stock.initialStock : undefined,
              nextInitialStock: t === "INITIAL" ? adjustQty : undefined,
            }),
          },
        });

        // Grouping for the run details
        outletsMap.set(stock.outlet.id, stock.outlet.name);
        if (!productMap.has(stock.productId)) {
          productMap.set(stock.productId, {
            productId: stock.productId,
            productName: stock.product.name,
            sku: stock.product.sku,
            outlets: {},
            notes: n,
          });
        }
        productMap.get(stock.productId).outlets[stock.outletId] = adjustQty;

        results.push({ stockId: sId, nextQty });
      }

      if (results.length > 0) {
        const uniqueOutlets = Array.from(outletsMap.entries()).map(([id, name]) => ({ id, name }));
        const groupAdjustments = Array.from(productMap.values());

        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "SAVE_STOCK_ADJUSTMENT",
            table: "stocks",
            recordId: batchId,
            details: JSON.stringify({
              adjustments: groupAdjustments,
              outlets: uniqueOutlets,
              notes: batchNotes || notes || "Stok Tambahan",
            }),
          },
        });
      }

      return { success: true, results };
    }, {
      timeout: 15000,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Gagal menyesuaikan stok" },
      { status: 500 }
    );
  }
}
