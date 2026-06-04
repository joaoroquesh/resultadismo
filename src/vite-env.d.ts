/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  // Dev-only: login rápido por senha (apenas em import.meta.env.DEV).
  readonly VITE_DEV_LOGIN_EMAIL: string;
  readonly VITE_DEV_LOGIN_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
