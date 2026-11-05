/* Xiaoen Ledger: independent confirmation-email resend.
   Works even if optional Supabase SDK fails to load. */
(() => {
  'use strict';
  const button=document.getElementById('cloudResend');
  const email=document.getElementById('cloudEmail');
  const output=document.getElementById('resendStatus');
  if(!button||!email||!output)return;
  const endpoint='https://uskeiejhxofaxlzgqoik.supabase.co/auth/v1/resend';
  const publishable='sb_publishable_Ky7-QaY2jSt_zY85BN2o_A_3u1gfoSL';
  const redirect='https://a09523316168755-sketch.github.io/xiaoen-ledger/';
  let active=false;
  const show=(message,kind='warning')=>{
    output.textContent=message;
    output.dataset.state=kind;
    output.hidden=false;
    output.scrollIntoView({block:'nearest',behavior:'smooth'});
  };
  button.addEventListener('click',async(event)=>{
    event.preventDefault();
    event.stopImmediatePropagation(); // Ignore legacy SDK-bound click handler
    if(active)return;
    const address=email.value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){
      show('請先輸入註冊時的有效 Email，再按「重寄驗證信」。','warning');
      email.focus();return;
    }
    active=true;button.disabled=true;button.textContent='寄送中…';
    show('已按下按鈕，正在向 Supabase 申請重寄驗證信…','warning');
    const controller=new AbortController();
    const deadline=setTimeout(()=>controller.abort(),16000);
    try{
      const response=await fetch(endpoint+'?redirect_to='+encodeURIComponent(redirect),{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':publishable},
        body:JSON.stringify({email:address,type:'signup'}),
        signal:controller.signal
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        const detail=body.msg||body.message||body.error_description||body.error||'伺服器未提供詳細原因';
        if(response.status===429)throw Error('重寄太頻繁，請稍後再試。'+detail);
        throw Error('HTTP '+response.status+'：'+detail);
      }
      show('✓ Supabase 已接受請求。若帳號仍待驗證，請查看信箱（包含垃圾郵件）。寄出與送達仍可能受到郵件服務限制。','success');
    }catch(err){
      const detail=err.name==='AbortError'?'連線逾時，請確認手機能連接 Supabase。':err.message||'未知錯誤';
      show('無法重寄驗證信：'+detail,'error');
    }finally{
      clearTimeout(deadline);active=false;button.disabled=false;button.textContent='重寄驗證信';
    }
  },true);
})();