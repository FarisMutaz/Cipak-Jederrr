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
    // 1. Fetch all movements first in a single query
    const movements = await prisma.operationalStockMovement.findMany({
      where: { id: { in: ids } },
      include: { operationalStock: true },
    });

    if (movements.length === 0) {
      return NextResponse.json({ success: true, message: "Tidak ada riwayat mutasi yang perlu dihapus" });
    }

    await prisma.$transaction(async (tx) => {
      // Aggregate stock adjustments in memory
      const stockAdjustments: Record<
        string,
        {
          id: string;
          initialStockDelta: number;
          stockInDelta: number;
          stockOutDelta: number;
          quantityDelta: number;
        }
      > = {};

      for (const m of movements) {
        const stock = m.operationalStock;
        if (!stock) continue;

        if (!stockAdjustments[stock.id]) {
          stockAdjustments[stock.id] = {
            id: stock.id,
            initialStockDelta: 0,
            stockInDelta: 0,
            stockOutDelta: 0,
            quantityDelta: 0,
          };
        }

        const adj = stockAdjustments[stock.id];

        if (m.type === "IN") {
          adj.stockInDelta -= m.quantity;
          adj.quantityDelta -= m.quantity;
        } else if (m.type === "OUT") {
          adj.stockOutDelta -= m.quantity;
          adj.quantityDelta += m.quantity;
        } else if (m.type === "ADJUSTMENT") {
          adj.initialStockDelta -= m.quantity;
          adj.quantityDelta -= m.quantity;
        }
      }

      // Execute aggregated updates for affected operational stocks
      for (const adj of Object.values(stockAdjustments)) {
        await tx.operationalStock.update({
          where: { id: adj.id },
          data: {
            initialStock: adj.initialStockDelta !== 0 ? { increment: adj.initialStockDelta } : undefined,
            stockIn: adj.stockInDelta !== 0 ? { increment: adj.stockInDelta } : undefined,
            stockOut: adj.stockOutDelta !== 0 ? { increment: adj.stockOutDelta } : undefined,
            quantity: adj.quantityDelta !== 0 ? { increment: adj.quantityDelta } : undefined,
          },
        });
      }

      // 2. Delete all movements in bulk
      await tx.operationalStockMovement.deleteMany({
        where: { id: { in: ids } },
      });
    });

    return NextResponse.json({
      message: ids.length > 1
        ? "Riwayat mutasi opname terpilih berhasil dihapus & stok telah disesuaikan!"
        : "Riwayat mutasi opname berhasil dihapus & stok telah disesuaikan!",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus riwayat mutasi: " + error.message },
      { status: 500 }
    );
  }
}
