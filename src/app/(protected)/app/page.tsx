import Link from 'next/link';
import {getContext} from '@/lib/session';
import {modules, canAccessModule, type ModuleId} from '@/lib/modules';
const counters: {title:string;id:ModuleId;table:string}[]=[
 {title:'Фирми',id:'companies',table:'companies'},
 {title:'Служители',id:'employees',table:'employees'},
 {title:'Прегледи',id:'examinations',table:'examinations'},
 {title:'Болнични листове',id:'sick-leaves',table:'sick_leaves'}
];
export default async function Dashboard(){
 const c=await getContext();if(!c.tenant)return null;
 const permittedCounters=counters.filter(x=>canAccessModule(c.role,x.id));
 const permittedModules=modules.filter(x=>canAccessModule(c.role,x.id));
 const numbers=await Promise.all(permittedCounters.map(async x=>{
  const q=await c.supabase.from(x.table).select('id',{head:true,count:'exact'}).eq('tenant_id',c.tenant!);
  return q.count??0;
 }));
 return <div className="content"><div className="page-header"><div><p className="eyebrow">ПРЕГЛЕД НА ДЕЙНОСТТА</p><h1>Работно табло</h1><p>Информацията е ограничена според вашата роля. Базата проверява правата за всеки ред.</p></div><div className="tag">Работна версия · v0.2</div></div>
 <section className="metrics">{permittedCounters.map((x,i)=><Link href={'/app/'+x.id} className="metric" key={x.id}><span>{x.title}</span><strong>{numbers[i].toLocaleString('bg-BG')}</strong><small>Виж регистъра ↗</small></Link>)}</section>
 <div className="section-heading"><h2>Модули и дейности</h2><p>Показани са само модулите, приложими за вашата роля.</p></div>
 <div className="module-grid">{permittedModules.map((m,i)=><Link href={'/app/'+m.id} className="module-card" key={m.id}><div className="module-emblem">{['▣','♙','✚','▤','▥','⇄','♧','▧'][i%8]}</div><h3>{m.title}</h3><p>{m.subtitle}</p><span>Отвори модул →</span></Link>)}</div>
 <div className="notice warn">Архивите от EMS-STM не са импортирани в облака. Непотвърдените връзки остават само в локалните извлечения.</div></div>;
}
