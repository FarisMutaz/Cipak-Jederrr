import React from "react";

export default function Logo({ className = "w-32 h-32" }: { className?: string }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-full bg-[#B51217] border-[3px] border-[#F5C14E] shadow-md select-none p-3 text-center transition-transform hover:scale-105 duration-300 ${className}`}
    >
      {/* Sparkles */}
      <div className="absolute top-8 right-6 text-[#F5C14E] text-[8px] animate-pulse">✦</div>
      <div className="absolute top-12 left-5 text-[#F5C14E] text-[6px]">✦</div>

      {/* Chef Hat SVG Icon */}
      <svg className="w-8 h-8 text-[#F5C14E] mb-0.5 drop-shadow" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2A4 4 0 0 0 8 6v.1A3 3 0 0 0 6.5 12a1 1 0 0 0 .5.8v2.2c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-2.2c.3-.2.5-.5.5-.8a3 3 0 0 0-1.5-5.9V6a4 4 0 0 0-4-4zm-4 16v1a2 2 0 0 0 4 0v-1H8zm8 0h-2v1a2 2 0 0 0 2-1z" />
      </svg>

      {/* Brand Name */}
      <h1
        className="text-white font-extrabold text-[13px] leading-tight tracking-tight uppercase font-sans"
        style={{ textShadow: "1px 1.5px 0px #8C0D10" }}
      >
        <span className="text-[#F5C14E]">CIPAK</span>
        <br />
        <span className="text-white">JEDERRR!</span>
      </h1>

      {/* Subbrand */}
      <span className="text-[#F5C14E] italic text-[7.5px] font-semibold -mt-0.5 leading-none">
        by Ciderrr Foods
      </span>

      {/* Line Divider */}
      <div className="w-10/12 h-[1px] bg-white/20 my-1"></div>

      {/* Tagline */}
      <p className="text-[5.5px] text-white tracking-wider uppercase font-bold leading-none scale-90">
        Cicip Sekali, Nagih Selamanya!
      </p>
    </div>
  );
}
