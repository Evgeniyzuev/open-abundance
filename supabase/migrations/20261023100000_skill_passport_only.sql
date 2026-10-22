-- One profile challenge instead of two.
--
-- "Personal Value Map" (bio with 20 words) asked for a subset of what "Skill Passport" asks (bio and a link), so only the
-- Passport stays active. It now asks for a bio of at least 5 words (the bio can be edited later) and one profile link.
-- The Value Map is switched off, not deleted: people who completed it keep their history and reward.

update public.challenges
set is_active = false
where id = 'd7ffef03-9e67-4cc1-bdd3-ba298cd82c87';

update public.challenges
set instructions = jsonb_build_object(
      'en', 'Write at least 5 words about yourself in your profile bio and add at least one link: portfolio, social page, case, work sample or website.',
      'ru', 'Напишите в описании профиля хотя бы 5 слов о себе и добавьте хотя бы одну ссылку: портфолио, соцстраницу, кейс, пример работы или сайт.'
    ),
    requirements = jsonb_build_object(
      'en', 'The profile bio has at least 5 words and at least one profile link exists.',
      'ru', 'В описании профиля минимум 5 слов и есть хотя бы одна ссылка профиля.'
    )
where id = 'de56d24c-9d7c-4228-b5d7-4c0ff49408d9';
