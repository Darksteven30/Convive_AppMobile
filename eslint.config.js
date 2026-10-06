// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  // supabase/functions son Edge Functions de Deno: las revisa la CLI de Supabase al publicarlas.
  globalIgnores(['dist/*', 'coverage/*', '.expo/*', 'supabase/functions/*']),
  expoConfig,
]);
