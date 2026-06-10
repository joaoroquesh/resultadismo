-- A jornada de personalização foi reformulada no 2.0.0 (wizard novo de 6 telas:
-- perfil/escudo/UF → time do coração → seleção → campeonatos → The Best+convite →
-- notificações+app). Quem preencheu a versão ANTIGA tem o estado resetado para
-- passar pela jornada nova no próximo acesso/recarregamento (decisão do PO).
--
-- Preservados (preferências vivas, não fazem parte do reset):
--   show_in_global_ranking (aparecer no The Best), favorite_group_id, uf.
update public.profiles
   set personalization_done = false,
       favorite_team_id = null,
       national_team_id = null,
       favorite_competition_id = null,
       followed_competition_ids = '{}',
       followed_team_ids = '{}',
       followed_teams = '{}'::jsonb;
