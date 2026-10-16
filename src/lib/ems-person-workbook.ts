import {normalizeHeading,workbookCellText,type WorkbookSheet} from './workbook-mapping';

export type EmsPersonRow={source_key:string;row_index:number;data:Record<string,string>};
export type EmsPersonPreparation={
 rows:EmsPersonRow[];issues:string[];warnings:string[];
 reportedEgnReview:number;unconfirmedNames:number;flaggedDuplicates:number;
};
export const emsFields=[
 'Оригинален ID','Име - основно','ЕГН','Дата на раждане (поле)',
 'Проверка ЕГН','Дата спрямо ЕГН','Статус на името','Потвърдено от',
 'Дублирано ЕГН','Вътрешен код 81 96 (неясен)',
 'Допълнителна дата 81 9B (неясна)','Текст 81 6E (неясен)',
 'Позиция в STRMCARE','Име - декодирано','Име - от справка'
] as const;

export function prepareEmsPersonCandidates(sheet:WorkbookSheet):EmsPersonPreparation{
 const rows:EmsPersonRow[]=[],issues:string[]=[],warnings:string[]=[];
 let reportedEgnReview=0,unconfirmedNames=0,flaggedDuplicates=0;
 const headerIndex=sheet.data.findIndex((line,index)=>index<15&&
  line.some(x=>normalizeHeading(x)===normalizeHeading('Оригинален ID'))&&
  line.some(x=>normalizeHeading(x)===normalizeHeading('Статус на името'))&&
  line.some(x=>normalizeHeading(x)===normalizeHeading('ЕГН')));
 if(headerIndex<0)return{rows,issues:['Няма колони Оригинален ID, ЕГН и Статус на името.'],warnings,reportedEgnReview,unconfirmedNames,flaggedDuplicates};
 const positions=emsFields.map(f=>sheet.data[headerIndex].findIndex(x=>normalizeHeading(x)===normalizeHeading(f)));
 for(const required of [0,1,2,4,6])if(positions[required]<0)issues.push('Липсва колона '+emsFields[required]+'.');
 if(issues.length)return{rows,issues,warnings,reportedEgnReview,unconfirmedNames,flaggedDuplicates};
 if(sheet.data.length>5016)issues.push('Файлът надхвърля 5000 реда и изисква разделяне на части.');
 const originalIds=new Set<string>();
 for(let i=headerIndex+1;i<sheet.data.length;i++){
  const raw=sheet.data[i];
  if(!raw.some(x=>workbookCellText(x)!==''))continue;
  const number=i+1,data:Record<string,string>={};
  for(let j=0;j<emsFields.length;j++){
   const value=positions[j]>=0?workbookCellText(raw[positions[j]]):'';
   if(value.length>8000)issues.push('Ред '+number+' има твърде дълга стойност.');
   data[emsFields[j]]=value;
  }
  if(originalIds.has(data['Оригинален ID']))warnings.push('Повторен оригинален ID на ред '+number+'.');
  else originalIds.add(data['Оригинален ID']);
  if(data['Проверка ЕГН']!=='OK')reportedEgnReview++;
  if(!/Потвърдено със справка/iu.test(data['Статус на името']))unconfirmedNames++;
  if(data['Дублирано ЕГН']==='Да')flaggedDuplicates++;
  data['Изходен лист']=sheet.sheet.slice(0,120);
  data['Ред в Excel']=String(number);
  data['Статус на миграция']='Архивен кандидат; работодател и идентичност не са потвърдени';
  rows.push({source_key:'ems-person-'+String(number).padStart(6,'0'),row_index:number,data});
 }
 if(!rows.length)issues.push('Няма лица за импортиране.');
 return{rows,issues,warnings,reportedEgnReview,unconfirmedNames,flaggedDuplicates};
}
