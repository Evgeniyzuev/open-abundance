-- Quest path: "Install the app" moves right after "The power of Core" (Evgen, 2026-10-27). Only 2 of 23 people
-- finished it as step 3. It stays on the path; "Skip" keeps it among taken quests.
-- New order: First step, First wish, Telegram bot, The power of Core, Install the app, then the rest unchanged.
-- path_order is unique, so the three steps pass through free numbers first.
update public.challenges set path_order = path_order + 100 where verification_logic in ('code_telegram', 'calculate_time_to_goal', 'app_installed') and path_order is not null;
update public.challenges set path_order = 3 where verification_logic = 'code_telegram' and path_order is not null;
update public.challenges set path_order = 4 where verification_logic = 'calculate_time_to_goal' and path_order is not null;
update public.challenges set path_order = 5 where verification_logic = 'app_installed' and path_order is not null;
