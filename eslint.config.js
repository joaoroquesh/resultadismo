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
      // Complexidade ciclomática: AVISA (não quebra o build) acima de 20.
      // É ponto de avaliação para todo código novo. Ver .claude/02-CODIGO.md
      // "Portões de qualidade de código" e .claude/11-EQUIPE-E-PAPEIS.md.
      complexity: ["warn", 20],
      // NUNCA <select> nativo (UI do SO destoa do tema/dark-mode). Sempre os
      // componentes do design system: <Select> (listas curtas) ou <Combobox>
      // (listas grandes com busca), de @/components/ui. ERRO de lint.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Não use <select> nativo. Use <Select> ou <Combobox> de @/components/ui (design system).",
        },
      ],
    },
  },
);
