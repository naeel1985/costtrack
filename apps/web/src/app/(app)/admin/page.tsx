export const dynamic = "force-dynamic";

import { getAdminData } from "@/server/admin";
import { AdminView } from "@/components/admin/admin-view";

export default async function AdminPage() {
  const data = await getAdminData();
  return <AdminView data={data} />;
}
