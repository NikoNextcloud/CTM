# Threat Model v0.1

| Заплаха | Критичност | Контрола | Остатък |
|---|---|---|---|
| Работодател вижда медицинско досие | Критична | RLS medical doctor only, no clinical fields in employees | Нужни реални deny-тестове |
| Изтичане чрез публичен GitHub | Критична | .gitignore за Excel, архиви, PHI; private repo requirement | Secret scanning policy pending |
| Изтичане чрез публичен Storage URL | Критична | No bucket in this phase | Private signed URL policy pending |
| Cross-tenant access | Критична | membership and tenant RLS, composite FKs | pgTAP cross-tenant tests pending |
| Admin sees medical details | Висока | separate RLS doctor-only | finer-grained field privacy pending |
| Фалшиво приписан болничен | Критична | не импортираме кандидати | първични ключове/рецензии missing |
| Session / CDN cookie leakage | Критична | @supabase/ssr, no-store authenticated paths | integration test pending |
| Фалшиви CSV формули | Висока | CSV escaping on exported text | spreadsheet injection test pending |
| Загуба на база | Критична | back up and PITR release gate | не е конфигурирано |
| Вътрешен администратор злоупотребява | Висока | роли и write-only audit rows | independent immutable read logs pending |
| Неправомерно качен документ | Критична | no upload in stage 1 | signed upload + antivirus pending |
