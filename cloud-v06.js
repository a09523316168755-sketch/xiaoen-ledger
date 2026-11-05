/* Xiaoen Ledger v0.6 — private, revision-checked cloud sync.
 * Publishable key is public by design. Never put privileged keys in this file.
 */
(function(){
'use strict';
const ENDPOINT='https://uskeiejhxofaxlzgqoik.supabase.co';
const PUBLIC_KEY='sb_publishable_Ky7-QaY2jSt_zY85BN2o_A_3u1gfoSL';
const WEBSITE='https://a09523316168755-sketch.github.io/xiaoen-ledger/';
const $=id=>document.getElementById(id);
const status=$('cloudStatus'),email=$('cloudEmail'),pw=$('cloudPassword');
const cloudPanel=$('cloudPanel'),cloudToggle=$('cloudToggle'),cloudBadge=$('cloudBadge');
function setCloudOpen(open){cloudPanel.classList.toggle('hidden',!open);cloudToggle.setAttribute('aria-expanded',String(open));if(open)window.ledgerShowCloudView?.();else window.ledgerCloseCloudView?.();}
cloudToggle.addEventListener('click',()=>setCloudOpen(cloudPanel.classList.contains('hidden')));
$('cloudClose').addEventListener('click',()=>setCloudOpen(false));
let api=null,user=null,revision=0,enabled=false,busy=false,pending=false,conflict=false,timeout=null;
let recoveryMode=false,resetMailBusy=false;
let syncMode='loading',retryDelay=1500;
function ready(v){window.ledgerSetDataReady?.(v)}const recoveryLinkHint=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
const OWNER_KEY='xiaoen-ledger-cloud-owner';
const dirtyKey=()=>user?'xiaoen-ledger-cloud-dirty-'+user.id:null;
function state(msg,kind,nextMode){
 if(nextMode)syncMode=nextMode;
 else if(recoveryMode)syncMode='loading';
 else if(kind==='error')syncMode='error';
 else if(busy||pending)syncMode='syncing';
 else if(user&&enabled)syncMode='synced';
 else if(user)syncMode='local';
 else syncMode='local';
 status.textContent=msg;status.dataset.state=kind||'';
 const labels={loading:'讀取中',local:'本機資料',syncing:'同步中',synced:'已同步',error:'同步異常'};
 cloudBadge.textContent=recoveryMode?'重設密碼':labels[syncMode];
 cloudToggle.dataset.state=kind||'';
 const strip=$('ledgerStatusBar');
 if(strip){strip.textContent=msg;strip.dataset.mode=syncMode;strip.title='按右上角雲端可查看詳細狀態'}
}
function showAuth(user){$('cloudAuthForm').classList.toggle('hidden',!!user);$('cloudLoggedIn').classList.toggle('hidden',!user);$('cloudUser').textContent=user?.email||'';}
function showRecovery(){
 recoveryMode=true;
 setCloudOpen(true);
 $('cloudAuthForm').classList.add('hidden');
 $('cloudLoggedIn').classList.add('hidden');
 $('cloudRecoveryPanel').classList.remove('hidden');
 state('重設連結已驗證：請在下方輸入新密碼。','success','loading');
 $('cloudRecoveryPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function hideRecovery(){
 recoveryMode=false;
 $('cloudRecoveryPanel').classList.add('hidden');
 showAuth(null);
}
function safeLocalSave(){try{localStorage.setItem('xiaoen-ledger-v5',JSON.stringify(data));return true}catch(e){alert('本機保存失敗：'+e.message);return false}}
function backupLocal(){const safe=JSON.stringify({version:5,...data},null,2);const blob=new Blob([safe],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='xiaoen-ledger-before-cloud-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
function isMeaningful(d){return !!(d?.rows?.length||d?.accounts?.length||d?.audit?.length)}
function askChoice(text){return confirm(text)}
async function loadRemote(){const {data:record,error}=await api.from('ledger_documents').select('revision,payload').eq('user_id',user.id).maybeSingle();if(error)throw error;return record}
function replaceApp(documentPayload){const next=migrate(documentPayload);data=next;if(!safeLocalSave())throw Error('本機無法保存已下載的雲端資料');resetEntry();renderAll();}
async function chooseInitial(record){
const local=migrate(data);
const dirty=localStorage.getItem(dirtyKey());
if(dirty!==null && localStorage.getItem(OWNER_KEY)===user.id){
 const serverRev=record?Number(record.revision):0;
 if(serverRev===Number(dirty)){revision=serverRev;enabled=true;pending=true;ready(true);state('找到尚未上傳的本機修改，正在恢復同步…','warning','syncing');await flush();return}
 conflict=true;enabled=false;ready(true);state('本機有未上傳的紀錄，雲端也已更新。請先匯出備份，再處理同步衝突。','error','error');return;
}
if(!record){
  if(isMeaningful(local)){
    state('雲端尚無資料。請選擇是否上傳目前裝置的帳本。');
    const upload=askChoice('雲端目前是空白帳本。\n\n確定：將目前裝置的交易、帳戶、分類上傳雲端。\n取消：暫不啟用同步，原本資料保留在這台裝置。');
    if(!upload){enabled=false;ready(true);state('僅本機儲存：尚未上傳到雲端。','warning','local');return;}
  }
  revision=0;enabled=true;pending=true;localStorage.setItem(dirtyKey(),'0');await flush();return;
}
revision=Number(record.revision);
const localBlob=JSON.stringify(local),remoteBlob=JSON.stringify(migrate(record.payload));
if(isMeaningful(local)&&localBlob!==remoteBlob){
  const useCloud=askChoice('這台裝置與雲端已有不同帳本。\n\n確定：下載並使用雲端資料（會先下載本機備份）。\n取消：先保留本機資料，不啟用同步。\n\n為安全起見，不會直接覆蓋已有的雲端帳本。');
  if(!useCloud){enabled=false;ready(true);state('本機帳本與雲端不同，已暫停同步以保護資料。','warning','local');return;}
  backupLocal();
}
replaceApp(record.payload);localStorage.setItem(OWNER_KEY,user.id);enabled=true;pending=false;ready(true);state('✓ 已從雲端載入，跨裝置同步已啟用','success','synced');
}
async function connectUser(sessionUser){
  user=sessionUser;enabled=false;pending=false;conflict=false;busy=false;
  ready(!user);
  showAuth(user);
  if(!user){state('本機儲存 · 尚未登入，紀錄不會跨裝置同步。','warning','local');return}
  const previousOwner=localStorage.getItem(OWNER_KEY);
  if(previousOwner&&previousOwner!==user.id){
  // Keep a separate local snapshot before switching identities; never silently discard it.
  try{
    const snapshot=localStorage.getItem('xiaoen-ledger-v5');
    if(snapshot)localStorage.setItem('xiaoen-ledger-v5-preswitch-'+previousOwner,snapshot);
  }catch(e){ready(false);state('切換帳號前無法備份原本的本機帳本，已停止切換：'+e.message,'error','error');return}
  backupLocal();
  data=blank();
  if(!safeLocalSave()){ready(false);state('無法安全切換帳號，請先保留原本備份。','error','error');return}
}
  state('正在讀取雲端帳本…','warning','loading');
  try{const row=await loadRemote();await chooseInitial(row)}catch(e){enabled=false;ready(true);state('雲端讀取失敗 · 目前只能使用本機資料：'+e.message,'error','error')}
}
function schedule(){if(!user||!enabled||conflict)return;localStorage.setItem(dirtyKey(),String(revision));pending=true;state('已儲存在本機，正在等候雲端同步…','warning','syncing');clearTimeout(timeout);timeout=setTimeout(()=>{void flush()},500)}
async function flush(){
 if(!user||!enabled||conflict||busy||!pending)return;
 busy=true;pending=false;const snapshot=JSON.stringify(data),baseRevision=revision;
 ready(true);
 state('正在寫入雲端…','warning','syncing');
 try{
  const {data:res,error}=await api.rpc('save_ledger_document',{expected_revision:baseRevision,new_payload:JSON.parse(snapshot)});
  if(error)throw error;
  const output=Array.isArray(res)?res[0]:res;
  if(!output||!output.applied){
    conflict=true;enabled=false;
    state('同步衝突：另一台裝置已更新雲端。本機資料已保留，請先備份再處理。','error','error');return;
  }
  revision=Number(output.current_revision);retryDelay=1500;localStorage.setItem(OWNER_KEY,user.id);
  if(JSON.stringify(data)!==snapshot){pending=true;localStorage.setItem(dirtyKey(),String(revision));state('已有新紀錄，繼續同步…','warning')}
  else {localStorage.removeItem(dirtyKey());state('✓ 雲端同步成功 · 本機與雲端一致','success','synced')}
 }catch(e){pending=true;retryDelay=Math.min(retryDelay*2,30000);state('同步失敗 · 本機修改已保留，可按雲端按鈕重試：'+e.message,'error','error')}
 finally{busy=false;if(pending&&enabled&&!conflict&&navigator.onLine){clearTimeout(timeout);timeout=setTimeout(()=>void flush(),retryDelay)}}
}
function onChange(){if(!user||!enabled)return;schedule()}
window.ledgerCloudChanged=onChange;
$('cloudRetry').onclick=async()=>{if(!user)return state('請先登入','warning');if(conflict){backupLocal();const ok=confirm('已啟動下載本機備份。確定要以雲端版本取代本機未同步資料嗎？請先確認備份檔已保存在裝置中。');if(!ok)return;conflict=false;enabled=false;localStorage.removeItem(dirtyKey());ready(false);try{await chooseInitial(await loadRemote())}catch(e){ready(true);state('重新讀取失敗：'+e.message,'error','error')}return}if(!enabled){try{await chooseInitial(await loadRemote())}catch(e){state('重新連線失敗：'+e.message,'error')}return}pending=true;await flush()};
$('cloudBackup').onclick=backupLocal;
$('cloudSignOut').onclick=async()=>{if(pending||conflict||(user&&!enabled&&isMeaningful(data))||localStorage.getItem(dirtyKey())!==null){state('尚有未確認或未同步的本機資料，為避免清除資料，已暫停登出。請先備份並完成雲端同步。','error','error');backupLocal();return}const {error}=await api.auth.signOut();if(error)return state(error.message,'error');const oldDirty=dirtyKey();enabled=false;user=null;revision=0;showAuth(null);resetEntry();backupLocal();data=blank();safeLocalSave();localStorage.removeItem(OWNER_KEY);if(oldDirty)localStorage.removeItem(oldDirty);renderAll();state('已登出。這台瀏覽器的雲端工作資料已隱藏，原始本機備份不會自動刪除。','warning')};
$('cloudForgot').onclick=async()=>{
 const address=email.value.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))return state('請先填寫註冊時的電子郵件。','warning');
 if(resetMailBusy)return;
 if(!api)return state('雲端登入服務尚未載入，請重新整理後重試。','error');
 resetMailBusy=true;
 const button=$('cloudForgot');button.disabled=true;button.textContent='寄送中…';
 state('正在申請密碼重設信…','warning');
 try{
   const {error}=await api.auth.resetPasswordForEmail(address,{redirectTo:WEBSITE});
   if(error)throw error;
   state('已提交密碼重設申請。如果這個 Email 對應已註冊帳號，請查看收件匣及垃圾郵件。','success');
 }catch(e){state('無法申請密碼重設：'+e.message,'error')}
 finally{resetMailBusy=false;button.disabled=false;button.textContent='忘記密碼？'}
};
$('cloudPasswordUpdate').onclick=async()=>{
 if(!recoveryMode)return state('請先由密碼重設郵件的連結進入本網站。','error');
 const a=$('cloudNewPassword'),b=$('cloudNewPasswordConfirm');
 if(a.value.length<12)return state('請使用至少 12 字元的新密碼。','warning');
 if(a.value!==b.value)return state('兩次輸入的新密碼不一致。','warning');
 const button=$('cloudPasswordUpdate');button.disabled=true;button.textContent='更新中…';
 try{
   const {error}=await api.auth.updateUser({password:a.value});
   if(error)throw error;
   a.value='';b.value='';
   const {error:outErr}=await api.auth.signOut();
   hideRecovery();
   if(location.hash)history.replaceState(null,'',location.pathname+location.search);
   state(outErr?'新密碼已更新，但自動登出失敗；請重新整理後登入。':'新密碼已成功更新，請使用新密碼登入。','success');
 }catch(e){state('新密碼更新失敗：'+e.message,'error')}
 finally{button.disabled=false;button.textContent='更新密碼'}
};
$('cloudResend').onclick=async()=>{const address=email.value.trim();if(!address)return state('請先填寫註冊時的電子郵件。','warning');state('正在寄送新的驗證信…');const {error}=await api.auth.resend({type:'signup',email:address,options:{emailRedirectTo:WEBSITE}});if(error)return state('無法重寄：'+error.message,'error');state('若帳號尚待驗證，已要求寄送新驗證信。請查看收件匣與垃圾郵件。','success')};
$('cloudSignIn').onclick=async()=>{const e=email.value.trim(),password=pw.value;if(!e||!password)return state('請輸入電子郵件與密碼。','warning');state('登入中…');const {error}=await api.auth.signInWithPassword({email:e,password});pw.value='';if(error)state('登入失敗：'+error.message,'error')};
$('cloudSignUp').onclick=async()=>{const e=email.value.trim(),password=pw.value;if(!e||password.length<8)return state('請填入電子郵件與至少 8 字元的密碼。','warning');state('正在建立帳號…');const {data:result,error}=await api.auth.signUp({email:e,password,options:{emailRedirectTo:WEBSITE}});pw.value='';if(error)return state('註冊失敗：'+error.message,'error');if(!result.session)state('註冊完成，請到電子郵件確認帳號，再返回網站登入。','warning');else state('註冊成功，正在載入帳本…','success')};
window.addEventListener('online',()=>{if(pending&&enabled&&!busy)void flush()});
async function checkRemote(){if(!enabled||!user||busy||pending||conflict)return;try{const remote=await loadRemote();if(remote&&Number(remote.revision)>revision){if(pending||busy)return;if(window.ledgerHasUnsavedForm?.()){state('其他裝置已更新雲端，請先處理目前尚未儲存的表單；不會擅自清空輸入內容。','warning','syncing');return}if(localStorage.getItem(dirtyKey())!==null){conflict=true;enabled=false;return state('雲端已有新版，且本機仍有未上傳修改；已暫停同步。','error','error')}replaceApp(remote.payload);revision=Number(remote.revision);state('✓ 已接收其他裝置的最新紀錄','success')}}catch(e){state('檢查其他裝置更新失敗：'+e.message,'warning')}}
window.addEventListener('storage',event=>{
 if(event.key==='xiaoen-ledger-v5'&&user&&enabled){
  // Another browser tab changed this device's local ledger. Never overwrite silently.
  conflict=true;enabled=false;ready(true);
  state('偵測到另一個分頁修改記帳資料，已暫停此分頁同步。請先備份，再重新開啟網站。','error','error');
 }
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(pending&&enabled&&!busy)void flush();else void checkRemote()}});
setInterval(()=>{if(document.visibilityState==='visible'&&enabled)void checkRemote()},30000);
(async function boot(){
 if(!window.supabase?.createClient){ready(true);state('雲端登入套件未載入 · 目前僅本機記帳。請檢查網路後重新整理。','error','error');return}
 api=window.supabase.createClient(ENDPOINT,PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},realtime:{params:{eventsPerSecond:1}}});
 api.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY'){setTimeout(()=>showRecovery(),0);return}
   if(event==='SIGNED_IN'&&!recoveryLinkHint&&!recoveryMode&&session?.user?.id!==user?.id){setTimeout(()=>void connectUser(session.user),0)}
   if(event==='SIGNED_OUT'&&user){setTimeout(()=>void connectUser(null),0)}
 });
 const {data:sessionData,error}=await api.auth.getSession();
 if(error)state('驗證狀態讀取失敗：'+error.message,'error');
 if(recoveryLinkHint){ready(false);
   if(!sessionData?.session)state('重設連結無法使用或已過期，請重新申請密碼重設信。','error');
   else setTimeout(()=>{if(!recoveryMode)showRecovery()},200);
 }else if(!recoveryMode) await connectUser(sessionData?.session?.user||null);
})();
})();
