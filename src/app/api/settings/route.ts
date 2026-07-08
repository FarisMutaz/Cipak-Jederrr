import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let setting = await prisma.setting.findFirst();

    if (!setting) {
      // Initialize default settings if missing
      setting = await prisma.setting.create({
        data: {
          storeName: "Cipak Jederrr",
          address: "Jl. Cideng Barat No. 25, Jakarta Pusat",
          phone: "081234567890",
          tax: 0,
          prefixInvoice: "TRX",
        },
      });
    }

    return NextResponse.json(setting);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat pengaturan: " + error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden: Developer access only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { storeName, address, phone, tax, prefixInvoice } = body;

    const setting = await prisma.setting.findFirst();

    let updated;
    if (setting) {
      updated = await prisma.setting.update({
        where: { id: setting.id },
        data: {
          storeName,
          address,
          phone,
          tax: parseFloat(tax) || 0,
          prefixInvoice,
        },
      });
    } else {
      updated = await prisma.setting.create({
        data: {
          storeName,
          address,
          phone,
          tax: parseFloat(tax) || 0,
          prefixInvoice,
        },
      });
    }

    // Log Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        table: "settings",
        recordId: updated.id,
        details: JSON.stringify(body),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui pengaturan: " + error.message },
      { status: 500 }
    );
  }
}
