import "dotenv/config";
import { PrismaClient, RoleName, PaymentMethod, StockMovementType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

import { parse } from "pg-connection-string";

const connectionString = process.env.DATABASE_URL || "";
const parsedConfig = parse(connectionString);
const pool = new pg.Pool({
  ...parsedConfig,
  ssl: connectionString.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting Database Seeding...");

  // Clear existing data in correct dependency order
  console.log("🧹 Clearing old database records...");
  await prisma.revenue.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.shoppingList.deleteMany({});
  await prisma.transactionItem.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.stock.deleteMany({});
  await prisma.operationalStockMovement.deleteMany({});
  await prisma.operationalStock.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.userOutlet.deleteMany({});
  await prisma.setting.deleteMany({});

  // 1. Seed Roles
  const rolesData = [
    { name: RoleName.DEVELOPER, description: "Full system access & settings configuration" },
    { name: RoleName.OWNER, description: "Business owner. Full access except system configurations" },
    { name: RoleName.KOORLAP, description: "Koordinator Lapangan access scoped to assigned outlets" },
    { name: RoleName.KASIR, description: "Cashier access scoped to a single outlet" },
  ];

  const roles: Record<RoleName, any> = {} as any;
  for (const r of rolesData) {
    roles[r.name] = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
  }
  console.log("✅ Roles seeded");

  // 2. Seed Outlets
  const outletsData = [
    { name: "Cideng", address: "Jl. Cideng Barat No. 25, Jakarta Pusat", phone: "08123456789", email: "cideng@cipak.com" },
    { name: "Cipondoh", address: "Jl. Cipondoh Raya No. 10, Tangerang", phone: "08123456780", email: "cipondoh@cipak.com" },
    { name: "Bekasi", address: "Jl. Bekasi Timur No. 4, Bekasi", phone: "08123456781", email: "bekasi@cipak.com" },
    { name: "Depok", address: "Jl. Margonda Raya No. 2, Depok", phone: "08123456782", email: "depok@cipak.com" },
    { name: "Tangerang", address: "Jl. Daan Mogot No. 55, Tangerang", phone: "08123456783", email: "tangerang@cipak.com" },
  ];

  const outlets = [];
  for (const o of outletsData) {
    const outlet = await prisma.outlet.upsert({
      where: { name: o.name },
      update: { address: o.address, phone: o.phone, email: o.email },
      create: { name: o.name, address: o.address, phone: o.phone, email: o.email },
    });
    outlets.push(outlet);
  }
  console.log("✅ Outlets seeded");

  const [cideng, cipondoh, bekasi, depok, tangerang] = outlets;

  // 3. Seed Users
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const usersData = [
    { username: "dev", name: "Admin Developer", roleName: RoleName.DEVELOPER, status: "ACTIVE" },
    { username: "owner", name: "Boss Owner", roleName: RoleName.OWNER, status: "ACTIVE" },
    { username: "koorlap1", name: "Koorlap Cideng & Cipondoh", roleName: RoleName.KOORLAP, status: "ACTIVE" },
    { username: "koorlap2", name: "Koorlap Bekasi & Depok", roleName: RoleName.KOORLAP, status: "ACTIVE" },
    { username: "kasir1", name: "Kasir 1 Cideng", roleName: RoleName.KASIR, status: "ACTIVE" },
    { username: "kasir2", name: "Kasir 2 Cideng", roleName: RoleName.KASIR, status: "ACTIVE" },
    { username: "kasir3", name: "Kasir 3 Bekasi", roleName: RoleName.KASIR, status: "ACTIVE" },
    { username: "kasir4", name: "Kasir 4 Cipondoh", roleName: RoleName.KASIR, status: "ACTIVE" },
  ];

  const users = [];
  for (const u of usersData) {
    const role = roles[u.roleName];
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, roleId: role.id, status: u.status },
      create: { username: u.username, name: u.name, password: passwordHash, roleId: role.id, status: u.status },
    });
    users.push(user);
  }
  console.log("✅ Users seeded");

  const [dev, owner, koorlap1, koorlap2, kasir1, kasir2, kasir3, kasir4] = users;

  // Associate Users with Outlets
  const userOutlets = [
    // Developer -> All outlets
    { userId: dev.id, outletId: cideng.id },
    { userId: dev.id, outletId: cipondoh.id },
    { userId: dev.id, outletId: tangerang.id },
    { userId: dev.id, outletId: bekasi.id },
    { userId: dev.id, outletId: depok.id },
    // Owner -> All outlets
    { userId: owner.id, outletId: cideng.id },
    { userId: owner.id, outletId: cipondoh.id },
    { userId: owner.id, outletId: tangerang.id },
    { userId: owner.id, outletId: bekasi.id },
    { userId: owner.id, outletId: depok.id },
    // Koorlap 1 -> Cideng, Cipondoh, Tangerang
    { userId: koorlap1.id, outletId: cideng.id },
    { userId: koorlap1.id, outletId: cipondoh.id },
    { userId: koorlap1.id, outletId: tangerang.id },
    // Koorlap 2 -> Bekasi, Depok
    { userId: koorlap2.id, outletId: bekasi.id },
    { userId: koorlap2.id, outletId: depok.id },
    // Cashiers
    { userId: kasir1.id, outletId: cideng.id },
    { userId: kasir2.id, outletId: cideng.id },
    { userId: kasir3.id, outletId: bekasi.id },
    { userId: kasir4.id, outletId: cipondoh.id },
  ];


  for (const uo of userOutlets) {
    await prisma.userOutlet.create({
      data: uo,
    });
  }
  console.log("✅ User-Outlet associations seeded");

  // 4. Seed Categories
  const categoriesData = [
    { name: "Cipak Ori" },
    { name: "Cimol Isi" },
    { name: "Tambahan" },
  ];

  const categories = [];
  for (const c of categoriesData) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name },
    });
    categories.push(cat);
  }
  console.log("✅ Categories seeded");

  const [cipakOriCat, cimolIsiCat, tambahanCat] = categories;

  // 5. Seed Products


  const productsInput = [
    // Cipak Koceak parent
    { name: "Cipak Koceak", sku: "SKU-CPK-001", sellingPrice: 5000, basePrice: 8000, categoryId: cipakOriCat.id, linkedProductSku: null, stockDeductionQty: 1 },
    // Cipak Koceak child 1
    { name: "Cipak Koceak", sku: "SKU-CPK-002", sellingPrice: 10000, basePrice: 100, categoryId: cipakOriCat.id, linkedProductSku: "SKU-CPK-001", stockDeductionQty: 2 },
    // Cipak Koceak child 2
    { name: "Cipak Koceak", sku: "SKU-CPK-003", sellingPrice: 15000, basePrice: 100, categoryId: cipakOriCat.id, linkedProductSku: "SKU-CPK-001", stockDeductionQty: 3 },

    // Cirambay parent
    { name: "Cirambay", sku: "SKU-CRM-001", sellingPrice: 5000, basePrice: 8000, categoryId: cipakOriCat.id, linkedProductSku: null, stockDeductionQty: 1 },
    // Cirambay child 1
    { name: "Cirambay", sku: "SKU-CRM-002", sellingPrice: 10000, basePrice: 100, categoryId: cipakOriCat.id, linkedProductSku: "SKU-CRM-001", stockDeductionQty: 2 },
    // Cirambay child 2
    { name: "Cirambay", sku: "SKU-CRM-003", sellingPrice: 15000, basePrice: 100, categoryId: cipakOriCat.id, linkedProductSku: "SKU-CRM-001", stockDeductionQty: 3 },

    // Cimol Bojot parent
    { name: "Cimol Bojot", sku: "SKU-CMB-001", sellingPrice: 5000, basePrice: 7000, categoryId: cipakOriCat.id, linkedProductSku: null, stockDeductionQty: 1 },
    // Cimol Bojot child 1
    { name: "Cimol Bojot", sku: "SKU-CMB-002", sellingPrice: 10000, basePrice: 100, categoryId: cipakOriCat.id, linkedProductSku: "SKU-CMB-001", stockDeductionQty: 2 },
    // Cimol Bojot child 2
    { name: "Cimol Bojot", sku: "SKU-CMB-003", sellingPrice: 15000, basePrice: 100, categoryId: cipakOriCat.id, linkedProductSku: "SKU-CMB-001", stockDeductionQty: 3 },

    // Cimol Isi Keju parent
    { name: "Cimol Isi Keju", sku: "SKU-CMK-001", sellingPrice: 5000, basePrice: 18000, categoryId: cimolIsiCat.id, linkedProductSku: null, stockDeductionQty: 1 },
    // Cimol Isi Keju child 1
    { name: "Cimol Isi Keju", sku: "SKU-CMK-002", sellingPrice: 10000, basePrice: 100, categoryId: cimolIsiCat.id, linkedProductSku: "SKU-CMK-001", stockDeductionQty: 2 },
    // Cimol Isi Keju child 2
    { name: "Cimol Isi Keju", sku: "SKU-CMK-003", sellingPrice: 15000, basePrice: 100, categoryId: cimolIsiCat.id, linkedProductSku: "SKU-CMK-001", stockDeductionQty: 3 },

    // Extras
    { name: "Kuah Creamy", sku: "SKU-ADD-001", sellingPrice: 5000, basePrice: 1000, categoryId: tambahanCat.id, linkedProductSku: null, stockDeductionQty: 1 },
    { name: "Chili Oil", sku: "SKU-ADD-002", sellingPrice: 3000, basePrice: 500, categoryId: tambahanCat.id, linkedProductSku: null, stockDeductionQty: 1 }
  ];

  const products: any[] = [];
  const parentProducts: Record<string, any> = {};

  // First insert parents
  for (const p of productsInput) {
    if (p.linkedProductSku === null) {
      const prod = await prisma.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          basePrice: p.basePrice,
          categoryId: p.categoryId,
          linkedProductId: null,
          stockDeductionQty: p.stockDeductionQty,
        },
      });
      products.push(prod);
      parentProducts[p.sku] = prod;
    }
  }

  // Second insert children
  for (const p of productsInput) {
    if (p.linkedProductSku !== null) {
      const parent = parentProducts[p.linkedProductSku];
      const prod = await prisma.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          basePrice: p.basePrice,
          categoryId: p.categoryId,
          linkedProductId: parent.id,
          stockDeductionQty: p.stockDeductionQty,
        },
      });
      products.push(prod);
    }
  }
  console.log("✅ Products seeded");

  // 6. Seed Stocks & Stock Movements for all Outlets (only parent products)


  for (const o of outlets) {
    for (const p of products) {
      if (p.linkedProductId !== null) continue; // Skip child products

      let initialStock = 100;
      let minStock = 5;

      const stock = await prisma.stock.create({
        data: {
          productId: p.id,
          outletId: o.id,
          initialStock: initialStock,
          stockIn: 20,
          stockOut: 10,
          sold: 0,
          quantity: initialStock + 20 - 10,
          minStock: minStock,
        },
      });

      // Stock Movement
      await prisma.stockMovement.create({
        data: {
          stockId: stock.id,
          type: StockMovementType.IN,
          quantity: initialStock + 20,
          notes: "Initial inventory seed & Restock",
          userId: dev.id,
        },
      });

      await prisma.stockMovement.create({
        data: {
          stockId: stock.id,
          type: StockMovementType.OUT,
          quantity: 10,
          notes: "Demo sales deduction",
          userId: dev.id,
        },
      });
    }
  }
  console.log("✅ Stocks and movements seeded");

  // 6b. Seed Operational Stocks (Stok Opname) for all Outlets
  console.log("🌱 Seeding Operational Stocks (Stok Opname)...");


  const opStocksData = [
    { name: "Cup 10oz", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Cup 16oz", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Cup 22oz", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Gas LPG 3kg", unit: "tabung", qtyPerUnit: 1, minStock: 1, initialStock: 2, stockIn: 0, stockOut: 1 },
    { name: "Kantong Plastik Besar", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Kantong Plastik Kecil", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Minyak Goreng", unit: "kg", qtyPerUnit: 1, minStock: 1, initialStock: 15, stockIn: 0, stockOut: 3 },
    { name: "Paper Bowl", unit: "pcs", qtyPerUnit: 20, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Plastik Cup", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Plastik Cup Double", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 15, stockIn: 0, stockOut: 5 },
    { name: "Sendok", unit: "pcs", qtyPerUnit: 50, minStock: 10, initialStock: 10, stockIn: 0, stockOut: 0 },
    { name: "Sumpit", unit: "pcs", qtyPerUnit: 10, minStock: 10, initialStock: 10, stockIn: 0, stockOut: 0 },
    { name: "Tusuk Sate", unit: "pcs", qtyPerUnit: 100, minStock: 10, initialStock: 10, stockIn: 0, stockOut: 0 },
  ];

  for (const o of outlets) {
    for (const item of opStocksData) {
      const opStock = await prisma.operationalStock.create({
        data: {
          name: item.name,
          unit: item.unit,
          qtyPerUnit: item.qtyPerUnit,
          outletId: o.id,
          initialStock: item.initialStock,
          stockIn: item.stockIn,
          stockOut: item.stockOut,
          quantity: item.initialStock + item.stockIn - item.stockOut,
          minStock: item.minStock,
        },
      });

      // Stock movement logs
      // IN movement (Initial stock)
      await prisma.operationalStockMovement.create({
        data: {
          operationalStockId: opStock.id,
          type: StockMovementType.IN,
          quantity: item.initialStock,
          notes: "Stok awal (Seeding)",
          userId: dev.id,
        },
      });

      // OUT movement
      if (item.stockOut > 0) {
        await prisma.operationalStockMovement.create({
          data: {
            operationalStockId: opStock.id,
            type: StockMovementType.OUT,
            quantity: item.stockOut,
            notes: "Penggunaan operasional (Seeding)",
            userId: dev.id,
          },
        });
      }
    }
  }
  console.log("✅ Operational Stocks seeded");

  // 7. Seed Settings

  await prisma.setting.create({
    data: {
      storeName: "Cipak Jederrr! POS",
      logo: "/images/cipak-logo.png",
      phone: "0812-9876-5432",
      email: "info@cipakjederrr.com",
      address: "Jl. Cideng Barat No. 25, Jakarta Pusat",
      operatingHours: "08:00 - 22:00",
      prefixInvoice: "TRX",
      tax: 0.0,
    },
  });
  console.log("✅ Global settings seeded");

  // 8. Seed Historical Transactions


  const paymentMethods = [PaymentMethod.CASH, PaymentMethod.QRIS, PaymentMethod.GRABFOOD];
  const targetOutlets = [cideng, cipondoh, bekasi];
  let trxCounter = 1;

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    for (const o of targetOutlets) {
      const numTrxs = Math.floor(Math.random() * 3) + 2;
      for (let t = 0; t < numTrxs; t++) {
        const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
        
        const itemProds: any[] = [];
        const numItems = Math.floor(Math.random() * 3) + 1;
        for (let k = 0; k < numItems; k++) {
          const randomProd = products[Math.floor(Math.random() * products.length)];
          if (!itemProds.some(item => item.id === randomProd.id)) {
            itemProds.push(randomProd);
          }
        }

        let subtotal = 0;
        const transactionItemsData = itemProds.map(prod => {
          const qty = Math.floor(Math.random() * 3) + 1;
          const itemSubtotal = prod.sellingPrice * qty;
          subtotal += itemSubtotal;
          return {
            productId: prod.id,
            quantity: qty,
            price: prod.sellingPrice,
            cost: prod.basePrice,
            subtotal: itemSubtotal,
          };
        });

        const invoiceNumber = `TRX-${date.getDate().toString().padStart(2, "0")}${(date.getMonth() + 1).toString().padStart(2, "0")}${date.getFullYear().toString().slice(-2)}-${trxCounter.toString().padStart(3, "0")}`;
        trxCounter++;

        const trxDate = new Date(date);
        trxDate.setHours(9 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60));

        const transaction = await prisma.transaction.create({
          data: {
            invoiceNumber,
            outletId: o.id,
            cashierId: kasir1.id,
            subtotal,
            total: subtotal,
            paymentMethod: method,
            createdAt: trxDate,
            items: {
              create: transactionItemsData,
            },
          },
        });

        await prisma.revenue.create({
          data: {
            outletId: o.id,
            transactionId: transaction.id,
            amount: subtotal,
            method,
            date: trxDate,
            userId: kasir1.id,
          },
        });
      }

      // Add Shopping List expense
      if (Math.random() > 0.3) {
        const listItems = ["Minyak Goreng", "Gas LPG 3kg", "Cup 16oz", "Sendok", "Plastik Cup"];
        const itemName = listItems[Math.floor(Math.random() * listItems.length)];
        const qty = Math.floor(Math.random() * 5) + 1;
        const price = Math.floor(Math.random() * 10000) + 5000;
        const total = qty * price;

        const expenseDate = new Date(date);
        expenseDate.setHours(8, 0, 0);

        const opStock = await prisma.operationalStock.findFirst({
          where: { name: itemName, outletId: o.id },
        });

        const shop = await prisma.shoppingList.create({
          data: {
            date: expenseDate,
            outletId: o.id,
            itemName,
            supplier: "Pasar Induk",
            qty,
            price,
            total,
            notes: "Kebutuhan operasional harian",
            userId: koorlap1.id,
            operationalStockId: opStock?.id || null,
          },
        });

        await prisma.expense.create({
          data: {
            outletId: o.id,
            name: `Belanja: ${itemName} (${qty}x)`,
            amount: total,
            category: "OPERATIONAL",
            date: expenseDate,
            userId: koorlap1.id,
            shoppingListId: shop.id,
          },
        });
      }
    }
  }

  console.log(`✅ Seeded ${trxCounter - 1} historic transactions & ledger logs!`);
  console.log("🌱 Database Seeding Completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
