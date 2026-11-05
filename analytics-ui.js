/* Xiaoen Ledger Financial Analytics UI v0.7
 * All figures from LedgerAnalyticsCore; DOM text via textContent, no sample data.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const core=window.LedgerAnalyticsCore;
if(!core||!$('analytics')&&!$('analysis'))return;
const root=$('analRoot'),details=$('analDetail');
if(!root||!details)return;
const TABS={overview:'財務總覽',income:'收入分析',expense:'支出分析',cash:'現金流',behavior:'消費行為',projects:'專項成本',health:'財務健康'};
const fmt=n=>'NT$ '+Math.round(Number(n)||0).toLocaleString('zh-TW');
const pct=n=>n===null||!Number.isFinite(n)?'不適用':(n*100).toLocaleString('zh-TW',{maximumFractionDigits:1})+'%';
const number=n=>Math.round(Number(n)||0).toLocaleString('zh-TW');
let mode='month',module='overview',last=null,localFrom='',localTo='',cashScale='month',activeDetail=null;
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e}
function append(to,...nodes){to.append(...nodes.filter(Boolean));return to}
function clear(to){to.replaceChildren();return to}
function empty(title,message){const c=el('div','anal-empty');append(c,el('strong','',title),el('p','',message));return c}
function block(title,sub=''){const b=el('section','anal-box');const h=el('div','anal-boxhead');append(h,el('h3','',title));if(sub)append(h,el('small','',sub));b.append(h);return b}
function metric(label,value,sub='',tone=''){const c=el('div','anal-metric'+(tone?' '+tone:''));append(c,el('small','',label),el('b','',value));if(sub)c.append(el('span','anal-meta',sub));return c}
function metrics(items){const g=el('div','anal-metrics');for(const x of items)g.append(metric(...x));return g}
function tip(message){return el('p','anal-note',message)}
function button(title,fn,cls='alt sm'){const b=el('button',cls,title);b.type='button';b.onclick=fn;return b}
function getData(){const x=window.ledgerAnalyticsGetData?.();return x&&x.ready?x.ledger:null}
function displayChange(value){if(value===null)return '前期為零，無法計算變化';return (value>0?'↑ ':value<0?'↓ ':'＝ ')+pct(Math.abs(value))}
function setModule(k){if(!TABS[k])return;module=k;details.classList.add('hidden');activeDetail=null;draw()}
function getPeriod(){return {mode,from:localFrom,to:localTo,today:core.todayTaipei()}}
function hbars(rows,total,clicker,emptyMessage='此期間尚無可分析資料'){
 const pane=el('div','anal-ranks');if(!rows.length)return empty('尚無可用統計',emptyMessage);
 const max=Math.max(1,...rows.map(x=>Math.max(0,x.value)));
 rows.forEach((r,index)=>{
   const row=el('div','anal-rank');
   const title=el('div','anal-ranktop');append(title,el('span','',r.name),el('strong','',fmt(r.value)));
   const line=el('div','anal-bartrack');const fill=el('div','anal-barfill');fill.style.width=Math.max(0,r.value)/max*100+'%';line.append(fill);
   append(row,title,line);
   const percent=total>0?(r.value/total)*100:null;
   if(percent!==null)append(row,el('small','',percent.toFixed(1)+'% · '+(clicker?'點擊查看交易':'分類占比')));
   if(clicker){row.classList.add('anal-clickable');row.tabIndex=0;row.role='button';row.onclick=()=>clicker(r);row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();clicker(r)}}}
   pane.append(row);
 });
 return pane;
}
function svg(tag,attrs){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));return n}
function lineChart(points,color='#b2a2e4',bar=false){
 if(!points.length||points.every(p=>p.value===0))return empty('資料不足','目前期間沒有可繪製的變動資料。');
 const box=el('div','anal-chart');
 const view=svg('svg',{viewBox:'0 0 680 212',role:'img','aria-label':'依期間呈現的實際金額趨勢折線或長條圖',preserveAspectRatio:'xMidYMid meet'});
 box.append(view);
 const values=points.map(p=>Number(p.value)||0),lo=Math.min(0,...values),hi=Math.max(0,...values);
 const span=Math.max(1,hi-lo),left=56,right=664,top=14,bottom=175,w=right-left,height=bottom-top;
 const y=n=>bottom-(n-lo)/span*height;
 for(let i=0;i<=4;i++){
   const val=lo+span*i/4,yy=y(val);
   view.append(svg('line',{x1:left,x2:right,y1:yy,y2:yy,stroke:'rgba(210,211,239,.12)','stroke-width':1}));
   const t=svg('text',{x:left-8,y:yy+4,'text-anchor':'end',fill:'#8f98ae','font-size':10});t.textContent=val.toLocaleString('zh-TW',{notation:Math.abs(val)>99999?'compact':'standard',maximumFractionDigits:0});view.append(t);
 }
 const x=i=>points.length===1?(left+right)/2:left+i*w/(points.length-1);
 if(bar){
   const width=Math.min(35,w/Math.max(points.length,1)*.65);
   points.forEach((p,i)=>{const yp=y(p.value),base=y(0);view.append(svg('rect',{x:x(i)-width/2,y:Math.min(base,yp),width,height:Math.max(2,Math.abs(base-yp)),rx:3,fill:p.value>=0?color:'#e99ba5'}))});
 }else{
   const d=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(p.value).toFixed(1)).join(' ');
   view.append(svg('path',{d,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
   if(points.length<25)points.forEach((p,i)=>view.append(svg('circle',{cx:x(i),cy:y(p.value),r:2.5,fill:color})));
 }
 const position=[0,Math.floor((points.length-1)/2),points.length-1];const seen=new Set();
 for(const i of position){if(seen.has(i))continue;seen.add(i);const t=svg('text',{x:x(i),y:200,'text-anchor':i===0?'start':i===points.length-1?'end':'middle',fill:'#b0b6c7','font-size':11});t.textContent=points[i].date.slice(5);view.append(t);}
 return box;
}
function donut(rows,clicker){
 const positive=rows.filter(x=>x.value>0),total=positive.reduce((a,x)=>a+x.value,0);
 if(!positive.length||total<=0)return empty('暫無占比','分類合計需為正數才可顯示占比。');
 const colors=['#a59bd0','#77c4a9','#d2ad81','#df9ca7','#7d9fc4','#ad8caf','#99b5ab'];
 const wrap=el('div','anal-donut-wrap');const chart=svg('svg',{viewBox:'0 0 180 180',role:'img','aria-label':'依實際淨支出顯示的分類占比'});
 chart.append(svg('circle',{cx:90,cy:90,r:59,fill:'none',stroke:'#292b3a','stroke-width':20}));
 let done=0;
 positive.forEach((r,i)=>{
   const len=r.value/total*2*Math.PI*59;
   const circle=svg('circle',{cx:90,cy:90,r:59,fill:'none',stroke:colors[i%colors.length],'stroke-width':20,transform:'rotate(-90 90 90)','stroke-dasharray':len+' '+(2*Math.PI*59-len),'stroke-dashoffset':-done});
   chart.append(circle);done+=len;
 });
 const mid=svg('text',{x:90,y:87,'text-anchor':'middle',fill:'#a6b2c9','font-size':12});mid.textContent='淨支出';
 const val=svg('text',{x:90,y:110,'text-anchor':'middle',fill:'#f4f3fb','font-size':16,'font-weight':650});val.textContent=number(total);
 chart.append(mid,val);wrap.append(chart);
 const legend=el('div','anal-donut-legend');
 positive.forEach((r,i)=>{const b=el('button','anal-legend-row');b.type='button';const dot=el('i');dot.style.background=colors[i%colors.length];append(b,dot,el('span','',r.name),el('strong','',(r.value/total*100).toFixed(1)+'%'));if(clicker)b.onclick=()=>clicker(r);else b.disabled=true;legend.append(b)});
 wrap.append(legend);return wrap;
}
function recordDetail(title,events){
 activeDetail={title,events};clear(details);details.classList.remove('hidden');
 const heading=el('div','anal-detailhead');append(heading,el('h3','',title+' · '+events.length+' 筆'),button('收起',()=>{details.classList.add('hidden');activeDetail=null}));
 details.append(heading);
 if(!events.length)details.append(empty('沒有交易','這個篩選條件下沒有符合的原始交易。'));
 events.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(e=>{
   const row=el('div','anal-detailrow');
   const info=el('div');append(info,el('strong','',e.row.note||e.sub||'交易'),el('small','',e.date+' · '+e.group+' / '+e.sub));
   const amt=el('strong','',fmt(e.income||e.expense||e.amount));if(e.expense<0)amt.textContent='沖減 '+fmt(Math.abs(e.expense));
   append(row,info,amt,button('查看／修改',()=>window.ledgerAnalyticsEditRow?.(e.row.id)));
   details.append(row);
 });
 if(events.length>80)details.append(tip('僅顯示前 80 筆。完整紀錄仍可在「交易」頁查閱。'));
 details.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function drawOverview(a){
 const s=a.stats,cr=a.change;
 if(a.count===0)root.append(empty('尚無收支紀錄','此期間沒有已發生的收入或支出。轉帳不列入收支。'));
 root.append(metrics([
 ['總收入',fmt(s.income),displayChange(cr.income),'anal-income'],
 ['總支出',fmt(s.expense),displayChange(cr.expense),'anal-expense'],
 ['收支結餘',fmt(s.net),displayChange(cr.net),s.net>=0?'anal-income':'anal-expense'],
 ['儲蓄率',pct(s.savingsRate),'收入為 0 時不適用'],
 ['平均每日淨支出',fmt(s.averageDailyExpense),'按選定期間 '+a.period.days+' 天平均'],
 ['最大單筆支出',s.largest?fmt(s.largest.amount):'資料不足',s.largest?s.largest.date:'無支出紀錄'],
 ['支出／收入比',pct(s.expenseIncomeRatio),'收入為 0 時不適用']
 ]));
 const series=block('收入與支出趨勢','已發生交易；退款於退款日期沖減支出');
 const ch=el('div','anal-dualchart');append(ch,lineChart(a.dailyIncome,'#85d9b1'),lineChart(a.dailyExpenses,'#e89eaa'));
 append(series,ch,tip('左圖：收入（綠）；右圖：淨支出（紅）。時間較長時依月份彙總。'));
 root.append(series);
 const ranks=block('主要支出分類','點擊分類檢視交易');
 ranks.append(hbars(a.categories.slice(0,6),s.expense,r=>recordDetail(r.name,a.stats.events.filter(e=>e.expense&&e.group===r.name))));
 root.append(ranks);
}
function drawIncome(a){
 const events=a.stats.events.filter(e=>e.income>0);
 if(!events.length)root.append(empty('收入資料不足','所選期間沒有被標記為正常收入的交易。退款與本金轉移不算收入。'));
 root.append(metrics([['收入合計',fmt(a.stats.income),'不含退款與本金轉移','anal-income'],
 ['平均月收入',a.incomeMonthlyAverage!==null?fmt(a.incomeMonthlyAverage):'資料不足','至少要有兩個有收入的月份'],
 ['固定薪資收入',fmt(a.fixedIncome),'依既有分類或收入來源欄位'],
 ['業績獎金波動',a.bonusDifference!==null?fmt(a.bonusDifference):'資料不足','至少兩個有獎金紀錄的月份']]));
 const b=block('收入來源結構','既有分類或手動指定的收入來源');append(b,donut(a.incomeSources,r=>recordDetail(r.name,events.filter(e=>core.SRC[e.incomeSource]===r.name))));root.append(b);
 const c=block('收入時間趨勢','依發生日期；跨月收入實際分布');append(c,lineChart(a.dailyIncome,'#85d9b1'));root.append(c);
 const d=block('固定與浮動收入','固定僅包含明確標記為固定薪資的紀錄');
 append(d,metrics([['固定薪資',fmt(a.fixedIncome),'明確分類'],['其他已辨識收入',fmt(a.stats.income-a.fixedIncome-a.uncertainIncome),'不含來源不明'],['其他／未標記',fmt(a.uncertainIncome),'不推測其固定或浮動性質']]));
 root.append(d);
}
function drawExpense(a){
 const es=a.stats.events.filter(e=>e.expense!==0);
 if(!es.length)root.append(empty('支出資料不足','所選期間沒有支出或已關聯退款紀錄。'));
 root.append(metrics([['淨支出',fmt(a.stats.expense),'支出扣除關聯退款','anal-expense'],
 ['平均每日淨支出',fmt(a.stats.averageDailyExpense),'含無交易的日期'],
 ['最大單筆支出',a.stats.largest?fmt(a.stats.largest.amount):'資料不足','退款不作為支出單筆'],
 ['前十大支出',fmt(a.topExpenses.reduce((s,x)=>s+x.amount,0)),'以實際支出排序，不含退款']]));
 const b=block('主分類占比','點擊圓環圖例可查看原交易');
 b.append(donut(a.categories,r=>recordDetail(r.name,es.filter(e=>e.group===r.name))));root.append(b);
 const c=block('子分類排行','同分類內退款會沖減淨支出');
 c.append(hbars(a.subcategories.slice(0,10),a.stats.expense,r=>recordDetail(r.name,es.filter(e=>e.group+' / '+e.sub===r.name))));root.append(c);
 const d=block('每日支出趨勢');d.append(lineChart(a.dailyExpenses,'#e89eaa',true));root.append(d);
 const e=block('固定／變動支出','僅統計已標記的交易');
 e.append(metrics([['固定',fmt(a.health.fixedExpense),'明確標記'],['變動',fmt(a.health.variableExpense),'明確標記'],['尚未分類',fmt(a.health.unclassifiedExpense),'未標記的歷史資料不猜測']]));root.append(e);
 const f=block('十大單筆支出','點擊以檢視原始交易');
 const list=el('div','anal-ranks');
 a.topExpenses.forEach((x,i)=>list.append(button((i+1)+'. '+(x.row.note||x.sub)+' · '+fmt(x.amount),()=>recordDetail('單筆支出',[x]),'anal-itembutton')));
 f.append(list.length?list:(a.topExpenses.length?list:empty('尚無紀錄','沒有支出交易')));root.append(f);
}
function drawCash(a){
 root.append(metrics([['帳戶實際流入',fmt(a.cash.inflow),'以資產帳戶入扣款計','anal-income'],
 ['帳戶實際流出',fmt(a.cash.outflow),'含信用卡繳款','anal-expense'],
 ['帳戶淨資金變動',fmt(a.cash.net),'內部資產轉帳總額互相抵銷'],
 ['無法歸入帳戶',a.cash.unassigned+' 筆','未指定或非可用資產帳戶']]));
 const b=block('資金流動趨勢','使用實際入扣款日期；未填者暫用交易日期');
 const opts=el('div','anal-mini-tabs');
 for(const [key,title] of [['day','每日'],['week','每週'],['month','每月']]){
 const btn=button(title,()=>{cashScale=key;draw()},'alt sm'+(cashScale===key?' selected':''));opts.append(btn)}
 b.append(opts);b.append(lineChart(a.cash[cashScale], '#b2a2e4',true));root.append(b);
 const c=block('帳戶資金變動','已歸屬帳戶的入扣款合計');
 c.append(hbars(a.cash.byAccount,a.cash.net,r=>recordDetail(r.name,a.stats.events.filter(e=>e.row.accountId&&e.row.accountId===((getData()?.accounts||[]).find(x=>x.name===r.name)?.id))),'此期間沒有可歸屬的資金流。'));root.append(c);
 const payment=a.cash.items.filter(e=>e.kind==='cardPayment').reduce((n,e)=>n-e.amount,0);
 const d=block('資金流分類');
 d.append(metrics([['信用卡繳款',fmt(payment),'資金流出，不重複列生活支出'],['內部轉帳',a.cash.items.filter(e=>e.kind==='transfer').length+' 個帳戶記錄','資產間轉移，不增加收支']]));
 d.append(tip('股票買入／本金移動需另建投資帳戶及交易種類，現有資料不足時不推測。'));
 d.append(tip('已知未來款項尚無到期資料模型，因此不計入已發生交易，暫不提供月底預測。'));
 if(a.cash.approximateDates)d.append(tip(a.cash.approximateDates+' 筆入扣款尚未填寫實際日期，使用交易發生日期暫代。'));
 root.append(d);
}
function drawBehavior(a){
 const exp=a.stats.events.filter(e=>e.kind==='expense');
 if(!exp.length)root.append(empty('消費資料不足','所選期間沒有足夠的消費交易。'));
 const topDay=a.expenseByDay[0]||null,topWeek=a.weekday[0]||null;
 root.append(metrics([['平均每日消費',fmt(a.stats.averageDailyExpense),'以淨支出 ÷ 選定天數'],
 ['消費最多日期',topDay?topDay.name:'資料不足',topDay?fmt(topDay.value):'尚無支出'],
 ['消費最多星期',topWeek?topWeek.name:'資料不足',topWeek?fmt(topWeek.value):'尚無支出'],
 ['餐飲紀錄',a.foodCount+' 筆','飲料／咖啡 '+a.drinkCount+' 筆'],
 ['最大單筆消費',a.stats.largest?fmt(a.stats.largest.amount):'資料不足',a.stats.largest?a.stats.largest.date:'尚無支出']]));
 const b=block('按星期消費分布','由真實交易發生日期彙總');b.append(hbars(a.weekday,a.stats.expense));root.append(b);
 const c=block('經常性支出線索','相同非空備註至少跨三個不同月份，僅作線索，不判定為固定付款');
 c.append(a.recurrence.length?hbars(a.recurrence.slice(0,10).map(x=>({name:x.name+' · '+x.months+' 個月',value:x.amount})),a.stats.expense):empty('資料不足','尚無同備註跨三個月份的消費紀錄。'));root.append(c);
 const d=block('與相鄰前期的消費變化','等長天數比較');
 d.append(metric('淨支出變化',displayChange(a.change.expense),a.period.comparison.start+' 至 '+a.period.comparison.end));root.append(d);
}
function drawProjects(a){
 root.append(tip('只彙總有明確專項標籤的交易；不推測舊交易屬於哪台汽車或哪隻寵物。退款沿用原支出的專項標籤，不重複計算。'));
 for(const p of a.projects){
 const b=block(p.name,'跨分類的專項成本');
 if(!p.events.length){b.append(empty('尚無已標記的專項交易','在「記帳」頁替交易選取對應專項標籤，這裡會立即彙總。'));root.append(b);continue}
 b.append(metrics([['本期淨成本',fmt(p.total),'含已關聯退款沖減','anal-expense'],['交易筆數',p.events.length+' 筆','可點分類查看交易']]));
 b.append(hbars(p.subcategories,p.total,r=>recordDetail(p.name+' · '+r.name,p.events.filter(x=>x.sub===r.name))));
 const monthly=block('逐月成本');monthly.append(lineChart(p.monthly.map(x=>({date:x.name,value:x.value})),'#b1a6df',true));b.append(monthly);
 root.append(b);
 }
}
function drawHealth(a){
 const h=a.health,s=a.stats;
 root.append(metrics([
 ['收支結餘率',pct(h.balanceRate),'收入為零時不適用'],
 ['固定支出／收入',pct(h.fixedRatio),h.unclassifiedExpense?'尚有未標記的支出':'需有固定／變動分類'],
 ['預算使用率',pct(h.budgetUsage),h.budget!==null?'期間配額 '+fmt(h.budget):'先設定每月預算'],
 ['預備金可支應月數',h.emergencyMonths!==null?h.emergencyMonths.toFixed(1)+' 個月':'待設定','以手動輸入的預備金 ÷ 每月必要支出'],
 ['帳戶估算可用資金',h.liquidBalance!==null?fmt(h.liquidBalance):'待設定','由期初餘額及有帳戶的交易估算；非銀行即時餘額'],
 ['預估月底可用餘額','待設定','尚無已知未來款項／支付日期模型']
 ]));
 const settings=getData()?.analyticsSettings||{};
 const b=block('財務管理參數','只保存你手動設定的金額，不自動產生假數據');
 const form=el('div','anal-settinggrid');
 const fields=[['analBudget','每月預算上限','monthlyBudget'],['analEssentials','每月必要支出','monthlyEssentials'],['analEmergency','緊急預備金（手動確認）','emergencyFund']];
 for(const [id,label,key] of fields){
   const wrap=el('label');wrap.textContent=label;const input=el('input');input.id=id;input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.placeholder='留空 = 未設定';input.value=settings[key]??'';wrap.append(input);form.append(wrap);
 }
 const save=button('儲存財務參數',()=>{
 const update={};
 for(const [id,label,key] of fields){const v=$(id).value.trim();if(v===''){update[key]=null;continue}const n=Number(v);if(!Number.isSafeInteger(n)||n<0){alert('請確認「'+label+'」為非負整數');return}update[key]=n}
 const ok=window.ledgerAnalyticsSaveSettings?.(update);
 if(ok)window.renderLedgerAnalytics?.();
 },'anal-primary');
 b.append(form,save,tip('預算依選定期間所涵蓋的曆日按月度天數比例分配；必要支出與預備金為手動確認值，不代表銀行查證。'));root.append(b);
 const d=block('財務健康判讀口徑');
 d.append(tip('儲蓄率 =（已發生收入 − 已發生淨支出）÷ 已發生收入。未記錄的轉帳或未設定資產，不代表你沒有現金。'));
 d.append(tip('固定支出佔比只在每筆支出都有明確固定／變動標記時顯示。未設定必要支出、預備金或預算，不產生評分。'));
 root.append(d);
}
function draw(){
 if($('analysis').classList.contains('hidden'))return;
 const ledger=getData();clear(root);details.classList.add('hidden');
 document.querySelectorAll('#analTabs button').forEach(x=>{x.classList.toggle('active',x.dataset.amodule===module);x.setAttribute('aria-selected',String(x.dataset.amodule===module))});
 if(!ledger){root.append(empty('等待帳本讀取完成','請先確認登入及雲端同步狀態。不使用可能過期的本機交易來產生報表。'));return}
 let a;try{a=core.calculate(ledger,getPeriod())}catch(e){root.append(empty('日期區間有誤',e.message));return}
 last=a;$('analRange').textContent=a.period.start+' → '+a.period.end+' · '+a.period.days+' 天 · 前期 '+a.period.comparison.start+' → '+a.period.comparison.end+'（同長天數）';
 const warnings=[];
 if(a.warnings.orphanRefunds)warnings.push(a.warnings.orphanRefunds+' 筆退款缺少有效原交易，未納入收支');
 if(a.warnings.invalidRows)warnings.push(a.warnings.invalidRows+' 筆交易資料不完整，未納入分析');
 if(a.warnings.ambiguousPrincipal)warnings.push(a.warnings.ambiguousPrincipal+' 筆本金類交易未納入一般收支');
 if(warnings.length)root.append(tip('資料檢查：'+warnings.join('；')+'。'));
 if(module==='income')drawIncome(a);
 else if(module==='expense')drawExpense(a);
 else if(module==='cash')drawCash(a);
 else if(module==='behavior')drawBehavior(a);
 else if(module==='projects')drawProjects(a);
 else if(module==='health')drawHealth(a);
 else drawOverview(a);
 root.append(tip('計算口徑：Asia/Taipei，日期起訖皆包含；收支依交易發生日期，資金流依實際入扣款日期（若未提供則以發生日期暫代）。轉帳、信用卡繳款與本金移動不計一般收入及支出。'));
}
function init(){
 const selector=$('analPeriod'),from=$('analFrom'),to=$('analTo'),custom=$('analCustom');
 const now=core.todayTaipei();
 from.value=now.slice(0,7)+'-01';to.value=now;localFrom=from.value;localTo=to.value;
 selector.onchange=()=>{mode=selector.value;custom.classList.toggle('hidden',mode!=='custom');draw()};
 function changeDates(){localFrom=from.value;localTo=to.value;draw()}
 from.addEventListener('change',changeDates);to.addEventListener('change',changeDates);
 $('analTabs').querySelectorAll('[data-amodule]').forEach(b=>{b.onclick=()=>setModule(b.dataset.amodule)});
 window.renderLedgerAnalytics=draw;
 draw();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();