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
    const movements = await prisma.stockMovement.findMany({
      where: {
        stock: {
          outletId,
          deletedAt: null,
        },
      },
      include: {
        stock: {
          include: {
            product: true,
          },
        },
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
      productName: m.stock.product.name,
      sku: m.stock.product.sku,
      type: m.type, // IN, OUT, ADJUSTMENT
      quantity: m.quantity,
      notes: m.notes,
      createdAt: m.createdAt,
      userName: m.user?.name || "Sistem",
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat log riwayat stok: " + error.message },
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
  const movementId = searchParams.get("id");

  if (!movementId) {
    return NextResponse.json({ error: "Movement ID harus ditentukan" }, { status: 400 });
  }

  try {
    // Find the movement first
    const movement = await prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: { stock: true },
    });

    if (!movement) {
      return NextResponse.json({ error: "Riwayat mutasi tidak ditemukan" }, { status: 404 });
    }

    // Reverse the stock effect
    const stock = movement.stock;
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
      // Was a set initial stock adjustment — recalculate
      // For ADJUSTMENT/INITIAL, the movement.quantity IS the new initial stock that was set
      // We need to subtract this from initialStock and recalculate quantity
      const currentInitial = stock.initialStock;
      const newInitial = currentInitial - movement.quantity;
      updateData = {
        initialStock: newInitial,
        quantity: { decrement: movement.quantity },
      };
    }

    // Execute in transaction
    await prisma.$transaction([
      prisma.stock.update({
        where: { id: stock.id },
        data: updateData,
      }),
      prisma.stockMovement.delete({
        where: { id: movementId },
      }),
    ]);

    return NextResponse.json({ message: "Riwayat mutasi berhasil dihapus & stok telah disesuaikan!" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus riwayat mutasi: " + error.message },
      { status: 500 }
    );
  }
}
