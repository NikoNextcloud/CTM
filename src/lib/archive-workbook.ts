import {
 normalizeHeading,workbookCellText,
 type WorkbookSheet,type WorkbookCell
} from './workbook-mapping';

export type ArchiveField=
 'company'|'work_number'|'full_name'|'city'|'address'|'egn'|
 'job_title'|'nkpd'|'personal_doctor'|'telk'|'start_date'|'end_date'|
 'diagnosis'|'notes'|'extra';
export type ArchiveMapping=Record<ArchiveField,number>;
export type ArchiveRow={
 source_key:string;row_index:number;data:Record<string,string>
};
export type ArchivePreparation={
 rows:ArchiveRow[];issues:string[];warnings:string[];
 missingWorkNumbers:number;missingEGNs:number;duplicateCandidatePairs:number;
};

export const archiveFields:ReadonlyArray<{key:ArchiveField;label:string;aliases:string[]}>= [
 {key:'company',label:'Фирма от източника',aliases:['фирма','работодател','company','company_name']},
 {key:'work_number',label:'Работен номер',aliases:['раб no','раб №','работен номер','workno','work number']},
 {key:'full_name',label:'Три имена',aliases:['име презиме фамилия','трите имена','служител','имена','full_name','full name']},
 {key:'city',label:'Град',aliases:['град','населено място','city']},
 {key:'address',label:'Адрес',aliases:['адрес','address']},
 {key:'egn',label:'ЕГН',aliases:['егн','единен граждански номер','egn']},
 {key:'job_title',label:'Длъжност',aliases:['длъжност','позиция','job_title']},
 {key:'nkpd',label:'Код по НКПД',aliases:['код по нкпд','нкпд','nkpd']},
 {key:'personal_doctor',label:'Личен лекар',aliases:['личен лекар','общопрактикуващ лекар','personal_doctor']},
 {key:'telk',label:'ТЕЛК',aliases:['телк','телк решение','telk']},
 {key:'start_date',label:'Дата на постъпване',aliases:['новопостъпили / дата','дата на постъпване','постъпване','start_date']},
 {key:'end_date',label:'Дата на напускане',aliases:['напуснали / дата','дата на напускане','напускане','end_date']},
 {key:'diagnosis',label:'Диагноза',aliases:['диагноза','диагнози','diagnosis','мкб']},
 {key:'notes',label:'Медицински бележки',aliases:['медицински бележки','медицински сведения','medical notes']},
 {key:'extra',label:'Допълнителни данни',aliases:[
  'допълнителни данни за проверка','колона m запазено','колона m без заглавие','допълнителни данни'
 ]}
];
const labelByField:Record<ArchiveField,string>={
 company:'Фирма',work_number:'Раб No',full_name:'Име Презиме Фамилия',
 city:'Град',address:'Адрес',egn:'ЕГН',job_title:'Длъжност',
 nkpd:'Код по НКПД',personal_doctor:'Личен лекар',telk:'ТЕЛК',
 start_date:'Дата на постъпване',end_date:'Дата на напускане',
 diagnosis:'Диагноза',notes:'Медицински бележки',
 extra:'Допълнителни данни'
};

export function archiveMapping(headers:WorkbookCell[]):ArchiveMapping{
 const result=Object.fromEntries(archiveFields.map(f=>[f.key,-1])) as ArchiveMapping;
 headers.forEach((value,i)=>{
  const normalized=normalizeHeading(value);
  for(const f of archiveFields){
   if(result[f.key]<0&&f.aliases.some(alias=>normalizeHeading(alias)===normalized)){
    result[f.key]=i;break;
   }
  }
 });
 return result;
}
export function chooseArchiveHeader(sheet:WorkbookSheet){
 let best=0,score=-1;
 for(let i=0;i<Math.min(sheet.data.length,45);i++){
  const map=archiveMapping(sheet.data[i]||[]);
  const hits=Object.values(map).filter(x=>x>=0).length;
  const weighted=hits+(map.full_name>=0?3:0)+(map.egn>=0?1:0);
  if(weighted>score){best=i;score=weighted}
 }
 return best;
}
export function archiveSourceCompany(sheet:WorkbookSheet){
 // Some legacy sheets carry the company name in a cover row, not in a column.
 const first=workbookCellText(sheet.data[0]?.[0]??'');
 const firstLine=first.split(/\r?\n/)[0].trim();
 return firstLine.length>=2&&firstLine.length<=150&&!/^(списък|данни|№|служители)/iu.test(firstLine)
  ?firstLine:'';
}
function cell(value:WorkbookCell){
 return workbookCellText(value);
}

export function prepareArchivePersonnel(
 sheet:WorkbookSheet,sheetIndex:number,headerRow:number,mapping:ArchiveMapping,
 fallbackCompany:string,sourceFile:string
):ArchivePreparation{
 const issues:string[]=[],warnings:string[]=[];
 const rows:ArchiveRow[]=[];
 let missingWorkNumbers=0,missingEGNs=0;
 if(!Number.isInteger(headerRow)||headerRow<0||headerRow>=sheet.data.length)
  return{rows,issues:['Невалиден ред със заглавия.'],warnings,missingWorkNumbers,missingEGNs,duplicateCandidatePairs:0};
 const company=fallbackCompany.trim();
 const header=sheet.data[headerRow]||[];
 const chosen=new Set<number>();
 for(const f of archiveFields){
  const col=mapping[f.key];
  if(col>=0){
   if(col>=Math.max(header.length,100)||!Number.isInteger(col))
    issues.push('Невалидна колона за '+f.label+'.');
   if(chosen.has(col))issues.push('Една колона е избрана за повече от едно поле.');
   chosen.add(col);
  }
 }
 if(mapping.full_name<0)issues.push('Избери колона с трите имена на служителя.');
 if(mapping.company<0&&(company.length<2||company.length>200))
  issues.push('Въведи фирмата, изписана в оригиналния източник.');
 if(issues.length)return{rows,issues,warnings,missingWorkNumbers,missingEGNs,duplicateCandidatePairs:0};
 const all=sheet.data.slice(headerRow+1);
 const populated=all.filter(r=>r.some(x=>cell(x)!==''));
 if(populated.length>5000)issues.push('Над 5000 записа: раздели файла, без да губиш редове.');
 const seen=new Set<string>();
 let duplicateCandidatePairs=0;
 for(let i=0;i<all.length;i++){
  const raw=all[i];
  if(!raw.some(x=>cell(x)!==''))continue;
  if(raw.some(x=>cell(x).length>8000))issues.push('Ред '+(headerRow+i+2)+': поле над 8000 знака. Прегледай оригинала.');
  const number=headerRow+i+2;
  const data:Record<string,string>={};
  for(const f of archiveFields){
   const col=mapping[f.key];
   data[labelByField[f.key]]=col>=0?cell(raw[col]):'';
  }
  if(!data['Фирма'])data['Фирма']=company;
  if(data['Име Презиме Фамилия'].trim().length<3)
   issues.push('Ред '+number+': липсват три имена.');
  if(data['Фирма'].trim().length<2)
   issues.push('Ред '+number+': липсва фирма в източника.');
  if(!data['Раб No'])missingWorkNumbers++;
  if(!data['ЕГН'])missingEGNs++;
  if(typeof raw[mapping.egn]==='number'&&mapping.egn>=0)
   warnings.push('Ред '+number+': ЕГН е числово поле. Провери водещите нули в оригинала.');
  const additional=header
   .map((name,index)=>({name:cell(name)||'Колона '+(index+1),index}))
   .filter(x=>!chosen.has(x.index)&&cell(raw[x.index])!=='');
  if(additional.length>15)issues.push('Ред '+number+': над 15 допълнителни колони. Раздели източника, без да пропускаш данни.');
  for(const other of additional){
   data['Доп. '+other.name.slice(0,90)+' #'+other.index]=cell(raw[other.index]);
  }
  data['Източник']=sourceFile.slice(0,120);
  data['Изходен лист']=sheet.sheet.slice(0,100);
  data['Ред в Excel']=String(number);
  const key=data['Име Презиме Фамилия'].normalize('NFKC').toLocaleLowerCase('bg-BG')+'|'+data['ЕГН'];
  if(seen.has(key))duplicateCandidatePairs++;
  else seen.add(key);
  rows.push({
   source_key:'sheet'+sheetIndex+'_row'+String(number).padStart(7,'0'),
   row_index:number,data
  });
  if(Object.keys(data).length>48||JSON.stringify(data).length>22000)
   issues.push('Ред '+number+': прекалено много или дълги полета.');
 }
 if(!rows.length)issues.push('Няма записи под заглавния ред.');
 if(missingWorkNumbers)warnings.push(missingWorkNumbers+' записа нямат работен номер — запазени са за проверка.');
 if(missingEGNs)warnings.push(missingEGNs+' записа нямат ЕГН — не се измисля идентификатор.');
 if(duplicateCandidatePairs)warnings.push(duplicateCandidatePairs+' възможни повторения по име и ЕГН — няма автоматично сливане.');
 return{rows,issues:issues.slice(0,30),warnings:warnings.slice(0,45),
  missingWorkNumbers,missingEGNs,duplicateCandidatePairs};
}
