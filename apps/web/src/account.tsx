import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAccount, signOut as apiSignOut, type Account } from './api';

/** `undefined` while the first check runs, `null` when signed out. */
export type AccountState = Account | null | undefined;

interface AccountContextValue {
  readonly account: AccountState;
  signOut(): Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** Whether this browser is signed in (from /api/me), shared by the header and the pages. */
export function AccountProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [account, setAccount] = useState<AccountState>(undefined);
  useEffect(() => {
    let live = true;
    getAccount()
      .then((value) => {
        if (live) setAccount(value);
      })
      .catch((error: unknown) => {
        // The server could not be reached: show the signed-out pages, from which sign-in can be tried again.
        console.warn('account check failed', error instanceof Error ? error.message : String(error));
        if (live) setAccount(null);
      });
    return () => {
      live = false;
    };
  }, []);
  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } catch (error) {
      // The cookie may still be there; the server ends it on its own at the latest after a week unused.
      console.warn('sign-out failed', error instanceof Error ? error.message : String(error));
    }
    setAccount(null);
  }, []);
  const value = useMemo(() => ({ account, signOut }), [account, signOut]);
  return <AccountContext value={value}>{children}</AccountContext>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount outside AccountProvider');
  return value;
}
