"use client";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Save,
  RefreshCw,
  History,
  Eye,
  User as UserIcon,
  Calendar,
  X,
  Trash2,
  Plus,
  Minus,
  ClipboardList,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import InputStokForm from "./input-stok-form";
import { cn, formatDayDate } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";

interface DistribusiStokContentProps {
  defaultTab?: "distribusi" | "stok_tambahan" | "riwayat";
}

export default function DistribusiStokContent({ defaultTab = "distribusi" }: DistribusiStokContentProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";

  const [activeTab, setActiveTab] = useState<"distribusi" | "stok_tambahan" | "riwayat">(defaultTab);
  const [gridData, setGridData] = useState<any[]>([]);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const [selectedStockHistory, setSelectedStockHistory] = useState<any | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [subTab, setSubTab] = useState<"distribusi" | "input_stok">("distribusi");
  const [historyOutletId, setHistoryOutletId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const confirm = useConfirm();

  const isOwnerOrDev = userRole === "OWNER" || userRole === "DEVELOPER" || userRole === "KOORLAP";

  // Override default subtab to input_stok for Koorlap since they cannot see distribution history logs
  useEffect(() => {
    if (userRole === "KOORLAP") {
      setSubTab("input_stok");
    }
  }, [userRole]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Query: Fetch Distribution History (only for OWNER & DEVELOPER)
  const { data: historyData, isLoading: isHistoryLoading, isRefetching: isHistoryRefetching, refetch: refetchHistory } = useQuery({
    queryKey: ["distribution-history"],
    queryFn: async () => {
      const res = await fetch("/api/audit-logs?action=SAVE_DISTRIBUTION&limit=100");
      if (!res.ok) throw new Error("Gagal memuat riwayat distribusi");
      return res.json();
    },
    enabled: (userRole === "DEVELOPER" || userRole === "OWNER") && activeTab === "riwayat",
  });
  const historyLogs = historyData?.logs || [];

  // Fetch outlets & product stock details
  const { data: rawData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["stok-distribution-list"],
    queryFn: async () => {
      const res = await fetch("/api/stok/distribution");
      if (!res.ok) throw new Error("Gagal memuat data distribusi");
      return res.json();
    },
    enabled: userRole === "DEVELOPER" || userRole === "OWNER" || userRole === "KOORLAP",
  });

  const outlets = rawData?.outlets || [];
  const products = rawData?.products || [];

  // Sync default history filter outlet
  useEffect(() => {
    if (outlets.length > 0 && !historyOutletId) {
      setHistoryOutletId(outlets[0].id);
    }
  }, [outlets, historyOutletId]);

  // Query: Fetch Stock Adjustment History (SAVE_STOCK_ADJUSTMENT logs)
  const { data: stockHistoryData, isLoading: isLoadingHistory, refetch: refetchHistoryMovements } = useQuery({
    queryKey: ["movements-history", historyOutletId],
    queryFn: async () => {
      if (!historyOutletId) return { logs: [] };
      const res = await fetch(`/api/audit-logs?action=SAVE_STOCK_ADJUSTMENT&outletId=${historyOutletId}&limit=100`);
      if (!res.ok) throw new Error("Gagal memuat riwayat");
      return res.json();
    },
    enabled: !!historyOutletId && activeTab === "riwayat" && subTab === "input_stok",
  });
  const stockHistoryLogs = stockHistoryData?.logs || [];

  // Mutation: Delete a stock movement (reverse stock)
  const deleteMovementMutation = useMutation({
    mutationFn: async ({ movementId, batchId }: { movementId?: string; batchId?: string }) => {
      const url = batchId
        ? `/api/stok/movements?batchId=${batchId}`
        : `/api/stok/movements?id=${movementId}`;
      const res = await fetch(url, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus riwayat mutasi");
      }
      return res.json();
    },
    onSuccess: (res) => {
      triggerAlert("success", res.message || "Riwayat mutasi berhasil dihapus!");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["movements-history"] });
      queryClient.invalidateQueries({ queryKey: ["stok-distribution-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDeleteSelected = async () => {
    const ok = await confirm({
      title: "Hapus Riwayat Terpilih",
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} riwayat mutasi terpilih secara massal? Stok produk terkait akan disesuaikan kembali secara otomatis.`,
      confirmText: "Ya, Hapus Semua",
      variant: "danger",
    });
    if (ok) {
      deleteMovementMutation.mutate({ movementId: selectedIds.join(",") });
    }
  };

  const handleDeleteMovement = async (batchId: string, notes: string) => {
    const ok = await confirm({
      title: "Hapus Riwayat Input Stok",
      message: `Apakah Anda yakin ingin menghapus riwayat input stok "${notes}"? Seluruh stok tambahan pada batch ini akan dikurangi kembali secara otomatis.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteMovementMutation.mutate({ batchId });
    }
  };

  // Initialize grid inputs when rawData is loaded
  useEffect(() => {
    if (products.length > 0 && outlets.length > 0) {
      const initialGrid = products.map((p: any) => {
        // Calculate sisa kemarin for each product across all outlets
        const totalSisa = Object.values(p.stocks).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0) as number;

        // Initialize distribution inputs: default to 0
        const distOutlets: Record<string, number> = {};
        outlets.forEach((o: any) => {
          distOutlets[o.id] = 0;
        });

        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          totalSisa,
          outlets: distOutlets,
          retur: 0,
        };
      });
      setGridData(initialGrid);
    }
  }, [rawData]);

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // Handle cell input changes
  const handleOutletQtyChange = (productId: string, outletId: string, value: string) => {
    const numericVal = Math.max(0, parseInt(value) || 0);
    setGridData((prev) =>
      prev.map((row) => {
        if (row.productId === productId) {
          return {
            ...row,
            outlets: {
              ...row.outlets,
              [outletId]: numericVal,
            },
          };
        }
        return row;
      })
    );
  };

  const handleReturChange = (productId: string, value: string) => {
    const numericVal = Math.max(0, parseInt(value) || 0);
    setGridData((prev) =>
      prev.map((row) => {
        if (row.productId === productId) {
          return {
            ...row,
            retur: numericVal,
          };
        }
        return row;
      })
    );
  };

  // Calculate grid validation details
  const validatedRows = gridData.map((row) => {
    const totalDistributed = Object.values(row.outlets).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0) as number;
    const formulaSum = totalDistributed + row.retur;
    const discrepancy = row.totalSisa - formulaSum;
    const isValid = discrepancy === 0;

    return {
      ...row,
      totalDistributed,
      discrepancy,
      isValid,
    };
  });

  // Find first fraud/discrepancy row to show in red alert banner
  const fraudRow = validatedRows.find((r) => !r.isValid);
  const isAnyFraud = !!fraudRow;

  // Mutation: Save stock distribution
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok/distribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan distribusi");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Distribusi stok harian berhasil disimpan & diverifikasi!");
      queryClient.invalidateQueries({ queryKey: ["stok-distribution-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const handleSave = () => {
    if (isAnyFraud) {
      triggerAlert("error", "Harap perbaiki selisih stok (Fraud Terdeteksi) sebelum menyimpan data.");
      return;
    }

    const payload = {
      distributions: gridData.map((row) => ({
        productId: row.productId,
        productName: row.name,
        sku: row.sku,
        totalSisa: row.totalSisa,
        retur: row.retur,
        outlets: row.outlets,
      })),
      outlets: outlets.map((o: any) => ({ id: o.id, name: o.name })),
    };

    saveMutation.mutate(payload);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in relative pb-10">
      {/* Toast Alerts */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-50 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 text-xs font-bold text-white max-w-md ${
              alertMsg.type === "success" ? "bg-emerald-500" : "bg-primary"
            }`}
          >
            {alertMsg.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <span>{alertMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Switcher (Distribusi vs Stok Tambahan vs Riwayat) */}
      <div className={`flex bg-white border border-border-custom rounded-xl p-1 shadow-sm ${
        userRole === "DEVELOPER" || userRole === "OWNER" || userRole === "KOORLAP" ? "max-w-[550px]" : "max-w-[400px]"
      }`}>
        <button
          onClick={() => setActiveTab("distribusi")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
            activeTab === "distribusi"
              ? "bg-primary text-white shadow-sm font-extrabold"
              : "text-gray-500 hover:text-text-custom"
          }`}
        >
          Distribusi
        </button>
        <button
          onClick={() => setActiveTab("stok_tambahan")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
            activeTab === "stok_tambahan"
              ? "bg-primary text-white shadow-sm font-extrabold"
              : "text-gray-500 hover:text-text-custom"
          }`}
        >
          Input Stok Tambahan
        </button>
        {(userRole === "DEVELOPER" || userRole === "OWNER" || userRole === "KOORLAP") && (
          <button
            onClick={() => setActiveTab("riwayat")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
              activeTab === "riwayat"
                ? "bg-primary text-white shadow-sm font-extrabold"
                : "text-gray-500 hover:text-text-custom"
            }`}
          >
            Riwayat
          </button>
        )}
      </div>

      {activeTab === "stok_tambahan" ? (
        <InputStokForm />
      ) : activeTab === "riwayat" ? (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Sub-tab Switcher (only for Owner & Developer) */}
          {(userRole === "DEVELOPER" || userRole === "OWNER") && (
            <div className="flex bg-white border border-border-custom rounded-xl p-1 shadow-sm max-w-[350px]">
              <button
                onClick={() => setSubTab("distribusi")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                  subTab === "distribusi"
                    ? "bg-primary text-white shadow-sm font-extrabold"
                    : "text-gray-500 hover:text-text-custom"
                }`}
              >
                Riwayat Distribusi
              </button>
              <button
                onClick={() => setSubTab("input_stok")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                  subTab === "input_stok"
                    ? "bg-primary text-white shadow-sm font-extrabold"
                    : "text-gray-500 hover:text-text-custom"
                }`}
              >
                Riwayat Input Stok
              </button>
            </div>
          )}

          {subTab === "distribusi" && (userRole === "DEVELOPER" || userRole === "OWNER") ? (
            <>
              {/* Header Panel */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-border-custom p-5 rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-lg text-text-custom tracking-tight">Riwayat Distribusi Stok</h2>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Daftar seluruh proses penyimpanan & verifikasi distribusi stok harian yang dilakukan oleh Koorlap.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => refetchHistory()}
                  disabled={isHistoryLoading || isHistoryRefetching}
                  className="p-2.5 bg-bg-custom border border-border-custom rounded-xl hover:bg-gray-50 text-gray-500 transition-all cursor-pointer disabled:opacity-50"
                  title="Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${isHistoryRefetching ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Table Card */}
              <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden flex flex-col p-5 gap-4">
                {isHistoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
                    <Loader2 className="w-9 h-9 animate-spin text-primary" />
                    <span className="text-xs font-bold">Memuat riwayat distribusi...</span>
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-xl border border-dashed border-border-custom">
                    Belum ada riwayat distribusi stok yang tersimpan.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                          <th className="py-3.5 px-4 font-bold">Waktu</th>
                          <th className="py-3.5 px-4 font-bold">Oleh</th>
                          <th className="py-3.5 px-4 font-bold">Detail</th>
                          <th className="py-3.5 px-4 text-center font-bold">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyLogs.map((log: any) => {
                          const dateObj = new Date(log.createdAt);
                          const formattedDate = dateObj.toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          });
                          const formattedTime = dateObj.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });

                          const detailCount = log.details?.distributions?.length || 0;

                          return (
                            <tr
                              key={log.id}
                              className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                            >
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-extrabold text-text-custom">{formattedDate}</span>
                                  <span className="text-[10px] text-gray-400 font-semibold">{formattedTime} WIB</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-extrabold text-text-custom">{log.userName}</span>
                                  <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider">
                                    {log.userRole}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-gray-600 font-semibold">
                                Mendistribusikan {detailCount} produk
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  onClick={() => setSelectedHistory(log)}
                                  className="p-1.5 hover:bg-primary/10 text-primary hover:text-primary-dark rounded-lg border border-transparent hover:border-primary/20 transition-all cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-extrabold"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Lihat Tabel</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Header Panel - Riwayat Input Stok */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-border-custom p-5 rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-lg text-text-custom tracking-tight">Riwayat Input Stok</h2>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Daftar mutasi penyesuaian stok produk terbaru di outlet.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Outlet:</span>
                    <select
                      value={historyOutletId}
                      onChange={(e) => setHistoryOutletId(e.target.value)}
                      className="px-2.5 py-1.5 bg-bg-custom border border-border-custom text-xs font-bold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
                    >
                      {outlets.map((o: any) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => refetchHistoryMovements()}
                    className="p-2 border border-border-custom hover:border-primary/20 text-gray-400 hover:text-primary rounded-xl transition-all cursor-pointer bg-white"
                    title="Refresh Riwayat"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Table Card - Riwayat Input Stok */}
              <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden flex flex-col p-5 gap-4">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-xs">Memuat riwayat input stok...</span>
                  </div>
                ) : stockHistoryLogs.length === 0 ? (
                  <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-2xl border border-border-custom border-dashed">
                    Belum ada riwayat input stok tercatat untuk outlet ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                          <th className="py-2.5 px-3 font-bold">Waktu</th>
                          <th className="py-2.5 px-3 font-bold">Oleh</th>
                          <th className="py-2.5 px-3 font-bold">Catatan / Alasan</th>
                          <th className="py-2.5 px-3 font-bold">Detail</th>
                          {isOwnerOrDev && <th className="py-2.5 px-3 text-center font-bold">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {stockHistoryLogs.map((log: any) => {
                          const dateObj = new Date(log.createdAt);
                          const formattedDate = dateObj.toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          });
                          const formattedTime = dateObj.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });

                          const detailCount = log.details?.adjustments?.length || 0;

                          return (
                            <tr
                              key={log.id}
                              className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                            >
                              <td className="py-3.5 px-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-extrabold text-text-custom">{formattedDate}</span>
                                  <span className="text-[10px] text-gray-400 font-semibold">{formattedTime} WIB</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-extrabold text-text-custom">{log.userName}</span>
                                  <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider">
                                    {log.userRole}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-3 text-gray-600 font-semibold max-w-[200px] truncate" title={log.details?.notes}>
                                {log.details?.notes || "Stok Tambahan"}
                              </td>
                              <td className="py-3.5 px-3 text-gray-600 font-semibold">
                                <button
                                  onClick={() => setSelectedStockHistory(log)}
                                  className="p-1.5 hover:bg-primary/10 text-primary hover:text-primary-dark rounded-lg border border-transparent hover:border-primary/20 transition-all cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-extrabold"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Lihat Tabel ({detailCount} Produk)</span>
                                </button>
                              </td>
                              {isOwnerOrDev && (
                                <td className="py-3.5 px-3 text-center">
                                  <button
                                    onClick={() => handleDeleteMovement(log.recordId, log.details?.notes || "Stok Tambahan")}
                                    disabled={deleteMovementMutation.isPending}
                                    className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                                    title="Hapus Riwayat"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Header and Sync Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-border-custom p-5 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Boxes className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-extrabold text-lg text-text-custom tracking-tight">Distribusi Stok Harian</h2>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Distribusikan sisa stok kemarin ke outlet untuk persiapan stok awal hari ini.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start md:self-auto">
              <button
                onClick={() => refetch()}
                disabled={isLoading || isRefetching}
                className="p-2.5 bg-bg-custom border border-border-custom rounded-xl hover:bg-gray-50 text-gray-500 transition-all cursor-pointer disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
              </button>

              <button
                onClick={handleSave}
                disabled={isAnyFraud || saveMutation.isPending || isLoading}
                className={`py-2.5 px-5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all duration-150 cursor-pointer ${
                  isAnyFraud
                    ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none"
                    : "bg-primary hover:bg-primary-dark text-white shadow-primary/20 hover:shadow-lg"
                }`}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Simpan & Verifikasi Distribusi</span>
              </button>
            </div>
          </div>

          {/* Fraud Alert Banner */}
          <AnimatePresence>
            {isAnyFraud && fraudRow && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-start gap-3 text-primary"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-black uppercase tracking-wider">🚨 FRAUD TERDETEKSI</span>
                  <p className="text-xs font-bold leading-relaxed text-primary-dark">
                    Terdapat {Math.abs(fraudRow.discrepancy)} pcs stok <span className="underline font-black">{fraudRow.name}</span> yang tidak memiliki catatan distribusi maupun retur.
                  </p>
                  <span className="text-[10px] text-gray-500 mt-1 font-semibold">
                    Rumus: Sisa Kemarin ({fraudRow.totalSisa} pcs) = Distribusi ({fraudRow.totalDistributed} pcs) + Retur ({fraudRow.retur} pcs).
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Grid Card */}
          <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden flex flex-col p-5 gap-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
                <Loader2 className="w-9 h-9 animate-spin text-primary" />
                <span className="text-xs font-bold">Memuat struktur outlet & data stok...</span>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-xl border border-dashed border-border-custom">
                Belum ada produk aktif yang dikonfigurasi untuk pencatatan stok fisik.
              </div>
            ) : (
              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                      <th className="py-3.5 px-4 font-bold">Nama Barang</th>
                      <th className="py-3.5 px-4 text-center bg-gray-50/50 border-r border-border-custom font-extrabold text-gray-600">
                        Sisa Kemarin
                      </th>
                      {outlets.map((o: any) => (
                        <th key={o.id} className="py-3.5 px-4 text-center font-bold">
                          {o.name.toUpperCase()}
                        </th>
                      ))}
                      <th className="py-3.5 px-4 text-center bg-violet-50/30 border-l border-border-custom font-bold text-violet-700">
                        Retur Gudang
                      </th>
                      <th className="py-3.5 px-4 text-center font-bold">Selisih</th>
                      <th className="py-3.5 px-4 text-center font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRows.map((row) => {
                      const isLow = row.totalSisa <= 0;

                      return (
                        <tr
                          key={row.productId}
                          className={`border-b border-border-custom last:border-none transition-colors hover:bg-bg-custom/10 ${
                            !row.isValid ? "bg-red-50/15" : ""
                          }`}
                        >
                          {/* Product details */}
                          <td className="py-4 px-4">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-text-custom text-sm">{row.name}</span>
                              <span className="text-[10px] text-gray-400 mt-0.5">{row.sku}</span>
                            </div>
                          </td>

                          {/* Sisa kemarin */}
                          <td className="py-4 px-4 text-center bg-gray-50/20 border-r border-border-custom font-black text-gray-700 text-sm">
                            {row.totalSisa}
                          </td>

                          {/* Outlet distribution fields */}
                          {outlets.map((o: any) => {
                            const val = row.outlets[o.id] ?? 0;
                            return (
                              <td key={o.id} className="py-3 px-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  disabled={isLow}
                                  value={isLow ? "" : val}
                                  onChange={(e) => handleOutletQtyChange(row.productId, o.id, e.target.value)}
                                  placeholder="0"
                                  className={`w-20 px-2.5 py-1.5 border border-border-custom rounded-lg text-center text-xs font-bold focus:outline-none focus:border-primary/50 text-text-custom focus:ring-1 focus:ring-primary/20 ${
                                    isLow ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-bg-custom"
                                  }`}
                                />
                              </td>
                            );
                          })}

                          {/* Retur Gudang input */}
                          <td className="py-3 px-3 text-center bg-violet-50/10 border-l border-border-custom">
                            <input
                              type="number"
                              min="0"
                              disabled={isLow}
                              value={isLow ? "" : row.retur}
                              onChange={(e) => handleReturChange(row.productId, e.target.value)}
                              placeholder="0"
                              className={`w-20 px-2.5 py-1.5 border border-violet-200 rounded-lg text-center text-xs font-bold focus:outline-none focus:border-violet-400 text-violet-700 focus:ring-1 focus:ring-violet-200 ${
                                isLow ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-violet-50/40"
                              }`}
                            />
                          </td>

                          {/* Discrepancy (Selisih) */}
                          <td
                            className={`py-4 px-4 text-center font-black text-sm ${
                              row.discrepancy === 0
                                ? "text-emerald-600"
                                : row.discrepancy > 0
                                ? "text-primary"
                                : "text-amber-600"
                            }`}
                          >
                            {row.discrepancy > 0 ? `+${row.discrepancy}` : row.discrepancy}
                          </td>

                          {/* Status badge */}
                          <td className="py-4 px-4 text-center">
                            <div className="flex justify-center">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>VALID</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-primary text-[10px] font-bold animate-pulse">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>SELISIH</span>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="bg-blue-50/40 border border-blue-100 p-4.5 rounded-xl flex gap-3 text-blue-700">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-extrabold uppercase tracking-wide">Panduan Distribusi Stok</span>
              <p className="text-xs leading-relaxed text-blue-900 font-medium">
                Setiap pagi, Koorlap bertanggung jawab untuk mendistribusikan sisa stok kemarin ke outlet-outlet aktif.
                Sisa kemarin yang tidak didistribusikan harus dimasukkan ke kolom <strong>Retur Gudang</strong> sehingga statusnya menjadi <strong>VALID</strong>.
                Penyimpanan data hanya diperbolehkan jika tidak ada selisih stok (FRAUD) yang terdeteksi.
              </p>
            </div>
          </div>
        </>
      )}

      {/* History Details Modal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {selectedHistory && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-start justify-center z-[200] p-4 overflow-y-auto pt-20">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white border border-border-custom rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
              >
                {/* Modal Header */}
                <div className="bg-primary/5 border-b border-border-custom px-5 py-4 flex justify-between items-center text-primary">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    <span className="font-extrabold text-sm uppercase tracking-wide">
                      Detail Distribusi - {new Date(selectedHistory.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedHistory(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-b border-border-custom pb-4 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Tanggal & Waktu</span>
                      <span className="font-extrabold text-text-custom">
                        {new Date(selectedHistory.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Oleh Koorlap</span>
                      <span className="font-extrabold text-text-custom">
                        {selectedHistory.userName}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Total Produk</span>
                      <span className="font-extrabold text-text-custom">
                        {selectedHistory.details?.distributions?.length || 0} Produk
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                          <th className="py-2.5 px-3">Nama Barang</th>
                          <th className="py-2.5 px-3 text-center bg-gray-50 border-r border-border-custom font-extrabold text-gray-600">
                            Sisa Kemarin
                          </th>
                          {(selectedHistory.details?.outlets || []).map((o: any) => (
                            <th key={o.id} className="py-2.5 px-3 text-center font-bold">
                              {o.name.toUpperCase()}
                            </th>
                          ))}
                          <th className="py-2.5 px-3 text-center bg-violet-50/50 border-l border-border-custom font-bold text-violet-700">
                            Retur Gudang
                          </th>
                          <th className="py-2.5 px-3 text-center font-bold">Selisih</th>
                          <th className="py-2.5 px-3 text-center font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedHistory.details?.distributions || []).map((row: any) => {
                          const totalDistributed = Object.values(row.outlets || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0) as number;
                          const formulaSum = totalDistributed + (Number(row.retur) || 0);
                          const discrepancy = (Number(row.totalSisa) || 0) - formulaSum;
                          const isValid = discrepancy === 0;

                          return (
                            <tr
                              key={row.productId}
                              className="border-b border-border-custom last:border-none hover:bg-bg-custom/10 transition-colors"
                            >
                              <td className="py-3 px-3">
                                <div className="flex flex-col">
                                  <span className="font-extrabold text-text-custom text-xs">{row.productName || "Produk"}</span>
                                  <span className="text-[10px] text-gray-400 mt-0.5">{row.sku}</span>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-center bg-gray-50/20 border-r border-border-custom font-black text-gray-700">
                                {row.totalSisa}
                              </td>

                              {(selectedHistory.details?.outlets || []).map((o: any) => {
                                const val = row.outlets?.[o.id] ?? 0;
                                return (
                                  <td key={o.id} className="py-3 px-3 text-center font-bold text-gray-600">
                                    {val}
                                  </td>
                                );
                              })}

                              <td className="py-3 px-3 text-center bg-violet-50/10 border-l border-border-custom font-bold text-violet-700">
                                {row.retur}
                              </td>

                              <td
                                className={`py-3 px-3 text-center font-black ${
                                  discrepancy === 0
                                    ? "text-emerald-600"
                                    : discrepancy > 0
                                    ? "text-primary"
                                    : "text-amber-600"
                                }`}
                              >
                                {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                              </td>

                              <td className="py-3 px-3 text-center">
                                <div className="flex justify-center">
                                  {isValid ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-bold">
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                      <span>VALID</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-100 text-primary text-[9px] font-bold">
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                      <span>SELISIH</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="border-t border-border-custom bg-bg-custom px-5 py-3.5 flex justify-end">
                  <button
                    onClick={() => setSelectedHistory(null)}
                    className="px-4.5 py-2 bg-white hover:bg-gray-50 border border-border-custom text-text-custom text-xs font-black rounded-xl transition-all cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Stock Input History Details Modal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {selectedStockHistory && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-start justify-center z-[200] p-4 overflow-y-auto pt-20">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white border border-border-custom rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
              >
                {/* Modal Header */}
                <div className="bg-primary/5 border-b border-border-custom px-5 py-4 flex justify-between items-center text-primary">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    <span className="font-extrabold text-sm uppercase tracking-wide">
                      Detail Input Stok - {new Date(selectedStockHistory.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedStockHistory(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-b border-border-custom pb-4 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Tanggal & Waktu</span>
                      <span className="font-extrabold text-text-custom">
                        {new Date(selectedStockHistory.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Oleh Operator</span>
                      <span className="font-extrabold text-text-custom">
                        {selectedStockHistory.userName} ({selectedStockHistory.userRole})
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Catatan / Alasan</span>
                      <span className="font-extrabold text-text-custom">
                        {selectedStockHistory.details?.notes || "Stok Tambahan"}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                          <th className="py-2.5 px-3">Nama Barang</th>
                          {(selectedStockHistory.details?.outlets || []).filter((o: any) => 
                            outlets.map((x: any) => x.id).includes(o.id)
                          ).map((o: any) => (
                            <th key={o.id} className="py-2.5 px-3 text-center font-bold">
                              {o.name.toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedStockHistory.details?.adjustments || []).map((row: any) => {
                          const visibleOutlets = (selectedStockHistory.details?.outlets || []).filter((o: any) => 
                            outlets.map((x: any) => x.id).includes(o.id)
                          );

                          return (
                            <tr
                              key={row.productId}
                              className="border-b border-border-custom last:border-none hover:bg-bg-custom/10 transition-colors"
                            >
                              <td className="py-3 px-3">
                                <div className="flex flex-col">
                                  <span className="font-extrabold text-text-custom text-xs">{row.productName || "Produk"}</span>
                                  <span className="text-[10px] text-gray-400 mt-0.5">{row.sku}</span>
                                </div>
                              </td>

                              {visibleOutlets.map((o: any) => {
                                const val = row.outlets?.[o.id];
                                return (
                                  <td key={o.id} className="py-3 px-3 text-center font-extrabold text-emerald-600">
                                    {val !== undefined && val > 0 ? `+${val} pcs` : "-"}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="border-t border-border-custom bg-bg-custom px-5 py-3.5 flex justify-end">
                  <button
                    onClick={() => setSelectedStockHistory(null)}
                    className="px-4.5 py-2 bg-white hover:bg-gray-50 border border-border-custom text-text-custom text-xs font-black rounded-xl transition-all cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
