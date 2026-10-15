'use client';

import { useActionState } from 'react';
import { inviteMember, updateMember } from '@/lib/team-actions';

type Member = { user_id: string; email: string | null; role: string; active: boolean };
type Company = { id: string; name: string; eik: string };
type Access = { user_id: string; company_id: string };
const roles = [
  ['admin', 'Администратор'], ['specialist', 'СТМ специалист'],
  ['doctor', 'Лекар'], ['employer', 'Работодател'], ['auditor', 'Одитор']
] as const;
const initial = { ok: false, message: '' };

function CompanyChoices({ companies, selected = [] }: { companies: Company[]; selected?: string[] }) {
  return <fieldset className="team-companies"><legend>Фирми — задължителни за работодател</legend>
    {companies.length === 0 ? <p className="muted">Първо добави фирма в регистъра, за да поканиш работодател.</p> :
      companies.map(company => <label key={company.id} className="team-choice">
        <input type="checkbox" name="company_ids" value={company.id} defaultChecked={selected.includes(company.id)} />
        <span>{company.name} <small>({company.eik})</small></span>
      </label>)}
  </fieldset>;
}

function InviteForm({ companies }: { companies: Company[] }) {
  const [state, action, pending] = useActionState(inviteMember, initial);
  return <section className="team-panel"><h2>Добави потребител</h2>
    <p className="muted">Първо създай потребителя ръчно в Supabase → Authentication → Users. Тук само задаваш неговите права в СТМ 2.0.</p>
    <form action={action} className="team-form">
      <div className="team-form-grid">
        <label>Служебен имейл<input type="email" name="email" required maxLength={254} placeholder="user@company.bg" autoComplete="email" /></label>
        <label>Потребителска роля<select name="role" defaultValue="specialist">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <CompanyChoices companies={companies} />
      <button className="btn primary" disabled={pending} type="submit">{pending ? 'Обработка…' : 'Добави съществуващ акаунт →'}</button>
      {state.message && <div role="status" className={'notice ' + (state.ok ? 'team-success' : 'warn')}>{state.message}</div>}
    </form>
  </section>;
}

function MemberRow({ member, ownUserId, companies, selected }: { member: Member; ownUserId: string; companies: Company[]; selected: string[] }) {
  const [state, action, pending] = useActionState(updateMember, initial);
  const isSelf = member.user_id === ownUserId;
  return <div className="team-member"><div className="team-member-head"><div>
    <strong>{member.email || 'Няма записан имейл'}</strong>
    <p>{isSelf ? 'Твоят акаунт · ' : ''}{member.active ? 'Активен достъп' : 'Достъпът е спрян'}</p>
  </div><span className={'team-pill ' + (member.active ? 'is-active' : 'is-inactive')}>{member.role}</span></div>
    {isSelf ? <p className="muted team-self-note">За защита не можеш да премахнеш собствените си администраторски права.</p> :
      <form action={action} className="team-form">
        <input type="hidden" name="user_id" value={member.user_id} />
        <div className="team-form-grid">
          <label>Роля<select name="role" defaultValue={member.role}>{roles.map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></label>
          <label className="team-active"><input type="checkbox" name="active" defaultChecked={member.active} /> Активен акаунт</label>
        </div>
        <CompanyChoices companies={companies} selected={selected} />
        <button disabled={pending} className="btn ghost" type="submit">{pending ? 'Записване…' : 'Запази права'}</button>
        {state.message && <p role="status" className={state.ok ? 'team-status-ok' : 'team-status-error'}>{state.message}</p>}
      </form>}
  </div>;
}

export function TeamManager({ ownUserId, members, companies, access }: { ownUserId: string; members: Member[]; companies: Company[]; access: Access[] }) {
  return <div className="content"><div className="page-header"><div><p className="eyebrow">АДМИНИСТРАЦИЯ / ДОСТЪП</p><h1>Екип и потребителски роли</h1><p>Ръчно добавяне на съществуващи акаунти, роли и достъп по фирма.</p></div><span className="tag">{members.length} акаунта</span></div>
    <div className="notice warn"><strong>Внимание:</strong> медицинските сведения са отделени от административните регистри. Ролята „работодател“ вижда само фирмите, към които е назначена. Системата остава в тестов режим.</div>
    <InviteForm companies={companies} />
    <section className="team-panel"><h2>Потребители в организацията</h2>
      {members.length ? members.map(member => <MemberRow key={member.user_id} member={member} ownUserId={ownUserId} companies={companies} selected={access.filter(x => x.user_id === member.user_id).map(x => x.company_id)} />) :
        <p className="muted">Няма добавени потребители.</p>}
    </section>
    <div className="notice">СТМ 2.0 не създава акаунти и не изпраща покани. Потребителите се създават само ръчно в <strong>Supabase → Authentication → Users</strong>. Действията с роли се записват в одитния регистър.</div>
  </div>;
}
