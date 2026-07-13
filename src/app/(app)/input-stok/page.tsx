"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  FileSpreadsheet,
  MapPin,
  Loader2,
  AlertCircle,
  CheckCircle2,
  History,
  Plus,
  Minus,
  Check,
  ClipboardList,
  Trash2,
} from "lucide-react";
import { cn, formatDayDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

const formSchema = zod.object({
  stockId: zod.string().min(1, { message: "Pilih produk terlebih dahulu" }),
  type: zod.enum(["INITIAL", "IN", "OUT"], { message: "Pilih tipe penyesuaian" }),
  qty: zod.coerce.number().min(0, { message: "Jumlah tidak boleh negatif" }),
  notes: zod.string().min(3, { message: "Catatan/Alasan minimal 3 karakter" }),
});

type AdjustmentFormValues = zod.infer<typeof formSchema>;

const EMPTY_ARRAY: any[] = [];

export default function InputStokFormPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const userOutlets = user?.outlets || [];
  const activeOutletId = user?.activeOutletId;
  const confirm = useConfirm();

  const isOwnerOrDev = userRole === "OWNER" || userRole === "DEVELOPER";

  // Query: Outlets dropdown list
  const { data: dbOutlets = EMPTY_ARRAY } = useQuery({
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
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  // Query: Fetch stocks for selected outlet
  const { data: stocks = EMPTY_ARRAY, isLoading: isLoadingStocks } = useQuery({
    queryKey: ["stocks-list", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat stok");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  // Query: Fetch stock movements history for selected outlet
  const { data: movements = EMPTY_ARRAY, isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["movements-history", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok/movements?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat riwayat");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Form setup
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      stockId: "",
      type: "IN",
      qty: 0,
      notes: "",
    },
  });

  const selectedStockId = watch("stockId");
  const watchType = watch("type");
  const watchQty = watch("qty");

  // Find selected stock object
  const selectedStock = stocks.find((s: any) => s.id === selectedStockId);

  // Set default product selection once stocks load
  useEffect(() => {
    if (stocks.length > 0 && !selectedStockId) {
      setValue("stockId", stocks[0].id);
    }
  }, [stocks, selectedStockId, setValue]);

  // Reset form when outlet changes
  useEffect(() => {
    reset({
      stockId: "",
      type: "IN",
      qty: 0,
      notes: "",
    });
  }, [activeOutlet, reset]);

  // Mutation: Save stock adjustment
  const adjustMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan penyesuaian");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Penyesuaian stok berhasil disimpan!");
      setValue("qty", 0);
      setValue("notes", "");
      queryClient.invalidateQueries({ queryKey: ["stocks-list"] });
      queryClient.invalidateQueries({ queryKey: ["movements-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const onSubmit = (data: AdjustmentFormValues) => {
    adjustMutation.mutate(data);
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

  const handleCancel = () => {
    reset({
      stockId: stocks.length > 0 ? stocks[0].id : "",
      type: "IN",
      qty: 0,
      notes: "",
    });
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in relative pb-10">
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

      {/* Header Panel */}
      <div className="bg-white p-4.5 rounded-xl border border-border-custom shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/5 border border-primary/10 rounded-xl text-primary">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-extrabold text-base text-text-custom leading-tight">Input Stok & Riwayat</h2>
            <p className="text-[10px] text-gray-400 mt-0.5 font-medium leading-normal">
              Gunakan formulir untuk menyesuaikan stok produk tunggal, dan tinjau log mutasi harian secara langsung.
            </p>
          </div>
        </div>

        {/* Outlet scoping selector */}
        {userRole !== "KASIR" && (
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" /> Outlet:
            </span>
            <select
              value={activeOutlet}
              onChange={(e) => setActiveOutlet(e.target.value)}
              className="px-3.5 py-1.5 bg-bg-custom border border-border-custom text-xs font-bold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
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

      {/* Main Grid: Form on Left, History on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Column Left: Input Form (w-5/12 on large screen) */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-border-custom rounded-2xl shadow-sm p-6 flex flex-col gap-5">
            <div className="pb-3 border-b border-border-custom">
              <h3 className="font-extrabold text-sm text-text-custom">Form Penyesuaian Stok</h3>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-normal">
                Modifikasi stok produk, log akan dicatat secara otomatis.
              </p>
            </div>

            {isLoadingStocks ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Memuat daftar produk...</span>
              </div>
            ) : stocks.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-400">
                Tidak ada produk terdaftar untuk outlet ini.
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                {/* Product Dropdown Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Produk</label>
                  <select
                    {...register("stockId")}
                    className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  >
                    {stocks.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.product.name} ({s.product.sku})
                      </option>
                    ))}
                  </select>
                  {errors.stockId && (
                    <span className="text-[9px] text-primary font-bold">{errors.stockId.message}</span>
                  )}
                </div>

                {/* Active Stock Indicator Block */}
                {selectedStock && (
                  <div className="p-3.5 bg-bg-custom border border-border-custom rounded-xl flex items-center justify-between text-xs text-text-custom">
                    <span className="font-semibold">Stok Aktif Saat Ini:</span>
                    <span className="font-extrabold text-primary text-sm">
                      {selectedStock.quantity} pcs
                    </span>
                  </div>
                )}

                {/* Adjustment Type Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tipe Penyesuaian</label>
                  <select
                    {...register("type")}
                    className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  >
                    <option value="IN">Stok Masuk (+)</option>
                    <option value="OUT">Stok Keluar (-)</option>
                    <option value="INITIAL">Stok Awal</option>
                  </select>
                  {errors.type && (
                    <span className="text-[9px] text-primary font-bold">{errors.type.message}</span>
                  )}
                </div>

                {/* Quantity Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    Jumlah (pcs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Contoh: 10"
                    {...register("qty")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errors.qty && (
                    <span className="text-[9px] text-primary font-bold">{errors.qty.message}</span>
                  )}
                </div>

                {/* Calculation Hint message */}
                {selectedStock && watchQty > 0 && (
                  <div className="text-[10px] text-gray-500 bg-gray-50 border border-gray-150 p-2.5 rounded-lg flex flex-col gap-0.5">
                    <span className="font-bold uppercase tracking-wider text-[8px] text-gray-400">Pratinjau Hasil</span>
                    {watchType === "IN" && (
                      <span>Stok akan bertambah: {selectedStock.quantity} + {watchQty} = <strong className="text-emerald-600">{selectedStock.quantity + watchQty} pcs</strong></span>
                    )}
                    {watchType === "OUT" && (
                      <span>Stok akan berkurang: {selectedStock.quantity} - {watchQty} = <strong className="text-primary">{Math.max(0, selectedStock.quantity - watchQty)} pcs</strong></span>
                    )}
                    {watchType === "INITIAL" && (
                      <span>Mengubah stok awal lama ({selectedStock.initialStock} pcs) menjadi <strong className="text-gray-700">{watchQty} pcs</strong>.</span>
                    )}
                  </div>
                )}

                {/* Reason Notes Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Alasan / Catatan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Kiriman supplier, produk rusak, audit internal"
                    {...register("notes")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  {errors.notes && (
                    <span className="text-[9px] text-primary font-bold">{errors.notes.message}</span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="w-1/2 py-2.5 border border-border-custom hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={adjustMutation.isPending}
                    className="w-1/2 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {adjustMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Penyesuaian</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Column Right: Riwayat Input (w-7/12 on large screen) */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-border-custom rounded-2xl shadow-sm p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-custom">
              <div className="flex flex-col">
                <h3 className="font-extrabold text-sm text-text-custom">Riwayat Input Stok</h3>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-normal">
                  Daftar mutasi penyesuaian stok produk terbaru di outlet ini.
                </p>
              </div>
              <button
                onClick={() => refetchHistory()}
                className="p-2 border border-border-custom hover:border-primary/20 text-gray-400 hover:text-primary rounded-xl transition-all cursor-pointer"
                title="Refresh Riwayat"
              >
                <History className="w-4 h-4" />
              </button>
            </div>

            {/* Movements History List */}
            <div className="overflow-x-auto min-h-[350px]">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Memuat riwayat mutasi...</span>
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-2xl border border-border-custom border-dashed">
                  Belum ada log mutasi stok tercatat untuk outlet ini.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Produk</th>
                      <th className="py-2.5 px-3 text-center">Tipe</th>
                      <th className="py-2.5 px-3 text-center">Jumlah</th>
                      <th className="py-2.5 px-3">Oleh</th>
                      <th className="py-2.5 px-3">Catatan</th>
                      {isOwnerOrDev && <th className="py-2.5 px-3 text-center">Aksi</th>}
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
                          <td className="py-3 px-3 text-gray-500 font-semibold truncate max-w-[120px]">
                            {formatDayDate(m.createdAt)}
                          </td>
                          <td className="py-3 px-3 font-bold text-text-custom">{m.productName}</td>
                          <td className="py-3 px-3 text-center">
                            {isIncoming ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] font-bold">
                                <Plus className="w-2.5 h-2.5" /> Masuk
                              </span>
                            ) : isOutgoing ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-primary/10 text-primary rounded text-[9px] font-bold">
                                <Minus className="w-2.5 h-2.5" /> Keluar
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-[#F5C14E]/25 text-[#b3861b] rounded text-[9px] font-bold">
                                ✦ Edit
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "py-3 px-3 text-center font-extrabold",
                              isIncoming ? "text-emerald-600" : isOutgoing ? "text-primary" : "text-[#b3861b]"
                            )}
                          >
                            {isIncoming ? "+" : isOutgoing ? "-" : ""}
                            {m.quantity} pcs
                          </td>
                          <td className="py-3 px-3 text-gray-500 italic truncate max-w-[90px]">{m.userName}</td>
                          <td className="py-3 px-3 text-gray-400 font-medium leading-normal max-w-[150px] truncate" title={m.notes}>
                            {m.notes}
                          </td>
                          {isOwnerOrDev && (
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => handleDeleteMovement(m.id, m.productName)}
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
