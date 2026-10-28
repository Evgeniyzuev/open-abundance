-- The relay of the Open Abundance lead (Evgen, 2026-10-28; lib/qaAccounts.ts OA_RELAY_LEAD_ID): qa-claude@example.com
-- may lead real members and passes on everything the Open Abundance lead does; team and leadership tools are tested
-- on it. Only the second QA account (qa-claude-2) stays barred from leading. The 12 members moved away by
-- 20261028150000 come back to it, under the usual rules (the lead is higher in level and has room).

create or replace function public.can_be_team_leader(p_leader_user_id uuid, p_member_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((
    select
      leader.level >= 2
      and leader.level > greatest(member.level, 0)
      and not public.team_assignment_would_create_cycle(p_leader_user_id, p_member_user_id)
      and snapshot.used_points + greatest(member.level, 0) <= snapshot.total_points
    from public.user_profiles leader
    join public.user_profiles member
      on member.user_id = p_member_user_id
    cross join lateral public.team_leadership_snapshot(p_leader_user_id) snapshot
    where leader.user_id = p_leader_user_id
      and leader.user_id <> member.user_id
      and leader.user_id <> '3dbbec5f-2f5a-4004-80cd-210405e24114'
  ), false);
$function$;

update public.user_profiles
set display_name = 'Лид Open Abundance · ИИ'
where user_id = '3dbbec5f-2f5a-4004-80cd-210405e24113';

do $$
declare
  v_member uuid;
begin
  for v_member in
    select m.member_user_id from public.team_memberships m
    where m.is_active and m.leader_user_id is null and m.member_user_id in (
      '7363a667-87d4-48a1-b45d-412505772d9d', '1390f1a1-66ab-4570-9fc5-6f425a0b5c93', 'ffac0b2e-1acd-4544-9f1e-1298ec11c74d',
      '971ccdbf-a5d5-42d8-954c-6ec5f6c200a9', '390d4eab-80d1-44e1-b82f-2e44942380a6', 'eb0aa29f-ec15-4f60-9a4e-c489b9c77867',
      'ecbc0568-df5f-4687-99fe-cf590bf49554', 'd83f6444-1f43-4293-acb6-6c878521205a', 'fc13efe9-5bd3-4c9c-87ac-48e3647ee0e4',
      'da2b416b-5bf0-4386-93e9-760317ea1335', 'd84ad0e4-3e49-430a-80f0-c9df15be785a', '6f61baa2-382c-44c8-9226-8092f29a11f2'
    )
  loop
    if public.can_be_team_leader('3dbbec5f-2f5a-4004-80cd-210405e24113', v_member) then
      update public.team_memberships
      set leader_user_id = '3dbbec5f-2f5a-4004-80cd-210405e24113',
          assigned_at = now(),
          team_bonus_base_balance = coalesce((select balance::numeric(30, 12) from public.core_accounts where user_id = v_member), 0),
          team_bonus_base_at = now()
      where member_user_id = v_member and is_active;
    end if;
  end loop;
end;
$$;
