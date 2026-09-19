import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import type { User } from "@/lib/types";

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

// Profile fields the authenticated user can update via PATCH /api/auth/me.
export interface ProfileUpdateInput {
  showOnLeaderboard?: boolean;
  displayName?: string;
}

// Invalidate every query whose result depends on the current identity so the
// UI re-fetches under the new auth state after login/signup/logout.
function invalidateAuthScopedQueries() {
  queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  queryClient.invalidateQueries({ queryKey: ["/api/quiz-sessions"] });
  queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
}

/**
 * Auth state + mutations built on the shared queryClient/apiRequest patterns.
 * The current user is fetched from GET /api/auth/me with on401 returnNull so an
 * unauthenticated visitor resolves to `null` rather than an error.
 */
export function useAuth() {
  const {
    data: user,
    isLoading,
    isFetching,
  } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<User | null>({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await apiRequest("POST", "/api/auth/login", input);
      return (await res.json()) as User;
    },
    onSuccess: invalidateAuthScopedQueries,
  });

  const signupMutation = useMutation({
    mutationFn: async (input: SignupInput) => {
      const res = await apiRequest("POST", "/api/auth/signup", input);
      return (await res.json()) as User;
    },
    onSuccess: invalidateAuthScopedQueries,
  });

  // Update the current user's profile (leaderboard opt-in + display name).
  // On success we refresh the auth-scoped queries and the leaderboard, since a
  // change to opt-in or display name affects both /api/auth/me and rankings.
  const updateProfileMutation = useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      const res = await apiRequest("PATCH", "/api/auth/me", input);
      return (await res.json()) as User;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/auth/me"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      invalidateAuthScopedQueries();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isFetching,
    loginMutation,
    signupMutation,
    logoutMutation,
    updateProfileMutation,
  };
}
