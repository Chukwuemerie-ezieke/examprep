import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { ArrowLeft, LogIn, UserPlus } from "lucide-react";

// Extract a human-readable message from an apiRequest error. apiRequest throws
// `Error("<status>: <body>")` where the body may be JSON like {"message": "..."}.
function serverMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const match = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  const body = match ? match[2] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // body was not JSON; fall through
  }
  return body.trim() || fallback;
}

export default function Auth() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { loginMutation, signupMutation } = useAuth();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await loginMutation.mutateAsync({ email: loginEmail, password: loginPassword });
      toast({ title: "Welcome back" });
      navigate("/");
    } catch (err) {
      toast({
        title: "Login failed",
        description: serverMessage(err, "Invalid email or password"),
        variant: "destructive",
      });
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (signupPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    try {
      await signupMutation.mutateAsync({
        email: signupEmail,
        password: signupPassword,
        displayName: signupName.trim() || undefined,
      });
      toast({ title: "Account created" });
      navigate("/");
    } catch (err) {
      toast({
        title: "Sign up failed",
        description: serverMessage(err, "Could not create your account"),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <CardTitle className="text-base">ExamPrep Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <Label htmlFor="login-email" className="text-xs">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="email"
                    required
                    autoFocus
                    data-testid="input-login-email"
                  />
                </div>
                <div>
                  <Label htmlFor="login-password" className="text-xs">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    data-testid="input-login-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={loginMutation.isPending || !loginEmail || !loginPassword}
                  data-testid="button-login"
                >
                  <LogIn className="w-4 h-4" />
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3">
                <div>
                  <Label htmlFor="signup-name" className="text-xs">Display name (optional)</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    autoComplete="name"
                    data-testid="input-signup-name"
                  />
                </div>
                <div>
                  <Label htmlFor="signup-email" className="text-xs">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    autoComplete="email"
                    required
                    data-testid="input-signup-email"
                  />
                </div>
                <div>
                  <Label htmlFor="signup-password" className="text-xs">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    data-testid="input-signup-password"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">At least 8 characters.</p>
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={signupMutation.isPending || !signupEmail || !signupPassword}
                  data-testid="button-signup"
                >
                  <UserPlus className="w-4 h-4" />
                  {signupMutation.isPending ? "Creating..." : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <Link href="/">
            <Button type="button" variant="ghost" className="w-full text-xs mt-3">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to site
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
