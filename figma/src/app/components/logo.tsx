interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  animated?: boolean;
}

export function Logo({ size = 'md', showText = true, animated = false }: LogoProps) {
  const sizes = {
    sm: { icon: 32, text: 'text-lg' },
    md: { icon: 40, text: 'text-2xl' },
    lg: { icon: 48, text: 'text-4xl' },
  };

  const iconSize = sizes[size].icon;
  const textClass = sizes[size].text;
  
  // Generate unique ID for gradient to avoid conflicts
  const gradientId = `logo-gradient-${size}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="flex items-center gap-3">
      {/* Logo Icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={animated ? 'logo-animated' : ''}
      >
        {/* Background circle with gradient */}
        <circle cx="16" cy="16" r="16" fill={`url(#${gradientId})`} />
        
        {/* Neural network nodes - representing AI intelligence */}
        <g className={animated ? 'nodes' : ''}>
          <circle cx="10" cy="12" r="2" fill="white" opacity="0.9" />
          <circle cx="10" cy="20" r="2" fill="white" opacity="0.9" />
          <circle cx="16" cy="16" r="2.5" fill="white" />
          <circle cx="22" cy="12" r="2" fill="white" opacity="0.9" />
          <circle cx="22" cy="20" r="2" fill="white" opacity="0.9" />
        </g>
        
        {/* Connection lines - representing organization and structure */}
        <g className={animated ? 'connections' : ''} opacity="0.6">
          <line x1="10" y1="12" x2="16" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="20" x2="16" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="16" x2="22" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="16" x2="22" y2="20" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        
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

      {/* Logo Text */}
      {showText && (
        <div>
          <h1 className={`${textClass} font-semibold text-foreground leading-none`}>
            Clerkly
          </h1>
        </div>
      )}
      
      {/* CSS for animations */}
      {animated && (
        <style>{`
          @keyframes pulse-node {
            0%, 100% {
              opacity: 0.9;
              r: 2;
            }
            50% {
              opacity: 1;
              r: 2.5;
            }
          }
          
          @keyframes pulse-center {
            0%, 100% {
              opacity: 1;
              r: 2.5;
            }
            50% {
              opacity: 1;
              r: 3;
            }
          }
          
          @keyframes flow {
            0% {
              stroke-dashoffset: 20;
            }
            100% {
              stroke-dashoffset: 0;
            }
          }
          
          .logo-animated .nodes circle:nth-child(1),
          .logo-animated .nodes circle:nth-child(2),
          .logo-animated .nodes circle:nth-child(4),
          .logo-animated .nodes circle:nth-child(5) {
            animation: pulse-node 2s ease-in-out infinite;
          }
          
          .logo-animated .nodes circle:nth-child(1) {
            animation-delay: 0s;
          }
          
          .logo-animated .nodes circle:nth-child(2) {
            animation-delay: 0.5s;
          }
          
          .logo-animated .nodes circle:nth-child(4) {
            animation-delay: 1s;
          }
          
          .logo-animated .nodes circle:nth-child(5) {
            animation-delay: 1.5s;
          }
          
          .logo-animated .nodes circle:nth-child(3) {
            animation: pulse-center 2s ease-in-out infinite;
          }
          
          .logo-animated .connections line {
            stroke-dasharray: 5 5;
            animation: flow 1.5s linear infinite;
          }
        `}</style>
      )}
    </div>
  );
}