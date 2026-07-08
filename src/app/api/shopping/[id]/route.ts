import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const { id } = await params;

  try {
    await prisma.$transaction(async (tx) => {
      // Find shopping list first
      const item = await tx.shoppingList.findUnique({
        where: { id },
      });

      if (!item) {
        throw new Error("Item tidak ditemukan");
      }

      // Soft delete shopping list
      await tx.shoppingList.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Soft delete linked expense
      await tx.expense.updateMany({
        where: { shoppingListId: id },
        data: { deletedAt: new Date() },
      });

      // Reverse stock increment if linked to operationalStockId
      if (item.operationalStockId && item.qty) {
        const opStock = await tx.operationalStock.findUnique({
          where: { id: item.operationalStockId },
        });
        if (opStock) {
          const factor = opStock.qtyPerUnit || 1;
          const decrementedQty = item.qty * factor;
          const nextQty = opStock.quantity - decrementedQty;
          await tx.operationalStock.update({
            where: { id: item.operationalStockId },
            data: {
              stockIn: { decrement: decrementedQty },
              quantity: nextQty,
            },
          });

          await tx.operationalStockMovement.create({
            data: {
              operationalStockId: item.operationalStockId,
              type: "OUT",
              quantity: decrementedQty,
              notes: `Pembatalan/Penghapusan Pembelian: ${item.itemName} (${item.qty}x beli @ ${factor} ${opStock.unit})`,
              userId: user.id,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          table: "shopping_lists",
          recordId: id,
          details: JSON.stringify({ itemName: item.itemName, total: item.total }),
        },
      });
    });

    return NextResponse.json({ success: true, message: "Berhasil menghapus item belanja" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Gagal menghapus item belanja" },
      { status: 500 }
    );
  }
}
