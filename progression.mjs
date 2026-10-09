import { exerciseKey, estimatedMax, exerciseHistory, plateauDetected } from './metrics.mjs?v=5';
const STORE = 'temp-progression-v1';
const LEVELS = ['Начальный', 'Базовый', 'Средний', 'Продвинутый'];
export const LIFTS = {
  bench: { name: 'Жим штанги лёжа', aliases: ['Жим лёжа','Жим штанги лёжа'], male: [.5,1,1.25,1.5], female: [.3,.5,.75,1.1], source: 'https://strengthlevel.com/strength-standards/bench-press/kg' },
  squat: { name: 'Приседания со штангой', aliases: ['Приседания','Приседания со штангой','Присед со штангой'], male: [.75,1.25,1.75,2.25], female: [.5,.75,1.25,1.75], source: 'https://strengthlevel.com/strength-standards/squat/kg' },
  deadlift: { name: 'Становая тяга', aliases: ['Становая тяга','Классическая становая тяга'], male: [1,1.5,2,2.5], female: [.75,1,1.5,2], source: 'https://strengthlevel.com/strength-standards/deadlift/kg' }
};
const fmt = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);
const number = v => Number(String(v).replace(',','.'));
const node = (tag, cls, text) => { const n = document.createElement(tag); if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
const dateLabel = date => new Date(date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
let ctx, state, selected = '', activeTab = 'history';
export function performedSessions(sessions,today) { return sessions.filter(s=>s.status!=='active'&&s.status!=='planned'&&s.date<=today&&s.activity!=='Бег'); }
export function strengthEstimate(set) { return Number.isInteger(Number(set.reps)) && Number(set.reps)>=1 && Number(set.reps)<=10 ? estimatedMax(set) : null; }
export function strengthThresholds(lift,sex,weight) { return LIFTS[lift]?.[sex] && weight>0 ? LIFTS[lift][sex].map(r=>Math.round(weight*r*10)/10) : null; }
export function nextStep(sets, rule={min:8,max:12,sets:3,increment:2.5}) {
  const actual=sets.filter(s=>s.weight!=null&&Number(s.weight)>0&&s.reps!=null&&Number(s.reps)>0);
  if(!actual.length)return {kind:'empty',text:'Запиши рабочий вес и повторы выполненных подходов — здесь появится следующий шаг.'};
  const last=actual.at(-1),weight=Number(last.weight),working=actual.filter(s=>Number(s.weight)===weight);
  if(actual.some(s=>['тяжело','до отказа'].includes(s.note)))return{kind:'hold',weight,text:`Повтори ${fmt(weight)} кг с контролем техники. Повышение нагрузки можно отложить.`};
  if(working.length>=rule.sets&&working.every(s=>Number(s.reps)>=rule.max)&&working.every(s=>['легко','нормально'].includes(s.note))){
    const increment=rule.increment;
    if(increment>weight*.1)return{kind:'hold',weight,text:`Шаг ${fmt(increment)} кг слишком велик относительно рабочего веса. Выбери меньший шаг или пока добавляй повторы с ${fmt(weight)} кг.`};
    return{kind:'increase',weight:weight+increment,text:`Можно попробовать ${fmt(weight+increment)} кг и вернуться к ${rule.min} повторам, если техника и самочувствие позволяют.`};
  }
  if(working.length>=rule.sets&&working.every(s=>Number(s.reps)>=rule.max))return{kind:'check',weight,text:`Верхняя граница достигнута. Отметь ощущения: если подходы уверенные, можно небольшое повышение веса; иначе повтори результат.`};
  return{kind:'reps',weight,text:`Оставь ${fmt(weight)} кг. Старайся постепенно довести ${rule.sets} рабочих подхода до ${rule.max} повторов; можно начать с одного дополнительного повтора.`};
}
function persist(){localStorage.setItem(STORE,JSON.stringify(state));}
function completed(){return performedSessions(ctx.data.sessions,ctx.today());}
function names(){return [...new Set(completed().flatMap(s=>s.exercises.filter(e=>e.sets.some(set=>set.weight!=null&&Number(set.reps)>0)).map(e=>e.name)))].sort((a,b)=>a.localeCompare(b,'ru-RU'));}
function histories(name){return exerciseHistory(completed(),name).map(entry=>({...entry,bestEstimate:Math.max(0,...entry.sets.map(set=>strengthEstimate(set)||0)),sets:entry.sets.filter(set=>set.weight!=null&&Number(set.reps)>0)})).filter(entry=>entry.sets.length);}
function button(text,cls,action){const b=node('button',cls,text);b.type='button';b.addEventListener('click',action);return b;}
function miniStat(label,value){const n=node('div','progression-stat');n.append(node('span','',label),node('strong','',value));return n;}
function chart(entries,key){
  const wrap=node('div','progression-chart');
  if(!entries.length){wrap.append(node('p','form-help','В этом периоде пока нет записей.'));return wrap;}
  const values=entries.map(e=>key==='reps'?Math.max(...e.sets.map(s=>Number(s.reps))):Number(e[key]));
  if(key==='bestEstimate'&&!values.some(v=>v>0)){wrap.append(node('p','form-help','Для оценки 1ПМ нужны подходы с весом и 1–10 повторами.'));return wrap;}
  const usable=entries.map((e,i)=>({e,v:values[i]})).filter(row=>key!=='bestEstimate'||row.v>0);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 360 175');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Динамика: ${usable.map(r=>`${r.e.date}: ${fmt(r.v)}`).join('; ')}`);
  const min=Math.min(...usable.map(r=>r.v)),max=Math.max(...usable.map(r=>r.v)),low=Math.max(0,min-(max-min||min||1)*.15),high=max+(max-min||max||1)*.15;
  const first=Date.parse(usable[0].e.date),last=Date.parse(usable.at(-1).e.date);
  const points=usable.map((row,i)=>({x:28+(last===first?(usable.length===1?.5:i/(usable.length-1)):(Date.parse(row.e.date)-first)/(last-first))*312,y:140-(row.v-low)/(high-low)*115,...row}));
  const make=(tag,attrs)=>{const e=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;};
  for(let i=0;i<3;i++)svg.append(make('line',{x1:25,x2:340,y1:25+i*57.5,y2:25+i*57.5,class:'chart-grid'}));
  svg.append(make('polyline',{points:points.map(p=>`${p.x},${p.y}`).join(' '),class:'chart-line'}));
  points.forEach(p=>{const dot=make('circle',{cx:p.x,cy:p.y,r:4,class:'chart-dot'});const title=make('title',{});title.textContent=`${dateLabel(p.e.date)} · ${fmt(p.v)}`;dot.append(title);svg.append(dot);});
  const start=make('text',{x:25,y:165,class:'chart-label'});start.textContent=dateLabel(usable[0].e.date);svg.append(start);
  const end=make('text',{x:340,y:165,'text-anchor':'end',class:'chart-label'});end.textContent=dateLabel(usable.at(-1).e.date);svg.append(end);wrap.append(svg);
  wrap.append(node('p','form-help',`${fmt(values.filter(v=>key!=='bestEstimate'||v>0).at(0))} → ${fmt(values.filter(v=>key!=='bestEstimate'||v>0).at(-1))}${key==='reps'?' повторов':' кг'}`));return wrap;
}
function renderHistory(){
  const target=document.querySelector('#progression-history');target.replaceChildren();
  const options=names(),select=document.querySelector('#progression-exercise');select.replaceChildren();
  if(!options.includes(selected))selected=options[0]||'';
  for(const name of options){const o=node('option','',name);o.value=name;select.append(o);}select.value=selected;
  if(!selected){target.append(node('p','empty-state','Запиши выполненную тренировку с весами и повторами — здесь появятся графики и личные результаты.'));renderNext();return;}
  const all=histories(selected),days=Number(document.querySelector('#progression-period').value),cutoff=Date.parse(ctx.today())-days*86400000;
  const history=days?all.filter(e=>Date.parse(e.date)>=cutoff):all;
  const latest=all.at(-1),best=Math.max(...all.map(e=>e.bestEstimate));
  const stats=node('div','progression-stats');stats.append(miniStat('Занятий',all.length),miniStat('Макс. рабочий вес',`${fmt(Math.max(...all.map(e=>e.topWeight)))} кг`),miniStat('Оценка лучшего 1ПМ',best?`${fmt(best)} кг`:'—'));target.append(stats);
  const metric=document.querySelector('#progression-metric').value;target.append(chart(history,metric));
  const comparable=metric==='bestEstimate'?history.filter(e=>e.bestEstimate>0):history;
  if(comparable.length>1){const key=metric==='reps'?null:metric;const value=e=>key?e[key]:Math.max(...e.sets.map(s=>Number(s.reps)));const first=value(comparable[0]),last=value(comparable.at(-1));if(first>0)target.append(node('p','progression-change',`За выбранный период: ${last-first>=0?'+':''}${fmt((last/first-1)*100)}% по выбранному показателю.`));}
  const table=node('div','progression-history-table');
  table.append(node('h4','','Последние занятия'));
  for(const entry of history.slice(-10).reverse()){const row=node('div','progression-history-row');row.append(node('span','',new Date(entry.date+'T12:00:00').toLocaleDateString('ru-RU')),node('strong','',`${fmt(entry.topWeight)} кг · ${entry.sets.length} подх.`),node('small','',`Объём ${fmt(entry.volume)} кг · 1ПМ ${entry.bestEstimate?fmt(entry.bestEstimate)+' кг':'—'}`));table.append(row);}target.append(table);
  const goal=state.goals[exerciseKey(selected)];const goalBox=node('section','progression-goal');goalBox.append(node('h4','','Моя цель'));
  const goalForm=node('form','progression-goal-form');
  const w=node('input');w.type='number';w.min='0.5';w.max='1000';w.step='any';w.required=true;w.name='weight';w.value=goal?.weight||'';w.setAttribute('aria-label','Целевой вес, кг');w.placeholder='Вес, кг';
  const r=node('input');r.type='number';r.min='1';r.max='100';r.required=true;r.name='reps';r.value=goal?.reps||'';r.setAttribute('aria-label','Целевые повторы');r.placeholder='Повторы';const save=node('button','small-button','Сохранить цель');save.type='submit';goalForm.append(w,r,save);
  goalForm.addEventListener('submit',event=>{event.preventDefault();state.goals[exerciseKey(selected)]={weight:Number(w.value),reps:Number(r.value)};persist();renderHistory();});goalBox.append(goalForm);
  if(goal){const sets=all.flatMap(e=>e.sets);const reached=sets.some(s=>Number(s.weight)>=goal.weight&&Number(s.reps)>=goal.reps);const percent=Math.min(100,Math.max(0,...sets.map(s=>Math.min(Number(s.weight)/goal.weight,Number(s.reps)/goal.reps)*100)));
    goalBox.append(node('p','',`${fmt(goal.weight)} кг × ${goal.reps} · ${reached?'Цель достигнута':'Движение к цели'}`));const progress=node('progress');progress.max=100;progress.value=percent;progress.setAttribute('aria-label','Прогресс к личной цели');goalBox.append(progress,button('Удалить цель','text-button',()=>{delete state.goals[exerciseKey(selected)];persist();renderHistory();}));}
  target.append(goalBox);renderNext();
}
function renderNext(){
  const target=document.querySelector('#progression-next');target.replaceChildren();
  if(!selected){target.append(node('p','form-help','Сначала запиши подходы в тренировке. Следующий шаг появится по твоим результатам.'));return;}
  const history=histories(selected),last=history.at(-1),rule=state.rules[exerciseKey(selected)]||{min:8,max:12,sets:3,increment:2.5};
  target.append(node('h3','',selected));if(!last)return;
  target.append(node('p','form-help',`Последнее занятие: ${dateLabel(last.date)}. Правило ниже можно настроить под свою программу.`));
  const recommendation=nextStep(last.sets,rule);target.append(node('p','progression-recommendation',recommendation.text));
  const form=node('form','progression-rule-form');
  for(const[key,caption,min,max,step]of[['min','От повторов',1,30,1],['max','До повторов',1,30,1],['sets','Рабочих подходов',1,20,1],['increment','Шаг веса, кг',.5,10,.5]]){const l=node('label','',caption),i=node('input');i.type='number';i.name=key;i.min=min;i.max=max;i.step=step;i.required=true;i.value=rule[key];l.append(i);form.append(l);}
  const save=node('button','small-button','Сохранить правило');save.type='submit';form.append(save);
  form.addEventListener('submit',event=>{event.preventDefault();const r=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));form.elements.max.setCustomValidity(r.max<r.min?'Верхняя граница должна быть не меньше нижней.':'');if(!form.reportValidity())return;state.rules[exerciseKey(selected)]=r;persist();renderNext();});form.elements.max.addEventListener('input',()=>form.elements.max.setCustomValidity(''));form.elements.min.addEventListener('input',()=>form.elements.max.setCustomValidity(''));target.append(form);
  target.append(node('p','form-help','Пример двойной прогрессии: сначала добавляй повторы в выбранном диапазоне, затем небольшой вес. Разминочные и рабочие подходы пока нужно различать при выборе правила. Подсказка не меняет записанные результаты или план автоматически.'));
  if(plateauDetected(history))target.append(node('p','progression-plateau','Последние пять оценок силы близки. Проверь восстановление, технику и регулярность; можно обсудить изменение программы с тренером.'));
}
function renderStandards(){
  const target=document.querySelector('#progression-standards-results');target.replaceChildren();const profile=state.profile;
  if(!profile.weight||!['male','female'].includes(profile.sex)){target.append(node('p','form-help','Для сравнения укажи массу тела и пол в профиле. Личный прогресс доступен без этих данных.'));return;}
  const lift=document.querySelector('#progression-lift').value,type=LIFTS[lift];
  const results=completed().flatMap(s=>s.exercises.filter(e=>type.aliases.some(alias=>exerciseKey(alias)===exerciseKey(e.name))).flatMap(e=>e.sets));
  const historical=Math.max(0,...results.map(s=>strengthEstimate(s)||0));const manualW=document.querySelector('#progression-lift-weight').value,manualR=document.querySelector('#progression-lift-reps').value;
  const manual=manualW!==''&&manualR!==''?strengthEstimate({weight:number(manualW),reps:Number(manualR)}):null;
  const manualMode=manualW!==''||manualR!=='';
  const validManual=manual&&document.querySelector('#progression-lift-weight').checkValidity()&&document.querySelector('#progression-lift-reps').checkValidity();
  const score=manualMode?(validManual?manual:0):historical;target.append(node('h3','',type.name));
  const summary=node('div','progression-stats');summary.append(miniStat(manualMode?'Оценка по введённому подходу':'Лучший 1ПМ из истории',score?`${fmt(score)} кг`:'—'),miniStat('К массе тела',score?`${fmt(score/profile.weight)} ×`:'—'));target.append(summary);
  if(manualMode&&!validManual)target.append(node('p','form-help','Укажи положительный вес и целое число повторов от 1 до 10.'));
  const thresholds=strengthThresholds(lift,profile.sex,profile.weight),table=node('div','progression-benchmarks');
  thresholds.forEach((weight,i)=>{const row=node('div','progression-benchmark'+(score>=weight?' reached':''));row.append(node('span','',LEVELS[i]),node('strong','',`${fmt(weight)} кг`),node('small','',`${fmt(type[profile.sex][i])} × массы тела`));table.append(row);});target.append(table);
  const source=node('a','progression-source','Источник: Strength Level · коэффициенты к массе тела');source.href=type.source;source.target='_blank';source.rel='noopener noreferrer';target.append(source);
  target.append(node('p','form-help','Ориентиры получены из коэффициентов сообщества Strength Level, а не из персональной программы. Они относятся к максимуму на одно повторение со штангой, включая вес грифа. Тренажёры и гантели сравнивай отдельно. Возраст и рост в этих коэффициентах не учитываются. Расчётный 1ПМ — приближение; проверять максимальный вес ради таблицы не требуется.'));
}
export function renderProgression(){if(!ctx)return;renderHistory();renderStandards();}
export function initProgression(context){
  ctx=context;try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');state={profile:saved.profile||{},goals:saved.goals||{},rules:saved.rules||{}};}catch{state={profile:{},goals:{},rules:{}};}
  const form=document.querySelector('#progression-profile');for(const key of ['sex','weight','height','experience'])if(state.profile[key]!=null)form.elements[key].value=state.profile[key];
  document.querySelector('#progression-profile-details').open=!state.profile.weight;
  form.addEventListener('submit',event=>{event.preventDefault();state.profile={sex:form.elements.sex.value,weight:form.elements.weight.value?Number(form.elements.weight.value):null,height:form.elements.height.value?Number(form.elements.height.value):null,experience:form.elements.experience.value};persist();document.querySelector('#progression-profile-status').textContent='Профиль сохранён';renderProgression();});
  document.querySelector('#progression-exercise').addEventListener('change',event=>{selected=event.target.value;renderHistory();});
  for(const id of ['progression-period','progression-metric'])document.querySelector('#'+id).addEventListener('change',renderHistory);
  for(const id of ['progression-lift','progression-lift-weight','progression-lift-reps'])document.querySelector('#'+id).addEventListener('input',renderStandards);
  document.querySelectorAll('[data-progression-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.progressionTab;document.querySelector('.progression-exercise-picker').hidden=activeTab==='standards';document.querySelectorAll('[data-progression-tab]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));document.querySelectorAll('[data-progression-panel]').forEach(panel=>panel.hidden=panel.dataset.progressionPanel!==activeTab);}));
  renderProgression();
}
