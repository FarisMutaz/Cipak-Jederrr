"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import Logo from "@/components/logo";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

const loginSchema = zod.object({
  username: zod.string().min(1, { message: "Username harus diisi" }),
  password: zod.string().min(1, { message: "Password harus diisi" }),
});

type LoginForm = zod.infer<typeof loginSchema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        username: data.username,
        password: data.password,
      });

      if (result?.error) {
        setError(result.error || "Username atau password salah.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      setError("Terjadi kesalahan sistem. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-border-custom p-8 shadow-xl w-full max-w-md"
    >
      {/* Brand Header */}
      <div className="flex flex-col items-center gap-4 mb-6">
        <Logo className="w-24 h-24" />
        <div className="text-center">
          <h2 className="font-extrabold text-xl text-text-custom">Cipak Jederrr POS</h2>
          <p className="text-xs text-gray-500 mt-1">Silakan masuk untuk mencatat transaksi penjualan</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-custom uppercase tracking-wide">Username</label>
          <input
            type="text"
            placeholder="Masukkan username Anda"
            {...register("username")}
            className="px-4 py-2.5 rounded-xl border border-border-custom bg-bg-custom text-sm focus:outline-none focus:border-primary/50 transition-colors"
          />
          {errors.username && <span className="text-[10px] text-primary font-bold">{errors.username.message}</span>}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5 relative">
          <label className="text-xs font-bold text-text-custom uppercase tracking-wide">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              {...register("password")}
              className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border-custom bg-bg-custom text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-text-custom"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <span className="text-[10px] text-primary font-bold">{errors.password.message}</span>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memverifikasi...</span>
            </>
          ) : (
            <span>Masuk ke POS</span>
          )}
        </button>
      </form>

      {/* Footer Info */}
      <div className="text-center text-[10px] text-gray-400 mt-6 leading-relaxed">
        &copy; {new Date().getFullYear()} Cipak Jederrr! by Ciderrr Foods.<br />
        Semua hak cipta dilindungi.
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-screen bg-bg-custom flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="bg-white rounded-2xl p-8 border border-border-custom shadow-xl w-full max-w-md flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs text-gray-500">Memuat halaman...</span>
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </div>
  );
}
