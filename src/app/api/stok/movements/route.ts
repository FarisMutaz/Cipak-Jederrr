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
    // 1. Fetch active stocks for this outlet to get product mapping and valid stock IDs
    const stocks = await prisma.stock.findMany({
      where: {
        outletId,
        deletedAt: null,
      },
      include: {
        product: true,
      },
    });

    const stockIds = stocks.map((s) => s.id);
    const stockMap = new Map(stocks.map((s) => [s.id, s.product]));

    // 2. Fetch audit logs for these stocks (representing manual adjustments)
    const logs = await prisma.auditLog.findMany({
      where: {
        table: "stocks",
        action: "UPDATE",
        recordId: { in: stockIds },
      },
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    // 3. Map audit logs to formatted output
    const formatted = logs.map((log) => {
      let details: any = {};
      if (log.details && typeof log.details === "object") {
        details = log.details;
      } else if (log.details && typeof log.details === "string") {
        try {
          details = JSON.parse(log.details);
        } catch (e) {}
      }

      const product = stockMap.get(log.recordId);

      return {
        id: log.id,
        productName: product?.name || "Produk tidak diketahui",
        sku: product?.sku || "",
        type: details.type || "ADJUSTMENT",
        quantity: details.logQty || 0,
        notes: details.notes || "",
        createdAt: log.createdAt,
        userName: log.user?.name || "Sistem",
      };
    });

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
  if (user.role !== "DEVELOPER" && user.role !== "OWNER" && user.role !== "KOORLAP") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const batchId = searchParams.get("batchId");

  if (!id && !batchId) {
    return NextResponse.json({ error: "Movement ID atau Batch ID harus ditentukan" }, { status: 400 });
  }

  try {
    let logs = [];
    if (batchId) {
      // Find all stock update logs for this batch
      const updateLogs = await prisma.auditLog.findMany({
        where: {
          table: "stocks",
          action: "UPDATE",
          details: {
            path: ["batchId"],
            equals: batchId,
          },
        },
      });

      // Also find the main SAVE_STOCK_ADJUSTMENT log
      const runLog = await prisma.auditLog.findFirst({
        where: {
          action: "SAVE_STOCK_ADJUSTMENT",
          recordId: batchId,
        },
      });

      logs = [...updateLogs];
      if (runLog) {
        logs.push(runLog);
      }
    } else {
      const ids = id!.split(",");
      logs = await prisma.auditLog.findMany({
        where: {
          id: { in: ids },
          table: "stocks",
        },
      });
    }

    if (logs.length === 0) {
      return NextResponse.json({ success: true, message: "Tidak ada riwayat mutasi yang perlu dihapus" });
    }

    await prisma.$transaction(async (tx) => {
      // Aggregate stock adjustments in memory to run minimal DB updates
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

      for (const log of logs) {
        if (log.action === "SAVE_STOCK_ADJUSTMENT") {
          continue; // Skip processing reversion for the run log itself
        }
        const stockId = log.recordId;
        let details: any = {};
        if (log.details && typeof log.details === "object") {
          details = log.details;
        } else if (log.details && typeof log.details === "string") {
          try {
            details = JSON.parse(log.details);
          } catch (e) {}
        }

        const logQty = details.logQty || 0;
        const type = details.type;
        const oldQty = details.oldQty || 0;
        const nextQty = details.nextQty || 0;

        if (!stockAdjustments[stockId]) {
          stockAdjustments[stockId] = {
            id: stockId,
            initialStockDelta: 0,
            stockInDelta: 0,
            stockOutDelta: 0,
            quantityDelta: 0,
          };
        }

        const adj = stockAdjustments[stockId];

        // Quantity delta is ALWAYS: oldQty - nextQty (reverting it back to the state before adjustment)
        adj.quantityDelta += (oldQty - nextQty);

        if (type === "IN") {
          adj.stockInDelta -= logQty;
        } else if (type === "OUT") {
          adj.stockOutDelta -= logQty;
        } else if (type === "INITIAL") {
          const oldInitialStock = details.oldInitialStock || 0;
          const nextInitialStock = details.nextInitialStock || 0;
          adj.initialStockDelta += (oldInitialStock - nextInitialStock);
        }
      }

      // Execute aggregated updates for affected stocks
      for (const adj of Object.values(stockAdjustments)) {
        await tx.stock.update({
          where: { id: adj.id },
          data: {
            initialStock: adj.initialStockDelta !== 0 ? { increment: adj.initialStockDelta } : undefined,
            stockIn: adj.stockInDelta !== 0 ? { increment: adj.stockInDelta } : undefined,
            stockOut: adj.stockOutDelta !== 0 ? { increment: adj.stockOutDelta } : undefined,
            quantity: adj.quantityDelta !== 0 ? { increment: adj.quantityDelta } : undefined,
          },
        });
      }

      // 2. Delete audit logs in bulk
      const idsToDelete = logs.map((log) => log.id);
      await tx.auditLog.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    });

    return NextResponse.json({
      message: batchId
        ? "Riwayat input stok berhasil dihapus & stok telah disesuaikan!"
        : logs.length > 1
        ? "Riwayat mutasi terpilih berhasil dihapus & stok telah disesuaikan!"
        : "Riwayat mutasi berhasil dihapus & stok telah disesuaikan!",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus riwayat mutasi: " + error.message },
      { status: 500 }
    );
  }
}
