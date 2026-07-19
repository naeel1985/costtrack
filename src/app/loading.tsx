import { PageLoader } from "@/components/page-loader";

// Full-page fallback (first load, auth and marketing routes) while the server
// renders the requested page.
export default function Loading() {
  return <PageLoader />;
}
