/* Xiaoen Ledger Financial Analytics deterministic regression suite.
   Synthetic data only. Run in console after loading analytics-core.js:
   window.runLedgerAnalyticsTests() */
(function(root){
'use strict';
root.runLedgerAnalyticsTests=function(){
 const A=root.LedgerAnalyticsCore;if(!A)throw Error('Missing analytics core');
 const cases=[];
 const assert=(name,actual,expected)=>{
   const success=Object.is(actual,expected);
   cases.push({name,passed:success,actual,expected});
   if(!success)throw Error(name+': expected '+expected+', got '+actual);
 };
 const row=(id,type,amount,date,fields={})=>({id,type,amount,date,group:type==='expense'?'餐飲':'工作收入',sub:type==='expense'?'正餐':'固定薪資',accountId:'cash',...fields});
 const accounts=[{id:'cash',kind:'asset',name:'主銀行',opening:20000},{id:'saving',kind:'asset',name:'儲蓄',opening:1000},{id:'card',kind:'credit',name:'信用卡',opening:0}];
 const rows=[
 row('salary','income',32000,'2026-11-01'),
 row('oct','expense',700,'2026-10-31'),
 row('food','expense',1500,'2026-11-02',{projectTag:'gla200',costNature:'variable'}),
 row('refundA','income',400,'2026-11-04',{analysisKind:'refund',refundOf:'food'}),
 row('refundB','income',100,'2026-11-05',{analysisKind:'refund',refundOf:'food'}),
 row('bankmove','transfer',1000,'2026-11-04',{toAccountId:'saving'}),
 row('cardspend','expense',2500,'2026-11-05',{accountId:'card',group:'寵物',sub:'飼料',projectTag:'ronnie',costNature:'fixed'}),
 row('cardpay','transfer',2000,'2026-11-06',{toAccountId:'card'}),
 row('outside','expense',250,'2026-10-30',{settledDate:'2026-11-06'}),
 row('deleted','expense',999,'2026-11-06',{deletedAt:'2026-11-06T00:00:00Z'}),
 row('principal','income',5000,'2026-11-06',{analysisKind:'principal'}),
 ];
 const ledger={accounts,rows,analyticsSettings:{monthlyBudget:9000,monthlyEssentials:5000,emergencyFund:20000}};
 const opts={mode:'month',today:'2026-11-06'};
 const res=A.calculate(ledger,opts);
 assert('Month start',res.period.start,'2026-11-01');
 assert('Month end is today',res.period.end,'2026-11-06');
 assert('Comparable days',res.period.days,A.days(res.period.comparison.start,res.period.comparison.end));
 assert('Finance excludes previous month and principal',res.stats.income,32000);
 assert('Refund reduces expense not income',res.stats.expense,3500);
 assert('Net income less net expense',res.stats.net,28500);
 assert('Internal transfer excluded from finance',res.stats.financial.some(e=>e.kind==='transfer'),false);
 assert('Card payment excluded from finance',res.stats.financial.some(e=>e.row.id==='cardpay'),false);
 assert('Internal bank transfer excluded from external outflow',res.cash.outflow,3750);
 assert('Cash refund included as incoming',res.cash.inflow,37500);
 assert('Card charge not bank cash out',res.cash.items.some(x=>x.row.id==='cardspend'),false);
 assert('Settlement date outside occurrence period counted',res.cash.items.some(x=>x.row.id==='outside'),true);
 assert('Category sums equal net expense',res.categories.reduce((a,x)=>a+x.value,0),res.stats.expense);
 assert('Project independent of category: car',res.projects.find(x=>x.key==='gla200').total,1000);
 assert('Project independent of category: pet',res.projects.find(x=>x.key==='ronnie').total,2500);
 assert('No project double count',res.projects.reduce((a,x)=>a+x.total,0),res.stats.expense);
 assert('Last month bounds',A.period('lastMonth',{today:'2026-11-06'}).end,'2026-10-31');
 assert('Previous year bounds',A.period('lastYear',{today:'2026-11-06'}).start,'2025-01-01');
 assert('Custom 4 dates',A.period('custom',{today:'2026-11-06',from:'2026-01-30',to:'2026-02-02'}).days,4);
 assert('Refund in month but original outside period',A.calculate({rows:[row('old','expense',400,'2026-10-30'),row('return','income',200,'2026-11-01',{analysisKind:'refund',refundOf:'old'})]},{...opts}).stats.expense,-200);
 assert('Zero income savings ratio null',A.calculate({rows:[row('x','expense',2,'2026-11-04')]},opts).stats.savingsRate,null);
 assert('Zero income ratio null',A.calculate({rows:[]},opts).stats.expenseIncomeRatio,null);
 assert('Empty rows zero count',A.calculate({rows:[]},opts).count,0);
 assert('Empty rows no fabricated cash',A.calculate({rows:[]},opts).cash.items.length,0);
 const edited=structuredClone(ledger);edited.rows.find(x=>x.id==='food').amount=2000;
 assert('Edited expense instantly affects totals',A.calculate(edited,opts).stats.expense,4000);
 const deleted=structuredClone(ledger);deleted.rows.find(x=>x.id==='food').deletedAt='2026-11-06';
 const deletedRes=A.calculate(deleted,opts);
 assert('Deleted original removes expense and refund linkage',deletedRes.warnings.orphanRefunds,2);
 deleted.rows.find(x=>x.id==='food').deletedAt=null;
 assert('Restore original restores original net expenses',A.calculate(deleted,opts).stats.expense,3500);
 const overRefund={rows:[row('origin','expense',100,'2026-11-01'),row('refund1','income',80,'2026-11-02',{analysisKind:'refund',refundOf:'origin'}),row('refund2','income',50,'2026-11-03',{analysisKind:'refund',refundOf:'origin'})]};
 assert('Over-refund flagged',A.calculate(overRefund,opts).warnings.orphanRefunds,1);
 assert('Over-refund excluded from net expense',A.calculate(overRefund,opts).stats.expense,20);
 assert('Budget is prorated by actual calendar days',res.health.budget,Math.round(9000/30*6));
 assert('Emergency months uses user supplied inputs',res.health.emergencyMonths,4);
 assert('Missing budget stays null',A.calculate({rows:[]},opts).health.budget,null);
 assert('No projected month-end when no schedule',res.health.projectedEndOfMonth,null);
 assert('Multiple month income average covers all calendar months',A.calculate({rows:[row('a','income',600,'2026-09-04')]},{mode:'3m',today:'2026-11-06'}).incomeMonthlyAverage,200);
 assert('All seven analytics source groups exist',Object.keys(A.SRC).length,7);
 return {passed:cases.filter(x=>x.passed).length,total:cases.length,cases};
 };
})(typeof window!=='undefined'?window:globalThis);
