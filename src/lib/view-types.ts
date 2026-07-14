// Plain, serialisable shapes passed from server components to client
// components (keeps Prisma types on the server, props lightweight).

export interface AccountLite {
  id: string;
  name: string;
  type: string;
  currency: string;
  color: string;
}

export interface CategoryLite {
  id: string;
  name: string;
  kind: string;
  icon: string;
  color: string;
}
