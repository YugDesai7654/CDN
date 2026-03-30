import { redirect } from "next/navigation";

export default function RootPage() {
  // Default redirect to login. Middleware will handle subsequent routing if already logged in.
  redirect("/login");
}
