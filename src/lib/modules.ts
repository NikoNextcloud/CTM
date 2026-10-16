export type ModuleId = 'companies'|'employees'|'worksites'|'job-positions'|'risks'|'examinations'|'sick-leaves'|'documents'|'migration'|'team'|'reports';
export const modules: {id:ModuleId;title:string;subtitle:string;table?:string;columns?:{key:string;label:string}[]}[] = [
 {id:'companies',title:'Фирми',subtitle:'Обслужвани работодатели',table:'companies',columns:[{key:'name',label:'Наименование'},{key:'eik',label:'ЕИК'},{key:'status',label:'Статус'}]},
 {id:'employees',title:'Служители',subtitle:'Регистър и трудови позиции без ЕГН',table:'employees',columns:[{key:'full_name',label:'Име'},{key:'job_title',label:'Длъжност'},{key:'reference_code',label:'Вътрешен номер'}]},
 {id:'worksites',title:'Работни обекти',subtitle:'Регистър на обектите по работодател',table:'worksites',columns:[{key:'name',label:'Наименование'},{key:'address',label:'Адрес'},{key:'active',label:'Активен'}]},
 {id:'job-positions',title:'Длъжности',subtitle:'Длъжности и организационни звена',table:'job_positions',columns:[{key:'title',label:'Длъжност'},{key:'department',label:'Отдел'},{key:'active',label:'Активна'}]},
 {id:'risks',title:'Оценка на риска',subtitle:'Работни рискове и защитни мерки (проект)',table:'risk_assessments',columns:[{key:'workplace',label:'Работно място'},{key:'hazard',label:'Опасност'},{key:'risk_level',label:'Ниво'},{key:'review_due',label:'Преглед'},{key:'status',label:'Статус'}]},
 {id:'examinations',title:'Медицински прегледи',subtitle:'Графици и заключения без диагнози',table:'examinations',columns:[{key:'exam_date',label:'Дата'},{key:'exam_type',label:'Вид'},{key:'fitness',label:'Заключение'}]},
 {id:'sick-leaves',title:'Болнични листове',subtitle:'Достъп само за медицински екип',table:'sick_leaves',columns:[{key:'start_date',label:'Начало'},{key:'end_date',label:'Край'},{key:'verification_status',label:'Проверка'}]},
 {id:'documents',title:'Документи',subtitle:'Частни файлове и проследимост',table:'documents',columns:[{key:'title',label:'Документ'},{key:'classification',label:'Класификация'},{key:'verification_status',label:'Проверка'}]},
 {id:'migration',title:'Миграция',subtitle:'Преглед и потвърждение на архивите',table:'migration_batches',columns:[{key:'source_name',label:'Източник'},{key:'status',label:'Статус'},{key:'created_at',label:'Създаден'}]},
 {id:'team',title:'Екип и роли',subtitle:'Ръчно създадени акаунти и фирмени права'},
 {id:'reports',title:'Справки',subtitle:'Контролирани справки и експорт'},
];
