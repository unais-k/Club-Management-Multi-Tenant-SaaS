import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  apiRequest,
  clearSessionTokens,
  hasStoredRefreshToken,
  refreshAccessToken,
  saveSessionTokens,
} from "@/lib/api";

export type AdminRole = "PLATFORM_ADMIN" | "CLUB_ADMIN";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole | "CONSUMER";
  clubId: string | null;
  club?: {
    id: string;
    name: string;
    slug: string;
    pricingModel: string;
    timezone: string;
  } | null;
}

interface LoginInput {
  email: string;
  password: string;
  clubSlug?: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

interface AuthContextValue {
  user: AdminUser | null;
  isReady: boolean;
  login: (input: LoginInput) => Promise<AdminUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      if (!hasStoredRefreshToken()) {
        if (mounted) setIsReady(true);
        return;
      }

      const token = await refreshAccessToken();
      if (token) {
        try {
          const profile = await apiRequest<AdminUser>("/auth/me");
          if (mounted && profile.role !== "CONSUMER") setUser(profile);
          else if (profile.role === "CONSUMER") clearSessionTokens();
        } catch {
          clearSessionTokens();
        }
      }

      if (mounted) setIsReady(true);
    }

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener("club-admin:session-expired", expire);
    return () =>
      window.removeEventListener("club-admin:session-expired", expire);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const result = await apiRequest<TokenResponse>("/auth/login", {
      method: "POST",
      authenticated: false,
      body: JSON.stringify(input),
    });

    if (result.user.role === "CONSUMER") {
      saveSessionTokens(result.accessToken, result.refreshToken);
      await apiRequest("/auth/logout", { method: "POST" }).catch(
        () => undefined,
      );
      clearSessionTokens();
      throw new Error("This account does not have admin access.");
    }

    saveSessionTokens(result.accessToken, result.refreshToken);
    try {
      const profile = await apiRequest<AdminUser>("/auth/me");
      setUser(profile);
      return profile;
    } catch (error) {
      clearSessionTokens();
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        retryAfterRefresh: false,
      });
    } finally {
      clearSessionTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isReady, login, logout }),
    [user, isReady, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an AuthProvider");
  return value;
}
