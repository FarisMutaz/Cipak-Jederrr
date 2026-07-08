import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// GET /api/settings/backup - Export database as JSON
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden: Developer access only" }, { status: 403 });
  }

  try {
    const roles = await prisma.role.findMany();
    const users = await prisma.user.findMany();
    const outlets = await prisma.outlet.findMany();
    const userOutlets = await prisma.userOutlet.findMany();
    const categories = await prisma.category.findMany();
    const products = await prisma.product.findMany();
    const stocks = await prisma.stock.findMany();
    const stockMovements = await prisma.stockMovement.findMany();
    const transactions = await prisma.transaction.findMany();
    const transactionItems = await prisma.transactionItem.findMany();
    const shoppingLists = await prisma.shoppingList.findMany();
    const expenses = await prisma.expense.findMany();
    const revenues = await prisma.revenue.findMany();
    const settings = await prisma.setting.findMany();

    const backupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      data: {
        roles,
        users,
        outlets,
        userOutlets,
        categories,
        products,
        stocks,
        stockMovements,
        transactions,
        transactionItems,
        shoppingLists,
        expenses,
        revenues,
        settings,
      },
    };

    return NextResponse.json(backupData);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal membuat cadangan database: " + error.message },
      { status: 500 }
    );
  }
}

// POST /api/settings/backup - Restore database from JSON
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden: Developer access only" }, { status: 403 });
  }

  try {
    const payload = await req.json();
    const { version, data } = payload;

    if (!data || !version) {
      return NextResponse.json({ error: "Format file cadangan tidak valid" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete in reverse dependency order
      await tx.auditLog.deleteMany({});
      await tx.stockMovement.deleteMany({});
      await tx.transactionItem.deleteMany({});
      await tx.revenue.deleteMany({});
      await tx.expense.deleteMany({});
      await tx.transaction.deleteMany({});
      await tx.shoppingList.deleteMany({});
      await tx.stock.deleteMany({});
      await tx.product.deleteMany({});
      await tx.userOutlet.deleteMany({});
      await tx.user.deleteMany({});
      await tx.role.deleteMany({});
      await tx.category.deleteMany({});
      await tx.outlet.deleteMany({});
      await tx.setting.deleteMany({});

      // 2. Restore in dependency order
      // Settings
      if (data.settings?.length > 0) {
        await tx.setting.createMany({ data: data.settings });
      }
      // Outlets
      if (data.outlets?.length > 0) {
        await tx.outlet.createMany({ data: data.outlets });
      }
      // Categories
      if (data.categories?.length > 0) {
        await tx.category.createMany({ data: data.categories });
      }
      // Roles
      if (data.roles?.length > 0) {
        await tx.role.createMany({ data: data.roles });
      }
      // Users
      if (data.users?.length > 0) {
        await tx.user.createMany({ data: data.users });
      }
      // UserOutlets
      if (data.userOutlets?.length > 0) {
        await tx.userOutlet.createMany({ data: data.userOutlets });
      }
      // Products
      if (data.products?.length > 0) {
        await tx.product.createMany({ data: data.products });
      }
      // Stocks
      if (data.stocks?.length > 0) {
        await tx.stock.createMany({ data: data.stocks });
      }
      // Stock Movements
      if (data.stockMovements?.length > 0) {
        await tx.stockMovement.createMany({ data: data.stockMovements });
      }
      // Shopping Lists
      if (data.shoppingLists?.length > 0) {
        await tx.shoppingList.createMany({ data: data.shoppingLists });
      }
      // Expenses
      if (data.expenses?.length > 0) {
        await tx.expense.createMany({ data: data.expenses });
      }
      // Transactions
      if (data.transactions?.length > 0) {
        await tx.transaction.createMany({ data: data.transactions });
      }
      // Transaction Items
      if (data.transactionItems?.length > 0) {
        await tx.transactionItem.createMany({ data: data.transactionItems });
      }
      // Revenues
      if (data.revenues?.length > 0) {
        await tx.revenue.createMany({ data: data.revenues });
      }
    });

    return NextResponse.json({ success: true, message: "Database berhasil dipulihkan!" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memulihkan database: " + error.message },
      { status: 500 }
    );
  }
}
