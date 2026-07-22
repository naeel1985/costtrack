"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ScrollText,
  PiggyBank,
  BarChart3,
  Wallet,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TransactionForm } from "@/components/forms/transaction-form";
import type { TransactionType } from "@/lib/domain";
import type { AccountLite, CategoryLite } from "@/lib/view-types";

interface AppContextValue {
  openPalette: () => void;
  openQuickAdd: (type?: TransactionType) => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppInteractive");
  return ctx;
}

export function AppInteractive({
  accounts,
  categories,
  children,
}: {
  accounts: AccountLite[];
  categories: CategoryLite[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [quickAddType, setQuickAddType] = React.useState<TransactionType | null>(null);

  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  const openQuickAdd = React.useCallback((type: TransactionType = "expense") => {
    setQuickAddType(type);
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      // Quick "n" to add an expense when not typing in a field.
      if (
        e.key.toLowerCase() === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setQuickAddType("expense");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setPaletteOpen(false);
    router.push(href);
  }

  function quickAdd(type: TransactionType) {
    setPaletteOpen(false);
    setQuickAddType(type);
  }

  const value = React.useMemo(() => ({ openPalette, openQuickAdd }), [openPalette, openQuickAdd]);

  return (
    <AppContext.Provider value={value}>
      {children}

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search actions, pages… (⌘K)" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick add">
            <CommandItem onSelect={() => quickAdd("expense")}>
              <TrendingDown className="text-negative" /> Add expense
            </CommandItem>
            <CommandItem onSelect={() => quickAdd("income")}>
              <TrendingUp className="text-positive" /> Add income
            </CommandItem>
            <CommandItem onSelect={() => quickAdd("transfer")}>
              <ArrowLeftRight /> Add transfer
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => go("/dashboard")}>
              <LayoutDashboard /> Dashboard
            </CommandItem>
            <CommandItem onSelect={() => go("/income")}>
              <TrendingUp /> Income
            </CommandItem>
            <CommandItem onSelect={() => go("/costs")}>
              <TrendingDown /> Costs
            </CommandItem>
            <CommandItem onSelect={() => go("/cheques")}>
              <ScrollText /> Cheques (PDCs)
            </CommandItem>
            <CommandItem onSelect={() => go("/provisions")}>
              <PiggyBank /> Provisions
            </CommandItem>
            <CommandItem onSelect={() => go("/reports")}>
              <BarChart3 /> Reports
            </CommandItem>
            <CommandItem onSelect={() => go("/accounts")}>
              <Wallet /> Accounts
            </CommandItem>
            <CommandItem onSelect={() => go("/settings")}>
              <Settings /> Settings
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Preferences">
            <CommandItem
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                setPaletteOpen(false);
              }}
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} Toggle theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={quickAddType !== null} onOpenChange={(o) => !o && setQuickAddType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Quick add
            </DialogTitle>
          </DialogHeader>
          {quickAddType && (
            <TransactionForm
              accounts={accounts}
              categories={categories}
              defaultType={quickAddType}
              onDone={() => setQuickAddType(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppContext.Provider>
  );
}
