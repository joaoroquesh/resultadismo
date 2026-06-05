import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Pastas/arquivos que o lint não deve analisar.
  {
    ignores: ["dist/", "dev-dist/", "supabase/", "**/*.config.*"],
  },
  // Base: JS + TypeScript recomendados, hooks e react-refresh (preset Vite).
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // `react-hooks/set-state-in-effect` é regra EXPERIMENTAL do React Compiler
      // (vem no recommended-latest). Sinaliza ~12 padrões idiomáticos pré-existentes
      // (popular formulário a partir de dados assíncronos, resetar estado quando uma
      // prop muda). Migrar esses componentes para os padrões "you might not need an
      // effect" é um passe DEDICADO — desligada por ora para não arriscar arquivos
      // core num app ao vivo (e enquanto há sessões editando em paralelo). As demais
      // regras de hooks seguem ativas: rules-of-hooks, exhaustive-deps e purity
      // (esta última pega Date.now()/Math.random() no render — bug real).
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
