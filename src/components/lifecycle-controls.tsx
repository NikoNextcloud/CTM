'use client';

import {useActionState,useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {
 changeCompanyLifecycle,changeEmployeeLifecycle,type LifecycleState
} from '@/lib/lifecycle-actions';

const initial:LifecycleState={ok:false,message:''};

export function CompanyLifecycleControls({id,revision,status}:{
 id:string;revision:number;status:string
}){
 const [state,action,pending]=useActionState(changeCompanyLifecycle,initial);
 const archived=status==='archived';
 return <section className="ctm-action-card" aria-label="Действия по фирмата">
  <div className="ctm-action-header"><div>
   <p className="eyebrow">УПРАВЛЕНИЕ НА ЗАПИСА</p>
   <h2>Статус и архивиране на фирмата</h2>
   <p>Архивирането е обратимо и не изтрива служители, договори или документи.</p>
  </div></div>
  <form action={action} className="ctm-action-form">
   <input type="hidden" name="id" value={id}/>
   <input type="hidden" name="revision" value={revision}/>
   <label className="checkbox-line"><input type="checkbox" name="acknowledged" value="yes" required/>
    Разбирам, че промяната ще се запише в одита и не изтрива оригинални данни.</label>
   {archived?
    <button className="btn primary" type="submit" name="intent" value="restore" disabled={pending}>
     Възстанови фирмата като неактивна
    </button>:
    <>
     {status==='inactive'&&<button className="btn ghost" type="submit" name="intent"
      value="activate" disabled={pending}>Активирай фирмата</button>}
     {status==='active'&&<button className="btn ghost" type="submit" name="intent"
      value="deactivate" disabled={pending}>Направи неактивна</button>}
     <button className="btn ctm-danger" type="submit" name="intent" value="archive"
      disabled={pending}>Премести фирмата в архив</button>
    </>}
  </form>
  {state.message&&<p role="status" className={state.ok?'team-status-ok':'team-status-error'}>{state.message}</p>}
 </section>;
}

export function EmployeeLifecycleControls({id,revision,status}:{
 id:string;revision:number;status:string
}){
 const [state,action,pending]=useActionState(changeEmployeeLifecycle,initial);
 const router=useRouter();
 useEffect(()=>{if(state.ok)router.refresh();},[state,router]);
 const archived=status==='archived';
 return <section className="ctm-action-card" aria-label="Действия по служителя">
  <div className="ctm-action-header"><div>
   <p className="eyebrow">УПРАВЛЕНИЕ НА ДОСИЕТО</p>
   <h2>Потвърждаване и архивиране</h2>
   <p>Архивирай вместо окончателно изтриване: поверителните данни и одитната история се запазват.</p>
  </div></div>
  <form action={action} className="ctm-action-form">
   <input type="hidden" name="id" value={id}/>
   <input type="hidden" name="revision" value={revision}/>
   <label className="checkbox-line"><input type="checkbox" name="acknowledged"
    value="yes" required/>Проверих основанието за промяна и потвърждавам действието.</label>
   {archived?
    <button className="btn primary" type="submit" name="intent" value="restore"
     disabled={pending}>Възстанови за проверка</button>:
    <>
     {status==='pending'&&<button className="btn primary" type="submit" name="intent"
      value="activate" disabled={pending}>Потвърди като активен</button>}
     {status==='active'&&<button className="btn ghost" type="submit" name="intent"
      value="deactivate" disabled={pending}>Отбележи като неактивен</button>}
     {status==='inactive'&&<button className="btn ghost" type="submit" name="intent"
      value="pending" disabled={pending}>Върни за проверка</button>}
     <button className="btn ctm-danger" type="submit" name="intent"
      value="archive" disabled={pending}>Премести служителя в архив</button>
    </>
   }
  </form>
  {state.message&&<p role="status" className={state.ok?'team-status-ok':'team-status-error'}>{state.message}</p>}
 </section>;
}
