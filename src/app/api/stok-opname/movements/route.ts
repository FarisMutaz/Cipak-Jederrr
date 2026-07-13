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

  try {
    const movements = await prisma.operationalStockMovement.findMany({
      where: {
        operationalStock: {
          outletId,
          deletedAt: null,
        },
      },
      include: {
        operationalStock: true,
        user: {
          select: { name: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    const formatted = movements.map((m) => ({
      id: m.id,
      itemName: m.operationalStock.name,
      unit: m.operationalStock.unit,
      type: m.type, // IN, OUT, ADJUSTMENT
      quantity: m.quantity,
      notes: m.notes,
      createdAt: m.createdAt,
      userName: m.user?.name || "Sistem",
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat log riwayat stok opname: " + error.message },
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
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Movement ID harus ditentukan" }, { status: 400 });
  }

  const ids = id.split(",");

  try {
    await prisma.$transaction(async (tx) => {
      for (const singleId of ids) {
        // Find the movement first
        const movement = await tx.operationalStockMovement.findUnique({
          where: { id: singleId },
          include: { operationalStock: true },
        });

        if (!movement) {
          continue;
        }

        // Reverse the stock effect
        const stock = movement.operationalStock;
        let updateData: any = {};

        if (movement.type === "IN") {
          // Was an IN movement, reverse: subtract from stockIn and quantity
          updateData = {
            stockIn: { decrement: movement.quantity },
            quantity: { decrement: movement.quantity },
          };
        } else if (movement.type === "OUT") {
          // Was an OUT movement, reverse: subtract from stockOut and add back to quantity
          updateData = {
            stockOut: { decrement: movement.quantity },
            quantity: { increment: movement.quantity },
          };
        } else if (movement.type === "ADJUSTMENT") {
          // Was a set initial stock adjustment
          const currentInitial = stock.initialStock;
          const newInitial = currentInitial - movement.quantity;
          updateData = {
            initialStock: newInitial,
            quantity: { decrement: movement.quantity },
          };
        }

        // Execute updates
        await tx.operationalStock.update({
          where: { id: stock.id },
          data: updateData,
        });

        await tx.operationalStockMovement.delete({
          where: { id: singleId },
        });
      }
    });

    return NextResponse.json({ message: ids.length > 1 ? "Riwayat mutasi opname terpilih berhasil dihapus & stok telah disesuaikan!" : "Riwayat mutasi opname berhasil dihapus & stok telah disesuaikan!" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus riwayat mutasi: " + error.message },
      { status: 500 }
    );
  }
}
