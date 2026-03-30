import { cookies } from "next/headers";
import { Navbar } from "@/components/navbar";
import { AUTH_COOKIE_NAME, USERNAME_COOKIE_NAME } from "@/lib/constants";
import { redirect } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const role = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const username = cookieStore.get(USERNAME_COOKIE_NAME)?.value || "Admin";

  if (role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar role="admin" username={username} />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
