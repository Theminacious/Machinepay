import type { SVGProps } from "react";
import type { MachineKind } from "../lib/machines";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function VehicleIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M3 13.5h18M5.5 13.5 7 8.2A2 2 0 0 1 8.9 6.8h6.2a2 2 0 0 1 1.9 1.4l1.5 5.3" />
      <path d="M4 13.5v3.2h16V13.5" />
      <circle cx="7.5" cy="17" r="1.7" />
      <circle cx="16.5" cy="17" r="1.7" />
      <path d="M11 3.2 9.6 5.6h2.4L10.6 8" />
    </svg>
  );
}

export function ChargerIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <rect x="5" y="3.2" width="11" height="14" rx="2.2" />
      <path d="M8.4 7.4h4.2M8.4 10.4h4.2" />
      <path d="M16 9h1.8a2.2 2.2 0 0 1 2.2 2.2v5a1.8 1.8 0 0 1-3.6 0V14" />
      <path d="M9.6 17.2v3.6M12.4 17.2v3.6" />
    </svg>
  );
}

export function UtilityIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M7 21V6.5L12 3l5 3.5V21" />
      <path d="M4.2 21h15.6" />
      <path d="M7 10.5h10M7 15h10" />
      <path d="M12.6 6.6 11 9.6h2.2L11.6 12.6" />
    </svg>
  );
}

export function machineIcon(kind: MachineKind) {
  if (kind === "vehicle") return VehicleIcon;
  if (kind === "charger") return ChargerIcon;
  return UtilityIcon;
}

export function BoltIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M13 2.5 5.5 13.2h5L10 21.5 18.5 10h-5.2z" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M12 2.8 5 5.4v5.2c0 4.4 2.9 8.3 7 10.6 4.1-2.3 7-6.2 7-10.6V5.4z" />
      <path d="M9.2 12.2l2 2 3.6-4" />
    </svg>
  );
}

export function BlockIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.8 5.8l12.4 12.4" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.5v3.8a2 2 0 0 1-2 2H5.7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H9.5" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <rect x="3" y="6" width="18" height="12.5" rx="2.4" />
      <path d="M3 10.2h18" />
      <circle cx="16.8" cy="14.2" r="1.1" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base} {...props} className={`animate-spin ${props.className ?? ""}`} aria-hidden="true">
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" opacity="0.9" />
    </svg>
  );
}
