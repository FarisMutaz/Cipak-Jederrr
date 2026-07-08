import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// GET /api/products - List products (optionally scoped by outlet stock)
export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const outletId = searchParams.get("outletId");
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    const whereCondition: any = { deletedAt: null };
    if (!includeInactive) {
      whereCondition.status = "ACTIVE";
    }

        const products = await prisma.product.findMany({
      where: whereCondition,
      include: {
        category: true,
        stocks: outletId ? { where: { outletId, deletedAt: null } } : false,
        linkedProduct: {
          include: {
            stocks: outletId ? { where: { outletId, deletedAt: null } } : false,
          },
        },
        linkedProduct2: {
          include: {
            stocks: outletId ? { where: { outletId, deletedAt: null } } : false,
          },
        },
        operationalStocks: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    let operationalStocks: any[] = [];
    if (outletId) {
      operationalStocks = await prisma.operationalStock.findMany({
        where: { outletId, deletedAt: null },
      });
    }

    // Format output to include stock inline
    const formatted = products.map((p) => {
      const linkedStocks: number[] = [];

      if (p.linkedProductId && p.linkedProduct) {
        const linkedStockObj = p.linkedProduct.stocks?.[0];
        const rawStock = linkedStockObj ? linkedStockObj.quantity : 0;
        linkedStocks.push(Math.floor(rawStock / (p.stockDeductionQty || 1)));
      }
      
      if (p.linkedProductId2 && p.linkedProduct2) {
        const linkedStockObj2 = p.linkedProduct2.stocks?.[0];
        const rawStock2 = linkedStockObj2 ? linkedStockObj2.quantity : 0;
        linkedStocks.push(Math.floor(rawStock2 / (p.stockDeductionQty2 || 1)));
      }

      let stockQty = 0;
      if (linkedStocks.length > 0) {
        stockQty = Math.min(...linkedStocks);
      } else if (p.operationalStocks && p.operationalStocks.length > 0) {
        let minStock = Infinity;
        for (const opStockLink of p.operationalStocks) {
          const opStockObj = operationalStocks.find((os) => os.name === opStockLink.operationalStockName);
          const rawStock = opStockObj ? opStockObj.quantity : 0;
          const possibleQty = Math.floor(rawStock / (opStockLink.deductionQty || 1));
          if (possibleQty < minStock) {
            minStock = possibleQty;
          }
        }
        stockQty = minStock === Infinity ? 0 : minStock;
      } else {
        const stockObj = p.stocks?.[0];
        stockQty = stockObj ? stockObj.quantity : 0;
      }

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        sellingPrice: p.sellingPrice,
        basePrice: p.basePrice,
        image: p.image,
        status: p.status,
        sortOrder: p.sortOrder,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        stock: stockQty,
        linkedProductId: p.linkedProductId,
        linkedProductName: p.linkedProduct?.name || null,
        linkedProductId2: p.linkedProductId2,
        linkedProductName2: p.linkedProduct2?.name || null,
        operationalStocks: p.operationalStocks,
        stockDeductionQty: p.stockDeductionQty,
        stockDeductionQty2: p.stockDeductionQty2,
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat produk: " + error.message },
      { status: 500 }
    );
  }
}

// POST /api/products - Create a new product (Owner & Developer only)
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
        const body = await req.json();
    const { name, categoryId, sku, barcode, sellingPrice, basePrice, status, linkedProductId, linkedProductId2, operationalStocks, stockDeductionQty, stockDeductionQty2 } = body;

    if (!name || !categoryId || !sku || !sellingPrice || !basePrice) {
      return NextResponse.json({ error: "Kolom wajib harus diisi" }, { status: 400 });
    }

    // Check SKU unique
    const existing = await prisma.product.findFirst({
      where: { sku, deletedAt: null },
    });
    if (existing) {
      return NextResponse.json({ error: "SKU produk sudah digunakan" }, { status: 400 });
    }

    // Determine next sortOrder
    const maxOrderResult = await prisma.product.aggregate({
      _max: { sortOrder: true },
      where: { deletedAt: null },
    });
    const nextSortOrder = (maxOrderResult._max.sortOrder ?? 0) + 1;

    const product = await prisma.product.create({
      data: {
        name,
        categoryId,
        sku,
        barcode: barcode || null,
        sellingPrice: parseFloat(sellingPrice),
        basePrice: parseFloat(basePrice),
        status: status || "ACTIVE",
        sortOrder: nextSortOrder,
        linkedProductId: linkedProductId || null,
        stockDeductionQty: stockDeductionQty ? parseInt(stockDeductionQty) : 1,
        linkedProductId2: linkedProductId2 || null,
        stockDeductionQty2: stockDeductionQty2 ? parseInt(stockDeductionQty2) : 1,
        operationalStocks: {
          create: (operationalStocks || []).map((os: any) => ({
            operationalStockName: os.name,
            deductionQty: parseFloat(os.deductionQty || 1),
          })),
        },
      },
    });

    const hasOpStocks = operationalStocks && operationalStocks.length > 0;

    // Automatically initialize stock = 0 for all outlets (ONLY if it is NOT a linked product or recipe product)
    if (!linkedProductId && !linkedProductId2 && !hasOpStocks) {
      const outlets = await prisma.outlet.findMany({ where: { deletedAt: null } });
      for (const o of outlets) {
        await prisma.stock.create({
          data: {
            productId: product.id,
            outletId: o.id,
            initialStock: 0,
            quantity: 0,
            minStock: 5,
          },
        });
      }
    }

    // Log Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        table: "products",
        recordId: product.id,
        details: JSON.stringify({ name, sku, linkedProductId, linkedProductId2, operationalStocksCount: (operationalStocks || []).length, stockDeductionQty, stockDeductionQty2 }),
      },
    });

    return NextResponse.json(product);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal membuat produk: " + error.message },
      { status: 500 }
    );
  }
}
