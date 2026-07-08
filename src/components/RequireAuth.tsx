import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Nao foi possivel entrar com essas credenciais.");
    }

    setSubmitting(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <p className="text-sm text-slate-300">Verificando acesso...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
        <Card className="w-full max-w-sm border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl tracking-normal">Acesso administrativo</CardTitle>
            <CardDescription className="text-slate-400">
              Entre com sua conta autorizada para abrir este painel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-slate-200">
                  Email
                </Label>
                <Input
                  id="admin-email"
                  autoComplete="email"
                  className="border-slate-700 bg-slate-950 text-slate-100"
                  disabled={submitting}
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password" className="text-slate-200">
                  Senha
                </Label>
                <Input
                  id="admin-password"
                  autoComplete="current-password"
                  className="border-slate-700 bg-slate-950 text-slate-100"
                  disabled={submitting}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <Button className="w-full" disabled={submitting} type="submit">
                {submitting ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <Button onClick={handleSignOut} size="sm" variant="secondary">
          <LogOut aria-hidden="true" />
          Sair
        </Button>
      </div>
      {children}
    </>
  );
}
