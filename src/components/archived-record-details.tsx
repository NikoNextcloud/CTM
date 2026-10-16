'use client';

import {useState} from 'react';

const sensitive=/(егн|телк|диагноз|лекар|медицин|бележк|адрес|здрав|мкб|болнич|health|notes|national.?id)/iu;

export function ArchivedRecordDetails({data}:{data:Record<string,unknown>}){
 const [unmasked,setUnmasked]=useState(false);
 const entries=Object.entries(data).slice(0,80);
 return <section className="table-panel">
  <div className="section-heading">
   <div><h2>Всички съхранени полета от източника</h2>
    <p>Поверителните стойности са скрити на екрана по подразбиране.</p></div>
   <button type="button" className="btn ghost"
    onClick={()=>setUnmasked(v=>!v)}
    aria-pressed={unmasked}>
    {unmasked?'Скрий поверителните стойности':'Покажи поверителните стойности'}
   </button>
  </div>
  <div className="table-wrap">
   <table><tbody>{entries.map(([name,value])=><tr key={name}>
    <th scope="row" style={{minWidth:180}}>{name}</th>
    <td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>
     {!unmasked&&sensitive.test(name)?'•••••• (скрито)':
      typeof value==='object'?JSON.stringify(value):String(value??'')}
    </td>
   </tr>)}</tbody></table>
  </div>
  {entries.length===0&&<p className="subnote">Няма полета в този архивен запис.</p>}
  {Object.keys(data).length>entries.length&&
   <p className="notice warn">Има допълнителни колони, които не могат да се покажат в този изглед.</p>}
 </section>;
}
