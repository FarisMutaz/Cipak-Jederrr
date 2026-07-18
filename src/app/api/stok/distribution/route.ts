import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// GET /api/stok/distribution - Fetch products, outlets, and current stock quantities (sisa kemarin)
export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER" && user.role !== "KOORLAP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Self-healing: Ensure all active independent products have stock records for all active outlets
    const activeProducts = await prisma.product.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        linkedProductId: null,
        linkedProductId2: null,
        operationalStocks: {
          none: {},
        },
      },
      select: { id: true },
    });

    const activeOutlets = await prisma.outlet.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    });

    const existingStocks = await prisma.stock.findMany({
      where: { deletedAt: null },
      select: { productId: true, outletId: true },
    });

    const stockSet = new Set(existingStocks.map((s) => `${s.productId}_${s.outletId}`));
    const missingStocksData = [];

    for (const o of activeOutlets) {
      for (const p of activeProducts) {
        if (!stockSet.has(`${p.id}_${o.id}`)) {
          missingStocksData.push({
            productId: p.id,
            outletId: o.id,
            initialStock: 0,
            quantity: 0,
            minStock: 5,
          });
        }
      }
    }

    if (missingStocksData.length > 0) {
      await prisma.stock.createMany({
        data: missingStocksData,
        skipDuplicates: true,
      });
    }

    const whereClause: any = { deletedAt: null, status: "ACTIVE" };
    if (user.role === "KOORLAP") {
      const userOutlets = await prisma.userOutlet.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { outletId: true }
      });
      const assignedOutletIds = userOutlets.map(uo => uo.outletId);
      whereClause.id = { in: assignedOutletIds };
    }

    const outlets = await prisma.outlet.findMany({
      where: whereClause,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const stocksWhere: any = {
      deletedAt: null,
      product: {
        deletedAt: null,
        linkedProductId: null,
        linkedProductId2: null,
        operationalStocks: {
          none: {},
        },
      },
    };

    if (user.role === "KOORLAP") {
      const userOutlets = await prisma.userOutlet.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { outletId: true }
      });
      const assignedOutletIds = userOutlets.map(uo => uo.outletId);
      stocksWhere.outletId = { in: assignedOutletIds };
    }

    const stocks = await prisma.stock.findMany({
      where: stocksWhere,
      include: {
        product: {
          include: { category: true },
        },
      },
    });

    // Group stocks by product
    const productMap: Record<string, any> = {};

    for (const s of stocks) {
      if (!productMap[s.productId]) {
        productMap[s.productId] = {
          id: s.product.id,
          name: s.product.name,
          sku: s.product.sku,
          category: s.product.category.name,
          stocks: {},
          stockIds: {},
        };
      }
      productMap[s.productId].stocks[s.outletId] = s.quantity;
      productMap[s.productId].stockIds[s.outletId] = s.id;
    }

    const products = Object.values(productMap);

    return NextResponse.json({ outlets, products });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/stok/distribution - Save stock distribution and returns
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
    const { distributions } = body; // Array of { productId, retur, outlets: { [outletId]: qty } }

    if (!distributions || !Array.isArray(distributions)) {
      return NextResponse.json({ error: "Data distribusi tidak valid" }, { status: 400 });
    }

    // Get assigned outlet ids for Koorlap
    let assignedOutletIds: string[] = [];
    if (user.role === "KOORLAP") {
      const userOutlets = await prisma.userOutlet.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { outletId: true }
      });
      assignedOutletIds = userOutlets.map(uo => uo.outletId);
    }

    const result = await prisma.$transaction(async (tx) => {
      const logs = [];

      for (const dist of distributions) {
        const { productId, retur = 0, outlets = {} } = dist;

        // Verify Koorlap is not modifying unauthorized outlets
        if (user.role === "KOORLAP") {
          const unauthorizedOutlets = Object.keys(outlets).filter(
            (oId) => !assignedOutletIds.includes(oId)
          );
          if (unauthorizedOutlets.length > 0) {
            throw new Error("Anda tidak memiliki akses ke satu atau lebih outlet yang dikirimkan.");
          }
        }

        // 1. Fetch current stocks for this product to calculate total sisa
        const currentStocksWhere: any = { productId, deletedAt: null };
        if (user.role === "KOORLAP") {
          currentStocksWhere.outletId = { in: assignedOutletIds };
        }

        const currentStocks = await tx.stock.findMany({
          where: currentStocksWhere,
          include: { product: true, outlet: true },
        });

        if (currentStocks.length === 0) {
          continue; // Skip products not associated with this Koorlap's outlets
        }

        const productName = currentStocks[0].product.name;
        const totalSisa = currentStocks.reduce((sum, s) => sum + s.quantity, 0);

        let totalDistributed = 0;
        for (const qty of Object.values(outlets)) {
          totalDistributed += Number(qty);
        }

        // Validate formula: Sisa = Distribusi + Retur
        if (totalSisa !== totalDistributed + Number(retur)) {
          throw new Error(
            `FRAUD TERDETEKSI: Terdapat ${Math.abs(totalSisa - totalDistributed - Number(retur))} pcs stok ${productName} yang tidak memiliki catatan distribusi maupun retur.`
          );
        }

        // 2. Perform updates and audit logs
        for (const stockRecord of currentStocks) {
          const distributedQty = Number(outlets[stockRecord.outletId] || 0);
          const oldQuantity = stockRecord.quantity;

          // Update stock counters
          await tx.stock.update({
            where: { id: stockRecord.id },
            data: {
              initialStock: distributedQty,
              stockIn: 0,
              stockOut: 0,
              sold: 0,
              quantity: distributedQty,
            },
          });

          // Log yesterday's ending balance (Sisa)
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "SISA_STOK",
              table: "stocks",
              recordId: stockRecord.id,
              details: JSON.stringify({
                productName,
                productId,
                outletName: stockRecord.outlet.name,
                outletId: stockRecord.outletId,
                amount: oldQuantity,
                notes: "Pencatatan sisa stok akhir hari",
              }),
            },
          });

          // Log today's distribution if distributedQty > 0
          if (distributedQty > 0) {
            await tx.auditLog.create({
              data: {
                userId: user.id,
                action: "DISTRIBUTION",
                table: "stocks",
                recordId: stockRecord.id,
                details: JSON.stringify({
                  productName,
                  productId,
                  outletName: stockRecord.outlet.name,
                  outletId: stockRecord.outletId,
                  amount: distributedQty,
                  notes: "Distribusi stok awal hari",
                }),
              },
            });
          }
        }

        // Log Retur Gudang if retur > 0
        if (Number(retur) > 0) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "RETUR_GUDANG",
              table: "products",
              recordId: productId,
              details: JSON.stringify({
                productName,
                productId,
                amount: Number(retur),
                notes: "Pengembalian sisa stok ke gudang utama",
              }),
            },
          });
        }
      }

      // 3. Log the complete distribution run for history (Owner/Dev)
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "SAVE_DISTRIBUTION",
          table: "stocks",
          recordId: new Date().toISOString().split("T")[0],
          details: JSON.stringify({
            distributions,
            outlets: body.outlets || []
          })
        }
      });

      return { success: true };
    }, {
      timeout: 15000, // 15s timeout to prevent transaction lock issues
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Distribution transaction failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
