// The shared engines live in packages/core (single source of truth, also used
// by the mobile app). Imported directly as in-project source — no npm package,
// so nothing for cPanel to resolve. Kept so "@/lib/free-savings-pool" imports work.
export * from "../../packages/core/src/free-savings-pool";
