import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// study_docs é uma tabela nova: acesso por handle sem tipo p/ NÃO precisar
// regenerar src/types/database.ts (arquivo gerado, compartilhado com outras
// sessões). Os retornos são validados via cast para StudyDoc.
const db = supabase as unknown as SupabaseClient;

// Estudos = biblioteca de análises (HTML) só para app-admin. Conteúdo no bucket
// PRIVADO "estudos" (RLS via is_app_admin); metadados em public.study_docs.
// O front baixa o HTML pelo client autenticado (gated no servidor) e renderiza
// num <iframe srcdoc> — nada de URL pública. Ver migration 20260616130000.

export const BUCKET = "estudos";

export type StudyDoc = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  storage_path: string;
  sort: number;
  created_at: string;
};

const COLS = "id,slug,title,category,description,storage_path,sort,created_at";

export function useStudyDocs() {
  return useQuery({
    queryKey: ["estudos", "list"],
    queryFn: async () => {
      const { data, error } = await db
        .from("study_docs")
        .select(COLS)
        .order("category", { ascending: true })
        .order("sort", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as StudyDoc[];
    },
  });
}

export function useStudyDoc(slug: string | undefined) {
  return useQuery({
    queryKey: ["estudos", "doc", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await db
        .from("study_docs")
        .select(COLS)
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as StudyDoc | null;
    },
  });
}

// Baixa o HTML do bucket (gated por RLS admin) como texto, p/ renderizar em srcdoc.
export function useStudyDocContent(storagePath: string | undefined) {
  return useQuery({
    queryKey: ["estudos", "content", storagePath],
    enabled: !!storagePath,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath!);
      if (error) throw new Error(error.message);
      return await data.text();
    },
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // tira acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function useUploadStudyDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      title: string;
      category: string;
      description?: string;
    }) => {
      const slug = slugify(input.title) || `estudo-${Date.now()}`;
      const path = `${slug}.html`;
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, input.file, { contentType: "text/html; charset=utf-8", upsert: true });
      if (up.error) throw new Error(up.error.message);

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("study_docs").upsert(
        {
          slug,
          title: input.title.trim(),
          category: input.category.trim() || "geral",
          description: input.description?.trim() || null,
          storage_path: path,
          created_by: auth.user?.id ?? null,
        },
        { onConflict: "slug" },
      );
      if (error) throw new Error(error.message);
      return slug;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estudos"] }),
  });
}

export function useDeleteStudyDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: { slug: string; storage_path: string }) => {
      await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      const { error } = await db.from("study_docs").delete().eq("slug", doc.slug);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estudos"] }),
  });
}
