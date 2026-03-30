"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert, UserIcon, Globe } from "lucide-react";

export function Navbar({ role, username }: { role: "admin" | "user"; username: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b bg-card">
      <div className="flex h-16 items-center px-6 justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Globe className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">CDN Control Center</span>
          <div className="ml-6 flex items-center space-x-4">
            {role === "admin" && (
              <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors text-muted-foreground data-[active=true]:text-primary">
                Admin Dashboard
              </Link>
            )}
            <Link href="/viewer" className="text-sm font-medium hover:text-primary transition-colors text-muted-foreground data-[active=true]:text-primary">
              Content Viewer
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-foreground bg-muted px-3 py-1.5 rounded-full">
            {role === "admin" ? <ShieldAlert className="h-4 w-4 text-amber-500" /> : <UserIcon className="h-4 w-4" />}
            <span className="font-medium">{username}</span>
            {role === "admin" && <span className="uppercase text-[10px] font-bold tracking-wider text-amber-500 ml-1">Admin</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
