import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Trade Accelerator" },
      {
        name: "description",
        content:
          "Sign in to Trade Accelerator to keep your trading notes saved to your account and synced across devices.",
      },
      { property: "og:title", content: "Sign in — Trade Accelerator" },
      { property: "og:description", content: "Sign in to sync your private trading journal and notes across devices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      toast.error("Enter your email and a password of at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created — check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="surface-card w-full max-w-sm p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
           Trade Accelerator
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your notes save to your account, so they're there on any device —
          even offline notes sync when you sign in.
        </p>

        <div className="mt-6 space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy
              ? "Working…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </div>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-primary hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin"
            ? "No account yet? Sign up"
            : "Already have an account? Sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link to="/" className="hover:underline">
            ← Back to notes
          </Link>
        </p>
      </div>
    </main>
  );
}
