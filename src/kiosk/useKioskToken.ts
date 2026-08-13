import { useEffect, useState } from 'react';
import { getKioskToken } from './kioskToken';

/** `null` until the (memoised, one-time) token resolution finishes. */
export function useKioskToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void getKioskToken().then((value) => {
      if (!disposed) setToken(value);
    });
    return () => {
      disposed = true;
    };
  }, []);

  return token;
}
