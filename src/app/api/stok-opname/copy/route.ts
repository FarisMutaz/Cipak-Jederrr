import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

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
    const { fromOutletId, toOutletId, initialStockMode } = await req.json(); // initialStockMode: 'zero' | 'copy'

    if (!fromOutletId || !toOutletId) {
      return NextResponse.json({ error: "Outlet asal dan outlet tujuan harus ditentukan" }, { status: 400 });
    }

    if (fromOutletId === toOutletId) {
      return NextResponse.json({ error: "Outlet asal dan outlet tujuan tidak boleh sama" }, { status: 400 });
    }

    // Get all active stock items from source outlet
    const sourceStocks = await prisma.operationalStock.findMany({
      where: {
        outletId: fromOutletId,
        deletedAt: null,
      },
    });

    if (sourceStocks.length === 0) {
      return NextResponse.json({ error: "Outlet asal tidak memiliki barang opname" }, { status: 400 });
    }

    // Get all active or deleted stock items in target outlet to find existing matches
    const targetStocksAny = await prisma.operationalStock.findMany({
      where: {
        outletId: toOutletId,
      },
    });

    const activeTargetStockNames = new Set(
      targetStocksAny
        .filter(s => s.deletedAt === null)
        .map(s => s.name.toLowerCase())
    );

    const deletedTargetStocksMap = new Map(
      targetStocksAny
        .filter(s => s.deletedAt !== null)
        .map(s => [s.name.toLowerCase(), s])
    );

    // Filter out items that are already active in target
    const itemsToCopy = sourceStocks.filter(s => !activeTargetStockNames.has(s.name.toLowerCase()));

    if (itemsToCopy.length === 0) {
      return NextResponse.json({ message: "Semua barang sudah ada di outlet tujuan", copiedCount: 0 });
    }

    // Create/Restore them in target outlet
    const copiedItems = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const item of itemsToCopy) {
        const qty = initialStockMode === "copy" ? item.quantity : 0;
        const nameLower = item.name.toLowerCase();
        
        let created;
        if (deletedTargetStocksMap.has(nameLower)) {
          const existingDeleted = deletedTargetStocksMap.get(nameLower)!;
          created = await tx.operationalStock.update({
            where: { id: existingDeleted.id },
            data: {
              unit: item.unit,
              initialStock: qty,
              quantity: qty,
              minStock: item.minStock,
              qtyPerUnit: item.qtyPerUnit,
              deletedAt: null, // restore
            },
          });
        } else {
          created = await tx.operationalStock.create({
            data: {
              name: item.name,
              unit: item.unit,
              outletId: toOutletId,
              initialStock: qty,
              quantity: qty,
              minStock: item.minStock,
              qtyPerUnit: item.qtyPerUnit,
            },
          });
        }

        if (qty > 0) {
          await tx.operationalStockMovement.create({
            data: {
              operationalStockId: created.id,
              type: "IN",
              quantity: qty,
              notes: `Salin stok dari outlet lain (${item.name})`,
              userId: user.id,
            },
          });
        }
        count++;
      }

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          table: "operational_stocks",
          recordId: toOutletId,
          details: JSON.stringify({
            action: "CLONE_OUTLET_STOCKS",
            fromOutletId,
            itemsCopied: count,
          }),
        },
      });

      return count;
    });

    return NextResponse.json({ success: true, message: `Berhasil menyalin ${copiedItems} barang opname`, copiedCount: copiedItems });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menyalin barang opname: " + error.message },
      { status: 500 }
    );
  }
}
