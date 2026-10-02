import { Redirect } from 'expo-router';

import { useSession } from '@/context/SessionContext';

// Punto de entrada: envía al inicio o al login según haya sesión.
export default function Index() {
  const { user } = useSession();
  return <Redirect href={user ? '/inicio' : '/sign-in'} />;
}
