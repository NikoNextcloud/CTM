import {CSV_FORMATS,IMPORT_LIMIT_ROWS,type TransferResource} from './import-csv';

export type WorkbookCell=string|number|boolean|Date|null|undefined;
export type WorkbookSheet={sheet:string;data:WorkbookCell[][]};
export type ColumnMap=Record<string,number>;
export type WorkbookProfile={index:number;name:string;headerRow:number;headers:string[];mapping:ColumnMap;recognized:number;dataRows:number;privateColumns:string[]};
export type MappedResult={csv:string;rowCount:number;issues:string[];excludedColumns:string[]};

const alias:Record<string,string[]>={
 company_eik:['company_eik','company eik','еик','булстат','еик на фирма','еик работодател','работодател еик'],
 name:['name','наименование','име на фирма','фирма','работодател','име на обект','обект'],
 eik:['eik','еик','булстат','егн на фирма'],
 address:['address','адрес','адрес на фирма','адрес на обект'],
 status:['status','статус','състояние'],
 full_name:['full_name','име презиме фамилия','трите имена','имена','име на служител','служител','име и фамилия'],
 job_title:['job_title','длъжност','длъжност по договор','позиция'],
 reference_code:['reference_code','работен номер','раб no','раб №','работен no','работен №','вътрешен номер','служебен номер','номер на служител'],
 title:['title','длъжност','наименование','име'],
 department:['department','отдел','звено','структурно звено'],
 active:['active','активен','активна'],
 workplace:['workplace','работно място','работно место','обект'],
 hazard:['hazard','опасност','рисков фактор'],
 risk_level:['risk_level','степен на риск','ниво на риск'],
 protective_measures:['protective_measures','мерки','предпазни мерки'],
 assessment_date:['assessment_date','дата на оценка'],
 review_due:['review_due','дата на преглед','преглед до']
};

export const fieldLabels:Record<string,string>={
 company_eik:'ЕИК на фирмата',name:'Наименование',eik:'ЕИК / БУЛСТАТ',address:'Адрес',
 status:'Статус',full_name:'Име на служител',job_title:'Длъжност',reference_code:'Вътрешен номер',
 title:'Длъжност / наименование',department:'Отдел',active:'Активност',
 workplace:'Работно място',hazard:'Опасност',risk_level:'Ниво на риска',
 protective_measures:'Мерки',assessment_date:'Дата на оценката',review_due:'Преглед до'
};
export function normalizeHeading(value:unknown){
 return String(value??'').normalize('NFKC').toLocaleLowerCase('bg-BG')
 .replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
}
const privateKeys=/(егн|телк|диагноз|лекар|медицин|здрав|болнич|мкб|icd|socialsecurity|nationalid|diagnos|health|doctor)/iu;
export function isPrivateColumn(header:string,resource:TransferResource){
 const n=normalizeHeading(header);
 return privateKeys.test(n)||(resource==='employees'&&/(^град$|^адрес$|^city$|^address$)/u.test(n));
}
export function fieldForHeader(header:string,resource:TransferResource){
 const normalized=normalizeHeading(header);
 if(!normalized || isPrivateColumn(header,resource))return null;
 const fields=CSV_FORMATS[resource];
 for(const key of fields){
  const variations=[key,...(alias[key]??[])];
  if(variations.some(x=>normalizeHeading(x)===normalized))return key;
 }
 return null;
}
export function headerFields(row:WorkbookCell[],resource:TransferResource){
 const fields=CSV_FORMATS[resource], mapping:ColumnMap=Object.fromEntries(fields.map(k=>[k,-1]));
 row.forEach((value,i)=>{const f=fieldForHeader(String(value??''),resource);
  if(f&&mapping[f]===-1)mapping[f]=i;
 });
 return mapping;
}
export function chooseHeaderRow(sheet:WorkbookSheet,resource:TransferResource){
 let bestIndex=0,bestScore=-1;
 // Real workbooks may begin with titles, blank rows and explanatory notes.
 const limit=Math.min(sheet.data.length,40);
 for(let i=0;i<limit;i++){
  const m=headerFields(sheet.data[i],resource);
  const score=Object.values(m).filter(v=>v>=0).length;
  if(score>bestScore){bestScore=score;bestIndex=i;}
 }
 return bestIndex;
}
export function describeSheet(sheet:WorkbookSheet,index:number,resource:TransferResource,requestedRow?:number):WorkbookProfile{
 const headerRow=requestedRow??chooseHeaderRow(sheet,resource);
 const head=sheet.data[headerRow]??[];
 const width=Math.max(head.length,...sheet.data.slice(headerRow+1,Math.min(sheet.data.length,headerRow+5)).map(r=>r.length),0);
 const headers=Array.from({length:Math.min(width,100)},(_,i)=>{
  const value=String(head[i]??'').trim();return value||'Колона '+(i+1);
 });
 const mapping=headerFields(head,resource);
 const dataRows=sheet.data.slice(headerRow+1).filter(row=>row.some(c=>c!==null&&c!==undefined&&String(c).trim()!=='')).length;
 return{index,name:sheet.sheet||'Лист '+(index+1),headerRow,headers,mapping,
  recognized:Object.values(mapping).filter(v=>v>=0).length,dataRows,
  privateColumns:headers.filter(h=>isPrivateColumn(h,resource))};
}
export function inspectWorkbook(sheets:WorkbookSheet[],resource:TransferResource){
 return sheets.map((s,i)=>describeSheet(s,i,resource));
}
export function workbookCellText(value:WorkbookCell){
 if(value instanceof Date){
  if(Number.isNaN(value.getTime()))return '';
  return value.toISOString().slice(0,10);
 }
 if(value===null||value===undefined)return '';
 return String(value).trim();
}
function quote(value:string){return '"'+value.replace(/"/g,'""')+'"';}
export function mapWorkbookSheet(
 sheet:WorkbookSheet,resource:TransferResource,headerRow:number,mapping:ColumnMap,fallback:Record<string,string>
):MappedResult{
 const fields=CSV_FORMATS[resource],issues:string[]=[];
 if(!Number.isInteger(headerRow)||headerRow<0||headerRow>=sheet.data.length){
  return {csv:'',rowCount:0,issues:['Невалиден ред със заглавия.'],excludedColumns:[]};
 }
 const profile=describeSheet(sheet,0,resource,headerRow);
 const chosen=new Set<number>();
 const optional=new Set(['address','department','job_title','workplace','protective_measures','review_due']);
 for(const field of fields){
  const column=mapping[field]??-1;
  if(column>=0){
   if(!Number.isInteger(column)||column>=profile.headers.length)issues.push('Невалидна колона за '+fieldLabels[field]+'.');
   if(chosen.has(column))issues.push('Една колона е избрана за повече от едно поле: '+fieldLabels[field]+'.');
   chosen.add(column);
   if(isPrivateColumn(profile.headers[column]||'',resource))
    issues.push('Колоната „'+profile.headers[column]+'“ е лична/медицинска и не може да се прехвърли към административно поле.');
  }else if(!optional.has(field)&&!String(fallback[field]??'').trim()){
   issues.push('Избери колона или постоянна стойност за '+fieldLabels[field]+'.');
  }
 }
 const excludedColumns=profile.headers.filter((_,i)=>!chosen.has(i));
 const sourceRows=sheet.data.slice(headerRow+1).filter(row=>row.some(v=>workbookCellText(v)!==''));
 if(!sourceRows.length)issues.push('Няма записи под реда със заглавия.');
 if(sourceRows.length>IMPORT_LIMIT_ROWS)issues.push('Файлът има '+sourceRows.length+' записа; максимумът за една операция е '+IMPORT_LIMIT_ROWS+'. Нищо не е пропуснато или внесено.');
 if(issues.length)return{csv:'',rowCount:sourceRows.length,issues,excludedColumns};
 const serialized:string[]=[fields.join(';')];
 for(const [i,row] of sourceRows.entries()){
  const vals=fields.map(key=>workbookCellText(mapping[key]>=0?row[mapping[key]]:fallback[key]));
  // Prevent accidental header row repetition or blank identifiers being silently imported.
  if(fields.some((key,j)=>!vals[j] && !['address','department','workplace','protective_measures','review_due'].includes(key)))
   issues.push('Липсва задължително поле в ред '+(headerRow+i+2)+'.');
  serialized.push(vals.map(quote).join(';'));
 }
 if(issues.length)return{csv:'',rowCount:sourceRows.length,issues:issues.slice(0,30),excludedColumns};
 return{csv:'\uFEFF'+serialized.join('\r\n')+'\r\n',rowCount:sourceRows.length,issues:[],excludedColumns};
}
