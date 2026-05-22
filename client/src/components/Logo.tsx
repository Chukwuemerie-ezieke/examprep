interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

/**
 * Harmony Digital Consults brand logo.
 * Shield with "HD" lettermark in teal gradient, gold book swoosh underneath.
 * Inline SVG for crisp rendering at any size and zero network cost.
 */
export function Logo({ size = 48, showText = false, className = "" }: LogoProps) {
  const uid = "hdcl"; // gradient id prefix (stable, single instance on page)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 110"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Harmony Digital Consults logo"
        role="img"
      >
        <defs>
          <linearGradient id={`${uid}-shield`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2A8E9B" />
            <stop offset="100%" stopColor="#0F4856" />
          </linearGradient>
          <linearGradient id={`${uid}-gold`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E8B547" />
            <stop offset="100%" stopColor="#C8941F" />
          </linearGradient>
        </defs>
        {/* Shield */}
        <path
          d="M50 4 L92 18 L92 58 C92 78 75 96 50 104 C25 96 8 78 8 58 L8 18 Z"
          fill={`url(#${uid}-shield)`}
        />
        {/* "HD" lettermark */}
        <text
          x="50"
          y="58"
          textAnchor="middle"
          fontFamily="'Plus Jakarta Sans', sans-serif"
          fontWeight="800"
          fontSize="38"
          fill="#ffffff"
          letterSpacing="-1"
        >
          HD
        </text>
        {/* Gold book swoosh */}
        <path
          d="M22 78 Q50 70 78 78 Q50 86 22 78 Z"
          fill={`url(#${uid}-gold)`}
        />
        <path
          d="M22 78 Q50 70 78 78"
          stroke="#A87A0F"
          strokeWidth="0.8"
          fill="none"
          opacity="0.4"
        />
      </svg>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight text-foreground">
            HARMONY
          </span>
          <span className="text-[10px] font-medium tracking-wider text-muted-foreground">
            DIGITAL CONSULTS
          </span>
        </div>
      )}
    </div>
  );
}
