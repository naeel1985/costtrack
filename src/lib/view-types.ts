// Plain, serialisable shapes passed from server components to client
// components (keeps Prisma types on the server, props lightweight).

export interface AccountLite {
  id: string;
  name: string;
  type: string;
  currency: string;
  color: string;
  /** Auto-managed accounts (e.g. the credit-card liability) — hidden from pickers. */
  isSystem?: boolean;
}

export interface CategoryLite {
  id: string;
  name: string;
  kind: string;
  icon: string;
  color: string;
}
