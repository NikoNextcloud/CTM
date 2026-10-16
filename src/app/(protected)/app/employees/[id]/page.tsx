import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getContext} from '@/lib/session';
import {EditEmployeePanel} from '@/components/edit-panels';
import {EmployeeClinicalPanel,type ClinicalRecord} from '@/components/employee-clinical-panel';
import {EmployeeLifecycleControls} from '@/components/lifecycle-controls';
export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default async function EmployeeDetail({params}:Props){
 const {id}=await params;if(!uuid(id))notFound();
 const ctx=await getContext();if(!ctx.tenant)notFound();
 const {data,error}=await ctx.supabase.from('employees')
  .select('id,company_id,full_name,job_title,reference_code,current_status,revision')
  .eq('tenant_id',ctx.tenant).eq('id',id).maybeSingle();
 if(error||!data)notFound();
 const canEdit=['admin','specialist'].includes(ctx.role);
 const canClinical=['admin','doctor'].includes(ctx.role);
 const clinical=canClinical?await ctx.supabase.rpc('ctm_read_employee_clinical',{p_employee_id:id}):null;
 const clinicalRecord=clinical?.data as ClinicalRecord|null;
 return <div className="content">
  <Link href="/app/employees" className="back">← Служители</Link>
  <div className="page-header"><div><p className="eyebrow">СЛУЖЕБЕН РЕГИСТЪР · ДОСИЕ НА СЛУЖИТЕЛ</p>
   <h1>{data.full_name}</h1><p>Длъжност: {data.job_title||'—'} · Вътрешен номер: {data.reference_code||'—'}</p>
  </div><span className="tag">{data.current_status==='pending'?'Статус: непотвърден':data.current_status}</span></div>
  <p><Link href={'/app/companies/'+data.company_id} className="company-link">Отвори фирменото досие →</Link></p>
  <p className="subnote">Статусът на този запис не доказва действащо трудово правоотношение. Поверителните полета имат отделни права и одит.</p>
  {canClinical&&(clinical?.error?<div className="notice warn" role="alert">Поверителните полета не могат да се заредят. Провери конфигурацията и достъпа до базата.</div>
   :<EmployeeClinicalPanel employeeId={id} record={clinicalRecord||{revision:0}}/>)}
  {canEdit&&<EditEmployeePanel employee={data}/>}
  {ctx.role==='admin'&&<EmployeeLifecycleControls id={data.id} revision={data.revision} status={data.current_status}/>}
 </div>;
}