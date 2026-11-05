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
let api=null,user=null,revision=0,enabled=false,busy=false,pending=false,conflict=false,timeout=null;
const keyFor=userId=>'xiaoen-ledger-v5-cloud-backup-'+userId;
function state(msg,kind){status.textContent=msg;status.dataset.state=kind||''}
function showAuth(user){$('cloudAuthForm').classList.toggle('hidden',!!user);$('cloudLoggedIn').classList.toggle('hidden',!user);$('cloudUser').textContent=user?.email||'';}
function safeLocalSave(){try{localStorage.setItem('xiaoen-ledger-v5',JSON.stringify(data));return true}catch(e){alert('本機保存失敗：'+e.message);return false}}
function backupLocal(){const safe=JSON.stringify({version:5,...data},null,2);const blob=new Blob([safe],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='xiaoen-ledger-before-cloud-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
function isMeaningful(d){return !!(d?.rows?.length||d?.accounts?.length||d?.audit?.length)}
function askChoice(text){return confirm(text)}
async function loadRemote(){const {data:record,error}=await api.from('ledger_documents').select('revision,payload').eq('user_id',user.id).maybeSingle();if(error)throw error;return record}
function replaceApp(documentPayload){const next=migrate(documentPayload);data=next;if(!safeLocalSave())throw Error('本機無法保存已下載的雲端資料');resetEntry();renderAll();}
async function chooseInitial(record){
const local=migrate(data);
if(!record){
  if(isMeaningful(local)){
    state('雲端尚無資料。請選擇是否上傳目前裝置的帳本。');
    const upload=askChoice('雲端目前是空白帳本。\n\n確定：將目前裝置的交易、帳戶、分類上傳雲端。\n取消：暫不啟用同步，原本資料保留在這台裝置。');
    if(!upload){enabled=false;state('未啟用同步：目前仍為本機帳本。','warning');return;}
  }
  revision=0;enabled=true;pending=true;await flush();return;
}
revision=Number(record.revision);
const localBlob=JSON.stringify(local),remoteBlob=JSON.stringify(migrate(record.payload));
if(isMeaningful(local)&&localBlob!==remoteBlob){
  const useCloud=askChoice('這台裝置與雲端已有不同帳本。\n\n確定：下載並使用雲端資料（會先下載本機備份）。\n取消：先保留本機資料，不啟用同步。\n\n為安全起見，不會直接覆蓋已有的雲端帳本。');
  if(!useCloud){enabled=false;state('資料不同，未啟用同步。請先匯出本機備份再整理。','warning');return;}
  backupLocal();
}
replaceApp(record.payload);enabled=true;pending=false;state('✓ 已從雲端載入，跨裝置同步已啟用','success');
}
async function connectUser(sessionUser){
  user=sessionUser;enabled=false;pending=false;conflict=false;busy=false;
  showAuth(user);
  if(!user){state('本機模式：尚未登入，紀錄不會跨裝置同步。','warning');return}
  state('正在檢查雲端帳本…');
  try{const row=await loadRemote();await chooseInitial(row)}catch(e){enabled=false;state('雲端連線失敗：'+e.message,'error')}
}
function schedule(){if(!user||!enabled||conflict)return;pending=true;state('本機已保存 · 等待雲端同步…','warning');clearTimeout(timeout);timeout=setTimeout(()=>{void flush()},500)}
async function flush(){
 if(!user||!enabled||conflict||busy||!pending)return;
 busy=true;pending=false;const snapshot=JSON.stringify(data),baseRevision=revision;
 state('正在寫入雲端…','warning');
 try{
  const {data:res,error}=await api.rpc('save_ledger_document',{expected_revision:baseRevision,new_payload:JSON.parse(snapshot)});
  if(error)throw error;
  const output=Array.isArray(res)?res[0]:res;
  if(!output||!output.applied){
    conflict=true;enabled=false;
    state('同步衝突：另一台裝置已修改雲端帳本。本機資料仍保留，請先下載備份再重新載入。','error');return;
  }
  revision=Number(output.current_revision);
  if(JSON.stringify(data)!==snapshot){pending=true;state('已有新紀錄，繼續同步…','warning')}
  else state('✓ 已同步至私人雲端','success');
 }catch(e){pending=true;state('雲端儲存失敗，本機已保留。請檢查網路並按「重試同步」：'+e.message,'error')}
 finally{busy=false;if(pending&&enabled&&!conflict&&navigator.onLine){clearTimeout(timeout);timeout=setTimeout(()=>void flush(),1400)}}
}
function onChange(){if(!user||!enabled)return;schedule()}
window.ledgerCloudChanged=onChange;
$('cloudRetry').onclick=async()=>{if(!user)return state('請先登入','warning');if(conflict){backupLocal();const ok=confirm('已先下載本機備份。要重新讀取雲端資料嗎？本機未同步的修改將被雲端版本取代。');if(!ok)return;conflict=false;enabled=false;try{await chooseInitial(await loadRemote())}catch(e){state('下載失敗：'+e.message,'error')}return}if(!enabled){try{await chooseInitial(await loadRemote())}catch(e){state('重新連線失敗：'+e.message,'error')}return}pending=true;await flush()};
$('cloudBackup').onclick=backupLocal;
$('cloudSignOut').onclick=async()=>{if(pending){state('尚有未同步內容。請先重試同步或下載備份。','warning');backupLocal();return}const {error}=await api.auth.signOut();if(error)return state(error.message,'error');enabled=false;user=null;revision=0;showAuth(null);resetEntry();data=blank();safeLocalSave();renderAll();state('已登出。這台瀏覽器的雲端工作資料已隱藏，原始本機備份不會自動刪除。','warning')};
$('cloudSignIn').onclick=async()=>{const e=email.value.trim(),password=pw.value;if(!e||!password)return state('請輸入電子郵件與密碼。','warning');state('登入中…');const {error}=await api.auth.signInWithPassword({email:e,password});pw.value='';if(error)state('登入失敗：'+error.message,'error')};
$('cloudSignUp').onclick=async()=>{const e=email.value.trim(),password=pw.value;if(!e||password.length<8)return state('請填入電子郵件與至少 8 字元的密碼。','warning');state('正在建立帳號…');const {data:result,error}=await api.auth.signUp({email:e,password,options:{emailRedirectTo:WEBSITE}});pw.value='';if(error)return state('註冊失敗：'+error.message,'error');if(!result.session)state('註冊完成，請到電子郵件確認帳號，再返回網站登入。','warning');else state('註冊成功，正在載入帳本…','success')};
window.addEventListener('online',()=>{if(pending&&enabled&&!busy)void flush()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&pending&&enabled&&!busy)void flush()});
(async function boot(){
 if(!window.supabase?.createClient){state('雲端套件載入失敗。請檢查網路或停用阻擋套件的擴充功能。','error');return}
 api=window.supabase.createClient(ENDPOINT,PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},realtime:{params:{eventsPerSecond:1}}});
 const {data:sessionData,error}=await api.auth.getSession();if(error)state('驗證狀態讀取失敗：'+error.message,'error');
 await connectUser(sessionData?.session?.user||null);
 api.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session?.user?.id!==user?.id){setTimeout(()=>void connectUser(session.user),0)}if(event==='SIGNED_OUT'&&user){setTimeout(()=>void connectUser(null),0)}});
})();
})();
