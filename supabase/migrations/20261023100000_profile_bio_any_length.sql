-- "Personal Value Map" and "Skill Passport" no longer ask for 20 words in the profile bio: any filled-in bio counts
-- (the check is in app/api/challenges/check/route.ts). Only the visible texts of the two challenges change here.

update public.challenges
set instructions = jsonb_build_object(
      'en', 'Open Social -> Profile -> edit the public profile bio. Add a few lines about your skills, interests and experience.',
      'ru', 'Откройте Социум -> Профиль -> редактирование публичного описания. Добавьте пару строк о навыках, интересах и опыте.'
    ),
    requirements = jsonb_build_object(
      'en', 'The profile bio is filled in.',
      'ru', 'Описание профиля заполнено.'
    )
where id = 'd7ffef03-9e67-4cc1-bdd3-ba298cd82c87';

update public.challenges
set requirements = jsonb_build_object(
      'en', 'The profile bio is filled in and at least one profile link exists.',
      'ru', 'Описание профиля заполнено и есть хотя бы одна ссылка профиля.'
    )
where id = 'de56d24c-9d7c-4228-b5d7-4c0ff49408d9';
