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
    const { outletId, updates } = body;

    if (!outletId || !updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: "Data pembaruan tidak lengkap" }, { status: 400 });
    }

    // Verify koorlap outlet access
    const userRole = user.role;
    const userOutlets = user.outlets || [];
    if (userRole !== "DEVELOPER" && userRole !== "OWNER") {
      const hasAccess = userOutlets.some((o: any) => o.id === outletId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden: Scoped outlet access only" }, { status: 403 });
      }
    }

    // Run updates atomically in transaction
    const results = await prisma.$transaction(async (tx) => {
      const updatedItems = [];

      for (const item of updates) {
        const { stockId, initialStock, stockIn, quantity } = item;
        if (!stockId || initialStock === undefined || stockIn === undefined || quantity === undefined) {
          throw new Error("Format data update tidak valid");
        }

        const A = parseInt(initialStock);
        const I = parseInt(stockIn);
        const S = parseInt(quantity);

        if (isNaN(A) || isNaN(I) || isNaN(S) || A < 0 || I < 0 || S < 0) {
          throw new Error("Nilai stok tidak boleh negatif atau bukan angka");
        }

        const stock = await tx.stock.findUnique({
          where: { id: stockId },
          include: { product: true },
        });

        if (!stock) {
          throw new Error(`Stok dengan ID ${stockId} tidak ditemukan`);
        }

        if (stock.outletId !== outletId) {
          throw new Error(`Stok ${stock.product.name} tidak berada di outlet yang dipilih`);
        }

        const oldA = stock.initialStock;
        const oldI = stock.stockIn;
        const oldS = stock.quantity;
        const sold = stock.sold;

        // Balanced formula calculation:
        // quantity = initialStock + stockIn - stockOut - sold
        // => stockOut = initialStock + stockIn - sold - quantity
        const O = A + I - sold - S;

        // Only update if changes occurred
        if (oldA !== A || oldI !== I || oldS !== S) {
          const updated = await tx.stock.update({
            where: { id: stockId },
            data: {
              initialStock: A,
              stockIn: I,
              quantity: S,
              stockOut: O,
            },
          });

          // Stock Movement Notes
          const notes = `Pembaruan Stok Massal: Awal (${oldA} -> ${A}), Masuk (${oldI} -> ${I}), Sisa (${oldS} -> ${S})`;
          await tx.stockMovement.create({
            data: {
              stockId,
              type: StockMovementType.ADJUSTMENT,
              quantity: Math.abs(S - oldS),
              notes,
              userId: user.id,
            },
          });

          // Audit Log
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "UPDATE",
              table: "stocks",
              recordId: stockId,
              details: JSON.stringify({
                old: { initialStock: oldA, stockIn: oldI, quantity: oldS, stockOut: stock.stockOut },
                new: { initialStock: A, stockIn: I, quantity: S, stockOut: O },
              }),
            },
          });

          updatedItems.push(updated);
        }
      }

      return updatedItems;
    });

    return NextResponse.json({ success: true, updatedCount: results.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Gagal melakukan pembaruan stok massal" },
      { status: 500 }
    );
  }
}
