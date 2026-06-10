-- Retrô — rodada 12: remove a duplicata de submit_feedback (6-arg, sem p_product).
-- Tinha 2 overloads (6 e 7 args); um client em cache antigo podia chamar a 6-arg e
-- inserir SEM product (default 'classico'), sumindo o report do admin do Retrô.
-- Mantém só a 7-arg (com p_product).
drop function if exists public.submit_feedback(text, text, text, text, text, text);
