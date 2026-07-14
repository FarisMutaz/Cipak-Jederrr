import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const outletId = searchParams.get("outletId");

  if (!outletId) {
    return NextResponse.json({ error: "Outlet ID harus ditentukan" }, { status: 400 });
  }

  const user = session.user as any;
  const userRole = user.role;
  const userOutlets = user.outlets || [];

  // Scoping check
  if (userRole !== "DEVELOPER" && userRole !== "OWNER") {
    const hasAccess = userOutlets.some((o: any) => o.id === outletId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: Scoped outlet access only" }, { status: 403 });
    }
  }

  try {
    const list = await prisma.shoppingList.findMany({
      where: {
        outletId,
        deletedAt: null,
      },
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: {
        date: "desc",
      },
    });
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat daftar belanja: " + error.message },
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
  const userId = user.id;

  try {
    const body = await req.json();
    const { date, outletId, itemName, supplier, qty, price, notes, operationalStockId } = body;

    if (!outletId || !itemName || !qty || !price) {
      return NextResponse.json({ error: "Kolom wajib harus diisi" }, { status: 400 });
    }

    const calculatedTotal = parseInt(qty) * parseFloat(price);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Shopping List item
      const item = await tx.shoppingList.create({
        data: {
          date: date ? new Date(date) : new Date(),
          outletId,
          itemName,
          supplier: supplier || null,
          qty: parseInt(qty),
          price: parseFloat(price),
          total: calculatedTotal,
          notes: notes || null,
          userId,
          operationalStockId: operationalStockId || null,
        },
      });

      // 2. Automatically create Expense
      await tx.expense.create({
        data: {
          outletId,
          name: `Belanja: ${itemName} (${qty}x)`,
          amount: calculatedTotal,
          category: "OPERATIONAL",
          date: date ? new Date(date) : new Date(),
          userId,
          shoppingListId: item.id,
        },
      });

      // 2b. Automatically increment Operational Stock if linked
      if (operationalStockId) {
        const opStock = await tx.operationalStock.findUnique({
          where: { id: operationalStockId },
        });
        if (opStock) {
          const factor = opStock.qtyPerUnit || 1;
          const addedQty = parseInt(qty) * factor;
          const nextQty = opStock.quantity + addedQty;
          await tx.operationalStock.update({
            where: { id: operationalStockId },
            data: {
              stockIn: { increment: addedQty },
              quantity: nextQty,
            },
          });

          await tx.operationalStockMovement.create({
            data: {
              operationalStockId,
              type: "IN",
              quantity: addedQty,
              notes: `Pembelian Pengeluaran: ${itemName} (${qty}x beli @ ${factor} ${opStock.unit})`,
              userId,
            },
          });
        }
      }

      // 3. Create Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          action: "CREATE",
          table: "shopping_lists",
          recordId: item.id,
          details: JSON.stringify({ itemName, total: calculatedTotal }),
        },
      });

      return item;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menyimpan pengeluaran: " + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden: Hanya Owner atau Developer yang dapat menghapus item belanja" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID Item Belanja harus ditentukan" }, { status: 400 });
  }

  const ids = id.split(",");

  try {
    // 1. Fetch all items first in a single query
    const items = await prisma.shoppingList.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    if (items.length === 0) {
      return NextResponse.json({ success: true, message: "Tidak ada item belanja yang perlu dihapus" });
    }

    await prisma.$transaction(async (tx) => {
      // Gather all unique operationalStockIds to query in bulk
      const opStockIds = Array.from(
        new Set(items.map((item) => item.operationalStockId).filter(Boolean))
      ) as string[];

      const dbOpStocks = opStockIds.length > 0 ? await tx.operationalStock.findMany({
        where: { id: { in: opStockIds } },
      }) : [];

      const opStockAdjustments: Record<string, number> = {};
      const opStockMovementsToCreate: any[] = [];

      for (const item of items) {
        if (item.operationalStockId && item.qty) {
          const opStock = dbOpStocks.find((s) => s.id === item.operationalStockId);
          if (opStock) {
            const factor = opStock.qtyPerUnit || 1;
            const decrementedQty = item.qty * factor;

            opStockAdjustments[opStock.id] = (opStockAdjustments[opStock.id] || 0) + decrementedQty;

            opStockMovementsToCreate.push({
              operationalStockId: item.operationalStockId,
              type: "OUT",
              quantity: decrementedQty,
              notes: `Pembatalan/Penghapusan Pembelian: ${item.itemName} (${item.qty}x beli @ ${factor} ${opStock.unit})`,
              userId: user.id,
            });
          }
        }
      }

      // 2. Soft delete shopping list items in bulk
      await tx.shoppingList.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: new Date() },
      });

      // 3. Soft delete linked expenses in bulk
      await tx.expense.updateMany({
        where: { shoppingListId: { in: ids } },
        data: { deletedAt: new Date() },
      });

      // 4. Update operational stocks in aggregated manner
      for (const [opStockId, decrementedQty] of Object.entries(opStockAdjustments)) {
        await tx.operationalStock.update({
          where: { id: opStockId },
          data: {
            stockIn: { decrement: decrementedQty },
            quantity: { decrement: decrementedQty },
          },
        });
      }

      // 5. Create movements in bulk
      if (opStockMovementsToCreate.length > 0) {
        await tx.operationalStockMovement.createMany({
          data: opStockMovementsToCreate,
        });
      }

      // 6. Create Audit Logs in bulk
      const auditLogs = items.map((item) => ({
        userId: user.id,
        action: "DELETE",
        table: "shopping_lists",
        recordId: item.id,
        details: JSON.stringify({ itemName: item.itemName, total: item.total }),
      }));

      await tx.auditLog.createMany({
        data: auditLogs,
      });
    });

    return NextResponse.json({
      success: true,
      message: ids.length > 1 ? "Item belanja terpilih berhasil dihapus" : "Berhasil menghapus item belanja",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Gagal menghapus item belanja" },
      { status: 500 }
    );
  }
}
