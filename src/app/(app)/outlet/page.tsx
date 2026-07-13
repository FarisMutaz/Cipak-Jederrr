"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Home,
  Building,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

const outletSchema = zod.object({
  name: zod.string().min(2, { message: "Nama outlet minimal 2 karakter" }),
  address: zod.string().optional(),
  phone: zod.string().optional(),
  email: zod.string().optional(),
  status: zod.enum(["ACTIVE", "INACTIVE"]),
});

type OutletForm = zod.infer<typeof outletSchema>;

export default function OutletManagementPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const activeUser = session?.user as any;
  const activeUserRole = activeUser?.role || "KASIR";
  const confirm = useConfirm();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<any>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Redirect if not Owner/Developer
  useEffect(() => {
    if (session && activeUserRole !== "DEVELOPER" && activeUserRole !== "OWNER") {
      window.location.href = "/dashboard";
    }
  }, [session, activeUserRole]);

  // Fetch all outlets (both active and inactive)
  const { data: outlets = [], isLoading } = useQuery({
    queryKey: ["outlets-list-all"],
    queryFn: async () => {
      const res = await fetch("/api/outlets?all=true");
      if (!res.ok) throw new Error("Gagal memuat outlet");
      return res.json();
    },
    enabled: !!session,
  });

  // Form Setup
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OutletForm>({
    resolver: zodResolver(outletSchema),
    defaultValues: {
      status: "ACTIVE",
      address: "",
      phone: "",
      email: "",
    },
  });

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Prepare edit
  const openEditModal = (o: any) => {
    setEditingOutlet(o);
    setValue("name", o.name);
    setValue("address", o.address || "");
    setValue("phone", o.phone || "");
    setValue("email", o.email || "");
    setValue("status", o.status as "ACTIVE" | "INACTIVE");
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingOutlet(null);
    reset({
      name: "",
      address: "",
      phone: "",
      email: "",
      status: "ACTIVE",
    });
    setIsModalOpen(true);
  };

  // Mutation: Save
  const saveMutation = useMutation({
    mutationFn: async (data: OutletForm) => {
      const url = editingOutlet ? `/api/outlets/${editingOutlet.id}` : "/api/outlets";
      const method = editingOutlet ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan outlet");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", editingOutlet ? "Outlet berhasil diperbarui!" : "Outlet baru berhasil ditambah!");
      setIsModalOpen(false);
      setEditingOutlet(null);
      queryClient.invalidateQueries({ queryKey: ["outlets-list-all"] });
      queryClient.invalidateQueries({ queryKey: ["outlets-list"] }); // also invalidate active ones
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  // Mutation: Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/outlets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus outlet");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Outlet berhasil dihapus!");
      queryClient.invalidateQueries({ queryKey: ["outlets-list-all"] });
      queryClient.invalidateQueries({ queryKey: ["outlets-list"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Hapus Outlet",
      message: "Apakah Anda yakin ingin menghapus outlet ini? Tindakan ini tidak dapat dibatalkan.",
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate(id);
    }
  };

  const onFormSubmit = (data: OutletForm) => {
    saveMutation.mutate(data);
  };

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

      {/* Header controls card */}
      <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex justify-between items-center">
        <h3 className="font-extrabold text-sm text-text-custom uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-5 h-5 text-primary" />
          Kelola Outlet POS
        </h3>
        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Outlet</span>
        </button>
      </div>

      {/* Outlets table card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs">Memuat daftar outlet...</span>
          </div>
        ) : outlets.length === 0 ? (
          <div className="text-center py-24 text-xs text-gray-400">
            Tidak ada outlet terdaftar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                  <th className="py-3.5 px-4">Nama Outlet</th>
                  <th className="py-3.5 px-4">Alamat</th>
                  <th className="py-3.5 px-4">Kontak</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((o: any) => (
                  <tr
                    key={o.id}
                    className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-text-custom">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                          <Building className="w-4 h-4" />
                        </div>
                        <span>{o.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 font-medium">
                      {o.address ? (
                        <div className="flex items-center gap-1.5 max-w-xs">
                          <Home className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{o.address}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Tidak ada alamat</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-0.5 text-gray-500">
                        {o.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {o.phone}
                          </span>
                        )}
                        {o.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3 text-gray-400" />
                            {o.email}
                          </span>
                        )}
                        {!o.phone && !o.email && (
                          <span className="text-gray-400 italic">Tidak ada kontak</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider border ${
                          o.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {o.status === "ACTIVE" ? "Aktif" : "Non-Aktif"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(o)}
                          className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal - Add / Edit Outlet Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md p-6 border border-border-custom shadow-xl relative overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-border-custom">
                <h3 className="font-extrabold text-sm text-text-custom flex items-center gap-1.5">
                  <MapPin className="w-5 h-5 text-primary" />
                  {editingOutlet ? `Edit Outlet: ${editingOutlet.name}` : "Tambah Outlet Baru"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-text-custom transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Outlet</label>
                  <input
                    type="text"
                    placeholder="Contoh: Cideng, Kemang"
                    {...register("name")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errors.name && <span className="text-[9px] text-primary font-bold">{errors.name.message}</span>}
                </div>

                {/* Address */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Alamat Outlet</label>
                  <input
                    type="text"
                    placeholder="Contoh: Jl. Cideng Barat No. 25, Jakarta Pusat"
                    {...register("address")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Telepon / HP</label>
                  <input
                    type="text"
                    placeholder="Contoh: 08123456789"
                    {...register("phone")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-semibold"
                  />
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Email Outlet</label>
                  <input
                    type="email"
                    placeholder="Contoh: cideng@cipak.com"
                    {...register("email")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</label>
                  <select
                    {...register("status")}
                    className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  >
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Non-Aktif</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3.5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-1/2 py-2.5 border border-border-custom hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="w-1/2 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Outlet</span>
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
