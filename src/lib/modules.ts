export type ModuleId = 'companies'|'employees'|'examinations'|'sick-leaves'|'documents'|'migration'|'team'|'reports';
export const modules: {id:ModuleId;title:string;subtitle:string;table?:string;columns?:{key:string;label:string}[]}[] = [
 {id:'companies',title:'Фирми',subtitle:'Обслужвани работодатели',table:'companies',columns:[{key:'name',label:'Наименование'},{key:'eik',label:'ЕИК'},{key:'status',label:'Статус'}]},
 {id:'employees',title:'Служители',subtitle:'Регистър и трудови позиции',table:'employees',columns:[{key:'full_name',label:'Име'},{key:'job_title',label:'Длъжност'},{key:'reference_code',label:'Вътрешен номер'}]},
 {id:'examinations',title:'Медицински прегледи',subtitle:'Графици и заключения без диагнози',table:'examinations',columns:[{key:'exam_date',label:'Дата'},{key:'exam_type',label:'Вид'},{key:'fitness',label:'Заключение'}]},
 {id:'sick-leaves',title:'Болнични листове',subtitle:'Достъп само за медицински екип',table:'sick_leaves',columns:[{key:'start_date',label:'Начало'},{key:'end_date',label:'Край'},{key:'verification_status',label:'Проверка'}]},
 {id:'documents',title:'Документи',subtitle:'Частни файлове и проследимост',table:'documents',columns:[{key:'title',label:'Документ'},{key:'classification',label:'Класификация'},{key:'verification_status',label:'Проверка'}]},
 {id:'migration',title:'Миграция',subtitle:'Преглед и потвърждение на архивите',table:'migration_batches',columns:[{key:'source_name',label:'Източник'},{key:'status',label:'Статус'},{key:'created_at',label:'Създаден'}]},
 {id:'team',title:'Екип и роли',subtitle:'Потребителски достъп и покани'},
 {id:'reports',title:'Справки',subtitle:'Контролирани справки и експорт'},
];

/** UI-level discoverability only. PostgreSQL RLS remains the security boundary. */
const roleAccess: Record<ModuleId, readonly string[]> = {
 companies: ['admin', 'specialist', 'doctor', 'employer', 'auditor'],
 employees: ['admin', 'specialist', 'doctor', 'employer'],
 examinations: ['doctor', 'specialist'],
 'sick-leaves': ['doctor'],
 documents: ['admin', 'specialist', 'doctor', 'employer'],
 migration: ['admin'],
 team: ['admin'],
 reports: ['admin', 'specialist']
};
export function canAccessModule(role: string, id: ModuleId): boolean {
 return roleAccess[id].includes(role);
}
