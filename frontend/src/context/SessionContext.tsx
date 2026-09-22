import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import { api, setTokenRefreshHandler } from '../lib/api';
import type { OrgMembership } from '../lib/api';

interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

interface SessionContextValue {
  session: Session | null;
  organizations: OrgMembership[];
  activeOrg: OrgMembership | null;
  setActiveOrgId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => void;
  refreshOrganizations: () => Promise<void>;
  createOrganization: (
    name: string,
    countryCode: string,
  ) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = 'hero.session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Require all session values.
    // Older/incomplete sessions are discarded.
    if (
      typeof parsed?.accessToken !== 'string' ||
      typeof parsed?.refreshToken !== 'string' ||
      typeof parsed?.userId !== 'string'
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

export function SessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(
    () => loadSession(),
  );

  const [organizations, setOrganizations] = useState<OrgMembership[]>([]);

  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(
    null,
  );

  const sessionRef = useRef<Session | null>(session);

  sessionRef.current = session;

  /*
   * Persist session in localStorage.
   */
  useEffect(() => {
    if (session) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(session),
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

  /*
   * Token refresh handler.
   */
  useEffect(() => {
    setTokenRefreshHandler(async () => {
      const current = sessionRef.current;

      if (!current?.refreshToken) {
        return null;
      }

      try {
        const tokens = await api.auth.refresh(
          current.refreshToken,
        );

        /*
         * userId belongs to the current authenticated session.
         * Refresh normally only returns new tokens.
         */
        const next: Session = {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userId: current.userId,
        };

        setSession(next);
        sessionRef.current = next;

        return next.accessToken;
      } catch {
        setSession(null);
        sessionRef.current = null;

        return null;
      }
    });
  }, []);

  /*
   * Load organizations for the authenticated user.
   */
  const refreshOrganizations = useCallback(async () => {
    const current = sessionRef.current;

    if (!current) {
      return;
    }

    try {
      const orgs = await api.organizations.mine(
        current.accessToken,
      );

      setOrganizations(orgs);

      setActiveOrgIdState((previousId) => {
        // Keep currently selected organization if it still exists.
        if (
          previousId &&
          orgs.some((organization) => organization.id === previousId)
        ) {
          return previousId;
        }

        // Otherwise select the first organization.
        return orgs.length > 0 ? orgs[0].id : null;
      });
    } catch {
      // Keep existing organization state on network/auth failure.
    }
  }, []);

  /*
   * Refresh organizations whenever authentication changes.
   */
  useEffect(() => {
    if (session) {
      void refreshOrganizations();
    } else {
      setOrganizations([]);
      setActiveOrgIdState(null);
    }
  }, [session, refreshOrganizations]);

  /*
   * Login.
   */
  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.auth.login(
        email,
        password,
      );

      /*
       * Backend/API type allows userId to be undefined.
       * Session requires it, so validate it here.
       */
      if (!tokens.userId) {
        throw new Error(
          'Login succeeded but user ID was not returned by the server.',
        );
      }

      const nextSession: Session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId: tokens.userId,
      };

      setSession(nextSession);
      sessionRef.current = nextSession;
    },
    [],
  );

  /*
   * Register and automatically log in.
   */
  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
    ) => {
      await api.auth.register(
        email,
        password,
        fullName,
      );

      const tokens = await api.auth.login(
        email,
        password,
      );

      /*
       * Validate userId before creating the Session.
       */
      if (!tokens.userId) {
        throw new Error(
          'Registration succeeded but user ID was not returned by the server.',
        );
      }

      const nextSession: Session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId: tokens.userId,
      };

      setSession(nextSession);
      sessionRef.current = nextSession;
    },
    [],
  );

  /*
   * Logout.
   */
  const logout = useCallback(() => {
    const current = sessionRef.current;

    if (current?.refreshToken) {
      void api.auth
        .logout(current.refreshToken)
        .catch(() => {
          // Ignore logout API errors.
        });
    }

    setSession(null);
    sessionRef.current = null;

    setOrganizations([]);
    setActiveOrgIdState(null);
  }, []);

  /*
   * Create organization.
   */
  const createOrganization = useCallback(
    async (
      name: string,
      countryCode: string,
    ) => {
      const current = sessionRef.current;

      if (!current) {
        return;
      }

      await api.organizations.create(
        current.accessToken,
        name,
        countryCode,
      );

      await refreshOrganizations();
    },
    [refreshOrganizations],
  );

  /*
   * Current active organization.
   */
  const activeOrg =
    organizations.find(
      (organization) => organization.id === activeOrgId,
    ) ?? null;

  return (
    <SessionContext.Provider
      value={{
        session,
        organizations,
        activeOrg,
        setActiveOrgId: setActiveOrgIdState,
        login,
        register,
        logout,
        refreshOrganizations,
        createOrganization,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error(
      'useSession must be used within SessionProvider',
    );
  }

  return context;
}