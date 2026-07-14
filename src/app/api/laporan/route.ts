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

  if (!outletId || !dateStr) {
    return NextResponse.json({ error: "Outlet ID dan Tanggal harus ditentukan" }, { status: 400 });
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

  const queryDate = new Date(dateStr);
  const startOfDay = new Date(queryDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(queryDate);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId },
      select: { name: true, address: true },
    });

    if (!outlet) {
      return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
    }

    // 1. Fetch transactions today
    const transactions = await prisma.transaction.findMany({
      where: {
        outletId,
        createdAt: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
      },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    // 2. Fetch expenses today
    const expenses = await prisma.expense.findMany({
      where: {
        outletId,
        date: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
      },
    });

    // 3. Fetch Parent Stocks (same as Stok Produk page query)
    const stocks = await prisma.stock.findMany({
      where: {
        outletId,
        deletedAt: null,
        product: {
          deletedAt: null,
          linkedProductId: null,
          linkedProductId2: null, // linkedProductId2
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

    for (const stockItem of stocks) {
      const product = stockItem.product;
      const stock = stockItem.initialStock || 0;
      const restock = (stockItem.stockIn || 0) - (stockItem.stockOut || 0);
      const sisa = stockItem.quantity || 0;

      // Calculate sold quantity from transactions today
      // This includes the parent product and all its variations (child products)
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

      // Apply price overrides matching gambar 2
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

      // Jumlah = Jual * Harga (as defined in Excel math)
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

      // Check if this item is in the employee salary calculation (Cimol Bojot, Cipak Koceak, Cirambay, Cimol Isi Keju, Kuah Creamy)
      const isGajiItem =
        lowerName.includes("cimol bojot") ||
        lowerName.includes("cipak koceak") ||
        lowerName.includes("cirambay") ||
        lowerName.includes("cimol isi keju") ||
        lowerName.includes("kuah creamy");

      if (isGajiItem) {
        totalJualGaji += jual;
      }

      // Classification:
      // Category 1 (Cipak/Cimol): Name contains "cipak", "cimol", "cirambay", or category name is "Cimol Isi"/"Cipak Ori"
      // Category 2 (Add-on): Other products (like "Tambahan" or containing "Kuah", "Chili Oil", "Bojot", etc.)
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
    // F1 = Gaji Karyawan: 70000 base, plus 1000 per porsi bonus if total > 60 porsi
    const bonusGaji = Math.max(0, totalJualGaji - 60) * 1000;
    const f1 = 70000 + bonusGaji;
    // F2 = d3 * 1250
    const f2 = d3 * 1250;
    // F3 = (d3 + d4) * 1500
    const f3 = (d3 + d4) * 1500;

    // Calculations for Finance Summary
    // G1 = Total GrabFood
    let g1 = 0;
    // G2 = Total Qris
    let g2 = 0;

    for (const t of transactions) {
      if (t.paymentMethod === "GRABFOOD") {
        g1 += t.total;
      } else if (t.paymentMethod === "QRIS") {
        g2 += t.total;
      }
    }

    // G3 = Gaji Pokok (Fixed component of F1)
    const g3 = 70000;

    // G4 = Total Operasional (Sum of expenses today)
    const g4 = expenses.reduce((sum, e) => sum + e.amount, 0);

    // G5 = Total Cash (Penjualan - Grab - Qris - Gaji Pokok - Operasional)
    const g5 = e3 - g1 - g2 - g3 - g4;

    const expensesTable = expenses.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      amount: e.amount,
    }));

    return NextResponse.json({
      outletName: outlet.name,
      outletAddress: outlet.address,
      date: dateStr,
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
