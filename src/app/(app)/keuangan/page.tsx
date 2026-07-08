"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Building,
  Calendar,
  FileSpreadsheet,
  FileText,
  Loader2,
  MapPin,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatRupiah, formatDate } from "@/lib/utils";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

export default function KeuanganPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const userOutlets = user?.outlets || [];
  const activeOutletId = user?.activeOutletId;

  const { data: dbOutlets = [] } = useQuery({
    queryKey: ["outlets-dropdown-list", userRole],
    queryFn: async () => {
      if (userRole !== "DEVELOPER" && userRole !== "OWNER") return [];
      const res = await fetch("/api/outlets");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: userRole === "DEVELOPER" || userRole === "OWNER",
  });

  const outletsToUse = (userRole === "DEVELOPER" || userRole === "OWNER") && dbOutlets.length > 0
    ? dbOutlets
    : userOutlets;

  const [activeOutlet, setActiveOutlet] = useState<string>("ALL");

  // Default range: past 30 days
  const todayStr = new Date().toISOString().split("T")[0];
  const past30Str = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(past30Str);
  const [endDate, setEndDate] = useState(todayStr);

  const firstUserOutletId = userOutlets[0]?.id;
  const firstOutletToUseId = outletsToUse[0]?.id;

  // Sync activeOutlet
  useEffect(() => {
    if (userRole === "KASIR" && firstUserOutletId) {
      setActiveOutlet(firstUserOutletId);
    } else if (activeOutletId) {
      setActiveOutlet(activeOutletId);
    } else if (firstOutletToUseId) {
      setActiveOutlet(firstOutletToUseId);
    }
  }, [activeOutletId, firstOutletToUseId, firstUserOutletId, userRole]);

  // Query: Finance report data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance-report", activeOutlet, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/keuangan?outletId=${activeOutlet}&startDate=${startDate}&endDate=${endDate}`
      );
      if (!res.ok) throw new Error("Gagal memuat laporan keuangan");
      return res.json();
    },
    enabled: !!session,
  });

  // Re-fetch on filter change
  useEffect(() => {
    if (session) refetch();
  }, [activeOutlet, startDate, endDate, session]);

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="bg-white p-4 rounded-xl border border-border-custom h-14"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-border-custom h-32"></div>
          ))}
        </div>
        <div className="bg-white p-6 rounded-xl border border-border-custom h-80"></div>
      </div>
    );
  }

  const { summary, chartData, ledger } = data;

  // Excel Export
  const exportExcel = () => {
    const wsData = [
      ["LAPORAN KEUANGAN - CIPAK JEDERRR POS"],
      [`Periode: ${startDate} s/d ${endDate}`],
      [`Outlet: ${activeOutlet === "ALL" ? "Semua Outlet" : activeOutlet}`],
      [],
      ["Tanggal", "Tipe Kas", "Nama Item", "Keterangan", "Jumlah (IDR)", "Pencatat"],
      ...ledger.map((item: any) => [
        new Date(item.date).toLocaleDateString("id-ID"),
        item.type === "INCOME" ? "Pemasukan (+)" : "Pengeluaran (-)",
        item.name,
        item.description,
        item.amount,
        item.operator,
      ]),
      [],
      ["Total Pendapatan (Omset)", summary.totalRevenue],
      ["Total Pengeluaran", summary.totalExpense],
      ["Laba Bersih", summary.netProfit],
      [],
      ["Breakdown Pendapatan:"],
      ["Cash", summary.cashRevenue],
      ["QRIS", summary.qrisRevenue],
      ["GrabFood", summary.grabfoodRevenue],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Keuangan");
    XLSX.writeFile(wb, `Laporan_Keuangan_Cipak_${startDate}_to_${endDate}.xlsx`);
  };

  // PDF Export
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(181, 18, 23); // #B51217 Red
    doc.text("LAPORAN KEUANGAN - CIPAK JEDERRR POS", 15, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(44, 44, 44);
    doc.text(`Periode: ${startDate} s/d ${endDate}`, 15, 27);
    doc.text(`Outlet: ${activeOutlet === "ALL" ? "Semua Outlet" : activeOutlet}`, 15, 33);

    // Summary Card Box
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(15, 40, 180, 25, 3, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.text("Total Pendapatan", 20, 48);
    doc.text("Total Pengeluaran", 80, 48);
    doc.text("Laba Bersih", 140, 48);

    doc.setFont("helvetica", "normal");
    doc.text(formatRupiah(summary.totalRevenue), 20, 56);
    doc.text(formatRupiah(summary.totalExpense), 80, 56);
    doc.setFont("helvetica", "bold");
    doc.text(formatRupiah(summary.netProfit), 140, 56);

    // Ledger table
    doc.text("Buku Ledger Mutasi Kas (Terakhir)", 15, 76);
    doc.setDrawColor(220, 220, 220);
    doc.line(15, 79, 195, 79);

    let y = 87;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Tanggal", 15, 84);
    doc.text("Transaksi / Keterangan", 45, 84);
    doc.text("Tipe", 115, 84);
    doc.text("Pencatat", 140, 84);
    doc.text("Jumlah (Rp)", 175, 84);

    doc.setFont("helvetica", "normal");
    for (const item of ledger.slice(0, 20)) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(new Date(item.date).toLocaleDateString("id-ID"), 15, y);
      doc.text(`${item.name} (${item.description})`, 45, y, { maxWidth: 65 });
      doc.text(item.type === "INCOME" ? "Pemasukan" : "Pengeluaran", 115, y);
      doc.text(item.operator, 140, y);
      doc.text(formatRupiah(item.amount), 175, y);
      y += 8;
    }

    doc.save(`Laporan_Keuangan_Cipak_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in no-print">
      {/* Filters card */}
      <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Date Ranges */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Mulai:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Sampai:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Outlet Selection */}
          {userRole !== "KASIR" && (
            <select
              value={activeOutlet}
              onChange={(e) => setActiveOutlet(e.target.value)}
              className="px-3 py-2 bg-bg-custom border border-border-custom text-xs font-semibold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
            >
              <option value="ALL">Semua Outlet</option>
              {outletsToUse.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {/* Export Excel */}
          <button
            onClick={exportExcel}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>

          {/* Export PDF */}
          <button
            onClick={exportPDF}
            className="px-3.5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI: Income */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm group hover:border-emerald-500/20 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Total Pemasukan (Omset)
            </span>
            <span className="font-extrabold text-lg text-emerald-600 leading-tight">
              {formatRupiah(summary.totalRevenue)}
            </span>
            <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-0.5 mt-0.5 leading-none">
              Dari penjualan kasir outlet
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-105 transition-transform duration-300">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        {/* KPI: Expense */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm group hover:border-primary/20 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Total Pengeluaran
            </span>
            <span className="font-extrabold text-lg text-primary leading-tight">
              {formatRupiah(summary.totalExpense)}
            </span>
            <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-0.5 mt-0.5 leading-none">
              Dari daftar belanja harian
            </span>
          </div>
          <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform duration-300">
            <ArrowDownRight className="w-6 h-6" />
          </div>
        </div>

        {/* KPI: Profit */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm group hover:border-accent/20 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Laba Bersih (Net Profit)
            </span>
            <span
              className={`font-extrabold text-lg leading-tight ${
                summary.netProfit >= 0 ? "text-emerald-600" : "text-primary"
              }`}
            >
              {formatRupiah(summary.netProfit)}
            </span>
            <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-0.5 mt-0.5 leading-none">
              Net margin operasional
            </span>
          </div>
          <div className="w-12 h-12 bg-accent/15 rounded-2xl flex items-center justify-center text-[#b3861b] group-hover:scale-105 transition-transform duration-300">
            <CircleDollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-6 rounded-xl border border-border-custom shadow-sm flex flex-col gap-4">
        <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
          Analisis Aliran Kas Harian (Pemasukan vs Pengeluaran)
        </h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: any) => formatRupiah(value)}
                contentStyle={{ background: "#FFF", borderRadius: "10px", borderColor: "#ECECEC", fontSize: "11px" }}
              />
              <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
              <Bar name="Pemasukan" dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar name="Pengeluaran" dataKey="expense" fill="#B51217" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ledger statement list card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border-custom bg-bg-custom flex items-center justify-between">
          <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
            Buku Mutasi Kas (Ledger Statement)
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Nama Mutasi</th>
                <th className="py-3 px-4">Tipe Kas</th>
                <th className="py-3 px-4">Keterangan</th>
                <th className="py-3 px-4 text-right">Jumlah</th>
                <th className="py-3 px-4">Pencatat</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((item: any) => {
                const isIncome = item.type === "INCOME";

                return (
                  <tr
                    key={item.id}
                    className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-gray-600">
                      {formatDate(item.date)}
                    </td>
                    <td className="py-3 px-4 font-bold text-text-custom">{item.name}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold ${
                          isIncome
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {isIncome ? "Pemasukan (+)" : "Pengeluaran (-)"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{item.description}</td>
                    <td
                      className={`py-3 px-4 text-right font-extrabold text-sm ${
                        isIncome ? "text-emerald-600" : "text-primary"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatRupiah(item.amount)}
                    </td>
                    <td className="py-3 px-4 text-gray-500 italic font-medium">{item.operator}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
