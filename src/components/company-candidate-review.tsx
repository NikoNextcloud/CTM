'use client';

import Link from 'next/link';
import {useActionState} from 'react';
import {
 promoteCandidate,flagCandidate,type CandidateReviewState
} from '@/lib/candidate-actions';

export type CompanyCandidate={
 id:string;name:string;normalized_name:string|null;
 source_kind:string;source_label:string;confidence:string;
 review_status:string;eik:string|null;review_note:string;
 promoted_company_id:string|null;
};
export type PublicResearch={candidate_id:string;proposed_eik:string|null;public_name:string;public_city:string;source_url:string;research_state:string;comment:string};
const initial:CandidateReviewState={ok:false,message:''};

export function CompanyCandidateReview({candidate,duplicateCount,research}:{
 candidate:CompanyCandidate;duplicateCount:number;research?:PublicResearch
}){
 const [verifiedState,verificationAction,verifying]=useActionState(promoteCandidate,initial);
 const [flagState,flagAction,flagging]=useActionState(flagCandidate,initial);
 const suggestion=candidate.review_note.match(/ЕИК от CSV \(непотвърден\): ([0-9]{9}(?:[0-9]{4})?)/u)?.[1]||'';
 const finalized=['verified','excluded'].includes(candidate.review_status);
 return <article className="table-panel candidate-card">
  <div className="candidate-top">
   <div><h3>{candidate.name}</h3>
    <p className="subnote">Източник: {candidate.source_kind} · {candidate.source_label}</p></div>
   <div className="ctm-candidate-state"><span className="tag">{candidate.review_status==='pending'?'За потвърждение':candidate.review_status==='verified'?'Потвърдена':candidate.review_status==='excluded'?'Изключена':'Конфликт'}</span></div>
  </div>
  {suggestion&&<p className="subnote">ЕИК, предложен във файла: <strong>{suggestion}</strong> · изисква официална проверка</p>}
  {research&&<div className="ctm-research-panel">
   <div className="ctm-research-heading">
    <strong>{research.research_state==='suggested'?'Намерен публичен кандидат за ЕИК':
      research.research_state==='ambiguous'?'Няколко възможни фирми':'ЕИК още не е установен еднозначно'}</strong>
    <span className="tag">Не е потвърдено</span>
   </div>
   {research.proposed_eik&&<p><strong>Предложен ЕИК: {research.proposed_eik}</strong>
     {research.public_city&&' · '+research.public_city}</p>}
   <p className="subnote">{research.comment}</p>
   <div className="ctm-research-links">
    {research.source_url&&<a href={research.source_url} target="_blank" rel="noopener noreferrer">
      Публичен източник ↗</a>}
    <a href={'https://www.google.com/search?q='+encodeURIComponent('"'+candidate.name+'" ЕИК')} target="_blank" rel="noopener noreferrer">
      Потърси по наименование ↗</a>
    <a href="https://portal.registryagency.bg/" target="_blank" rel="noopener noreferrer">Официален регистър ↗</a>
   </div>
  </div>}

  <p className="subnote">Достоверност на разпознаване: {candidate.confidence}
   {duplicateCount>1?' · '+duplicateCount+' кандидата с подобно име':''}</p>
  {duplicateCount>1&&<div className="notice warn">
   Има повторения на нормализираното име. Провери дали всички източници са за една фирма.
  </div>}
  {finalized?<>
   {candidate.review_status==='verified'&&candidate.promoted_company_id
    ?<p><Link className="company-link" href={'/app/companies/'+candidate.promoted_company_id}>
      Отвори свързаното фирмено досие →
     </Link></p>:null}
   <p className="subnote">ЕИК: {candidate.eik||'не е посочен'}.
    Основание: {candidate.review_note||'липсва'}</p>
  </>:<>
   <details className="add-panel ctm-candidate-review">
    <summary className="ctm-review-trigger">✓ Провери ЕИК и потвърди фирмата</summary>
    <p className="subnote">
     Провери ЕИК, правната форма и наименованието в официалния регистър или първичен договор.
     След потвърждаване новият фирмен запис остава НЕАКТИВЕН, докато договорният статус не е проверен.
    </p>
    <p><a className="company-link" href="https://portal.registryagency.bg/"
     target="_blank" rel="noopener noreferrer">Отвори официалния регистър ↗</a></p>
    <form action={verificationAction} className="candidate-review-form">
     <input type="hidden" name="candidate_id" value={candidate.id}/>
     <label>ЕИК/БУЛСТАТ (9 или 13 цифри, с контролна проверка)
      <input name="eik" inputMode="numeric" pattern="[0-9]{9}([0-9]{4})?"
       placeholder="Потвърден идентификатор" defaultValue={candidate.eik||research?.proposed_eik||suggestion} required maxLength={13}/>
     </label>
     <label>Потвърдено наименование (въведи изписването отгоре)
      <input name="confirmed_name" required minLength={2} maxLength={200}
       autoComplete="off" placeholder="Изпиши името на фирмата"/>
     </label>
     <label>Доказателство: източник, дата, документ/регистър
      <textarea name="evidence" required minLength={24} maxLength={500}
       placeholder="Например: ТРРЮЛНЦ, ЕИК, дата на проверката и номер на договор"/>
     </label>
     <label className="checkbox-line"><input type="checkbox" name="confirmation" value="yes" required/>
      Проверих принадлежността на ЕИК към това юридическо лице и не потвърждавам непроверен архивен запис.
     </label>
     <button className="btn primary" type="submit" disabled={verifying}>
      {verifying?'Проверка и записване…':'Потвърди фирмата'}
     </button>
     {verifiedState.message&&<p role="status" className={verifiedState.ok?'team-status-ok':'team-status-error'}>
      {verifiedState.message}
     </p>}
    </form>
   </details>
   <details className="add-panel ctm-candidate-review">
    <summary className="ctm-review-trigger ctm-review-trigger-muted">Изключи / отбележи конфликт</summary>
    <form action={flagAction} className="candidate-review-form">
     <input type="hidden" name="candidate_id" value={candidate.id}/>
     <label>Решение<select name="resolution" defaultValue="conflict">
      <option value="conflict">Конфликт — изисква допълнителна проверка</option>
      <option value="excluded">Изключи — не е юридическо лице / дублиран източник</option>
     </select></label>
     <label>Основание за решението<textarea name="reason" required minLength={12} maxLength={500}
       placeholder="Посочи проверения първичен източник или причината за конфликта"/></label>
     <button className="btn ghost" type="submit" disabled={flagging}>
      {flagging?'Записване…':'Запиши решение'}
     </button>
     {flagState.message&&<p role="status" className={flagState.ok?'team-status-ok':'team-status-error'}>
      {flagState.message}
     </p>}
    </form>
   </details>
  </>}
 </article>;
}
