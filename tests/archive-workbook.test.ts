import assert from 'node:assert/strict';
import {
 archiveMapping,chooseArchiveHeader,archiveSourceCompany,prepareArchivePersonnel
} from '../src/lib/archive-workbook';

const input={
 sheet:'Лист1',
 data:[
  ['ТЕСТОВА ФИРМА ООД\nСинтетичен регистър'],
  [],
  ['№','Раб No','Име Презиме Фамилия','ЕГН','ТЕЛК','Длъжност','Допълнителни данни (за проверка)'],
  [1,'','ТЕСТ Иван Иванов','0000000000','СИНТЕТИЧНА ТЕЛК','Оператор','Бележка'],
  [2,'E-2','ТЕСТ Мария Иванова','','','Касиер',''],
  []
 ]
};
assert.equal(chooseArchiveHeader(input),2);
const map=archiveMapping(input.data[2]);
assert.equal(map.full_name,2);
assert.equal(map.egn,3);
assert.equal(map.telk,4);
assert.equal(map.extra,6);
const c=archiveSourceCompany(input);
assert.equal(c,'ТЕСТОВА ФИРМА ООД');
const p=prepareArchivePersonnel(input,0,2,map,c,'fictional.xlsx');
assert.equal(p.rows.length,2);
assert.equal(p.issues.length,0);
assert.equal(p.missingWorkNumbers,1);
assert.equal(p.missingEGNs,1);
assert.equal(p.rows[0].data['Име Презиме Фамилия'],'ТЕСТ Иван Иванов');
assert.equal(p.rows[0].data['ТЕЛК'],'СИНТЕТИЧНА ТЕЛК');
assert.equal(p.rows[0].data['Допълнителни данни'],'Бележка');
assert.equal(p.rows[0].data['Ред в Excel'],'4');
assert.equal(p.rows[1].source_key,'sheet0_row0000005');
const wrong={...map,full_name:-1};
assert.ok(prepareArchivePersonnel(input,0,2,wrong,c,'synthetic.xlsx').issues.length>0);
console.log('Archived personnel XLSX header detection and preserving sensitive fields: PASS');
