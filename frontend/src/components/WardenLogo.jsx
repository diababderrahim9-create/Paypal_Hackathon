import React from 'react';

export const WardenLogo = ({
  variant = 'full',
  size = 36,
  className = ''
}) => {
  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 115"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path
          d="M50 6L12 19V53C12 80.5 28.2 103.5 50 110C71.8 103.5 88 80.5 88 53V19L50 6Z"
          fill="#1E2631"
          stroke="#EBE8E0"
          strokeWidth="6.5"
          strokeLinejoin="round"
        />

        <path
          d="M28 33L42 30V65"
          stroke="#6C8CA1"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M72 33L58 30V65"
          stroke="#6C8CA1"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M28 43V60C28 69 34 78 39 84L50 64L61 84C66 78 72 69 72 60V43"
          stroke="#EBE8E0"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {variant === 'full' && (
        <div className="flex flex-col justify-center">
          <span className="text-xl font-bold tracking-[0.18em] text-[#EBE8E0] leading-none">
            WARDEN
          </span>
          <span className="text-[9px] font-mono tracking-[0.06em] text-[#8FA3B0] mt-1 uppercase">
            Deterministic AI Firewall
          </span>
        </div>
      )}
    </div>
  );
};

export default WardenLogo;
