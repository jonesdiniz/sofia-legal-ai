import sofiaLogo from "@/assets/sofia-logo.png";

interface SofiaLogoProps {
  className?: string;
}

export function SofiaLogo({ className = "h-12 w-12" }: SofiaLogoProps) {
  return (
    <img
      src={sofiaLogo}
      alt="Sofia - Assistente Previdenciária"
      className={className}
    />
  );
}
