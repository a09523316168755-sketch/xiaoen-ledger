/* Xiaoen Ledger Financial Analytics Core v0.7
   Pure calculations: no network, no storage, no mutations to ledger rows.
   Accounting date is YYYY-MM-DD in Asia/Taipei, boundaries inclusive.
*/
(function(root){
'use strict';
const TZ='Asia/Taipei';
const SRC={salary:'固定薪資',bonus:'業績獎金',overtime:'加班費',parttime:'兼職收入',interest:'利息',dividend:'配息',other:'其他收入'};
const PROJECT={gla200:'Mercedes-Benz GLA 200',ronnie:'羅尼'};
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function utc(s){return new Date(s+'T00:00:00Z')}
function isoDate(d){return d.toISOString().slice(0,10)}
function shift(s,n){const d=utc(s);d.setUTCDate(d.getUTCDate()+n);return isoDate(d)}
function days(a,b){return Math.round((utc(b)-utc(a))/86400000)+1}
function firstOfMonth(s,delta=0){const d=utc(s);return isoDate(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+delta,1)))}
function endOfMonth(s){return shift(firstOfMonth(s,1),-1)}
function todayTaipei(at){const d=at?new Date(at):new Date();return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d).replaceAll('/','-')}
function period(mode='month',options={}){
 const now=iso(options.today)?options.today:todayTaipei();
 const year=now.slice(0,4);let start,end,label,partial=false;
 switch(mode){
 case 'lastMonth':start=firstOfMonth(now,-1);end=shift(firstOfMonth(now),-1);label='上月';break;
 case '3m':start=firstOfMonth(now,-2);end=now;label='近三個月（截至今日）';partial=true;break;
 case '6m':start=firstOfMonth(now,-5);end=now;label='近六個月（截至今日）';partial=true;break;
 case 'year':start=year+'-01-01';end=now;label='本年度（截至今日）';partial=true;break;
 case 'lastYear':start=(Number(year)-1)+'-01-01';end=(Number(year)-1)+'-12-31';label='去年度';break;
 case 'custom':
   start=options.from;end=options.to;label='自訂期間';
   if(!iso(start)||!iso(end)||start>end)throw new Error('自訂日期不正確，請確認起訖日期');break;
 default:start=firstOfMonth(now);end=now;label='本月（截至今日）';partial=true;
 }
 const count=days(start,end);return {mode,start,end,label,days:count,partial,comparison:{start:shift(start,-count),end:shift(start,-1),days:count,label:'緊接前一期，同長天數'}};
}
const money=amount=>Number.isSafeInteger(Number(amount))&&Number(amount)>0?Number(amount):null;
function sourceOf(r){
 if(SRC[r.incomeSource])return r.incomeSource;
 const sub=String(r.sub||r.category||'').trim();
 if(['固定薪資','薪水','月薪'].includes(sub))return 'salary';
 if(['業績獎金','獎金','績效獎金'].includes(sub))return 'bonus';
 if(['加班費'].includes(sub))return 'overtime';
 if(['兼職','兼職收入','副業收入'].includes(sub))return 'parttime';
 if(['利息'].includes(sub))return 'interest';
 if(['配息','股息'].includes(sub))return 'dividend';
 return 'other';
}
function normalize(ledger){
 const rows=Array.isArray(ledger?.rows)?ledger.rows:[];
 const all=new Map(rows.filter(x=>x&&x.id!==undefined).map(x=>[String(x.id),x]));
 const refundedTotals=new Map();
 const out=[], warnings={invalidRows:0,orphanRefunds:0,ambiguousPrincipal:0,unassignedAccount:0};
 for(const r of rows){
   if(!r||r.deletedAt)continue;
   const amount=money(r.amount);
   if(!iso(r.date)||amount===null){warnings.invalidRows++;continue}
   const e={row:r,id:String(r.id??''),date:r.date,settledDate:iso(r.settledDate)?r.settledDate:r.date,hasSettlementDate:iso(r.settledDate),
      amount,kind:r.type,group:String(r.group||'未分類'),sub:String(r.sub||r.category||'未分類'),
      incomeSource:sourceOf(r),nature:r.costNature==='fixed'?'fixed':r.costNature==='variable'?'variable':'unknown',
      project:PROJECT[r.projectTag]?r.projectTag:null,income:0,expense:0};
   if(r.type==='transfer'){e.kind='transfer';}
   else if(r.analysisKind==='principal'){e.kind='principal';warnings.ambiguousPrincipal++;}
   else if(r.type==='income'&&r.analysisKind==='refund'){
     const original=all.get(String(r.refundOf||''));
     if(!original||original.deletedAt||original.type!=='expense'||money(original.amount)===null){e.kind='orphanRefund';warnings.orphanRefunds++;}
     else if((refundedTotals.get(String(r.refundOf))||0)+amount>Number(original.amount)){e.kind='orphanRefund';warnings.orphanRefunds++;}
     else{refundedTotals.set(String(r.refundOf),(refundedTotals.get(String(r.refundOf))||0)+amount);e.kind='refund';e.expense=-amount;e.group=String(original.group||'未分類');e.sub=String(original.sub||original.category||'未分類');e.nature=original.costNature==='fixed'?'fixed':original.costNature==='variable'?'variable':'unknown';e.project=PROJECT[original.projectTag]?original.projectTag:null}
   }else if(r.type==='expense'){e.kind='expense';e.expense=amount;}
   else if(r.type==='income'){e.kind='income';e.income=amount;}
   else{warnings.invalidRows++;continue}
   out.push(e);
 }
 return {events:out,warnings};
}
function sum(events,key){return events.reduce((a,e)=>a+(e[key]||0),0)}
function groupSum(events,key,mapper){const m=new Map();for(const e of events){const k=mapper(e);m.set(k,(m.get(k)||0)+e[key])}return [...m].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'zh-TW'))}
function proratedBudget(p,monthly){
 if(!Number.isFinite(monthly)||monthly<=0)return null;
 let value=0;for(let d=p.start;d<=p.end;d=shift(d,1))value+=monthly/days(firstOfMonth(d),endOfMonth(d));
 return Math.round(value);
}
function motions(events,accounts){
 const map=new Map((Array.isArray(accounts)?accounts:[]).map(a=>[String(a.id),a]));
 const out=[];let unassigned=0;
 const asset=id=>{const a=map.get(String(id||''));return a&&a.kind!=='credit'?a:null};
 for(const e of events){
   const r=e.row,from=asset(r.accountId),to=asset(r.toAccountId);
   if(e.kind==='transfer'){
     if(from)out.push({date:e.settledDate,amount:-e.amount,row:r,account:from.name,kind:map.get(String(r.toAccountId))?.kind==='credit'?'cardPayment':'transfer'});
     if(to)out.push({date:e.settledDate,amount:e.amount,row:r,account:to.name,kind:'transfer'});
     if(!from&&!to)unassigned++;
   }else if(['expense','income','refund','principal','orphanRefund'].includes(e.kind)){
     if(from)out.push({date:e.settledDate,amount:r.type==='expense'?-e.amount:e.amount,row:r,account:from.name,kind:e.kind});
     else if(!r.accountId)unassigned++;
   }
 }
 return {items:out,unassigned};
}
function isoWeek(d){const x=utc(d);let dow=x.getUTCDay();if(!dow)dow=7;x.setUTCDate(x.getUTCDate()-dow+1);return isoDate(x)}
function dailyEvents(events,p,key='expense',limit=65){
 let points=[];
 if(p.days<=limit){for(let d=p.start;d<=p.end;d=shift(d,1))points.push({date:d,value:0});const map=new Map(points.map(x=>[x.date,x]));events.forEach(e=>{const cell=map.get(e.date);if(cell)cell.value+=e[key]||0});}
 else{const m=new Map();for(const e of events){const label=e.date.slice(0,7);m.set(label,(m.get(label)||0)+(e[key]||0))}for(let d=firstOfMonth(p.start);d<=p.end;d=firstOfMonth(d,1))points.push({date:d.slice(0,7),value:m.get(d.slice(0,7))||0});}
 return points;
}
function cashGroups(items,group){const m=new Map();for(const e of items){const key=group==='day'?e.date:group==='week'?isoWeek(e.date):e.date.slice(0,7);m.set(key,(m.get(key)||0)+e.amount)}return [...m].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date))}
function stats(events,p){
 const fin=events.filter(e=>e.date>=p.start&&e.date<=p.end);
 const incl=fin.filter(e=>e.kind==='income'||e.kind==='expense'||e.kind==='refund');
 const income=sum(incl,'income'),expense=sum(incl,'expense'),net=income-expense;
 const largest=fin.filter(e=>e.kind==='expense').sort((a,b)=>b.amount-a.amount)[0]||null;
 return {events:fin,financial:incl,income,expense,net,
   savingsRate:income>0?net/income:null,expenseIncomeRatio:income>0?expense/income:null,averageDailyExpense:expense/p.days,largest};
}
function compareMoney(current,previous){if(previous===0)return null;return (current-previous)/Math.abs(previous)}
function calculate(ledger,opts={}){
 const p=period(opts.mode||'month',opts);
 const {events,warnings}=normalize(ledger);
 const s=stats(events,p),prev=stats(events,{...p,start:p.comparison.start,end:p.comparison.end,days:p.days});
 const finance=s.financial,expenseEvents=finance.filter(e=>e.expense!==0),incomeEvents=finance.filter(e=>e.income>0);
 const incomeSources=groupSum(incomeEvents,'income',e=>SRC[e.incomeSource]||SRC.other);
 const categories=groupSum(expenseEvents,'expense',e=>e.group);
 const subcategories=groupSum(expenseEvents,'expense',e=>e.group+' / '+e.sub);
 const incomeMonthly=groupSum(incomeEvents,'income',e=>e.date.slice(0,7)).sort((a,b)=>a.name.localeCompare(b.name));
 const bonusSeries=groupSum(incomeEvents.filter(e=>e.incomeSource==='bonus'),'income',e=>e.date.slice(0,7)).sort((a,b)=>a.name.localeCompare(b.name));
 const bonusDiff=bonusSeries.length>=2?Math.max(...bonusSeries.map(x=>x.value))-Math.min(...bonusSeries.map(x=>x.value)):null;
 let coveredMonths=0;for(let m=firstOfMonth(p.start);m<=p.end;m=firstOfMonth(m,1))coveredMonths++;
 const expenses=s.events.filter(e=>e.kind==='expense');
 const expenseByDay=groupSum(expenseEvents,'expense',e=>e.date);
 const weekdayNames=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
 const weekday=groupSum(expenseEvents,'expense',e=>weekdayNames[utc(e.date).getUTCDay()]);
 const food=expenses.filter(e=>e.group==='餐飲');
 const drink=food.filter(e=>['飲料','咖啡'].includes(e.sub));
 const recurrence=new Map();
 for(const e of expenses){const note=String(e.row.note||'').trim();if(!note)continue;const key=note.toLocaleLowerCase();if(!recurrence.has(key))recurrence.set(key,{note,months:new Set(),events:[]});const x=recurrence.get(key);x.months.add(e.date.slice(0,7));x.events.push(e)}
 const repeat=[...recurrence.values()].filter(x=>x.months.size>=3).map(x=>({name:x.note,months:x.months.size,amount:sum(x.events,'expense'),events:x.events})).sort((a,b)=>b.months-a.months);
 const projects=Object.keys(PROJECT).map(key=>{const es=expenseEvents.filter(e=>e.project===key);return {key,name:PROJECT[key],events:es,total:sum(es,'expense'),subcategories:groupSum(es,'expense',e=>e.sub),monthly:groupSum(es,'expense',e=>e.date.slice(0,7)).sort((a,b)=>a.name.localeCompare(b.name))}});
 const {items:allMotions,unassigned}=motions(events,ledger?.accounts);
 const cash=allMotions.filter(x=>x.date>=p.start&&x.date<=p.end);
 const cashIn=sum(cash.filter(x=>x.amount>0&&x.kind!=='transfer'),'amount'),cashOut=-sum(cash.filter(x=>x.amount<0&&x.kind!=='transfer'),'amount');
 const cashByAccount=groupSum(cash,'amount',x=>x.account);
 const currentCats=new Map(categories.map(x=>[x.name,x.value]));
 const previousCats=groupSum(prev.financial.filter(x=>x.expense!==0),'expense',x=>x.group);
 const categoryChange=[...new Set([...currentCats.keys(),...previousCats.map(x=>x.name)])].map(name=>{const current=currentCats.get(name)||0,previous=previousCats.find(x=>x.name===name)?.value||0;return {name,current,previous,amount:current-previous,rate:compareMoney(current,previous)}}).sort((x,y)=>Math.abs(y.amount)-Math.abs(x.amount));
 const classifiedExp=expenseEvents.filter(e=>e.nature!=='unknown');
 const fixedExpense=sum(classifiedExp.filter(e=>e.nature==='fixed'),'expense'),variableExpense=sum(classifiedExp.filter(e=>e.nature==='variable'),'expense');
 const fixedIncome=sum(incomeEvents.filter(e=>e.incomeSource==='salary'),'income');
 const uncertainIncome=sum(incomeEvents.filter(e=>e.incomeSource==='other'),'income');
 const settings=ledger?.analyticsSettings||{};
 const budget=Number(settings.monthlyBudget)>0?proratedBudget(p,Number(settings.monthlyBudget)):null;
 const essentials=Number(settings.monthlyEssentials)>0?Number(settings.monthlyEssentials):null;
 const emergency=Number.isFinite(Number(settings.emergencyFund))&&String(settings.emergencyFund??'').trim()!==''&&Number(settings.emergencyFund)>=0?Number(settings.emergencyFund):null;
 const liquidAccounts=(ledger?.accounts||[]).filter(a=>a.kind!=='credit');
 const reliableBalances=liquidAccounts.length>0&&liquidAccounts.every(a=>Number.isSafeInteger(Number(a.opening)));
 const liquidBalance=reliableBalances?liquidAccounts.reduce((acc,a)=>acc+Number(a.opening)+events.reduce((d,e)=>{
   const r=e.row,amt=e.amount;
   if(e.kind==='transfer')return d+(r.accountId===a.id?-amt:0)+(r.toAccountId===a.id?amt:0);
   return d+(r.accountId===a.id?(r.type==='expense'?-amt:amt):0);
 },0),0):null;
 return {period:p,stats:s,previous:prev,change:{income:compareMoney(s.income,prev.income),expense:compareMoney(s.expense,prev.expense),net:compareMoney(s.net,prev.net)},
   count:s.financial.length,incomeSources,categories,subcategories,categoryChange,monthlyIncome:incomeMonthly,bonusDifference:bonusDiff,bonusSeries,
   fixedIncome,uncertainIncome,incomeMonthlyAverage:coveredMonths>0?s.income/coveredMonths:null,incomeMonthCount:coveredMonths,
   topExpenses:expenses.slice().sort((a,b)=>b.amount-a.amount).slice(0,10),
   dailyExpenses:dailyEvents(expenseEvents,p),dailyIncome:dailyEvents(incomeEvents,p,'income'),
   expenseByDay,weekday,foodCount:food.length,drinkCount:drink.length,recurrence:repeat,projects,
   cash:{items:cash,net:cashIn-cashOut,inflow:cashIn,outflow:cashOut,byAccount:cashByAccount,
     daily:cashGroups(cash,'day'),weekly:cashGroups(cash,'week'),monthly:cashGroups(cash,'month'),unassigned,
     approximateDates:cash.filter(x=>!iso(x.row.settledDate)).length},
   health:{balanceRate:s.income>0?s.net/s.income:null,budget,monthlyBudget:settings.monthlyBudget??null,
      budgetUsage:budget>0?s.expense/budget:null,fixedExpense,variableExpense,unclassifiedExpense:sum(expenseEvents.filter(e=>e.nature==='unknown'),'expense'),
      fixedRatio:s.income>0&&classifiedExp.length===expenseEvents.length?fixedExpense/s.income:null,
      emergencyMonths:essentials!==null&&emergency!==null?emergency/essentials:null,
      liquidBalance,projectedEndOfMonth:null},
   warnings,sourceEvents:events};
}
root.LedgerAnalyticsCore=Object.freeze({period,calculate,normalize,todayTaipei,shift,days,iso,isoWeek,SRC,PROJECT});
})(typeof window!=='undefined'?window:globalThis);
