import Image from "next/image";

/** GMS logo. 36 px tall (131.5 × 36 CSS px) in the sidebar, measured from 06-sidebar.png. */
export function GmsMark({ className = "h-9 w-auto" }: Readonly<{ className?: string }>) {
  return <Image src="/gms-logo.png" alt="GMS Gemstone Management System" width={263} height={72} priority className={className} />;
}
