-- CTM v0.17: public-registry research for every archive-company candidate.
-- Suggestions never approve EIK or create active employers.
CREATE TABLE IF NOT EXISTS public.ctm_company_research (
 candidate_id uuid PRIMARY KEY REFERENCES public.ctm_company_candidates(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 proposed_eik text CHECK(proposed_eik IS NULL OR proposed_eik ~ '^[0-9]{9}([0-9]{4})?$'),
 public_name text NOT NULL DEFAULT '',
 public_city text NOT NULL DEFAULT '',
 source_url text NOT NULL DEFAULT '',
 research_state text NOT NULL DEFAULT 'unresolved'
  CHECK(research_state IN('unresolved','suggested','ambiguous')),
 comment text NOT NULL DEFAULT '',
 researched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ctm_company_research_tenant ON public.ctm_company_research(tenant_id,research_state);
ALTER TABLE public.ctm_company_research ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ctm_company_research FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ctm_company_research TO authenticated;
DROP POLICY IF EXISTS ctm_company_research_admin_read ON public.ctm_company_research;
CREATE POLICY ctm_company_research_admin_read ON public.ctm_company_research
 FOR SELECT TO authenticated
 USING (private.has_role(tenant_id,ARRAY['admin'::text]));
-- Ensure ALL 92 existing candidates have a visible research status even when no
-- trustworthy single public identification is available.
INSERT INTO public.ctm_company_research(candidate_id,tenant_id,research_state,comment)
SELECT c.id,c.tenant_id,'unresolved',
 'Не е установено еднозначно публично съвпадение. Провери ЕИК в ТРРЮЛНЦ или първичен договор.'
FROM public.ctm_company_candidates c
ON CONFLICT(candidate_id) DO NOTHING;
WITH matches(source_name,eik,link,city) AS (VALUES
('А - КОНСУЛТ ИНЖЕНЕРИНГ ЕООД','205384521','https://papagal.bg/eik/205384521/db4b','София'),
('АН и ВАН 2014 ЕООД','203031864','https://papagal.bg/eik/203031864/0032','София'),
('АПИТА МАКС ТРАВЕЛ БГ ЕООД','208407740','https://papagal.bg/eik/208407740/9a7c','София'),
('Бачи Долчи ЕООД','202258122','https://papagal.bg/eik/202258122/6d70','София'),
('БИ ЕН ГРУП БГ ООД','175060941','https://www.ukazatelite.com/175060941','София'),
('Бизнес Фасилити Сървисиз  ЕООД','200233622','https://registri.bg/bg/companies/200233622/','Червен бряг'),
('Ботъл Шок Шоп  ЕООД','148105923','https://papagal.bg/eik/148105923/a733','Монтана'),
('Витоша газ','204192799','https://papagal.bg/eik/204192799/b99a','Банкя'),
('Вход А-2020 ЕООД','208752640','https://papagal.bg/eik/208752640/0519','София'),
('ГАЛЕН - ФАРМА ООД - 112005999','112005999','https://papagal.bg/eik/112005999/1f62','Калугерово'),
('ГАП-07 ЕООД','160100839','https://www.finansi.bg/gap-07','Войводиново'),
('ГАЯ ИН ЕООД','206585331','https://registri.bg/bg/companies/206585331/','София'),
('ДАРИНА 2014 ЕООД','204777646','https://finansi.bg/darina-2014','София'),
('ДИ АР АР КОНСТРЪКШЪНС ЕООД','205927216','https://papagal.bg/eik/205927216/1b20','Сандански'),
('Дикрил консулт','121406838','https://papagal.bg/eik/121406838/53d4','София'),
('ЕКО ГЛОБЪЛ ООД','119628493','https://papagal.bg/eik/119628493/567c','Нова Загора'),
('Екс Зона Спорт ЕООД','206611025','https://finansi.bg/eks-zona-sport','Банкя'),
('Елитекс','120502989','https://papagal.bg/eik/120502989/b34a','Смолян'),
('Елитекс Еоод','120502989','https://papagal.bg/eik/120502989/b34a','Смолян'),
('ЕТ Унифлекс - Явор Банакиев - гр София','831704067','https://gestapo.bg/Search?name_org=831704067&page=1','София'),
('Еър Лукс Системи ЕООД','205059773','https://papagal.bg/eik/205059773/363a','София'),
('КАА ТИМЕКС ЛР ООД','121347208','https://papagal.bg/eik/121347208/10ff','София'),
('КАПЕКО ЕООД','206536957','https://finansi.bg/kapeko','Нови хан'),
('КБН фамилия ООД','208393753','https://papagal.bg/eik/208393753/6c60','София'),
('Креационе Леньо ООД','201384723','https://papagal.bg/eik/201384723/f9ff','Костандово'),
('М-СЕРТ ЕООД','131194935','https://papagal.bg/eik/131194935/28dd','София'),
('МАРИО 75 ЕООД','204296207','https://papagal.bg/eik/204296207/b4e3','Пловдив'),
('Марс Армор','130864852','https://papagal.bg/eik/130864852/62f7','Костинброд'),
('МОНТЕРОЗА ООД','131512220','https://papagal.bg/eik/131512220/3027','София'),
('ПАК ГРУП','203641020','https://papagal.bg/eik/203641020/a29d','Стамболийски'),
('ПЕНОН','115031967','https://papagal.bg/eik/115031967/f2bb','Пловдив'),
('ПЕТРОНИКС ГРУП ЕООД','200381913','https://papagal.bg/eik/200381913/d487','Костинброд'),
('ПЛ ПРОДЖЕКТ ООД','204012087','https://papagal.bg/eik/204012087/8a4a','Димитровград'),
('ПМГ БИЛД ЕООД','205447199','https://papagal.bg/eik/205447199/1bd1','Пловдив'),
('ПРОФЕСИОНАЛ - 777 ООД','203294363','https://papagal.bg/eik/203294363/1838','Стамболийски'),
('Профи Принт България ЕООД','203458122','https://papagal.bg/eik/203458122/f0a0','Пазарджик'),
('Сдружение „Бъдещето сега“','205478068','https://gestapo.bg/Search?name_org=205478068&page=1','София'),
('Смарти Кидс ООД','204897243','https://papagal.bg/eik/204897243/eab7','София'),
('СОФИЯ МОНАКО ВЕРК ЕООД','203914686','https://papagal.bg/eik/203914686/7a7b','София'),
('СТАНТЕК ЕООД','121604510','https://stantek.com/?p=contacts','София'),
('СТАС ФЕШЪН ЕООД','203008164','https://finansi.bg/stas-feshan','Пловдив'),
('Стив 2001','206536738','https://papagal.bg/eik/206536738/cc63','Сливница'),
('СТИВ 2001','206536738','https://papagal.bg/eik/206536738/cc63','Сливница'),
('ТИКЕ ММ ЕООД','115299431','https://papagal.bg/eik/115299431/8bfd','Пловдив'),
('Тимекс БГ','130570683','https://papagal.bg/eik/130570683/2dc5','София'),
('ТИФЛЕКС 1 ЕООД','115802046','https://papagal.bg/eik/115802046/e0cf','Белозем'),
('ТРАЙКО СТРОЙ БГ ЕООД','206824945','https://papagal.bg/eik/206824945/7ee0','Самоков'),
('ТРИЕСТ 5 ГРУП ООД','203638394','https://sigma.midt.bg/companies/203638394','Бургас'),
('Триест 5 ООД','203638394','https://papagal.bg/eik/203638394/c04b','Бургас'),
('Филм Фиксърс Балканс ЕООД','203547247','https://papagal.bg/eik/203547247/3766','София'),
('Хидройоникс','160009243','https://registri.bg/bg/companies/160009243/','Перущица'),
('ЯНЕВ ИНЖЕНЕРИНГ ЕООД','200558822','https://papagal.bg/eik/200558822/a325','Пловдив')

)
UPDATE public.ctm_company_research r SET
 proposed_eik=m.eik, public_name=c.name,public_city=m.city,source_url=m.link,
 research_state='suggested',researched_at=now(),
 comment='Публично намерен кандидат за ЕИК, не е юридически потвърден за този архивен източник.'
FROM public.ctm_company_candidates c JOIN matches m ON upper(btrim(c.name))=upper(btrim(m.source_name))
WHERE r.candidate_id=c.id AND r.tenant_id=c.tenant_id;
UPDATE public.ctm_company_research r SET research_state='ambiguous',
 proposed_eik=NULL,source_url='',public_city='',researched_at=now(),
 comment='Съществуват няколко фирми с това или сходно наименование; изискай ЕИК от договор или първичен документ.'
FROM public.ctm_company_candidates c WHERE c.id=r.candidate_id
 AND upper(btrim(c.name)) IN ('ГЕО-ТРАНС ООД','ПРОЛЕТ ЕООД','СИРИУС ООД','РЕМИ ЕООД','ВХОД А','ЕЛИТЕКС');

-- Additional researched public sources (names still require registry confirmation).
WITH newer(source_name,eik,link,city) AS (VALUES
('Джи и Ей ЕООД','121481374','https://ga-clima.com/terms','София'),
('ДЕКС БИЛД ЕООД','208737955','https://papagal.bg/eik/208737955/4448','София'),
('ИНСА ЕООД','825377953','https://www.tech.bg/company/insaeood','Раковски'),
('Станекс оод','121446829','https://papagal.bg/eik/121446829/2dd6','София'),
('ФОТЕКС ООД','112041415','https://finansi.bg/foteks','Батак'),
('Техно Проект Пласт  ООД','112043398','https://umispublic.government.bg/iBeneficientProjects.aspx?benef=21022','Пазарджик'),
('МЕХАНИК ИНЖЕНЕРИНГ  ЕООД','204816558','https://eumis2020.government.bg/bg/7b436037/Offers/Details/d96af89d-c4f3-4f45-894d-ca29ade6796f','София'),
('ЕТ МЕБЕЛИ БАКАЛОВ - ГЕОРГИ БАКАЛОВ','115873214','https://landlord.bg/map/%D0%9C%D0%95%D0%91%D0%95%D0%9B%D0%98%20%D0%91%D0%90%D0%9A%D0%90%D0%9B%D0%9E%D0%92%20%D0%93%D0%95%D0%9E%D0%A0%D0%93%D0%98%20%D0%91%D0%90%D0%9A%D0%90%D0%9B%D0%9E%D0%92%21%D0%AE_%D0%A1%D0%BE%D0%B1%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%B8%D0%BA','Пловдив')
)
UPDATE public.ctm_company_research r SET
 proposed_eik=m.eik,public_name=c.name,public_city=m.city,source_url=m.link,
 research_state='suggested',researched_at=now(),
 comment='Допълнителен публичен кандидат за ЕИК. Изисква проверка спрямо договор и Търговски регистър.'
FROM public.ctm_company_candidates c JOIN newer m
 ON upper(btrim(c.name))=upper(btrim(m.source_name))
WHERE r.candidate_id=c.id AND r.tenant_id=c.tenant_id AND r.research_state='unresolved';
