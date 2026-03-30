"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerIcon, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingAs, setLoggingAs] = useState<"admin" | "user" | null>(null);

  async function handleLogin(usr: string, pass: string, type: "admin" | "user") {
    setError("");
    setLoading(true);
    setLoggingAs(type);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usr, password: pass }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push(data.redirectTo);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
      setLoading(false);
      setLoggingAs(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-3">
              <ServerIcon className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">CDN Control Center</CardTitle>
          <CardDescription>Distributed Edge Cache System</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm font-medium text-destructive text-center mb-2">{error}</div>}
          
          <div className="flex flex-col gap-3">
            <Button 
              onClick={() => handleLogin("admin", "admin123", "admin")} 
              disabled={loading}
              className="w-full h-12"
            >
              {loading && loggingAs === "admin" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Log in as Admin (Operator)
            </Button>
            
            <Button 
              onClick={() => handleLogin("user", "user123", "user")} 
              disabled={loading}
              variant="secondary"
              className="w-full h-12"
            >
              {loading && loggingAs === "user" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Log in as User (Viewer)
            </Button>
          </div>
          
          <div className="text-xs text-center text-muted-foreground mt-4 leading-relaxed">
            Quick links to access the simulator interfaces.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
