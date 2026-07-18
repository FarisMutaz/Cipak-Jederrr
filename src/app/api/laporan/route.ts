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
  const dateStr = searchParams.get("date"); // YYYY-MM-DD
  const startDateStr = searchParams.get("startDate") || dateStr;
  const endDateStr = searchParams.get("endDate") || dateStr;

  if (!outletId || !startDateStr || !endDateStr) {
    return NextResponse.json({ error: "Outlet ID dan Tanggal harus ditentukan" }, { status: 400 });
  }

  const user = session.user as any;
  const userRole = user.role;
  const userOutlets = user.outlets || [];

  let outletIds: string[] = [];

  if (outletId === "ALL") {
    // Only DEVELOPER and OWNER can query ALL outlets
    if (userRole !== "DEVELOPER" && userRole !== "OWNER") {
      return NextResponse.json({ error: "Forbidden: Pilihan semua outlet hanya tersedia untuk Owner dan Developer" }, { status: 403 });
    }
    const allOutlets = await prisma.outlet.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true }
    });
    outletIds = allOutlets.map(o => o.id);
  } else {
    // Specific outletId scoping check
    if (userRole !== "DEVELOPER" && userRole !== "OWNER") {
      const hasAccess = userOutlets.some((o: any) => o.id === outletId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden: Scoped outlet access only" }, { status: 403 });
      }
    }
    outletIds = [outletId];
  }

  const startOfDay = new Date(startDateStr);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(endDateStr);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    let outletName = "Gabungan Outlet";
    let outletAddress = "";

    if (outletIds.length === 1) {
      const outlet = await prisma.outlet.findUnique({
        where: { id: outletIds[0] },
        select: { name: true, address: true },
      });
      if (!outlet) {
        return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
      }
      outletName = outlet.name;
      outletAddress = outlet.address || "";
    } else {
      outletName = "Semua Outlet";
      outletAddress = "-";
    }

    // Fetch Report Session Status (only if single outlet and single day is selected)
    let sessionInfo: {
      status: string;
      openedAt: Date | null;
      openedBy: string | null;
      closedAt: Date | null;
      closedBy: string | null;
    } = {
      status: "AKUMULASI",
      openedAt: null,
      openedBy: null,
      closedAt: null,
      closedBy: null,
    };

    if (outletIds.length === 1 && startDateStr === endDateStr) {
      const reportSession = await prisma.dailyReportSession.findUnique({
        where: {
          outletId_date: {
            outletId: outletIds[0],
            date: startDateStr,
          },
        },
        include: {
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
        },
      });

      sessionInfo = {
        status: reportSession?.status || "NOT_OPENED",
        openedAt: reportSession?.openedAt || null,
        openedBy: reportSession?.openedBy?.name || null,
        closedAt: reportSession?.closedAt || null,
        closedBy: reportSession?.closedBy?.name || null,
      };
    }

    // 1. Fetch transactions in range
    const transactions = await prisma.transaction.findMany({
      where: {
        outletId: { in: outletIds },
        createdAt: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
      },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    // 2. Fetch expenses in range
    const expenses = await prisma.expense.findMany({
      where: {
        outletId: { in: outletIds },
        date: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
      },
    });

    // 3. Fetch Parent Stocks for all selected outlets
    const stocks = await prisma.stock.findMany({
      where: {
        outletId: { in: outletIds },
        deletedAt: null,
        product: {
          deletedAt: null,
          linkedProductId: null,
          linkedProductId2: null,
        },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: [
        { product: { sortOrder: "asc" } },
        { product: { name: "asc" } },
      ],
    });

    // Group and aggregate stocks by product ID
    const aggregatedStocksMap: Record<string, {
      product: any;
      initialStock: number;
      stockIn: number;
      stockOut: number;
      quantity: number;
    }> = {};

    for (const stockItem of stocks) {
      const pId = stockItem.productId;
      if (!aggregatedStocksMap[pId]) {
        aggregatedStocksMap[pId] = {
          product: stockItem.product,
          initialStock: 0,
          stockIn: 0,
          stockOut: 0,
          quantity: 0,
        };
      }
      aggregatedStocksMap[pId].initialStock += stockItem.initialStock || 0;
      aggregatedStocksMap[pId].stockIn += stockItem.stockIn || 0;
      aggregatedStocksMap[pId].stockOut += stockItem.stockOut || 0;
      aggregatedStocksMap[pId].quantity += stockItem.quantity || 0;
    }

    // Sort the aggregated list to match the original ordering
    const aggregatedStocks = Object.values(aggregatedStocksMap).sort((a, b) => {
      const orderDiff = (a.product.sortOrder || 0) - (b.product.sortOrder || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.product.name.localeCompare(b.product.name);
    });

    // Process table data
    const cipakTable: any[] = [];
    const addonTable: any[] = [];

    let c3 = 0; // Total Sisa Cipak
    let c4 = 0; // Total Sisa Add-on
    let d3 = 0; // Total Jual Cipak
    let d4 = 0; // Total Jual Add-on
    let e3 = 0; // Total Penjualan (e1 + e2)
    let h1 = 0; // Total Bawa Cipak (a1 + b1)
    let h2 = 0; // Total Bawa Add-on (a2 + b2)
    let totalJualGaji = 0;

    for (const stockItem of aggregatedStocks) {
      const product = stockItem.product;
      const stock = stockItem.initialStock;
      const restock = stockItem.stockIn - stockItem.stockOut;
      const sisa = stockItem.quantity;

      // Calculate sold quantity from transactions in range
      let jual = 0;

      for (const t of transactions) {
        for (const item of t.items) {
          if (item.product.linkedProductId === product.id) {
            jual += item.quantity * (item.product.stockDeductionQty || 1);
          }
          if (item.product.linkedProductId2 === product.id) {
            jual += item.quantity * (item.product.stockDeductionQty2 || 1);
          }
          if (!item.product.linkedProductId && !item.product.linkedProductId2 && item.productId === product.id) {
            jual += item.quantity;
          }
        }
      }

      // Apply price overrides matching Excel formulas
      const PRICE_OVERRIDES: Record<string, number> = {
        "cipak koceak": 5000,
        "cirambay": 5000,
        "cimol bojot": 5000,
        "cimol keju": 5000,
        "cimol isi keju": 5000,
        "kuah creamy": 5000,
        "chili oil": 2000,
        "bojot": 3000,
      };

      const lowerName = product.name.toLowerCase();
      let price = product.sellingPrice;
      for (const [key, val] of Object.entries(PRICE_OVERRIDES)) {
        if (lowerName === key || lowerName.includes(key)) {
          price = val;
          break;
        }
      }

      const jumlah = jual * price;

      const itemData = {
        id: product.id,
        name: product.name,
        category: product.category.name,
        stock,
        restock,
        sisa,
        jual,
        price,
        jumlah,
      };

      const isGajiItem =
        lowerName.includes("cimol bojot") ||
        lowerName.includes("cipak koceak") ||
        lowerName.includes("cirambay") ||
        lowerName.includes("cimol isi keju") ||
        lowerName.includes("kuah creamy");

      if (isGajiItem) {
        totalJualGaji += jual;
      }

      const isCipakCimol =
        lowerName.includes("cipak") ||
        lowerName.includes("cimol") ||
        lowerName.includes("cirambay") ||
        product.category.name === "Cimol Isi" ||
        product.category.name === "Cipak Ori";

      if (isCipakCimol) {
        cipakTable.push(itemData);
        c3 += sisa;
        d3 += jual;
        h1 += (stock + restock);
      } else {
        addonTable.push(itemData);
        c4 += sisa;
        d4 += jual;
        h2 += (stock + restock);
      }

      e3 += jumlah;
    }

    // Calculations for Proyeksi Keuangan
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayCount = Math.max(1, Math.round((endOfDay.getTime() - startOfDay.getTime()) / msPerDay));
    const outletCount = outletIds.length;
    const scaleFactor = dayCount * outletCount;

    // Scale employee salary & bonus limit based on dayCount * outletCount
    const baseSalary = 70000 * scaleFactor;
    const bonusGaji = Math.max(0, totalJualGaji - (60 * scaleFactor)) * 1000;
    const f1 = baseSalary + bonusGaji;
    const f2 = d3 * 1250;
    const f3 = (d3 + d4) * 1500;

    // Calculations for Finance Summary
    let g1 = 0; // GrabFood
    let g2 = 0; // Qris

    for (const t of transactions) {
      if (t.paymentMethod === "GRABFOOD") {
        g1 += t.total;
      } else if (t.paymentMethod === "QRIS") {
        g2 += t.total;
      }
    }

    const g3 = baseSalary;
    const g4 = expenses.reduce((sum, e) => sum + e.amount, 0);
    const g5 = e3 - g1 - g2 - g3 - g4;

    const expensesTable = expenses.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      amount: e.amount,
    }));

    return NextResponse.json({
      outletName,
      outletAddress,
      startDate: startDateStr,
      endDate: endDateStr,
      sessionInfo,
      cipakTable,
      addonTable,
      totals: {
        c3,
        c4,
        d3,
        d4,
        e3,
        h1,
        h2,
      },
      proyeksi: {
        f1,
        f2,
        f3,
      },
      finance: {
        g1,
        g2,
        g3,
        g4,
        g5,
      },
      expensesTable,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memproses laporan: " + error.message },
      { status: 500 }
    );
  }
}
