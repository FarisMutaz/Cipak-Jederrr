"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  Boxes,
  MapPin,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertTriangle,
  History,
  CheckCircle2,
  AlertCircle,
  X,
  Settings,
  Plus,
  Minus,
  Check,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { cn, formatDayDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

const adjustSchema = zod.object({
  type: zod.enum(["INITIAL", "IN", "OUT"]),
  qty: zod.coerce.number(),
  notes: zod.string().min(3, { message: "Alasan minimal 3 karakter" }),
}).refine((data) => {
  if (data.type === "INITIAL") return data.qty >= 0;
  return data.qty >= 1;
}, {
  message: "Jumlah minimal 1 untuk stok masuk/keluar, dan minimal 0 untuk stok awal",
  path: ["qty"],
});

type AdjustForm = zod.infer<typeof adjustSchema>;

const addStockSchema = zod.object({
  name: zod.string().min(2, { message: "Nama stok minimal 2 karakter" }),
  categoryId: zod.string().min(1, { message: "Pilih kategori" }),
  minStock: zod.coerce.number().min(0, { message: "Batas minimum tidak boleh negatif" }),
  initialStock: zod.coerce.number().min(0, { message: "Stok awal tidak boleh negatif" }),
});

type AddStockForm = zod.infer<typeof addStockSchema>;

export default function StokPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const confirm = useConfirm();
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
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals state
  const [adjustingStock, setAdjustingStock] = useState<any>(null);
  const [limitingStock, setLimitingStock] = useState<any>(null);
  const [limitValue, setLimitValue] = useState<number>(5);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);

  const firstUserOutletId = userOutlets[0]?.id;
  const firstOutletToUseId = outletsToUse[0]?.id;

  // Sync activeOutlet
  useEffect(() => {
    if (userRole === "KASIR" && firstUserOutletId) {
      setActiveOutlet(firstUserOutletId);
    } else if (activeOutletId && activeOutletId !== "ALL") {
      setActiveOutlet(activeOutletId);
    } else if (firstOutletToUseId) {
      setActiveOutlet(firstOutletToUseId);
    }
  }, [activeOutletId, firstOutletToUseId, firstUserOutletId, userRole]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      type: "IN",
      qty: 0,
      notes: "",
    },
  });

  const watchType = watch("type");

  const {
    register: registerAdd,
    handleSubmit: handleSubmitAdd,
    reset: resetAdd,
    formState: { errors: errorsAdd },
  } = useForm({
    resolver: zodResolver(addStockSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      minStock: 5,
      initialStock: 0,
    },
  });

  // Query: Stock list
  const { data: stocks = [], isLoading: isLoadingStocks, isError: isErrorStocks, error: errorStocks } = useQuery({
    queryKey: ["stocks-list", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat stok");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  // Query: Stock movements history
  const { data: movements = [], isLoading: isLoadingHistory, isError: isErrorHistory, error: errorHistory } = useQuery({
    queryKey: ["movements-history", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok/movements?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat log riwayat stok");
      return res.json();
    },
    enabled: !!activeOutlet && activeTab === "history",
  });

  // Query: Categories (for Add Stock modal)
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Gagal memuat kategori");
      return res.json();
    },
  });

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Mutation: Adjust stock
  const adjustMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyesuaikan stok");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Penyesuaian stok berhasil disimpan!");
      setAdjustingStock(null);
      reset({ type: "IN", qty: 0, notes: "" });
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["movements-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  // Mutation: Update threshold
  const limitMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal mengubah batas minimum");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Batas minimum stok berhasil diperbarui!");
      setLimitingStock(null);
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  // Mutation: Delete product/stock item
  const deleteStockMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus stok");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Item stok berhasil dihapus!");
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDeleteStock = async (productId: string) => {
    const ok = await confirm({
      title: "Hapus Item Stok",
      message: "Apakah Anda yakin ingin menghapus item stok ini? Seluruh data stok dan riwayat mutasi terkait item ini akan dihapus dari pandangan.",
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteStockMutation.mutate(productId);
    }
  };

  // Mutation: Add new stock item
  const addStockMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal membuat stok baru");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Stok baru berhasil ditambahkan!");
      setIsAddStockModalOpen(false);
      resetAdd({ name: "", categoryId: "", minStock: 5, initialStock: 0 });
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const onAddStockSubmit = (data: any) => {
    addStockMutation.mutate({
      ...data,
      outletId: activeOutlet,
    });
  };

  const onAdjustSubmit = (data: any) => {
    adjustMutation.mutate({
      stockId: adjustingStock.id,
      ...data,
    });
  };

  const onLimitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    limitMutation.mutate({
      stockId: limitingStock.id,
      minStock: limitValue,
    });
  };

  // Mutation: Delete a stock movement (reverse stock)
  const deleteMovementMutation = useMutation({
    mutationFn: async (movementId: string) => {
      const res = await fetch(`/api/stok/movements?id=${movementId}`, {
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
      queryClient.invalidateQueries({ queryKey: ["movements-history"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDeleteMovement = async (movementId: string, productName: string) => {
    const ok = await confirm({
      title: "Hapus Riwayat Mutasi",
      message: `Apakah Anda yakin ingin menghapus riwayat mutasi "${productName}"? Stok akan disesuaikan secara otomatis.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteMovementMutation.mutate(movementId);
    }
  };

  // Mutation: Reset all stock to 0
  const resetStockMutation = useMutation({
    mutationFn: async (outletId: string) => {
      const res = await fetch("/api/stok", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET_ALL", outletId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal me-reset stok");
      }
      return res.json();
    },
    onSuccess: (data) => {
      triggerAlert("success", data.message || "Seluruh stok produk berhasil di-reset menjadi 0!");
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["movements-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleResetAllStock = async () => {
    const ok = await confirm({
      title: "Reset Semua Stok Produk",
      message: "Apakah Anda yakin ingin me-reset seluruh stok produk (stok awal, masuk, keluar, terjual, dan sisa) di outlet ini menjadi 0? Seluruh riwayat mutasi di outlet ini juga akan dihapus secara permanen.",
      confirmText: "Ya, Reset Semua",
      confirmButtonClass: "bg-[#E84E4E] hover:bg-[#D33D3D] text-white",
      variant: "danger",
    });
    if (ok && activeOutlet) {
      resetStockMutation.mutate(activeOutlet);
    }
  };

  const isOwnerOrDev = userRole === "OWNER" || userRole === "DEVELOPER";

  return (
    <div className="flex flex-col gap-6 animate-fade-in relative">
      {/* Alert Notification */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-50 px-6 py-3.5 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-bold text-white ${
              alertMsg.type === "success" ? "bg-emerald-500" : "bg-primary"
            }`}
          >
            {alertMsg.type === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{alertMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control panel */}
      <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Toggle tabs and Add Stock button */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center bg-bg-custom border border-border-custom rounded-xl p-0.5">
            <button
              onClick={() => setActiveTab("current")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5",
                activeTab === "current" ? "bg-primary text-white shadow-sm" : "text-gray-500 hover:text-text-custom"
              )}
            >
              <Boxes className="w-4 h-4" />
              Stok Terkini
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5",
                activeTab === "history" ? "bg-primary text-white shadow-sm" : "text-gray-500 hover:text-text-custom"
              )}
            >
              <History className="w-4 h-4" />
              Riwayat Mutasi
            </button>
          </div>

          {(userRole === "OWNER" || userRole === "DEVELOPER") && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddStockModalOpen(true)}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah Stok Baru
              </button>
              <button
                onClick={handleResetAllStock}
                disabled={resetStockMutation.isPending}
                className="px-4 py-2 bg-[#E84E4E] hover:bg-[#D33D3D] text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={cn("w-4 h-4", resetStockMutation.isPending && "animate-spin")} />
                Reset Semua Stok
              </button>
            </div>
          )}
        </div>

        {/* Outlet scoping selector */}
        {userRole !== "KASIR" && (
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[10px] font-bold text-emerald-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              <span>Urutan mengikuti menu Produk</span>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" /> Outlet:
            </span>
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

      {/* Main Content card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden">
        {activeTab === "current" ? (
          /* Stok Terkini Table */
          isLoadingStocks ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs">Memuat data stok outlet...</span>
            </div>
          ) : isErrorStocks ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#E84E4E]">
              <AlertCircle className="w-8 h-8 animate-bounce text-primary" />
              <span className="text-xs font-extrabold">Gagal memuat data stok</span>
              <span className="text-[10px] text-gray-400 leading-normal max-w-xs text-center">
                {(errorStocks as any)?.message || "Terjadi kesalahan koneksi database."}
              </span>
              <span className="text-[10px] text-gray-500 font-bold bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-1.5 mt-1">
                Pastikan terminal database (`npx prisma dev`) sudah berjalan.
              </span>
            </div>
          ) : stocks.length === 0 ? (
            <div className="text-center py-24 text-xs text-gray-400">
              Belum ada stok produk terdaftar untuk outlet ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                    <th className="py-3.5 px-3 text-center w-12">#</th>
                    <th className="py-3.5 px-4">Nama Produk</th>
                    <th className="py-3.5 px-4 text-center">Stok Awal</th>
                    <th className="py-3.5 px-4 text-center text-emerald-600">Stok Masuk</th>
                    <th className="py-3.5 px-4 text-center text-primary">Stok Keluar</th>
                    <th className="py-3.5 px-4 text-center text-blue-600">Terjual</th>
                    <th className="py-3.5 px-4 text-center">Stok Akhir</th>
                    <th className="py-3.5 px-4 text-center">Limit Peringatan</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s: any, idx: number) => {
                    const isLow = s.quantity <= s.minStock;
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                      >
                        <td className="py-3.5 px-3 text-center">
                          <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-text-custom">
                          <div className="flex flex-col">
                            <span>{s.product.name}</span>
                            <span className="text-[9px] font-medium text-gray-400 mt-0.5">
                              {s.product.status === "ACTIVE" ? (
                                <span className="text-emerald-600 font-bold">● Aktif di POS</span>
                              ) : (
                                <span className="text-gray-500 font-bold">○ Hanya Stok (Menu Nonaktif)</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-gray-600">{s.initialStock}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-600">+{s.stockIn}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-primary">-{s.stockOut}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-blue-600">{s.sold}</td>
                        <td className="py-3.5 px-4 text-center font-extrabold text-text-custom text-sm">
                          {s.quantity} pcs
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-gray-500">{s.minStock} pcs</td>
                        <td className="py-3.5 px-4 text-center">
                          {s.quantity === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-[9px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> Habis
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-[#b3861b] rounded text-[9px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> Menipis
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] font-bold">
                              Aman
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setAdjustingStock(s);
                                reset({ type: "IN", qty: 0, notes: "" });
                              }}
                              className="px-2.5 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-[10px] font-bold shadow-sm transition-colors cursor-pointer"
                            >
                              Sesuaikan Stok
                            </button>
                            <button
                              onClick={() => {
                                setLimitingStock(s);
                                setLimitValue(s.minStock);
                              }}
                              className="p-1.5 border border-border-custom hover:border-primary/20 text-gray-400 hover:text-primary rounded-lg transition-colors cursor-pointer"
                              title="Ubah Limit Peringatan"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            {(userRole === "OWNER" || userRole === "DEVELOPER") && (
                              <button
                                onClick={() => handleDeleteStock(s.product.id)}
                                className="p-1.5 border border-[#E84E4E]/20 hover:border-[#E84E4E]/50 text-[#E84E4E]/60 hover:text-[#E84E4E] rounded-lg transition-colors cursor-pointer"
                                title="Hapus Stok"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Riwayat Mutasi Table */
          isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs">Memuat riwayat mutasi stok...</span>
            </div>
          ) : isErrorHistory ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#E84E4E]">
              <AlertCircle className="w-8 h-8 animate-bounce text-primary" />
              <span className="text-xs font-extrabold">Gagal memuat riwayat mutasi stok</span>
              <span className="text-[10px] text-gray-400 leading-normal max-w-xs text-center">
                {(errorHistory as any)?.message || "Terjadi kesalahan koneksi database."}
              </span>
              <span className="text-[10px] text-gray-500 font-bold bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-1.5 mt-1">
                Pastikan terminal database (`npx prisma dev`) sudah berjalan.
              </span>
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-24 text-xs text-gray-400">
              Belum ada mutasi stok tercatat untuk outlet ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                    <th className="py-3.5 px-4">Waktu</th>
                    <th className="py-3.5 px-4">Produk</th>
                    <th className="py-3.5 px-4 text-center">Tipe Mutasi</th>
                    <th className="py-3.5 px-4 text-center">Jumlah</th>
                    <th className="py-3.5 px-4">Operator</th>
                    <th className="py-3.5 px-4">Alasan / Catatan</th>
                    {isOwnerOrDev && <th className="py-3.5 px-4 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m: any) => {
                    const isIncoming = m.type === "IN";
                    const isOutgoing = m.type === "OUT";

                    return (
                      <tr
                        key={m.id}
                        className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                      >
                        <td className="py-3.5 px-4 text-gray-500 font-semibold">
                          {formatDayDate(m.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-text-custom">{m.productName}</td>
                        <td className="py-3.5 px-4 text-center">
                          {isIncoming ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] font-bold">
                              <Plus className="w-2.5 h-2.5" /> Stok Masuk
                            </span>
                          ) : isOutgoing ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-primary/10 text-primary rounded text-[9px] font-bold">
                              <Minus className="w-2.5 h-2.5" /> Stok Keluar
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-[#F5C14E]/25 text-[#b3861b] rounded text-[9px] font-bold">
                              ✦ Penyesuaian
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "py-3.5 px-4 text-center font-extrabold text-sm",
                            isIncoming ? "text-emerald-600" : isOutgoing ? "text-primary" : "text-[#b3861b]"
                          )}
                        >
                          {isIncoming ? "+" : isOutgoing ? "-" : ""}
                          {m.quantity} pcs
                        </td>
                        <td className="py-3.5 px-4 text-gray-600 font-medium italic">{m.userName}</td>
                        <td className="py-3.5 px-4 text-gray-500 leading-normal">{m.notes}</td>
                        {isOwnerOrDev && (
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleDeleteMovement(m.id, m.productName)}
                              disabled={deleteMovementMutation.isPending}
                              className="p-1.5 hover:bg-primary/10 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                              title="Hapus Riwayat"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Modal - Sesuaikan Stok (IN/OUT/OPNAME) */}
      <AnimatePresence>
        {adjustingStock && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md p-6 border border-border-custom shadow-xl relative overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-border-custom">
                <h3 className="font-extrabold text-sm text-text-custom flex flex-col">
                  <span>Sesuaikan Stok Produk</span>
                  <span className="text-[10px] text-gray-400 font-medium mt-0.5">
                    {adjustingStock.product.name}
                  </span>
                </h3>
                <button
                  onClick={() => setAdjustingStock(null)}
                  className="text-gray-400 hover:text-text-custom transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onAdjustSubmit)} className="flex flex-col gap-4">
                {/* Current info */}
                <div className="p-3 bg-bg-custom border border-border-custom rounded-xl flex items-center justify-between text-xs text-text-custom">
                  <span>Stok Aktif Saat Ini:</span>
                  <span className="font-extrabold text-primary text-sm">{adjustingStock.quantity} pcs</span>
                </div>

                {/* Adjustment Type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tipe Penyesuaian</label>
                  <select
                    {...register("type")}
                    className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  >
                    <option value="INITIAL">Stok Awal</option>
                    <option value="IN">Stok Masuk (+)</option>
                    <option value="OUT">Stok Keluar (-)</option>
                  </select>
                </div>

                {/* Quantity */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    Jumlah (pcs) {watchType === "INITIAL" && `(Saat ini: ${adjustingStock.initialStock} pcs)`}
                  </label>
                  <input
                    type="number"
                    placeholder={watchType === "INITIAL" ? "Contoh: 100 (Stok Awal Baru)" : "Contoh: 10"}
                    {...register("qty")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  {errors.qty && <span className="text-[9px] text-primary font-bold">{errors.qty.message}</span>}
                </div>

                {/* Notes */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Alasan / Catatan</label>
                  <input
                    type="text"
                    placeholder={watchType === "INITIAL" ? "Contoh: Koreksi stok awal yang salah input" : "Contoh: Kiriman supplier, produk rusak, audit internal"}
                    {...register("notes")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  {errors.notes && <span className="text-[9px] text-primary font-bold">{errors.notes.message}</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3.5">
                  <button
                    type="button"
                    onClick={() => setAdjustingStock(null)}
                    className="w-1/2 py-2.5 border border-border-custom hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={adjustMutation.isPending}
                    className="w-1/2 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {adjustMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Penyesuaian</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - Ubah Limit Peringatan (minStock) */}
      <AnimatePresence>
        {limitingStock && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6 border border-border-custom shadow-xl relative overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-border-custom">
                <h3 className="font-extrabold text-sm text-text-custom flex flex-col">
                  <span>Batas Limit Peringatan</span>
                  <span className="text-[10px] text-gray-400 font-medium mt-0.5">
                    {limitingStock.product.name}
                  </span>
                </h3>
                <button
                  onClick={() => setLimitingStock(null)}
                  className="text-gray-400 hover:text-text-custom transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={onLimitSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Batas Minimum Peringatan</label>
                  <input
                    type="number"
                    value={limitValue}
                    onChange={(e) => setLimitValue(parseInt(e.target.value) || 0)}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  <p className="text-[9px] text-gray-400 leading-normal mt-1">
                    Jika stok produk di outlet ini kurang dari atau sama dengan jumlah ini, notifikasi peringatan akan aktif.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setLimitingStock(null)}
                    className="w-1/2 py-2.5 border border-border-custom hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={limitMutation.isPending}
                    className="w-1/2 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {limitMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Batas</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modal: Tambah Stok Baru */}
        {isAddStockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 shadow-2xl border border-border-custom w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-border-custom">
                <h3 className="font-extrabold text-sm text-text-custom flex items-center gap-1.5">
                  <Boxes className="w-5 h-5 text-primary" />
                  Tambah Stok Baru
                </h3>
                <button
                  onClick={() => setIsAddStockModalOpen(false)}
                  className="text-gray-400 hover:text-text-custom transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitAdd(onAddStockSubmit)} className="flex flex-col gap-4">
                {/* Nama Stok */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Stok / Produk</label>
                  <input
                    type="text"
                    placeholder="Contoh: Cipak Koceak (Level 3)"
                    {...registerAdd("name")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errorsAdd.name && <span className="text-[9px] text-primary font-bold">{errorsAdd.name.message}</span>}
                </div>

                {/* Kategori */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Kategori</label>
                  <select
                    {...registerAdd("categoryId")}
                    className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errorsAdd.categoryId && <span className="text-[9px] text-primary font-bold">{errorsAdd.categoryId.message}</span>}
                </div>

                {/* Batas Minimum */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Batas Minimum Peringatan</label>
                  <input
                    type="number"
                    {...registerAdd("minStock")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errorsAdd.minStock && <span className="text-[9px] text-primary font-bold">{errorsAdd.minStock.message}</span>}
                </div>

                {/* Stok Awal */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Stok Awal di Outlet Ini</label>
                  <input
                    type="number"
                    {...registerAdd("initialStock")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errorsAdd.initialStock && <span className="text-[9px] text-primary font-bold">{errorsAdd.initialStock.message}</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setIsAddStockModalOpen(false)}
                    className="w-1/2 py-2.5 border border-border-custom hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={addStockMutation.isPending}
                    className="w-1/2 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {addStockMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Stok</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
