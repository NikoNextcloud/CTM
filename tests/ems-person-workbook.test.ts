import assert from 'node:assert/strict';
import {prepareEmsPersonCandidates,emsFields} from '../src/lib/ems-person-workbook';
const source={sheet:'ЛИЦА 1013',data:[
 [...emsFields],
 ['id01','Тестово Име 1','0000000000','','OK','','Декодирано име: непотвърдено','','Да'],
 ['id02','Тестово Име 2','1111111111','','ЗА ПРОВЕРКА','','Потвърдено със справка','','Не']
]};
const result=prepareEmsPersonCandidates(source);
assert.equal(result.issues.length,0);
assert.equal(result.rows.length,2);
assert.equal(result.reportedEgnReview,1);
assert.equal(result.unconfirmedNames,1);
assert.equal(result.flaggedDuplicates,1);
assert.match(result.rows[0].source_key,/^ems-person-[0-9]{6}$/);
assert.equal(result.rows[0].data['ЕГН'],'0000000000');
assert.equal(result.rows[0].data['Статус на миграция'].includes('не са потвърдени'),true);
const bad=prepareEmsPersonCandidates({sheet:'invalid',data:[['Име','ЕГН'],['Тест','0']]});
assert.ok(bad.issues.length>0);
assert.equal(bad.rows.length,0);
console.log('EMS analytical candidates: provenance, quality flags and no auto activation PASS');