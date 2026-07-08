"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  Printer,
  Loader2,
  Calendar,
  Building,
} from "lucide-react";
import { formatRupiah, formatDayDate } from "@/lib/utils";

export default function LaporanPage() {
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

  const [activeOutlet, setActiveOutlet] = useState<string>("");
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split("T")[0]);

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

  // Query: Daily Report details
  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ["daily-report", activeOutlet, reportDate],
    queryFn: async () => {
      const res = await fetch(`/api/laporan?outletId=${activeOutlet}&date=${reportDate}`);
      if (!res.ok) throw new Error("Gagal memuat laporan harian");
      return res.json();
    },
    enabled: !!activeOutlet && !!reportDate,
  });

  useEffect(() => {
    if (activeOutlet && reportDate) {
      refetch();
    }
  }, [activeOutlet, reportDate]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Settings Panel - hidden on print */}
      <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Date Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pilih Hari:</span>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-1.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-semibold"
            />
          </div>

          {/* Outlet Selector */}
          {userRole !== "KASIR" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Outlet:</span>
              <select
                value={activeOutlet}
                onChange={(e) => setActiveOutlet(e.target.value)}
                className="px-3 py-1.5 bg-bg-custom border border-border-custom text-xs font-bold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
              >
                {outletsToUse.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Print Button */}
        <button
          onClick={handlePrint}
          disabled={isLoading || !report}
          className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Laporan (A4)</span>
        </button>
      </div>

      {/* Main Document Preview Container */}
      <div className="flex justify-center bg-gray-100 p-0 md:p-6 rounded-2xl border border-border-custom no-print-bg">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-28 gap-2 text-gray-400 bg-white w-full max-w-[850px] rounded-xl border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs">Menyusun dokumen laporan...</span>
          </div>
        ) : !report ? (
          <div className="text-center py-28 text-xs text-gray-400 bg-white w-full max-w-[850px] rounded-xl border">
            Data laporan tidak tersedia
          </div>
        ) : (
          /* Report Page panel - forces A4 boundaries on screen, isolates for printing */
          <div className="bg-white w-full max-w-[850px] p-6 border border-gray-300 shadow-lg text-black font-sans leading-tight relative print-container">
            {/* Header */}
            <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-4 w-full max-w-[650px] mx-auto">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base uppercase tracking-wider">Outlet :</span>
                <span className="font-black text-2xl uppercase tracking-widest text-[#800000]">
                  {report.outletName}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-xs text-gray-700">
                  {formatDayDate(reportDate)}
                </span>
              </div>
            </div>

            {/* Main Sales Table (Cipak Table + Addon Table) */}
            <div className="mb-4">
              <table className="w-full max-w-[650px] mx-auto text-left text-[11px] border-collapse border border-black table-print font-medium">
                <thead>
                  <tr className="bg-[#800000] text-white font-bold border border-black">
                    <th className="py-1 px-2 border border-black w-40">Menu</th>
                    <th className="py-1 px-2 text-center border border-black w-14">Stock</th>
                    <th className="py-1 px-2 text-center border border-black w-16">Restock</th>
                    <th className="py-1 px-2 text-center border border-black w-14">Sisa</th>
                    <th className="py-1 px-2 text-center border border-black w-14">Jual</th>
                    <th className="py-1 px-2 text-right border border-black w-24">Harga</th>
                    <th className="py-1 px-2 text-right border border-black w-28">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Category 1: Cipak / Cimol items */}
                  {report.cipakTable.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-2 text-center text-gray-400 italic border border-black">
                        Tidak ada menu utama aktif
                      </td>
                    </tr>
                  ) : (
                    report.cipakTable.map((p: any, idx: number) => (
                      <tr key={idx} className="border border-black hover:bg-gray-50">
                        <td className="py-1 px-2 border border-black font-bold text-gray-800">{p.name}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">{p.stock}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">
                          {p.restock >= 0 ? `+${p.restock}` : p.restock}
                        </td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">{p.sisa}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-900 font-semibold">{p.jual}</td>
                        <td className="py-1 px-2 text-right border border-black text-gray-600">
                          {formatRupiah(p.price)}
                        </td>
                        <td className="py-1 px-2 text-right border border-black font-bold text-gray-800">
                          {p.jumlah > 0 ? formatRupiah(p.jumlah) : "-"}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Total Cimol Isi Row */}
                  <tr className="bg-[#EAD1D1] text-black font-extrabold border-2 border-black">
                    <td colSpan={3} className="py-1 px-2 text-center border border-black">
                      Total Cimol Isi
                    </td>
                    <td className="py-1 px-2 text-center border border-black text-[#800000]">
                      {report.totals.c3} <span className="text-[9px] font-bold text-gray-600 ml-0.5">Porsi</span>
                    </td>
                    <td className="py-1 px-2 text-center border border-black text-[#800000]">
                      {report.totals.d3} <span className="text-[9px] font-bold text-gray-600 ml-0.5">Pcs</span>
                    </td>
                    <td colSpan={2} className="py-1 px-2 border border-black bg-white"></td>
                  </tr>

                  {/* Category 2: Add-on items */}
                  {report.addonTable.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-2 text-center text-gray-400 italic border border-black">
                        Tidak ada add-on aktif
                      </td>
                    </tr>
                  ) : (
                    report.addonTable.map((p: any, idx: number) => (
                      <tr key={idx} className="border border-black hover:bg-gray-50">
                        <td className="py-1 px-2 border border-black font-bold text-gray-800">{p.name}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">{p.stock}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">
                          {p.restock >= 0 ? `+${p.restock}` : p.restock}
                        </td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">{p.sisa}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-900 font-semibold">{p.jual}</td>
                        <td className="py-1 px-2 text-right border border-black text-gray-600">
                          {formatRupiah(p.price)}
                        </td>
                        <td className="py-1 px-2 text-right border border-black font-bold text-gray-800">
                          {p.jumlah > 0 ? formatRupiah(p.jumlah) : "-"}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Add-ons Summaries representation */}
                  <tr className="bg-gray-50 border-2 border-black font-bold text-gray-700">
                    <td colSpan={3} className="py-1 px-2 text-center border border-black">
                      Total Add-on / Tambahan
                    </td>
                    <td className="py-1 px-2 text-center border border-black text-[#800000]">
                      {report.totals.c4}
                    </td>
                    <td className="py-1 px-2 text-center border border-black text-[#800000]">
                      {report.totals.d4}
                    </td>
                    <td colSpan={2} className="py-1 px-2 border border-black bg-white"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Middle Grid: Bawa Stock (Left), Proyeksi (Middle), Finance (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4 text-xs font-semibold w-full max-w-[650px] mx-auto">
              {/* Left Column: Bawa Stock */}
              <div className="md:col-span-3 flex flex-col justify-center gap-2 border border-black p-3 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center pb-1.5 border-b border-gray-300">
                  <span className="text-gray-500 font-bold text-[10px]">Bawa Cipak:</span>
                  <span className="font-extrabold text-[#800000] text-sm">
                    {report.totals.h1} <span className="text-[10px] text-gray-500 font-medium">Porsi</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-bold text-[10px]">Bawa ADD ON:</span>
                  <span className="font-extrabold text-[#800000] text-sm">
                    {report.totals.h2} <span className="text-[10px] text-gray-500 font-medium">Porsi</span>
                  </span>
                </div>
              </div>

              {/* Middle Column: Proyeksi Keuangan */}
              <div className="md:col-span-5 border-2 border-black rounded-lg overflow-hidden flex flex-col">
                <div className="bg-[#800000] text-white text-center py-1 text-[10px] font-black uppercase tracking-wider">
                  Proyeksi Keuangan
                </div>
                <div className="p-3 bg-white flex flex-col gap-2 flex-grow justify-center">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-[10px]">Gaji Karyawan :</span>
                    <span className="font-bold text-gray-800">{formatRupiah(report.proyeksi.f1)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-100 pt-1.5">
                    <span className="text-gray-600 text-[10px]">Bahan Baku :</span>
                    <span className="font-bold text-gray-800">{formatRupiah(report.proyeksi.f2)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-100 pt-1.5">
                    <span className="text-gray-600 text-[10px]">Margin Kotor :</span>
                    <span className="font-bold text-[#800000]">{formatRupiah(report.proyeksi.f3)}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Finance / Penjualan Summary */}
              <div className="md:col-span-4 border border-black p-3 rounded-lg bg-gray-50 flex flex-col gap-1.5 justify-center">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-gray-700 text-[10px]">Penjualan:</span>
                  <span className="text-[#800000]">{formatRupiah(report.totals.e3)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-500 italic text-[10px] pl-2">
                  <span>*GrabFood :</span>
                  <span>{formatRupiah(report.finance.g1)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-500 italic text-[10px] pl-2">
                  <span>*Qris :</span>
                  <span>{formatRupiah(report.finance.g2)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-500 italic text-[10px] pl-2">
                  <span>*Gaji Pokok :</span>
                  <span>{formatRupiah(report.finance.g3)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-500 italic text-[10px] pl-2 border-b border-dashed border-gray-300 pb-1.5">
                  <span>*Operasional :</span>
                  <span>{formatRupiah(report.finance.g4)}</span>
                </div>
                <div className="flex justify-between items-center font-black text-sm pt-0.5">
                  <span className="text-gray-800 uppercase tracking-wide">Total Cash :</span>
                  <span className="text-[#800000] underline">{formatRupiah(report.finance.g5)}</span>
                </div>
              </div>
            </div>

            {/* Table 3: PENGELUARAN (Expenses today) */}
            <div className="mb-6">
              <h3 className="font-extrabold text-[10px] text-[#800000] uppercase tracking-wider mb-1.5 w-full max-w-[650px] mx-auto">
                Pengeluaran
              </h3>
              <table className="w-full max-w-[650px] mx-auto text-left text-[11px] border-collapse border border-black table-print font-medium">
                <thead>
                  <tr className="bg-[#800000] text-white font-bold border border-black">
                    <th className="py-1 px-2 border border-black w-40">PENGELUARAN</th>
                    <th className="py-1 px-2 border border-black w-24">Ket</th>
                    <th className="py-1 px-2 text-center border border-black w-14">Qty</th>
                    <th className="py-1 px-2 text-right border border-black w-24">Harga</th>
                    <th className="py-1 px-2 text-right border border-black w-28">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expensesTable.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-gray-400 italic border border-black bg-white">
                        Tidak ada pengeluaran hari ini
                      </td>
                    </tr>
                  ) : (
                    report.expensesTable.map((e: any, idx: number) => (
                      <tr key={idx} className="border border-black hover:bg-gray-50">
                        <td className="py-1 px-2 border border-black font-semibold text-gray-800">{e.name}</td>
                        <td className="py-1 px-2 border border-black text-gray-600 uppercase text-[9px]">{e.category}</td>
                        <td className="py-1 px-2 text-center border border-black text-gray-700">1</td>
                        <td className="py-1 px-2 text-right border border-black text-gray-600">{formatRupiah(e.amount)}</td>
                        <td className="py-1 px-2 text-right border border-black font-bold text-gray-800">{formatRupiah(e.amount)}</td>
                      </tr>
                    ))
                  )}

                  {/* Total Pengeluaran Row */}
                  <tr className="bg-[#EAD1D1] text-black font-extrabold border-2 border-black">
                    <td colSpan={4} className="py-1 px-2 text-right border border-black uppercase tracking-wider text-[9px]">
                      Total Pengeluaran
                    </td>
                    <td className="py-1 px-2 text-right border border-black text-[#800000]">
                      {formatRupiah(report.finance.g4)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures for physical approval */}
            <div className="grid grid-cols-3 gap-4 text-center text-[10px] mt-8 pt-4 border-t border-dashed border-gray-300 signatures w-full max-w-[650px] mx-auto">
              <div>
                <p className="text-gray-400 mb-10">Disiapkan Oleh (Kasir)</p>
                <div className="w-10/12 border-b border-black mx-auto"></div>
                <p className="mt-1 font-semibold text-gray-600">{user.name}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-10">Diverifikasi Oleh (Koorlap)</p>
                <div className="w-10/12 border-b border-black mx-auto"></div>
                <p className="mt-1 font-semibold text-gray-600">&nbsp;</p>
              </div>
              <div>
                <p className="text-gray-400 mb-10">Disetujui Oleh (Owner)</p>
                <div className="w-10/12 border-b border-black mx-auto"></div>
                <p className="mt-1 font-semibold text-gray-600">&nbsp;</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
