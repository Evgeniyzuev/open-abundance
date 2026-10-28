-- First screen = the "First step" quest (+$1 to Core) and sign-in (+$1): 1 + 1 = $2, the Core threshold of level 1.
-- The sign-up reward drops from $2 to $1 so the two together make exactly the first level.
update public.challenges
set core_reward_amount = 1.00
where verification_logic = 'signup'
  and core_reward_amount = 2.00;
