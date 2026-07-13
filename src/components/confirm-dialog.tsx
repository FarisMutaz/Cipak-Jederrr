"use client";

import React, { useState, useCallback, useContext, createContext, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning";
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (state) {
      const { resolve } = state;
      setState(null);
      resolve(true);
    }
  }, [state]);

  const handleCancel = useCallback(() => {
    if (state) {
      const { resolve } = state;
      setState(null);
      resolve(false);
    }
  }, [state]);

  const contextValue = useMemo(() => ({ confirm }), [confirm]);

  const isDanger = state?.options.variant === "danger";

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}

      <AnimatePresence>
        {state && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/45 backdrop-blur-xs"
              onClick={handleCancel}
            />

            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-border-custom overflow-hidden"
            >
              {/* Accent bar */}
              <div className={`h-1 w-full ${isDanger ? "bg-primary" : "bg-accent"}`} />

              <div className="p-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl border ${
                      isDanger
                        ? "bg-primary/5 border-primary/15 text-primary"
                        : "bg-amber-50 border-amber-200 text-amber-600"
                    }`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <h3 className="font-extrabold text-sm text-text-custom leading-tight">
                      {state.options.title || "Konfirmasi"}
                    </h3>
                  </div>
                  <button
                    onClick={handleCancel}
                    className="p-1 rounded-lg text-gray-400 hover:text-text-custom hover:bg-bg-custom transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Message */}
                <p className="text-xs text-gray-500 leading-relaxed pl-0.5">
                  {state.options.message}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2.5 border border-border-custom hover:bg-bg-custom text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    {state.options.cancelText || "Batal"}
                  </button>
                  <button
                    onClick={handleConfirm}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition-all duration-200 cursor-pointer text-center ${
                      isDanger
                        ? "bg-primary hover:bg-primary-dark text-white shadow-primary/20 hover:shadow-lg"
                        : "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 hover:shadow-lg"
                    }`}
                  >
                    {state.options.confirmText || "Ya, Lanjutkan"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
