// Identidade de treinador persistida (TASK 4). Regra:
//   · localStorage (rd_manager_v2_archetype) é a fonte da verdade client-side;
//   · logado, espelhamos em profiles.manager_archetype (best-effort, try/catch: se a
//     coluna ainda não foi migrada em produção, NUNCA quebra o app);
//   · na montagem, carregamos do profile (se logado e existir) senão do localStorage;
//   · no login, se o local tem arquétipo e o profile não, faz UM upsert.
// Espelha os padrões do useSaveProfileBasics / EditarPerfilPage (update direto em
// profiles via supabase-js, com useAuth() pra user/profile).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { ArchetypeKey } from "./archetypes.ts";
import { loadArchetype, saveArchetype } from "./localState";

// lê profiles.manager_archetype do profile sem depender dos tipos gerados (a coluna é
// nova; o database.ts pode ainda não conhecê-la). Valida contra as chaves conhecidas.
const VALID = new Set<ArchetypeKey>([
  "posicional", "reativo", "intenso", "equilibrista", "relacional", "copeiro",
]);
function archetypeFromProfile(profile: unknown): ArchetypeKey | null {
  if (!profile || typeof profile !== "object") return null;
  const v = (profile as Record<string, unknown>).manager_archetype;
  return typeof v === "string" && VALID.has(v as ArchetypeKey) ? (v as ArchetypeKey) : null;
}

// update best-effort no Supabase; qualquer erro (coluna ausente, offline, RLS) é engolido.
// localStorage já guardou; o servidor é só espelho. A coluna manager_archetype é NOVA e
// ainda não está nos tipos gerados (database.ts) -> o payload passa por um Record solto
// pra não travar o build; o supabase-js valida em runtime. Quando `db:types` rodar após a
// migração em produção, dá pra tipar direto.
async function pushToSupabase(userId: string, k: ArchetypeKey | null): Promise<void> {
  try {
    const payload = { manager_archetype: k } as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("profiles") as any).update(payload).eq("id", userId);
  } catch {
    /* coluna não migrada / offline: segue com o localStorage como verdade */
  }
}

export function useManagerArchetype() {
  const { user, profile } = useAuth();
  const [archetype, setArchetypeState] = useState<ArchetypeKey | null>(() => loadArchetype());
  // garante que o upsert de reconciliação no login rode UMA vez por usuário.
  const reconciledFor = useRef<string | null>(null);

  // carga/reconciliação quando o profile chega (login) ou muda.
  useEffect(() => {
    const local = loadArchetype();
    const fromProfile = archetypeFromProfile(profile);

    if (user && profile) {
      if (fromProfile) {
        // servidor manda: reflete no estado e no localStorage (espelho local).
        if (fromProfile !== local) saveArchetype(fromProfile);
        setArchetypeState(fromProfile);
      } else if (local && reconciledFor.current !== user.id) {
        // logado, profile sem arquétipo, mas há um local: upsert único.
        reconciledFor.current = user.id;
        void pushToSupabase(user.id, local);
        setArchetypeState(local);
      } else {
        setArchetypeState(local);
      }
    } else {
      // deslogado: só localStorage.
      setArchetypeState(local);
    }
  }, [user, profile]);

  // define o arquétipo: localStorage sempre; Supabase best-effort se logado.
  const setArchetype = useCallback(
    (k: ArchetypeKey | null) => {
      saveArchetype(k);
      setArchetypeState(k);
      if (user) void pushToSupabase(user.id, k);
    },
    [user],
  );

  return { archetype, setArchetype };
}
