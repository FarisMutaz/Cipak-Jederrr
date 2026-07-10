import React from "react";
import Image from "next/image";

export default function Logo({ className = "w-32 h-32" }: { className?: string }) {
  return (
    <div className={`relative transition-transform hover:scale-105 duration-300 ${className}`}>
      <Image
        src="/logo.png"
        alt="Cipak Jederrr Logo"
        width={128}
        height={128}
        className="w-full h-full object-contain"
        priority
      />
    </div>
  );
}
