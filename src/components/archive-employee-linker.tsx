'use client';

import Link from 'next/link';
import {useActionState} from 'react';
import {linkArchivedEmployee,type ArchiveLinkState} from '@/lib/archive-link-actions';

export type VerifiedCompany={id:string;name:string;eik:string};
const initial:ArchiveLinkState={ok:false,message:'',employeeId:null};

export function ArchiveEmployeeLinker({
 archiveId,archiveCompany,companies
}:{
 archiveId:string;archiveCompany:string;companies:VerifiedCompany[];
}){
 const [state,action,pending]=useActionState(linkArchivedEmployee,initial);
 const exact=companies.filter(c=>c.name.trim().toLocaleLowerCase('bg-BG')===
  archiveCompany.trim().toLocaleLowerCase('bg-BG'));
 return <section className="table-panel ctm-action-card">
  <div className="section-heading">
   <div><p className="eyebrow">СВЪРЗВАНЕ КЪМ ОСНОВНИЯ РЕГИСТЪР</p>
    <h2>Прехвърли проверения служител</h2>
    <p>Оригиналното досие остава в архива. Създава се непотвърден служител
     само към проверена фирма с ЕИК. Системата отказва невалидно ЕГН,
     разминаване във фирмата или възможно дублиране.</p>
   </div>
  </div>
  {companies.length===0?<div className="notice warn">Все още няма потвърдени фирми.
   <p><Link className="btn primary" href="/app/migration/companies">
    Провери фирмата и ЕИК →</Link></p></div>:
   <form action={action} className="company-form">
    <input type="hidden" name="archive_id" value={archiveId}/>
    <label>Фирма, потвърдена чрез официален ЕИК
     <select name="company_id" defaultValue={exact.length===1?exact[0].id:''} required>
      <option value="">Избери потвърдена фирма</option>
      {companies.map(c=><option key={c.id} value={c.id}>{c.name} · ЕИК {c.eik}</option>)}
     </select>
    </label>
    <p className="subnote">Фирма според архивния запис: <strong>{archiveCompany||'не е посочена'}</strong></p>
    <label className="checkbox-line">
     <input type="checkbox" name="acknowledged" value="yes" required/>
     Проверих принадлежността към фирмата и разбирам, че служителят ще е
     със статус „За проверка“ до окончателно потвърждение.
    </label>
    <button className="btn primary" type="submit" disabled={pending}>
     {pending?'Създаване…':'Свържи със служител в регистъра'}
    </button>
    {state.message&&<p role="status" className={state.ok?'team-status-ok':'team-status-error'}>
     {state.message}</p>}
    {state.ok&&state.employeeId&&<p><Link className="btn ghost" href={'/app/employees/'+state.employeeId}>
     Отвори свързаното досие →</Link></p>}
   </form>}
 </section>;
}
