-- Novo modo de disputa: "liga" = confronto direto em pontos corridos (tabela 3/1/0).
-- Copa usa o 'cup' já existente; Pontos usa 'points'. Aditivo e seguro.
alter type public.league_mode add value if not exists 'liga';
