"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  Settings,
  Database,
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building,
  Phone,
  MapPin,
  Percent,
  Hash,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

const settingsSchema = zod.object({
  storeName: zod.string().min(2, { message: "Nama usaha minimal 2 karakter" }),
  address: zod.string().min(5, { message: "Alamat minimal 5 karakter" }),
  phone: zod.string().min(5, { message: "Nomor telepon minimal 5 karakter" }),
  tax: zod.number().min(0).max(100, { message: "Pajak antara 0% s/d 100%" }),
  prefixInvoice: zod.string().min(2).max(5, { message: "Prefix invoice 2 s/d 5 karakter" }),
});

type SettingsForm = zod.infer<typeof settingsSchema>;

export default function PengaturanPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const confirm = useConfirm();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Redirect if not Developer (RBAC rule: only DEVELOPER manages configurations and backup/restore)
  useEffect(() => {
    if (session && userRole !== "DEVELOPER") {
      window.location.href = "/dashboard";
    }
  }, [session, userRole]);

  // Form Setup
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setValue("storeName", data.storeName);
          setValue("address", data.address);
          setValue("phone", data.phone);
          setValue("tax", data.tax);
          setValue("prefixInvoice", data.prefixInvoice);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    if (session) {
      fetchSettings();
    }
  }, [session, setValue]);

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  const onSubmit = async (data: SettingsForm) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal memperbarui pengaturan");
      }

      triggerAlert("success", "Pengaturan usaha berhasil disimpan!");
    } catch (err: any) {
      triggerAlert("error", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Export JSON Backup
  const handleExportBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await fetch("/api/settings/backup");
      if (!res.ok) {
        throw new Error("Gagal mengambil cadangan data");
      }

      const backupJSON = await res.json();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupJSON, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `cipak_pos_backup_${new Date().toISOString().split("T")[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      triggerAlert("success", "Backup database berhasil diunduh!");
    } catch (err: any) {
      triggerAlert("error", err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  // Import JSON Restore
  const handleImportRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!await confirm({
      title: "Peringatan Kritis!",
      message: "Memulihkan database dari file cadangan akan menghapus seluruh data transaksi, stok, produk, dan outlet saat ini. Apakah Anda yakin ingin melanjutkan?",
      confirmText: "Ya, Pulihkan",
      variant: "danger",
    })) {
      e.target.value = ""; // clear file picker
      return;
    }

    setIsRestoring(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);

          const res = await fetch("/api/settings/backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Gagal memulihkan data");
          }

          triggerAlert("success", "Database berhasil dipulihkan dari file cadangan!");
          // Force page refresh after 2 seconds to reload all state
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (error: any) {
          triggerAlert("error", "Format berkas salah atau data rusak: " + error.message);
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      triggerAlert("error", err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-xs">Memuat menu pengaturan...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in relative">
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

      {/* Form: Shop Settings (Left/Center Column) */}
      <div className="lg:col-span-2 bg-white border border-border-custom rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border-custom">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-extrabold text-sm text-text-custom">Profil & Konfigurasi Usaha</h3>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Company Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-primary" /> Nama Usaha (Brand)
            </label>
            <input
              type="text"
              {...register("storeName")}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
            />
            {errors.storeName && (
              <span className="text-[9px] text-primary font-bold">{errors.storeName.message}</span>
            )}
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-primary" /> Nomor Telepon Kantor
            </label>
            <input
              type="text"
              {...register("phone")}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
            {errors.phone && (
              <span className="text-[9px] text-primary font-bold">{errors.phone.message}</span>
            )}
          </div>

          {/* Address */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" /> Alamat Kantor Pusat
            </label>
            <textarea
              rows={3}
              {...register("address")}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom resize-none leading-normal"
            />
            {errors.address && (
              <span className="text-[9px] text-primary font-bold">{errors.address.message}</span>
            )}
          </div>

          {/* Tax & Invoice Serial */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-primary" /> Tarif Pajak (%)
              </label>
              <input
                type="number"
                step="0.1"
                {...register("tax", { valueAsNumber: true })}
                className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
              />
              {errors.tax && (
                <span className="text-[9px] text-primary font-bold">{errors.tax.message}</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-primary" /> Prefix Invoice
              </label>
              <input
                type="text"
                {...register("prefixInvoice")}
                className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold uppercase"
              />
              {errors.prefixInvoice && (
                <span className="text-[9px] text-primary font-bold">{errors.prefixInvoice.message}</span>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSaving}
            className="py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer mt-2 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <span>Simpan Konfigurasi</span>
            )}
          </button>
        </form>
      </div>

      {/* Database Backup & Restore Panel (Right Column) */}
      <div className="bg-white border border-border-custom rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border-custom">
          <Database className="w-5 h-5 text-primary" />
          <h3 className="font-extrabold text-sm text-text-custom">Utilitas Database</h3>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-[10px] text-gray-400 leading-relaxed uppercase tracking-wide font-bold">
            Cadangkan (Backup) & Pulihkan (Restore) database menggunakan file format JSON portable.
          </p>

          {/* Export button */}
          <div className="flex flex-col gap-2 p-3.5 border border-border-custom rounded-xl bg-bg-custom">
            <span className="text-[10px] font-extrabold text-text-custom uppercase tracking-wide">
              Ekspor Cadangan
            </span>
            <span className="text-[9px] text-gray-400 leading-normal">
              Unduh seluruh snapshot data sistem termasuk transaksi, barang, stok, dan user.
            </span>
            <button
              onClick={handleExportBackup}
              disabled={isBackingUp}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 mt-1"
            >
              {isBackingUp ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Ekspor Backup JSON</span>
            </button>
          </div>

          {/* Import button */}
          <div className="flex flex-col gap-2 p-3.5 border border-primary/20 rounded-xl bg-primary/5">
            <span className="text-[10px] font-extrabold text-primary uppercase tracking-wide flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-primary" />
              Impor / Pulihkan Data
            </span>
            <span className="text-[9px] text-primary/70 leading-normal">
              Pilih file JSON backup untuk menimpa seluruh data sistem. Tindakan ini tidak dapat dibatalkan!
            </span>

            <label className="w-full py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 mt-1 text-center">
              {isRestoring ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Unggah File & Pulihkan</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportRestore}
                disabled={isRestoring}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
