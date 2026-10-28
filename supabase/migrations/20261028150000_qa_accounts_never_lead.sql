-- QA test accounts (lib/qaAccounts.ts) must never lead real people. Since Oct 25 one led 12 members; they move to the
-- Open Abundance lead, and can_be_team_leader now refuses QA accounts as leaders.

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
      and leader.user_id not in ('3dbbec5f-2f5a-4004-80cd-210405e24113', '3dbbec5f-2f5a-4004-80cd-210405e24114')
  ), false);
$function$;

do $$
declare
  v_member uuid;
begin
  for v_member in
    select member_user_id from public.team_memberships
    where is_active and leader_user_id in ('3dbbec5f-2f5a-4004-80cd-210405e24113', '3dbbec5f-2f5a-4004-80cd-210405e24114')
  loop
    perform public.detach_team_member_to_system(v_member, 'qa_account');
  end loop;
end;
$$;
