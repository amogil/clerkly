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
          @keyframes pulse-subtle {
            0%, 100% {
              opacity: 0.6;
              r: 1.8;
            }
            50% {
              opacity: 0.95;
              r: 2.3;
            }
          }
          
          @keyframes pulse-medium {
            0%, 100% {
              opacity: 0.7;
              r: 2;
            }
            50% {
              opacity: 1;
              r: 2.6;
            }
          }
          
          @keyframes pulse-strong {
            0%, 100% {
              opacity: 0.85;
              r: 2.2;
            }
            50% {
              opacity: 1;
              r: 2.8;
            }
          }
          
          @keyframes pulse-center {
            0%, 100% {
              opacity: 0.95;
              r: 2.5;
            }
            25% {
              opacity: 1;
              r: 3.2;
            }
            75% {
              opacity: 1;
              r: 2.8;
            }
          }
          
          @keyframes flow-fast {
            0% {
              stroke-dashoffset: 20;
              opacity: 0.4;
            }
            50% {
              opacity: 0.8;
            }
            100% {
              stroke-dashoffset: 0;
              opacity: 0.4;
            }
          }
          
          @keyframes flow-slow {
            0% {
              stroke-dashoffset: 20;
              opacity: 0.3;
            }
            50% {
              opacity: 0.7;
            }
            100% {
              stroke-dashoffset: 0;
              opacity: 0.3;
            }
          }
          
          /* Top-left node - subtle pulse */
          .logo-animated .nodes circle:nth-child(1) {
            animation: pulse-subtle 3.2s ease-in-out infinite;
            animation-delay: 0s;
          }
          
          /* Bottom-left node - medium pulse */
          .logo-animated .nodes circle:nth-child(2) {
            animation: pulse-medium 2.4s ease-in-out infinite;
            animation-delay: 0.8s;
          }
          
          /* Center node - complex pulse */
          .logo-animated .nodes circle:nth-child(3) {
            animation: pulse-center 2.88s ease-in-out infinite;
            animation-delay: 0.4s;
          }
          
          /* Top-right node - strong pulse */
          .logo-animated .nodes circle:nth-child(4) {
            animation: pulse-strong 2.6s ease-in-out infinite;
            animation-delay: 1.6s;
          }
          
          /* Bottom-right node - medium pulse */
          .logo-animated .nodes circle:nth-child(5) {
            animation: pulse-medium 3s ease-in-out infinite;
            animation-delay: 2.2s;
          }
          
          /* Connection lines - varied flow speeds */
          .logo-animated .connections line:nth-child(1) {
            stroke-dasharray: 5 5;
            animation: flow-fast 2s linear infinite;
            animation-delay: 0s;
          }
          
          .logo-animated .connections line:nth-child(2) {
            stroke-dasharray: 5 5;
            animation: flow-slow 2.8s linear infinite;
            animation-delay: 0.7s;
          }
          
          .logo-animated .connections line:nth-child(3) {
            stroke-dasharray: 5 5;
            animation: flow-fast 2.2s linear infinite;
            animation-delay: 1.4s;
          }
          
          .logo-animated .connections line:nth-child(4) {
            stroke-dasharray: 5 5;
            animation: flow-slow 2.6s linear infinite;
            animation-delay: 2.1s;
          }
        `}</style>
      )}
    </div>
  );
}