-- Clearer text for the "Invite a friend" challenge. The app now offers ready-made messages
-- and a send-to checklist inside the challenge, so the instructions point there.
update public.challenges
set
  description = '{"ru":"Позовите друга попробовать Open Abundance. В челлендже есть готовые сообщения и список, куда их отправить.","en":"Invite a friend to try Open Abundance. The challenge has ready-made messages and a list of places to send them."}'::jsonb,
  instructions = '{"ru":"1. Откройте «Тексты и список для приглашений».\n2. Выберите сообщение и отправьте его другу, в чат или в историю.\n3. Отмечайте в списке, куда уже отправили.\n4. Когда друг зарегистрируется по вашей ссылке, вернитесь и нажмите «Проверить выполнение».","en":"1. Open \"Messages and checklist for invitations\".\n2. Pick a message and send it to a friend, a chat or a story.\n3. Tick off in the list where you have sent it.\n4. When your friend signs up with your link, come back and press \"Check completion\"."}'::jsonb,
  requirements = '{"ru":"Хотя бы один человек зарегистрировался по вашей ссылке.","en":"At least one person has signed up with your link."}'::jsonb
where verification_logic = 'has_referral';
