import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  ScrollText,
  PiggyBank,
  BarChart3,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show in the mobile bottom bar. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/income", label: "Income", icon: TrendingUp, primary: true },
  { href: "/costs", label: "Costs", icon: TrendingDown, primary: true },
  { href: "/cheques", label: "Cheques", icon: ScrollText, primary: true },
  { href: "/provisions", label: "Provisions", icon: PiggyBank },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];
