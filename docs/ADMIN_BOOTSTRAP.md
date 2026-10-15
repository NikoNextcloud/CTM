# Първи администратор — CTM 2.0 (само тестова среда)

**Няма публична регистрация или автоматично предоставяне на администраторски права.** Тези инструкции се изпълняват от собственика на отделния Supabase проект. Никога не поставяйте парола, токен или реални медицински данни в GitHub.

## Състояние към 15.10.2026
- Проект: `ctm-2-0-dev` (Supabase, eu-central-1).
- Организация в таблица `public.tenants`: `CTM - development only`.
- Имейл акаунти: още няма, необходими са покана и потвърждение.
- База: няма внесени истински лица, документи или ЕГН.

## Стъпка 1 — създаване на потребител

1. Отворете [Supabase Authentication → Users](https://supabase.com/dashboard/project/ljdsvpfxuigdbznrvmyn/auth/users).
2. Използвайте **Invite user** за реално притежаван служебен имейл на бъдещия администратор.
3. Поканеният потребител следва да потвърди имейла и да настрои собствена силна парола. **Не изпращайте паролата в чат или GitHub.**
4. При нужда актуализирайте разрешените redirect URL адреси за Supabase Auth до вашия защитен Vercel домейн; не допускайте wildcard от непознати домейни.

## Стъпка 2 — свързване с тестовата организация

Само собственикът на Supabase проекта стартира следния SQL в Dashboard SQL Editor. Заменете `ADMIN_EMAIL_HERE@example.com` с имейла на действително поканения и потвърден потребител. Скриптът отказва действие, ако имейлът не е потвърден, организацията липсва или входът е оставен като пример.

```sql
do $bootstrap$
declare
  v_email text := 'ADMIN_EMAIL_HERE@example.com';
  v_uid uuid;
  v_tenant uuid;
begin
  if lower(v_email) = 'admin_email_here@example.com' then
    raise exception 'Replace the example email before running.';
  end if;

  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(v_email)
    and u.email_confirmed_at is not null;

  if v_uid is null then
    raise exception 'Verified Supabase Auth user not found.';
  end if;

  select t.id into v_tenant
  from public.tenants t
  where t.name = 'CTM - development only';

  if v_tenant is null then
    raise exception 'Development tenant not found.';
  end if;

  insert into public.tenant_members(tenant_id, user_id, role, active)
  values (v_tenant, v_uid, 'admin', true)
  on conflict (tenant_id, user_id)
  do update set role = 'admin', active = true;
end
$bootstrap$;
```

## Стъпка 3 — проверка
1. Отворете [CTM Cloud / вход](https://ctm-pearl.vercel.app/login).
2. Влезте с потребителя от стъпка 1. Уверете се, че се появяват таблото и модулите според `admin`.
3. Излезте и проверете, че директен достъп до `/app` не позволява четене на данни.
4. Създайте само **измислена фирма** за първоначално функционално тестване; медицински данни остават извън облака.

## За следващите потребители
Поканите не трябва да раздават права автоматично. Предоставянето и премахването на членство и фирмен достъп е отделно административно действие, което трябва да бъде одитирано и потвърдено. Преди реална употреба се изискват тестове за изолация на работодателите, MFA и преглед на правното основание за обработка на медицинска информация.
