# Политика за сигурност — начална архитектура

1. В GitHub **само изходен код**. Никога архиви, ЕГН, медицински документи, ключове, експорти или логове с лични данни.
2. Отделен Supabase проект в EU регион; регионът не отменя международните преноси, DPA/DPIA и правен анализ.
3. Приложна автентикация с Supabase Auth + RLS във всяка изложена таблица. Авторизация по tenant, user role и company; UI ограниченията не са достатъчни.
4. ЕГН и пълните медицински подробности не са моделирани за облачен импорт в v0.1; следват отделен ограничен private schema и приложно криптиране/ключово управление.
5. Политики за Storage трябва да бъдат написани и тествани преди реално прикачване на документи; този пакет не създава публична кофа за документи.
6. `anon` не получава достъп до данните. `service_role`/secret key само в защитени server-only процеси след audit; никога в браузъра.
7. Без auto-approve на миграции. Фирма–служител и преглед–пациент се свързват само при доказуем ключ или човешко потвърждение.
8. При изграждане на автентикацията използвайте `auth.getUser()` или проверени claims; не разчитайте само на `getSession()` от клиентски cookie.
9. В authenticated server компоненти: `force-dynamic`, `Cache-Control: private, no-store`; не кеширайте отговори с `Set-Cookie` между потребители.
10. Задължителни при production: MFA, rate limits, журнал на прочит на чувствителни досиета, неизменим audit, логове без PHI, encrypted backup, restore drill, penetration test, DPA, DPIA и retention policy.

Източници: https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/auth/server-side ; https://supabase.com/docs/guides/storage/security/access-control ; https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
