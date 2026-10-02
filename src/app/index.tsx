import { Redirect } from 'expo-router';

import { homeRouteFor } from '@/constants/permissions';
import { useSession } from '@/context/SessionContext';

// Punto de entrada: sin sesión va al login; con sesión, a la pantalla principal de su rol.
// Los guards también redirigen aquí al iniciar o cerrar sesión.
export default function Index() {
  const { user } = useSession();
  return <Redirect href={user ? homeRouteFor(user.role) : '/sign-in'} />;
}
