import { Redirect } from 'expo-router';

// Sin autenticación real todavía: siempre se inicia en el registro.
export default function Index() {
  return <Redirect href="/sign-in" />;
}
