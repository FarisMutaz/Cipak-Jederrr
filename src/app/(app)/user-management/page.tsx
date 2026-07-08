"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  X,
  Shield,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building,
  Key,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const userSchema = zod.object({
  name: zod.string().min(2, { message: "Nama minimal 2 karakter" }),
  username: zod.string().min(2, { message: "Username minimal 2 karakter" }),
  password: zod.string().optional(),
  roleName: zod.enum(["DEVELOPER", "OWNER", "KOORLAP", "KASIR"]),
  outletIds: zod.array(zod.string()).optional(),
});

type UserForm = zod.infer<typeof userSchema>;

export default function UserManagementPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const activeUser = session?.user as any;
  const activeUserRole = activeUser?.role || "KASIR";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [allOutlets, setAllOutlets] = useState<any[]>([]);

  // Redirect if not Owner/Developer
  useEffect(() => {
    if (session && activeUserRole !== "DEVELOPER" && activeUserRole !== "OWNER") {
      window.location.href = "/dashboard";
    }
  }, [session, activeUserRole]);

  // Fetch all outlets list
  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const res = await fetch("/api/outlets");
        if (res.ok) {
          const data = await res.json();
          setAllOutlets(data);
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchOutlets();
  }, []);

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Gagal memuat pengguna");
      return res.json();
    },
    enabled: !!session,
  });

  // Form Setup
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      roleName: "KASIR",
      outletIds: [],
    },
  });

  const selectedRole = watch("roleName");
  const selectedOutletIds = watch("outletIds") || [];

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Prepare edit
  const openEditModal = (u: any) => {
    setEditingUser(u);
    setValue("name", u.name);
    setValue("username", u.username);
    setValue("password", ""); // Leave blank for keep
    setValue("roleName", u.role);
    setValue("outletIds", u.outlets.map((o: any) => o.id));
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingUser(null);
    reset({
      name: "",
      username: "",
      password: "",
      roleName: "KASIR",
      outletIds: [],
    });
    setIsModalOpen(true);
  };

  // Mutation: Save
  const saveMutation = useMutation({
    mutationFn: async (data: UserForm) => {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PUT" : "POST";

      // If adding new user, password is required
      if (!editingUser && !data.password) {
        throw new Error("Password wajib diisi untuk pengguna baru");
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan pengguna");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", editingUser ? "Pengguna berhasil diperbarui!" : "Pengguna baru berhasil ditambah!");
      setIsModalOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  // Mutation: Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus pengguna");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Pengguna berhasil dihapus!");
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDelete = (id: string) => {
    if (id === activeUser.id) {
      triggerAlert("error", "Anda tidak dapat menghapus akun Anda sendiri");
      return;
    }
    if (confirm("Apakah Anda yakin ingin menghapus pengguna ini? Pengguna tidak akan dapat masuk ke sistem lagi.")) {
      deleteMutation.mutate(id);
    }
  };

  const handleCheckboxChange = (outletId: string, checked: boolean) => {
    if (selectedRole === "KASIR") {
      // Kasir is locked to exactly one outlet
      setValue("outletIds", checked ? [outletId] : []);
    } else {
      // Manager can check checklist multiple outlets
      if (checked) {
        setValue("outletIds", [...selectedOutletIds, outletId]);
      } else {
        setValue(
          "outletIds",
          selectedOutletIds.filter((id) => id !== outletId)
        );
      }
    }
  };

  const onFormSubmit = (data: UserForm) => {
    // If Kasir or Manager, enforce outletIds presence
    if ((data.roleName === "KASIR" || data.roleName === "KOORLAP") && (!data.outletIds || data.outletIds.length === 0)) {
      triggerAlert("error", `Pengguna dengan role ${data.roleName} wajib memiliki minimal 1 outlet`);
      return;
    }
    // If Owner/Developer, ignore outlet mapping
    if (data.roleName === "DEVELOPER" || data.roleName === "OWNER") {
      data.outletIds = [];
    }
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
          <Users className="w-5 h-5 text-primary" />
          Kelola User POS
        </h3>
        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah User</span>
        </button>
      </div>

      {/* Users table card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs">Memuat daftar pengguna...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-24 text-xs text-gray-400">
            Tidak ada pengguna terdaftar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                  <th className="py-3.5 px-4">Nama Pengguna</th>
                  <th className="py-3.5 px-4">Username Login</th>
                  <th className="py-3.5 px-4">Role Hak Akses</th>
                  <th className="py-3.5 px-4">Scope Outlet Ditugaskan</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr
                    key={u.id}
                    className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-text-custom">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#F5C14E]/10 border border-[#F5C14E]/30 flex items-center justify-center text-primary font-bold text-xs">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{u.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 font-medium">{u.username}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/5 text-primary text-[9px] font-bold rounded-lg uppercase tracking-wider">
                        <Shield className="w-3 h-3 text-[#F5C14E]" />
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {u.role === "DEVELOPER" || u.role === "OWNER" ? (
                        <span className="text-[10px] text-gray-400 font-semibold italic">Semua Outlet (Global Scope)</span>
                      ) : u.outlets.length === 0 ? (
                        <span className="text-[10px] text-primary font-semibold italic flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> Belum ditugaskan
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.outlets.map((o: any) => (
                            <span
                              key={o.id}
                              className="px-2 py-0.5 bg-bg-custom border border-border-custom text-gray-600 text-[9px] font-bold rounded"
                            >
                              {o.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.id !== activeUser.id && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal - Add / Edit User Form */}
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
                  <Users className="w-5 h-5 text-primary" />
                  {editingUser ? `Edit User: ${editingUser.name}` : "Tambah User Baru"}
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
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Lengkap</label>
                  <input
                    type="text"
                    placeholder="Contoh: Faris Kasir Cideng"
                    {...register("name")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errors.name && <span className="text-[9px] text-primary font-bold">{errors.name.message}</span>}
                </div>

                {/* Username */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Username Login</label>
                  <input
                    type="text"
                    placeholder="faris"
                    {...register("username")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  />
                  {errors.username && <span className="text-[9px] text-primary font-bold">{errors.username.message}</span>}
                </div>

                {/* Password / Reset */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    {editingUser ? "Ganti Password (Kosongkan jika tetap)" : "Password Login"}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="••••••••"
                      {...register("password")}
                      className="w-full pl-3.5 pr-10 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                    />
                    <Key className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Role */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Role Akses</label>
                  <select
                    {...register("roleName")}
                    className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                  >
                    <option value="DEVELOPER">Developer (Akses Sistem Penuh)</option>
                    <option value="OWNER">Owner (Akses Laporan & Keuangan)</option>
                    <option value="KOORLAP">Koorlap (Kelola Multi Outlet)</option>
                    <option value="KASIR">Kasir (Transaksi & Belanja Single Outlet)</option>
                  </select>
                </div>

                {/* Outlet Scope checklist */}
                {(selectedRole === "KASIR" || selectedRole === "KOORLAP") && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-primary" />
                      Scope Outlet yang Ditugaskan
                    </label>

                    <div className="border border-border-custom rounded-xl p-3 bg-bg-custom flex flex-col gap-2 max-h-[140px] overflow-y-auto">
                      {allOutlets.length === 0 ? (
                        <p className="text-[10px] text-gray-400 italic text-center py-2">Belum ada outlet aktif</p>
                      ) : selectedRole === "KASIR" ? (
                        /* Kasir - single select dropdown representation */
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[9px] text-gray-500 italic block mb-1">
                            Kasir wajib ditugaskan ke tepat 1 outlet.
                          </span>
                          {allOutlets.map((o) => (
                            <label
                              key={o.id}
                              className="flex items-center gap-2 text-xs font-semibold text-text-custom cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="kasirOutlet"
                                checked={selectedOutletIds.includes(o.id)}
                                onChange={(e) => handleCheckboxChange(o.id, e.target.checked)}
                                className="accent-primary"
                              />
                              <span>{o.name}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        /* Koorlap - checklist */
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[9px] text-gray-500 italic block mb-1">
                            Koorlap dapat mengelola beberapa outlet sekaligus.
                          </span>
                          {allOutlets.map((o) => (
                            <label
                              key={o.id}
                              className="flex items-center gap-2 text-xs font-semibold text-text-custom cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedOutletIds.includes(o.id)}
                                onChange={(e) => handleCheckboxChange(o.id, e.target.checked)}
                                className="rounded text-primary focus:ring-primary accent-primary"
                              />
                              <span>{o.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                      <span>Simpan User</span>
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
