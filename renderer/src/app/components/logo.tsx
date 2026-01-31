// Requirements: E.T.4, E.U.2
type LogoProps = {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
};

export function Logo({ size = "md", showText = true }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: "text-lg" },
    md: { icon: 32, text: "text-2xl" },
    lg: { icon: 48, text: "text-4xl" },
  };

  const iconSize = sizes[size].icon;
  const textClass = sizes[size].text;
  const gradientId = `logo-gradient-${size}`;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="16" r="16" fill={`url(#${gradientId})`} />
        <path
          d="M20 9C20 9 22 11 22 16C22 21 20 23 20 23"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M17 11C17 11 18.5 12.5 18.5 16C18.5 19.5 17 21 17 21"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16" r="3" fill="white" />
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#5b6cf2" />
          </linearGradient>
        </defs>
      </svg>
      {showText ? (
        <div>
          <h1 className={`${textClass} font-semibold text-foreground leading-none`}>Clerkly</h1>
        </div>
      ) : null}
    </div>
  );
}
