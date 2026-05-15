import { useState, useEffect, useRef, useCallback } from "react";

// ── FONTS & STYLES ─────────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Syne:wght@700;800&display=swap";
  document.head.appendChild(l);
  const s = document.createElement("style");
  s.textContent = `*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{background:#f0faf4;font-family:'Plus Jakarta Sans',sans-serif}input,select,textarea{font-family:'Plus Jakarta Sans',sans-serif}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#86efac;border-radius:4px}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}@keyframes glow{0%,100%{box-shadow:0 0 20px #16a34a33}50%{box-shadow:0 0 36px #16a34a66}}@keyframes scanline{0%,100%{top:12%}50%{top:80%}}`;
  document.head.appendChild(s);
}

// ── PALETTE ────────────────────────────────────────────────────────────────
const C = {
  g900:"#14532d",g800:"#166534",g700:"#15803d",g600:"#16a34a",g500:"#22c55e",
  g400:"#4ade80",g300:"#86efac",g200:"#bbf7d0",g100:"#dcfce7",g50:"#f0faf4",
  white:"#fff",gr900:"#111827",gr700:"#374151",gr500:"#6b7280",gr300:"#d1d5db",
  red:"#ef4444",amber:"#f59e0b",blue:"#3b82f6",violet:"#7c3aed",indigo:"#6366f1",pink:"#ec4899",
};

const STATUS_CFG = {
  active:     {label:"Active",     color:"#16a34a",bg:"#dcfce7"},
  on_notice:  {label:"On Notice",  color:"#d97706",bg:"#fef3c7"},
  relieved:   {label:"Relieved",   color:"#6b7280",bg:"#f3f4f6"},
  terminated: {label:"Terminated", color:"#dc2626",bg:"#fee2e2"},
  absconded:  {label:"Absconded",  color:"#7c3aed",bg:"#ede9fe"},
  suspended:  {label:"Suspended",  color:"#ea580c",bg:"#ffedd5"},
};

const ROLE_CFG = {
  super_admin:  {label:"Super Admin",  color:C.g700},
  org_admin:    {label:"Org Admin",    color:C.violet},
  branch_admin: {label:"Branch Admin", color:C.amber},
  employee:     {label:"Employee",     color:C.blue},
};


// ── DEVICE FINGERPRINTING ─────────────────────────────────────
async function getDeviceFingerprint() {
  const signals = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.deviceMemory || 0,
    navigator.platform || "",
  ];
  // Canvas fingerprint
  try {
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("SmartAi3SL🔒", 2, 2);
    signals.push(cv.toDataURL().slice(-50));
  } catch(e) {}
  // Audio fingerprint
  try {
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const an = ac.createAnalyser();
    osc.connect(an);
    an.connect(ac.destination);
    osc.start(0);
    const data = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(data);
    signals.push(data[0].toFixed(3));
    osc.stop();
    ac.close();
  } catch(e) {}
  // Hash all signals
  const str = signals.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const fp = Math.abs(hash).toString(36) + str.length.toString(36);
  // Store in both localStorage and IndexedDB for cross-browser detection
  try { localStorage.setItem("saa_device_fp", fp); } catch(e) {}
  try {
    const req = indexedDB.open("saa_fp_db", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("fp", {keyPath:"k"});
    req.onsuccess = e => {
      const tx = e.target.result.transaction("fp","readwrite");
      tx.objectStore("fp").put({k:"device_fp", v:fp});
    };
  } catch(e) {}
  return fp;
}

async function getStoredFingerprint() {
  // Check localStorage first
  const lsFp = localStorage.getItem("saa_device_fp");
  if (lsFp) return lsFp;
  // Check IndexedDB
  return new Promise(resolve => {
    try {
      const req = indexedDB.open("saa_fp_db", 1);
      req.onsuccess = e => {
        try {
          const tx = e.target.result.transaction("fp","readonly");
          const getReq = tx.objectStore("fp").get("device_fp");
          getReq.onsuccess = () => resolve(getReq.result?.v || null);
          getReq.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

// ── API CLIENT ─────────────────────────────────────────────────────────────
const TOKEN_KEY = "saa_token";
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function api(method, path, body, params) {
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) { clearToken(); window.location.reload(); return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

const GET  = (path, params) => api("GET",   path, null, params);
const POST = (path, body)   => api("POST",  path, body);
const PATCH= (path, body)   => api("PATCH", path, body);
const DEL  = (path)         => api("DELETE", path);

// ── UTILS ──────────────────────────────────────────────────────────────────
const fmt   = n => `₹${Number(n).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
const today = () => new Date().toLocaleDateString("en-CA", {timeZone:"Asia/Kolkata"});
const nowT  = () => new Date().toLocaleTimeString("en-GB", {timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"});
const toM   = t => { if(!t) return 0; const str=String(t).slice(0,5); const[h,m]=str.split(":").map(Number); return h*60+m; };
const pad   = n => String(n).padStart(2,"0");
const fmtD  = ds => { const c=ds?String(ds).split("T")[0]:""; if(!c)return"—"; return new Date(c+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",weekday:"short"}); };
const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
const fmtDF = ds => { const c=ds?String(ds).split("T")[0]:""; if(!c)return"—"; return new Date(c+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}); };

function shiftMins(sh) { if(!sh)return 480; const s=toM(sh.start_time||sh.start),e=toM(sh.end_time||sh.end); return(e>s?e-s:1440-s+e)-(sh.break_mins||sh.breakMins||0); }
function lateM(scan, start) { let d=toM(scan)-toM(start); if(d<-720)d+=1440; return d; }
function geoDist(la1,ln1,la2,ln2) { const R=6371000,r=x=>x*Math.PI/180,dL=r(la2-la1),dN=r(ln2-ln1); const a=Math.sin(dL/2)**2+Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(dN/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }

// ── QR CANVAS ──────────────────────────────────────────────────────────────
function QRCanvas({data:qd, size=200}) {
  const ref = useRef(null);
  useEffect(() => {
    if(!ref.current) return;
    const cv=ref.current, ctx=cv.getContext("2d");
    cv.width=size; cv.height=size;
    let h=5381; for(let i=0;i<qd.length;i++) h=((h<<5)+h)^qd.charCodeAt(i); h=Math.abs(h);
    const M=29, cs=size/M;
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,size,size);
    const dm=(x,y)=>{ctx.fillStyle=C.g800;ctx.fillRect(x*cs,y*cs,7*cs,7*cs);ctx.fillStyle="#fff";ctx.fillRect((x+1)*cs,(y+1)*cs,5*cs,5*cs);ctx.fillStyle=C.g600;ctx.fillRect((x+2)*cs,(y+2)*cs,3*cs,3*cs);};
    dm(0,0); dm(M-7,0); dm(0,M-7);
    for(let r=0;r<M;r++) for(let c=0;c<M;c++) {
      const iM=(r<8&&c<8)||(r<8&&c>=M-8)||(r>=M-8&&c<8);
      if(!iM){const b=(h>>((r*M+c)%29))&1,b2=((h*31^(r*17+c*7))>>((r+c)%19))&1;if(b||b2){ctx.fillStyle=C.g700;ctx.fillRect(c*cs+.5,r*cs+.5,cs-1,cs-1);}}
    }
    ctx.fillStyle="#fff"; ctx.fillRect(size/2-16,size/2-16,32,32);
    ctx.fillStyle=C.g600; ctx.font=`bold ${Math.floor(cs*1.6)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("📍",size/2,size/2+1);
  },[qd,size]);
  return <canvas ref={ref} style={{borderRadius:10,display:"block"}}/>;
}

// ── QR SCANNER ─────────────────────────────────────────────────────────────
function QRScanner({onScan, onClose, branches}) {
  const vRef=useRef(null);
  const [err,setErr]=useState(null);
  const [streaming,setStreaming]=useState(false);
  const [selBranch,setSelBranch]=useState(branches[0]?.id||"");
  useEffect(()=>{
    let st;
    navigator.mediaDevices?.getUserMedia({video:{facingMode:"environment"}})
      .then(s=>{st=s;if(vRef.current)vRef.current.srcObject=s;setStreaming(true);})
      .catch(()=>setErr("Camera unavailable"));
    return ()=>st?.getTracks().forEach(t=>t.stop());
  },[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999}}>
      <div style={{background:C.white,borderRadius:"28px 28px 0 0",padding:24,width:"100%",maxWidth:480,animation:"slideUp .3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h3 style={{fontSize:18,fontWeight:800,color:C.g800}}>Mark Attendance</h3>
            <p style={{color:C.gr500,fontSize:12}}>Scan QR or select your branch below</p>
          </div>
          <button onClick={onClose} style={S.iconBtn}>✕</button>
        </div>
        <div style={{background:"#000",borderRadius:18,height:130,position:"relative",overflow:"hidden",marginBottom:14}}>
          <video ref={vRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:14,border:`2px solid ${C.g500}`,borderRadius:10}}/>
          {streaming&&<div style={{position:"absolute",left:14,right:14,height:2,background:`linear-gradient(90deg,transparent,${C.g500},transparent)`,top:"40%",animation:"scanline 2s ease-in-out infinite"}}/>}
        </div>
        {err&&(
          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:12,padding:12,marginBottom:8}}>
            <p style={{color:"#92400e",fontWeight:700,fontSize:13}}>⚠ {err}</p>
            <p style={{color:"#78350f",fontSize:12,marginTop:4}}>Camera not available — select your branch below and tap Mark Attendance directly. Your location will still be verified.</p>
          </div>
        )}
        <p style={{color:C.g700,fontSize:13,fontWeight:700,marginBottom:8}}>Select your branch:</p>
        <select style={{...S.select,marginBottom:10}} value={selBranch} onChange={e=>setSelBranch(e.target.value)}>
          <option value="">— Select branch —</option>
          {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={()=>{if(!selBranch){setErr("Select a branch first");return;}onScan({branchId:selBranch,token:"SMARTAI_V4",app:"3SL"});}}
          disabled={!selBranch}
          style={{...S.btn,opacity:selBranch?1:0.5}}>
          📍 Mark at {branches.find(b=>b.id===selBranch)?.name||"Branch"}
        </button>
        <p style={{color:C.gr500,fontSize:11,textAlign:"center",marginTop:8}}>Your location will be verified automatically</p>
      </div>
    </div>
  );
}

// ── LOADING & ERROR ────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{display:"flex",justifyContent:"center",padding:60}}><div style={{width:32,height:32,border:`3px solid ${C.g100}`,borderTopColor:C.g600,borderRadius:"50%",animation:"spin .7s linear infinite"}}/></div>;
}
function Err({msg,onRetry}) {
  return <div style={{padding:40,textAlign:"center"}}><p style={{fontSize:36,marginBottom:12}}>⚠️</p><p style={{color:C.red,fontSize:15,marginBottom:16}}>{msg}</p>{onRetry&&<button style={{...S.btn,width:"auto",padding:"10px 24px"}} onClick={onRetry}>Retry</button>}</div>;
}
function Empty({icon,msg}) {
  return <div style={{textAlign:"center",padding:"50px 20px"}}><p style={{fontSize:42,marginBottom:12}}>{icon}</p><p style={{color:C.gr500,fontSize:15}}>{msg}</p></div>;
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { const u=localStorage.getItem("saa_user"); return u?JSON.parse(u):null; } catch { return null; }
  });
  const [page, setPage] = useState("home");
  const [toast, setToast] = useState(null);
  const [activeOrgId, setActiveOrgId] = useState(null);

  const notify = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const login = (u, token) => {
    setToken(token);
    localStorage.setItem("saa_user", JSON.stringify(u));
    setUser(u);
    setActiveOrgId(u.org_id);
    if(u.role==="super_admin") setPage("sa_orgs");
    else if(u.role==="employee") setPage("home");
    else setPage("adm_home");
    // Register push notifications
    registerPush(u.id);
  };

  const logout = () => {
    clearToken();
    localStorage.removeItem("saa_user");
    setUser(null); setPage("home");
  };

  if(!user || !getToken()) return <LoginScreen onLogin={login}/>;

  return(
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.g50,minHeight:"100vh"}}>
      {toast && <Toast {...toast}/>}
      {user.role==="employee"
        ? <EmpApp user={user} notify={notify} page={page} setPage={setPage} onLogout={logout}/>
        : <AdminApp user={user} notify={notify} page={page} setPage={setPage} activeOrgId={activeOrgId} setActiveOrgId={setActiveOrgId} onLogout={logout}/>}
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}) {
  const [ph,setPh]=useState(""), [pw,setPw]=useState(""), [err,setErr]=useState(""), [loading,setLoading]=useState(false);
  const go = async () => {
    setLoading(true); setErr("");
    try {
      const res = await POST("/api/auth/login", {phone:ph, password:pw});
      onLogin(res.user, res.token);
    } catch(e) { setErr(e.message); setLoading(false); }
  };
  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${C.g900},${C.g700} 60%,${C.g500})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400,animation:"fadeUp .5s ease"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:72,height:72,background:"rgba(255,255,255,0.14)",borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.18)"}}>
            <span style={{fontSize:36}}>📍</span>
          </div>
          <h1 style={{color:C.white,fontSize:26,fontWeight:900,fontFamily:"'Syne',sans-serif",letterSpacing:"-0.5px",margin:"0 0 4px"}}>SmartAi Attendance</h1>
          <p style={{color:"rgba(255,255,255,0.55)",fontSize:12,fontWeight:600,letterSpacing:0.5}}>by 3SL Media Labs</p>
        </div>
        <div style={{background:C.white,borderRadius:26,padding:28,boxShadow:"0 28px 72px rgba(0,0,0,0.22)"}}>
          <h2 style={{color:C.g800,fontSize:20,fontWeight:800,marginBottom:18}}>Sign in</h2>
          <label style={S.label}>Phone number</label>
          <input style={S.input} type="tel" placeholder="9876543210" value={ph} onChange={e=>setPh(e.target.value)}/>
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
          {err&&<p style={{color:C.red,fontSize:13,marginBottom:8}}>⚠ {err}</p>}
          <button style={S.btn} onClick={go} disabled={loading}>
            {loading?<span style={{display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>:"Sign In →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EMPLOYEE APP ───────────────────────────────────────────────────────────
function EmpApp({user, notify, page, setPage, onLogout}) {
  const [branches, setBranches] = useState([]);
  const [todayAtt, setTodayAtt] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [br, att] = await Promise.all([
        GET("/api/branches"),
        GET("/api/attendance", {date: today(), employee_id: user.id}),
      ]);
      setBranches(br||[]);
      const cin = (att||[]).find(r=>r.type==="checkin");
      const cout = (att||[]).find(r=>r.type==="checkout");
      setTodayAtt({cin, cout});
    } catch(e) { notify(e.message,"error"); }
    finally { setLoading(false); }
  },[user.id]);

  useEffect(()=>{ load(); },[load]);

  const handleScan = (qd) => {
    setShowScanner(false);
    const scBr = branches.find(b=>b.id===qd.branchId);
    if(!scBr) { notify("Branch not found", "error"); return; }
    if(todayAtt?.cin && todayAtt?.cout) { notify("Already done for today", "error"); return; }
    notify("📍 Checking your location…", "info");
    if(navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dist = geoDist(pos.coords.latitude,pos.coords.longitude,scBr.lat,scBr.lng);
          if(dist > (scBr.radius || 200)) {
            notify(`❌ You are ${Math.round(dist)}m away. Must be within ${scBr.radius||200}m of ${scBr.name}`, "error");
            return;
          }
          processAtt(qd.branchId, pos.coords);
        },
        (geoErr) => {
          const msg = geoErr.code===1
            ? "⚠ Location permission denied — marking without geo verification"
            : "⚠ GPS unavailable — marking without geo verification";
          notify(msg, "warn");
          processAtt(qd.branchId, null);
        },
        {timeout:10000, enableHighAccuracy:true, maximumAge:0}
      );
    } else {
      notify("⚠ GPS not supported — marking anyway", "warn");
      processAtt(qd.branchId, null);
    }
  }

  const processAtt = async (branchId, coords) => {
    try {
      if(!todayAtt?.cin) {
        // Generate and send device fingerprint with check-in
        const fp = await getDeviceFingerprint();
        const res = await POST("/api/attendance/checkin", {branch_id:branchId, geo_lat:coords?.latitude, geo_lng:coords?.longitude, geo_verified:!!coords, device_fp:fp});
        if(res.blocked) { notify(res.error, "error"); return; }
        if(res.needsApproval) notify(`${res.lateMins}m late — approval sent ⏳`,"warn");
        else if(res.isLate) notify(`Checked in ${res.lateMins}m late ⚠`,"warn");
        else notify(`✅ Checked in at ${nowT()}`);
      } else {
        const res = await POST("/api/attendance/checkout", {geo_lat:coords?.latitude, geo_lng:coords?.longitude, geo_verified:!!coords});
        const h=Math.floor((res.worked_mins||0)/60), m=(res.worked_mins||0)%60;
        notify(`✅ Checked out — ${h}h ${m}m`);
      }
      load();
    } catch(e) { notify(e.message,"error"); }
  };

  const myBranch = branches.find(b=>b.id===user.branch_id);
  const myBranches = branches.filter(b=>b.org_id===user.org_id);

  const empNav=[{k:"home",i:"🏠",l:"Home"},{k:"shifts",i:"📅",l:"Shifts"},{k:"history",i:"📋",l:"History"},{k:"salary",i:"💰",l:"Salary"},{k:"advances",i:"💳",l:"Advance"},{k:"calendar",i:"📅",l:"Calendar"},{k:"profile",i:"👤",l:"Profile"}];
  const pages={
    home: <EmpHome user={user} branch={myBranch} todayAtt={todayAtt} loading={loading} onScan={()=>setShowScanner(true)}/>,
    shifts: <EmpShifts user={user} notify={notify}/>,
    history: <EmpHistory user={user} notify={notify}/>,
    salary: <EmpSalary user={user} notify={notify}/>,
    profile: <EmpProfile user={user} notify={notify}/>,
    advances: <EmpAdvances user={user} notify={notify}/>,
    calendar: <AttendanceCalendar user={user} notify={notify} isAdmin={false} activeOrgId={user.org_id}/>,
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:480,margin:"0 auto",background:C.g50}}>
      {showScanner&&<QRScanner onScan={handleScan} onClose={()=>setShowScanner(false)} branches={myBranches}/>}
      <TopBar user={user} onLogout={onLogout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{pages[page]||pages.home}</div>
      <BottomNav items={empNav} page={page} setPage={setPage}/>
    </div>
  );
}

function EmpHome({user, branch, todayAtt, loading, onScan}) {
  const sc = STATUS_CFG[user.status||"active"]||STATUS_CFG.active;
  const cin = todayAtt?.cin, cout = todayAtt?.cout;
  const status = !cin?"out":!cout?"in":"done";
  const [stats, setStats] = useState(null);

  useEffect(()=>{
    const {from,to} = monthRange();
    GET("/api/salary-report",{year:new Date().getFullYear(),month:new Date().getMonth()+1})
      .then(r=>{ const me=r.report?.find(e=>e.id===user.id); if(me)setStats(me); })
      .catch(()=>{});
  },[user.id]);

  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:18,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,background:"rgba(255,255,255,0.07)",borderRadius:"50%"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
            <h2 style={{color:C.white,fontSize:22,fontWeight:800,margin:"4px 0 2px"}}>Hi, {user.name?.split(" ")[0]} 👋</h2>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{user.designation} · {branch?.name||user.branch_name}</p>
          </div>
          <span style={{background:sc.bg,color:sc.color,fontSize:11,padding:"4px 10px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["Check In",cin?.check_in_time,"▶",C.g600,cin?.is_late?`${cin.late_mins}m late`:"On time"],
          ["Check Out",cout?.check_out_time,"⏹",C.indigo,"—"]].map(([l,t,ic,c,sub])=>(
          <div key={l} style={{background:C.white,borderRadius:16,padding:14,boxShadow:`0 2px 8px ${C.g300}33`}}>
            <p style={{color:C.gr500,fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{color:t?c:C.gr300,fontSize:22,fontWeight:900,margin:"4px 0"}}>{t?t.slice(0,5):"—"}</p>
            <p style={{color:C.gr500,fontSize:11}}>{sub}</p>
          </div>
        ))}
      </div>

      {todayAtt?.cin&&!todayAtt?.cout&&<WorkingClock cinTime={todayAtt.cin.check_in_time}/>}
            {isMobile()
        ? <button onClick={onScan} disabled={status==="done"||loading}
        style={{width:"100%",background:status==="done"?C.gr300:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:20,padding:"20px",cursor:status==="done"?"not-allowed":"pointer",color:C.white,display:"flex",flexDirection:"column",alignItems:"center",gap:6,animation:status!=="done"?"glow 3s infinite":"none",marginBottom:18}}>
        <span style={{fontSize:32}}>📷</span>
        <span style={{fontSize:16,fontWeight:800}}>{status==="out"?"Scan to Check In — Shift 1":status==="in"?"Scan to Check Out":status==="between"?"Scan to Check In — Shift 2":"Day Complete ✓"}</span>
        <span style={{fontSize:12,opacity:0.75}}>Geo-fenced · Tap to mark attendance</span>
      </button>
        : (status!=="done"&&<div style={{background:"#f0faf4",border:"1.5px dashed #86efac",borderRadius:18,padding:"20px",textAlign:"center",marginBottom:18}}>
            <p style={{fontSize:24,marginBottom:6}}>💻</p>
            <p style={{color:"#15803d",fontWeight:700,fontSize:14}}>Use your mobile phone</p>
            <p style={{color:"#6b7280",fontSize:12}}>Attendance can only be marked from a mobile device</p>
          </div>)
      }

      {stats&&(
        <div style={{background:C.white,borderRadius:20,padding:18,boxShadow:`0 2px 12px ${C.g300}44`}}>
          <p style={{color:C.gr500,fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4}}>This month</p>
          <p style={{color:C.g700,fontSize:28,fontWeight:900,margin:"4px 0"}}>{fmt(stats.netEarned||0)}</p>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{color:C.gr500,fontSize:13}}>Present: {stats.presentDays} days</span>
            <span style={{color:C.red,fontSize:13}}>Deductions: -{fmt(stats.totalDeductions||0)}</span>
          </div>
          <div style={{background:C.g100,borderRadius:8,height:6,marginTop:10}}>
            <div style={{background:`linear-gradient(90deg,${C.g600},${C.g400})`,height:6,borderRadius:8,width:`${Math.min(100,((stats.netEarned||0)/(user.salary||1))*100)}%`}}/>
          </div>
        </div>
      )}
    </div>
  );
}

function EmpShifts({user, notify}) {
  const [schedules, setSchedules] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [defaultShift, setDefaultShift] = useState(null);
  const [reqDate,setReqDate]=useState(""), [reqShift,setReqShift]=useState(""), [reqNote,setReqNote]=useState("");

  const load = async () => {
    try {
      const now = new Date();
      const from = new Date(); from.setDate(from.getDate()-2);
      const to = new Date(); to.setDate(to.getDate()+14);
      const [sc,sh,rq,shiftInfo] = await Promise.all([
        GET("/api/schedules",{from:from.toISOString().split("T")[0],to:to.toISOString().split("T")[0],employee_id:user.id}),
        GET("/api/shifts"),
        GET("/api/shift-requests"),
        GET("/api/my-shift-info"),
      ]);
      setSchedules(sc||[]); setShifts(sh||[]); setRequests(rq||[]);
      // Store org/employee default shift for fallback display
      if(shiftInfo?.emp_shift_id||shiftInfo?.org_shift_id) {
        const defaultSh = shiftInfo.emp_shift_id
          ? {id:shiftInfo.emp_shift_id,name:shiftInfo.emp_shift_name,start_time:shiftInfo.emp_start,end_time:shiftInfo.emp_end,color:"#3b82f6",source:"employee"}
          : {id:shiftInfo.org_shift_id,name:shiftInfo.org_shift_name,start_time:shiftInfo.org_start,end_time:shiftInfo.org_end,color:"#16a34a",source:"org"};
        setDefaultShift(defaultSh);
      }
    } catch(e){notify(e.message,"error");}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const submitReq = async () => {
    if(!reqDate||!reqShift){notify("Select date and shift","error");return;}
    try {
      await POST("/api/shift-requests",{requested_shift_id:reqShift,date:reqDate,note:reqNote,manager_id:user.manager_id});
      notify("Request sent ✓"); setReqDate(""); setReqShift(""); setReqNote(""); load();
    } catch(e){notify(e.message,"error");}
  };

  const days=[]; for(let i=-2;i<=13;i++){const d=new Date();d.setDate(d.getDate()+i);days.push(d.toISOString().split("T")[0]);}
  const pending=requests.filter(r=>r.status==="pending");

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>My Shifts</h2>
      <TabBar tabs={[["upcoming","📅 Schedule"],["request","🔄 Request"]]} active={tab} onChange={setTab}/>
      {tab==="upcoming"&&(
        <div>
          {pending.length>0&&<div style={{background:"#fffbeb",borderRadius:14,padding:14,marginBottom:14,border:`1px solid #fcd34d`}}><p style={{color:"#d97706",fontWeight:700,fontSize:13}}>⏳ {pending.length} pending request(s)</p></div>}
          {days.map(ds=>{
            const sc=schedules.find(s=>s.date===ds&&s.is_override)||schedules.find(s=>s.date===ds&&!s.is_override);
            // Fallback to employee default shift if no schedule assigned
            const defShift=!sc?defaultShift:null;
            const shiftInfo=sc||defShift;
            const isToday=ds===today();
            return(
              <div key={ds} style={{background:isToday?`linear-gradient(135deg,${C.g800},${C.g700})`:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:`0 2px 8px ${C.g300}${isToday?"66":"22"}`,borderLeft:`4px solid ${shiftInfo?shiftInfo.color||C.g500:C.gr300}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div>
                    <p style={{color:isToday?C.white:C.gr900,fontWeight:800,fontSize:15}}>{fmtD(ds)} {isToday&&"· TODAY"}</p>
                    <p style={{color:isToday?"rgba(255,255,255,0.7)":C.gr500,fontSize:13}}>
                      {shiftInfo
                        ?`${shiftInfo.shift_name||shiftInfo.name||"Shift"} · ${String(shiftInfo.start_time||"").slice(0,5)}–${String(shiftInfo.end_time||"").slice(0,5)}`
                        :"No shift assigned — contact admin"}
                    </p>
                    {sc?.is_override&&<span style={{background:"#fef3c7",color:"#d97706",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>OVERRIDE</span>}
                    {defShift&&!sc&&<span style={{background:C.g100,color:C.g600,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>Default shift</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="request"&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,fontSize:15,marginBottom:14}}>Request shift change</p>
          <label style={S.label}>Date</label>
          <input style={S.input} type="date" value={reqDate} min={today()} onChange={e=>setReqDate(e.target.value)}/>
          <label style={S.label}>Requested shift</label>
          <select style={S.select} value={reqShift} onChange={e=>setReqShift(e.target.value)}>
            <option value="">Select shift</option>
            {shifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</option>)}
          </select>
          <label style={S.label}>Reason</label>
          <input style={S.input} placeholder="Optional note" value={reqNote} onChange={e=>setReqNote(e.target.value)}/>
          <button style={S.btn} onClick={submitReq}>Send request</button>
        </div>
      )}
    </div>
  );
}

function EmpHistory({user, notify}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const {from,to} = monthRange();
  useEffect(()=>{
    GET("/api/attendance",{from,to,employee_id:user.id})
      .then(r=>setRecords(r||[]))
      .catch(e=>notify(e.message,"error"))
      .finally(()=>setLoading(false));
  },[]);
  const grouped = records.reduce((a,r)=>{ const dk=r.date?String(r.date).split("T")[0]:null; if(!dk)return a; (a[dk]=a[dk]||[]).push({...r,date:dk}); return a; },{});
  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Attendance History</h2>
      {Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([ds,recs])=>{
        const rec=recs[0]; const cin=rec?.check_in_time?{...rec,check_in_time:String(rec.check_in_time).slice(0,5)}:null; const cout=rec?.check_out_time?String(rec.check_out_time).slice(0,5):null;
        const worked=rec?.worked_mins;
        return(
          <div key={ds} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`,borderLeft:`4px solid ${cin?.is_late?C.amber:C.g500}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontWeight:800,color:C.gr900}}>{fmtD(ds)}</span>
              <div style={{display:"flex",gap:6}}>
                {cin?.shift_name&&<span style={{background:C.g100,color:C.g700,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{cin.shift_name}</span>}
                {cin?.is_late&&<span style={{background:"#fffbeb",color:C.amber,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{cin.late_mins}m LATE</span>}
                {cin?.admin_edited&&<span style={{background:"#ede9fe",color:C.violet,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>EDITED</span>}
                {cin?.is_auto_checkout&&<span style={{background:"#fef3c7",color:"#d97706",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>🤖 AUTO</span>}
                {cin?.is_early_checkout&&!cin?.early_penalty_waived&&<span style={{background:"#fee2e2",color:C.red,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>⚡ EARLY -{cin.early_mins}m</span>}
                {cin?.is_early_checkout&&cin?.early_penalty_waived&&<span style={{background:"#dcfce7",color:"#16a34a",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>✅ WAIVED</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <span style={{color:C.g600,fontSize:14,fontWeight:600}}>▶ {cin?.check_in_time||"—"}</span>
              <span style={{color:C.gr500,fontSize:14}}>⏹ {cout||"—"}</span>
              {worked!=null&&<span style={{color:C.gr500,fontSize:13}}>⏱ {Math.floor(worked/60)}h {worked%60}m</span>}
            </div>
            {cin?.branch_name&&<p style={{color:C.gr500,fontSize:12,marginTop:5}}>📍 {cin.branch_name}</p>}
          </div>
        );
      })}
      {Object.keys(grouped).length===0&&<Empty icon="📋" msg="No attendance this month"/>}
    </div>
  );
}

function EmpSalary({user, notify}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  useEffect(()=>{
    GET("/api/my-salary",{year:now.getFullYear(),month:now.getMonth()+1})
      .then(r=>setReport(r))
      .catch(e=>notify(e.message,"error"))
      .finally(()=>setLoading(false));
  },[]);
  if(loading) return <Spinner/>;
  if(!report) return <Empty icon="💰" msg="No salary data yet"/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Salary Dashboard</h2>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:20}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{now.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</p>
        <p style={{color:C.white,fontSize:36,fontWeight:900,margin:"6px 0 2px"}}>{fmt(report.netEarned||0)}</p>
        <p style={{color:"rgba(255,255,255,0.55)",fontSize:13}}>of {fmt(report?.salary||user.salary||0)}/month</p>
        <div style={{background:"rgba(255,255,255,0.15)",borderRadius:8,height:7,marginTop:14}}>
          <div style={{background:C.g300,height:7,borderRadius:8,width:`${Math.min(100,((report.netEarned||0)/(user.salary||1))*100)}%`}}/>
        </div>
      </div>
      {[["Days Present",report.presentDays],["Gross Earned",fmt(report.earnedGross||0)],["Late Deductions",`-${fmt(report.lateDeductions||0)}`],["CL used/allowed",`${report.clUsed||0}/${report.clAllowed||0}`],["SL used/allowed",`${report.slUsed||0}/${report.slAllowed||0}`],["Leave Deductions",`-${fmt(report.leaveDeductions||0)}`],["No-Show",`-${fmt(report.noShowDeductions||0)}`],["Early Checkout",`-${fmt(report.earlyDeductions||0)}`],["Advance Recovery",`-${fmt(report.advanceDeduction||0)}`],["Net Earned",fmt(report.netEarned||0)]].map(([l,v])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.g50}`}}>
          <span style={{color:C.gr500,fontSize:14}}>{l}</span>
          <span style={{color:C.gr900,fontWeight:700,fontSize:14}}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function EmpProfile({user, notify}) {
  const [history, setHistory] = useState([]);
  useEffect(()=>{
    GET("/api/status-history",{employee_id:user.id}).then(r=>setHistory(r||[])).catch(()=>{});
  },[user.id]);
  const sc=STATUS_CFG[user.status||"active"]||STATUS_CFG.active;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>My Profile</h2>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:16}}>
        <div style={{width:60,height:60,background:"rgba(255,255,255,0.2)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:14}}>👤</div>
        <h3 style={{color:C.white,fontSize:20,fontWeight:800}}>{user.name}</h3>
        <p style={{color:"rgba(255,255,255,0.7)",fontSize:14}}>{user.designation}</p>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <span style={{background:sc.bg,color:sc.color,fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
          <span style={{background:"rgba(255,255,255,0.15)",color:C.white,fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{ROLE_CFG[user.role]?.label}</span>
        </div>
      </div>
      <div style={{background:C.white,borderRadius:20,padding:20,marginBottom:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
        {[["📱 Phone",user.phone],["🏢 Branch",user.branch_name],["🏛 Organization",user.org_name],["📅 Joined",user.date_of_joining?fmtDF(user.date_of_joining):"—"]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.g50}`}}>
            <span style={{color:C.gr500,fontSize:14}}>{l}</span>
            <span style={{color:C.gr900,fontWeight:600,fontSize:14}}>{v||"—"}</span>
          </div>
        ))}
      </div>
      <div style={{background:C.white,borderRadius:20,padding:20,marginTop:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
        <p style={{color:C.g800,fontWeight:800,fontSize:15,marginBottom:14}}>🔑 Change Password</p>
        <ChangePasswordBox notify={notify}/>
      </div>
    </div>
  );
}

// ── ADMIN APP ──────────────────────────────────────────────────────────────
function AdminApp({user, notify, page, setPage, activeOrgId, setActiveOrgId, onLogout}) {
  const isSA=user.role==="super_admin", isOA=user.role==="org_admin", isBA=user.role==="branch_admin";
  const [personalMode, setPersonalMode] = useState(false);
    const nav=[
    ...(isSA?[{k:"sa_orgs",i:"🏢",l:"Orgs"}]:[]),
    {k:"adm_home",i:"🏠",l:"Home"},
    {k:"adm_staff",i:"👥",l:"Staff"},
    {k:"adm_shifts",i:"📅",l:"Shifts"},
    {k:"adm_override",i:"⚡",l:"Override"},
    {k:"adm_approvals",i:"✅",l:"Approvals"},
    {k:"adm_qr",i:"📷",l:"QR"},
    ...(isSA||isOA?[{k:"adm_reports",i:"📊",l:"Reports"}]:[]),
    {k:"adm_settings",i:"⚙️",l:"Settings"},
    {k:"adm_att_table",i:"📊",l:"Att."},
    {k:"adm_leave_hist",i:"📝",l:"Leaves"},
    {k:"adm_daily",i:"🟢",l:"Daily"},
    ...(isSA||isOA?[{k:"adm_advances",i:"💳",l:"Advances"}]:[]),
    {k:"adm_calendar",i:"🗓",l:"Calendar"},
    {k:"adm_hierarchy",i:"🏛",l:"Hierarchy"},
  ];
  const pages={
    sa_orgs: <SuperAdminOrgs notify={notify} setActiveOrgId={setActiveOrgId} setPage={setPage} activeOrgId={activeOrgId}/>,
    adm_home: <AdminHome user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_staff: <AdminStaff user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_shifts: <AdminShifts user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_override: <AdminOverride user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_approvals: <AdminApprovals user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_qr: <AdminQR notify={notify} activeOrgId={activeOrgId}/>,
    adm_reports: <AdminReports user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_edit: <AdminEditAtt user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_settings: <AdminSettings user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_att_table: <AdminAttendanceTable user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_leave_hist: <AdminLeaveHistory user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_daily: <AdminDailyBoard notify={notify} activeOrgId={activeOrgId}/>,
    adm_advances: <AdminAdvances user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_calendar: <AttendanceCalendar user={user} notify={notify} isAdmin={true} activeOrgId={activeOrgId}/>,
    adm_hierarchy: <HierarchyTable user={user} notify={notify} activeOrgId={activeOrgId}/>,
  };
  const isDesktop = (isSA||isOA||isBA) && window.innerWidth >= 1024;

  if(isDesktop) {
    return(
      <div style={{display:"flex",height:"100vh",background:C.g50,overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:window.innerWidth>=1280?220:64,minWidth:window.innerWidth>=1280?220:64,background:"#fff",borderRight:`1px solid ${C.g100}`,display:"flex",flexDirection:"column",height:"100vh",position:"fixed",left:0,top:0,zIndex:20,transition:"width .2s"}}>
          {/* Logo */}
          <div style={{padding:"18px 16px 12px",borderBottom:`1px solid ${C.g100}`}}>
            {window.innerWidth>=1280
              ? <><p style={{color:C.g800,fontWeight:900,fontSize:15,lineHeight:1.2}}>SmartAi Attendance</p><p style={{color:C.gr500,fontSize:11}}>by 3SL Media Labs</p></>
              : <span style={{fontSize:22}}>📍</span>}
          </div>
          {/* BA toggle */}
          {isBA&&(
            <div style={{padding:"10px 10px 0"}}>
              <button onClick={()=>setPersonalMode(!personalMode)}
                style={{width:"100%",background:personalMode?C.g600:C.g100,border:"none",borderRadius:10,padding:"8px 6px",cursor:"pointer",color:personalMode?C.white:C.gr500,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6,justifyContent:window.innerWidth>=1280?"flex-start":"center"}}>
                <span>{personalMode?"👤":"🏢"}</span>
                {window.innerWidth>=1280&&<span>{personalMode?"My Attendance":"Admin Panel"}</span>}
              </button>
            </div>
          )}
          {/* Nav items */}
          <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            {nav.map(item=>(
              <button key={item.k} onClick={()=>setPage(item.k)}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:window.innerWidth>=1280?"10px 16px":"10px 0",justifyContent:window.innerWidth>=1280?"flex-start":"center",background:page===item.k?C.g50:"transparent",border:"none",borderLeft:page===item.k?`3px solid ${C.g600}`:"3px solid transparent",cursor:"pointer",color:page===item.k?C.g700:C.gr500,fontWeight:page===item.k?700:400,fontSize:13}}>
                <span style={{fontSize:18,minWidth:24,textAlign:"center"}}>{item.i}</span>
                {window.innerWidth>=1280&&<span>{item.l}</span>}
              </button>
            ))}
          </div>
          {/* User + logout */}
          <div style={{padding:"12px 16px",borderTop:`1px solid ${C.g100}`,display:"flex",alignItems:"center",gap:8}}>
            {window.innerWidth>=1280&&(
              <div style={{flex:1,minWidth:0}}>
                <p style={{color:C.g800,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</p>
                <p style={{color:C.gr500,fontSize:11}}>{ROLE_CFG[user.role]?.label}</p>
              </div>
            )}
            <NotificationBell user={user}/>
            <button onClick={onLogout} style={{background:C.g100,border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:C.g700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>↩</button>
          </div>
        </div>
        {/* Main content */}
        <div style={{marginLeft:window.innerWidth>=1280?220:64,flex:1,overflowY:"auto",height:"100vh"}}>
          {personalMode&&isBA
            ? <BranchAdminPersonalView user={user} notify={notify} page={page} setPage={setPage}/>
            : pages[page]||pages.adm_home
          }
        </div>
      </div>
    );
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:480,margin:"0 auto",background:C.g50}}>
      <TopBar user={user} onLogout={onLogout} orgId={activeOrgId}/>
      {isBA&&(
        <div style={{background:C.white,padding:"8px 20px",borderBottom:`1px solid ${C.g100}`,display:"flex",gap:8}}>
          <button onClick={()=>setPersonalMode(false)}
            style={{flex:1,background:!personalMode?C.g600:C.g100,border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:!personalMode?C.white:C.gr500,fontWeight:700,fontSize:13}}>
            🏢 Admin Panel
          </button>
          <button onClick={()=>setPersonalMode(true)}
            style={{flex:1,background:personalMode?C.g600:C.g100,border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:personalMode?C.white:C.gr500,fontWeight:700,fontSize:13}}>
            👤 My Attendance
          </button>
        </div>
      )}
      {personalMode&&isBA
        ? <BranchAdminPersonalView user={user} notify={notify} page={page} setPage={setPage}/>
        : <>
            <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{pages[page]||pages.adm_home}</div>
            <BottomNav items={nav} page={page} setPage={setPage}/>
          </>
      }
    </div>
  );
}

function SuperAdminOrgs({notify, setActiveOrgId, setPage, activeOrgId}) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({name:"",code:"",plan:"basic"});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const load = async () => { try { setOrgs(await GET("/api/orgs")||[]); } catch(e){notify(e.message,"error");} finally{setLoading(false);} };
  useEffect(()=>{load();},[]);

  const create = async () => {
    if(!form.name||!form.code){notify("Name and code required","error");return;}
    try { await POST("/api/orgs",form); notify("Organization created ✓"); setShowAdd(false); setForm({name:"",code:"",plan:"basic"}); load(); }
    catch(e){notify(e.message,"error");}
  };

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:20}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Super Admin</p>
        <h2 style={{color:C.white,fontSize:20,fontWeight:800,margin:"4px 0"}}>All Organizations</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{orgs.length} organizations</p>
      </div>
      {orgs.map((org,i)=>{
        const isActive=org.id===activeOrgId;
        const colors=[C.g600,C.violet,C.blue,C.pink,"#14b8a6"];
        const accent=colors[i%colors.length];
        return(
          <div key={org.id} style={{background:C.white,borderRadius:20,padding:20,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${accent}`,outline:isActive?`2px solid ${accent}`:"none",outlineOffset:2}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:44,height:44,background:`${accent}18`,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:accent,fontSize:16}}>{org.code?.slice(0,2)}</div>
                <div>
                  <p style={{color:C.gr900,fontWeight:800,fontSize:16}}>{org.name}</p>
                  <p style={{color:C.gr500,fontSize:12}}>{org.code} · {org.plan} · {org.employee_count||0} employees</p>
                </div>
              </div>
              {isActive&&<span style={{background:`${accent}18`,color:accent,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>ACTIVE</span>}
            </div>
            <button style={{...S.btn,background:isActive?accent:`linear-gradient(135deg,${C.g700},${C.g500})`}} onClick={()=>{setActiveOrgId(org.id);setPage("adm_home");notify(`Switched to ${org.name}`);}}>
              {isActive?"✓ Currently managing":"Switch to this org"}
            </button>
          </div>
        );
      })}
      {!showAdd?(
        <button onClick={()=>setShowAdd(true)} style={{...S.btn,background:"transparent",border:`2px dashed ${C.g300}`,color:C.g700,padding:18}}>+ Add new organization</button>
      ):(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,fontSize:15,marginBottom:14}}>New organization</p>
          <label style={S.label}>Name</label><input style={S.input} placeholder="Company name" value={form.name} onChange={e=>f("name",e.target.value)}/>
          <label style={S.label}>Code</label><input style={S.input} placeholder="e.g. ACME" maxLength={6} value={form.code} onChange={e=>f("code",e.target.value.toUpperCase())}/>
          <label style={S.label}>Plan</label>
          <select style={S.select} value={form.plan} onChange={e=>f("plan",e.target.value)}>
            <option value="basic">Basic</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option>
          </select>
          <div style={{display:"flex",gap:10}}>
            <button style={{...S.btn,flex:1}} onClick={create}>Create</button>
            <button onClick={()=>setShowAdd(false)} style={{...S.outline,flex:1}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminHome({user, notify, activeOrgId}) {
  const [stats, setStats] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const now = new Date();
      const [att, emps, appr] = await Promise.all([
        GET("/api/attendance",{date:today(),org_id:activeOrgId}),
        GET("/api/employees",{org_id:activeOrgId}),
        GET("/api/approvals",{org_id:activeOrgId}),
      ]);
      const checkedIn=[...new Set((att||[]).filter(r=>r.check_in_time).map(r=>r.employee_id))].length;
      setStats({checkedIn, total:(emps||[]).filter(e=>e.role==="employee"&&e.status==="active").length, pendingApprovals:(appr||[]).length});
      setEmployees((emps||[]).filter(e=>e.role==="employee"&&e.status==="active"));
    } catch(e){notify(e.message,"error");}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(activeOrgId)load();},[activeOrgId]);

  const recordLeave = async (data) => {
    try { await POST("/api/leaves",{...data,org_id:activeOrgId}); notify("Leave recorded ✓"); }
    catch(e){notify(e.message,"error");}
  };

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:18}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
        <h2 style={{color:C.white,fontSize:20,fontWeight:800,margin:"4px 0"}}>Admin Dashboard</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{ROLE_CFG[user.role]?.label}</p>
      </div>
      {stats&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          {[[stats.checkedIn,`of ${stats.total} present`,C.g600,"Today Present"],[stats.pendingApprovals,"need action",C.red,"Pending Approvals"]].map(([v,sub,c,l])=>(
            <div key={l} style={{background:C.white,borderRadius:18,padding:16,boxShadow:`0 2px 10px ${C.g300}44`,borderTop:`3px solid ${c}`}}>
              <p style={{color:C.gr500,fontSize:12,fontWeight:600}}>{l}</p>
              <p style={{color:c,fontSize:26,fontWeight:900,margin:"4px 0 2px"}}>{v}</p>
              <p style={{color:C.gr500,fontSize:11}}>{sub}</p>
            </div>
          ))}
        </div>
      )}
      <h3 style={{color:C.g800,fontSize:15,fontWeight:800,marginBottom:12}}>Mark leave / penalty</h3>
      <LeaveForm employees={employees} onSubmit={recordLeave}/>
    </div>
  );
}

function LeaveForm({employees, onSubmit}) {
  const [empId,setEmpId]=useState(""), [type,setType]=useState("casual"), [dt,setDt]=useState(today()), [reason,setReason]=useState("");
  return(
    <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <select style={S.select} value={empId} onChange={e=>setEmpId(e.target.value)}>
        <option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select style={S.select} value={type} onChange={e=>setType(e.target.value)}>
        <option value="casual">Casual leave</option><option value="unauthorized">Unauthorized leave</option><option value="noshow">No show</option>
      </select>
      <input style={S.input} type="date" value={dt} onChange={e=>setDt(e.target.value)}/>
      <input style={S.input} placeholder="Reason (optional)" value={reason} onChange={e=>setReason(e.target.value)}/>
      <button style={S.btn} onClick={()=>{if(!empId)return;onSubmit({employee_id:empId,date:dt,type,reason});setEmpId("");setReason("");}}>Record leave</button>
    </div>
  );
}

function AdminStaff({user, notify, activeOrgId}) {
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState("list");
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [e,b,s,cat] = await Promise.all([GET("/api/employees",{org_id:activeOrgId}),GET("/api/branches",{org_id:activeOrgId}),GET("/api/shifts",{org_id:activeOrgId}),GET("/api/job-categories",{org_id:activeOrgId})]);
      setEmployees(e||[]); setBranches(b||[]); setShifts(s||[]); setCategories(cat||[]);
    } catch(e){notify(e.message,"error");}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(activeOrgId)load();},[activeOrgId]);

  let list = employees.filter(e=>e.role!=="super_admin");
  if(user.role==="branch_admin") list=list.filter(e=>e.branch_id===user.branch_id);
  if(filterStatus!=="all") list=list.filter(e=>e.status===filterStatus);
  if(filterBranch!=="all") list=list.filter(e=>e.branch_id===filterBranch);
  if(search) list=list.filter(e=>e.name?.toLowerCase().includes(search.toLowerCase())||e.phone?.includes(search));

  const changeStatus = async (emp, newStatus, reason, effectiveDate) => {
    try {
      await PATCH(`/api/employees/${emp.id}`,{status:newStatus,relieving_date:effectiveDate,relieving_reason:reason});
      await POST("/api/status-history",{employee_id:emp.id,org_id:activeOrgId,old_status:emp.status,new_status:newStatus,reason,effective_date:effectiveDate});
      notify(`${emp.name} — ${STATUS_CFG[newStatus]?.label} ✓`); load();
    } catch(e){notify(e.message,"error");}
  };

  const deleteEmp = async (emp) => {
    if(!window.confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
    try { await PATCH(`/api/employees/${emp.id}`,{is_active:false}); notify("Staff removed"); load(); }
    catch(e){notify(e.message,"error");}
  };

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{color:C.g800,fontSize:22,fontWeight:800}}>Staff</h2>
        <button style={{...S.btn,width:"auto",padding:"8px 16px",fontSize:13}} onClick={()=>{setSelected(null);setTab("form");}}>+ Add</button>
      </div>
      <TabBar tabs={[["list","👥 List"],["form",selected?"✏️ Edit":"➕ Add"]]} active={tab} onChange={setTab}/>

      {tab==="list"&&(
        <div>
          <input style={{...S.input,marginBottom:10}} placeholder="🔍 Search name or phone…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <select style={{...S.select,marginBottom:0,flex:1,fontSize:12}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">All status</option>{Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            <select style={{...S.select,marginBottom:0,flex:1,fontSize:12}} value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
              <option value="all">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {Object.entries(STATUS_CFG).map(([k,v])=>{const c=list.filter(e=>e.status===k).length;if(!c)return null;return<span key={k} style={{background:v.bg,color:v.color,fontSize:12,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{v.label}: {c}</span>;})}
          </div>
          {list.map(e=>{
            const sc=STATUS_CFG[e.status||"active"]||STATUS_CFG.active;
            return(
              <div key={e.id} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <p style={{color:C.gr900,fontWeight:800,fontSize:15}}>{e.name}</p>
                      <span style={{background:sc.bg,color:sc.color,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
                    </div>
                    <p style={{color:C.gr500,fontSize:12}}>{e.designation} · {e.branch_name}</p>
                    <p style={{color:C.gr500,fontSize:12}}>📱 {e.phone} · {fmt(e.salary||0)}/mo</p>
                  </div>
                  <span style={{color:ROLE_CFG[e.role]?.color,fontSize:11,fontWeight:700}}>{ROLE_CFG[e.role]?.label}</span>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button style={{...S.outline,flex:1,padding:"8px",fontSize:12}} onClick={()=>{setSelected(e);setTab("form");}}>✏️ Edit</button>
                  <StatusBtn emp={e} onChange={changeStatus}/>
                  {(user.role==="super_admin"||user.role==="org_admin")&&(
                    <button onClick={()=>deleteEmp(e)} style={{...S.outline,padding:"8px 12px",fontSize:12,borderColor:C.red,color:C.red}}>🗑</button>
                  )}
                </div>
              </div>
            );
          })}
          {list.length===0&&<Empty icon="👥" msg="No staff found"/>}
        </div>
      )}
      {tab==="form"&&(
        <StaffForm emp={selected} branches={branches} shifts={shifts} categories={categories} activeOrgId={activeOrgId} user={user} notify={notify}
          onSave={async(data)=>{
            try{
              if(selected) await PATCH(`/api/employees/${selected.id}`,data);
              else await POST("/api/employees",{...data,org_id:activeOrgId});
              notify(selected?"Staff updated ✓":"Staff added ✓"); load(); setSelected(null); setTab("list");
            }catch(e){notify(e.message,"error");}
          }}
          onCancel={()=>{setSelected(null);setTab("list");}}
        />
      )}
    </div>
  );
}

function StatusBtn({emp, onChange}) {
  const [show,setShow]=useState(false);
  const [ns,setNs]=useState(emp.status||"active");
  const [reason,setReason]=useState("");
  const [date,setDate]=useState(today());
  const sc=STATUS_CFG[emp.status||"active"]||STATUS_CFG.active;
  return(
    <>
      <button onClick={()=>setShow(true)} style={{...S.outline,flex:1,padding:"8px",fontSize:12,borderColor:sc.color,color:sc.color}}>🔄</button>
      {show&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div style={{background:C.white,borderRadius:"24px 24px 0 0",padding:24,width:"100%",maxWidth:480,animation:"slideUp .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <p style={{color:C.g800,fontWeight:800,fontSize:17}}>Status — {emp.name}</p>
              <button onClick={()=>setShow(false)} style={S.iconBtn}>✕</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
              {Object.entries(STATUS_CFG).map(([k,v])=>(
                <button key={k} onClick={()=>setNs(k)} style={{background:ns===k?v.bg:"transparent",border:`1.5px solid ${ns===k?v.color:C.gr300}`,borderRadius:20,padding:"6px 14px",color:ns===k?v.color:C.gr500,fontWeight:700,fontSize:13,cursor:"pointer"}}>{v.label}</button>
              ))}
            </div>
            {ns!=="active"&&<><label style={S.label}>Effective date</label><input style={S.input} type="date" value={date} onChange={e=>setDate(e.target.value)}/><label style={S.label}>Reason</label><input style={S.input} placeholder="Reason" value={reason} onChange={e=>setReason(e.target.value)}/></>}
            <button style={S.btn} onClick={()=>{onChange(emp,ns,reason,date);setShow(false);}}>Apply</button>
          </div>
        </div>
      )}
    </>
  );
}

function StaffForm({emp, branches, shifts, categories, activeOrgId, user, notify, onSave, onCancel}) {
  const isEdit=!!emp;
  const [f,setF]=useState({
    name:emp?.name||"",phone:emp?.phone||"",password:"",branch_id:emp?.branch_id||branches[0]?.id||"",
    role:emp?.role||"employee",designation:emp?.designation||"",salary:emp?.salary||"",
    default_shift_id:emp?.default_shift_id||"",manager_id:emp?.manager_id||"",
    date_of_joining:emp?.date_of_joining?String(emp.date_of_joining).split('T')[0]:today(),employee_code:emp?.employee_code||"",
    job_category_id:emp?.job_category_id||"",
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <p style={{color:C.g800,fontWeight:800,fontSize:16,marginBottom:14}}>{isEdit?"Edit Staff":"Add New Staff"}</p>
      {[["name","Full Name","text"],["phone","Phone Number","tel"],["designation","Designation","text"],["salary","Monthly Salary (₹)","number"],["employee_code","Employee Code","text"],["date_of_joining","Date of Joining","date"]].map(([k,ph,t])=>(
        <div key={k}><label style={S.label}>{ph}</label><input style={S.input} type={t} placeholder={ph} value={f[k]} onChange={e=>set(k,e.target.value)}/></div>
      ))}
      {!isEdit&&<div><label style={S.label}>Password</label><input style={S.input} type="password" placeholder="Default password" value={f.password} onChange={e=>set("password",e.target.value)}/></div>}
      <label style={S.label}>Branch</label>
      <select style={S.select} value={f.branch_id} onChange={e=>set("branch_id",e.target.value)}>
        {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <label style={S.label}>Role</label>
      <select style={S.select} value={f.role} onChange={e=>set("role",e.target.value)}>
        <option value="employee">Employee</option>
        <option value="branch_admin">Branch Admin</option>
        {(user.role==="super_admin"||user.role==="org_admin")&&<option value="org_admin">Org Admin</option>}
      </select>
      <label style={S.label}>Job Category</label>
      <select style={S.select} value={f.job_category_id} onChange={e=>set("job_category_id",e.target.value)}>
        <option value="">No category assigned</option>
        {(categories||[]).map(c=><option key={c.id} value={c.id}>{c.name} · {c.sunday_off?"Sun off":"7-day"} · CL:{c.cl_per_month} SL:{c.sl_per_month}</option>)}
      </select>
      <label style={S.label}>Default Shift</label>
      <select style={S.select} value={f.default_shift_id} onChange={e=>set("default_shift_id",e.target.value)}>
        <option value="">None</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</option>)}
      </select>
      <div style={{display:"flex",gap:10}}>
        <button style={{...S.btn,flex:1}} onClick={()=>onSave(f)}>{isEdit?"Save changes":"Add staff"}</button>
        <button onClick={onCancel} style={{...S.outline,flex:1}}>Cancel</button>
      </div>
      {isEdit&&<ResetPasswordBox empId={emp.id} empName={emp.name} notify={notify}/>}
      {isEdit&&(user.role==="super_admin"||user.role==="org_admin")&&<DeviceResetBox empId={emp.id} empName={emp.name} notify={notify}/>}
    </div>
  );
}

function AdminShifts({user, notify, activeOrgId}) {
  const [shifts,setShifts]=useState([]), [employees,setEmployees]=useState([]), [schedules,setSchedules]=useState([]);
  const [tab,setTab]=useState("templates");
  const [selEmp,setSelEmp]=useState(""), [selShift,setSelShift]=useState(""), [from,setFrom]=useState(today());
  const [to,setTo]=useState(()=>{const d=new Date();d.setDate(d.getDate()+6);return d.toISOString().split("T")[0];});
  const [skipSun,setSkipSun]=useState(true), [pattern,setPattern]=useState("same");
  const [rotation,setRotation]=useState(["","","","","",""]);
  const [tmName,setTmName]=useState(""), [tmStart,setTmStart]=useState("09:00"), [tmEnd,setTmEnd]=useState("18:00"), [tmBreak,setTmBreak]=useState(60), [tmColor,setTmColor]=useState("#3b82f6");
  const [loading,setLoading]=useState(true);
  const canEdit=["super_admin","org_admin","branch_admin"].includes(user.role);

  const load=async()=>{
    try{const[s,e]=await Promise.all([GET("/api/shifts",{org_id:activeOrgId}),GET("/api/employees",{org_id:activeOrgId})]);setShifts(s||[]);setEmployees((e||[]).filter(x=>x.role==="employee"&&x.status==="active"));}
    catch(e){notify(e.message,"error");}finally{setLoading(false);}
  };
  useEffect(()=>{if(activeOrgId)load();},[activeOrgId]);

  const addTemplate=async()=>{
    if(!tmName){notify("Enter shift name","error");return;}
    try{await POST("/api/shifts",{org_id:activeOrgId,name:tmName,start_time:tmStart,end_time:tmEnd,break_mins:Number(tmBreak),color:tmColor});notify("Shift added ✓");setTmName("");load();}
    catch(e){notify(e.message,"error");}
  };

  const applyBulk=async()=>{
    if(!selEmp){notify("Select employee","error");return;}
    try{
      const rot=pattern==="rotate"?rotation.filter(Boolean):null;
      await POST("/api/schedules/bulk",{employee_id:selEmp,shift_id:selShift||null,from,to,skip_sundays:skipSun,rotation:rot,org_id:activeOrgId});
      notify("Schedule applied ✓");
    }catch(e){notify(e.message,"error");}
  };

  let filteredEmps=user.role==="branch_admin"?employees.filter(e=>e.branch_id===user.branch_id):employees;

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Shifts</h2>
      <TabBar tabs={[["templates","📋 Templates"],["schedule","📅 Schedule"]]} active={tab} onChange={setTab}/>
      {tab==="templates"&&(
        <div>
          {shifts.map(sh=><div key={sh.id} style={{background:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:`0 2px 8px ${C.g300}22`,borderLeft:`4px solid ${sh.color}`}}>
            <div><p style={{color:C.gr900,fontWeight:800}}>{sh.name}</p><p style={{color:C.gr500,fontSize:13}}>{sh.start_time?.slice(0,5)}–{sh.end_time?.slice(0,5)} · {sh.break_mins}m break</p></div>
            <div style={{width:14,height:14,borderRadius:"50%",background:sh.color}}/>
          </div>)}
          {canEdit&&(
            <div style={{background:C.white,borderRadius:20,padding:20,marginTop:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
              <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>Add shift template</p>
              <input style={S.input} placeholder="Shift name" value={tmName} onChange={e=>setTmName(e.target.value)}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={S.label}>Start</label><input style={S.input} type="time" value={tmStart} onChange={e=>setTmStart(e.target.value)}/></div>
                <div><label style={S.label}>End</label><input style={S.input} type="time" value={tmEnd} onChange={e=>setTmEnd(e.target.value)}/></div>
              </div>
              <label style={S.label}>Break (mins)</label><input style={S.input} type="number" value={tmBreak} onChange={e=>setTmBreak(e.target.value)}/>
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                {["#f59e0b","#3b82f6","#8b5cf6","#6366f1","#10b981","#ef4444","#ec4899"].map(c=>(
                  <button key={c} onClick={()=>setTmColor(c)} style={{width:28,height:28,borderRadius:"50%",background:c,border:tmColor===c?`3px solid ${C.g800}`:"3px solid transparent",cursor:"pointer"}}/>
                ))}
              </div>
              <button style={S.btn} onClick={addTemplate}>Add template</button>
            </div>
          )}
        </div>
      )}
      {tab==="schedule"&&canEdit&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <label style={S.label}>Employee</label>
          <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
            <option value="">Select employee</option>{filteredEmps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={S.label}>From</label><input style={S.input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
            <div><label style={S.label}>To</label><input style={S.input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[["same","Same daily"],["rotate","Rotating"]].map(([v,l])=>(
              <button key={v} onClick={()=>setPattern(v)} style={{flex:1,background:pattern===v?C.g600:C.g100,border:"none",borderRadius:12,padding:"10px",cursor:"pointer",color:pattern===v?C.white:C.gr700,fontWeight:700,fontSize:13}}>{l}</button>
            ))}
          </div>
          {pattern==="same"&&<><label style={S.label}>Shift</label><select style={S.select} value={selShift} onChange={e=>setSelShift(e.target.value)}><option value="">Select shift</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></>}
          {pattern==="rotate"&&(
            <div style={{background:C.g50,borderRadius:14,padding:14,marginBottom:12}}>
              {["Mon","Tue","Wed","Thu","Fri","Sat"].map((day,i)=>(
                <div key={day} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{color:C.gr500,fontSize:13,width:30}}>{day}</span>
                  <select style={{...S.select,marginBottom:0,flex:1,padding:"8px 10px",fontSize:13}} value={rotation[i]||""} onChange={e=>{const l=[...rotation];l[i]=e.target.value;setRotation(l);}}>
                    <option value="">Off</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:16}}>
            <input type="checkbox" checked={skipSun} onChange={e=>setSkipSun(e.target.checked)} style={{accentColor:C.g600,width:16,height:16}}/>
            <span style={{color:C.gr700,fontSize:14}}>Skip Sundays</span>
          </label>
          <button style={S.btn} onClick={applyBulk}>Apply schedule</button>
        </div>
      )}
    </div>
  );
}

function AdminOverride({user, notify, activeOrgId}) {
  const [tab,setTab]=useState("override");
  const [employees,setEmployees]=useState([]), [shifts,setShifts]=useState([]), [requests,setRequests]=useState([]);
  const [selEmp,setSelEmp]=useState(""), [selDate,setSelDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().split("T")[0];}), [selShift,setSelShift]=useState(""), [note,setNote]=useState("");
  const [loading,setLoading]=useState(true);

  const load=async()=>{
    try{const[e,s,r]=await Promise.all([GET("/api/employees",{org_id:activeOrgId}),GET("/api/shifts",{org_id:activeOrgId}),GET("/api/shift-requests",{org_id:activeOrgId})]);
    let emps=(e||[]).filter(x=>x.role==="employee"&&x.status==="active");
    if(user.role==="branch_admin")emps=emps.filter(x=>x.branch_id===user.branch_id);
    setEmployees(emps);setShifts(s||[]);setRequests((r||[]).filter(x=>x.status==="pending"));}
    catch(e){notify(e.message,"error");}finally{setLoading(false);}
  };
  useEffect(()=>{if(activeOrgId)load();},[activeOrgId]);

  const applyOverride=async()=>{
    if(!selEmp||!selShift||!selDate){notify("Fill all fields","error");return;}
    try{await POST("/api/schedules/override",{employee_id:selEmp,shift_id:selShift,date:selDate,note,org_id:activeOrgId});notify("Override applied ✓");setNote("");}
    catch(e){notify(e.message,"error");}
  };

  const decide=async(req,status)=>{
    try{await PATCH(`/api/shift-requests/${req.id}`,{status});notify(`Request ${status} ✓`);load();}
    catch(e){notify(e.message,"error");}
  };

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Shift Override</h2>
      <TabBar tabs={[["override","⚡ Override"],["requests",`🔄 Requests${requests.length>0?` (${requests.length})`:""}`]]} active={tab} onChange={setTab}/>
      {tab==="override"&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <label style={S.label}>Employee</label>
          <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
            <option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <label style={S.label}>Date</label>
          <input style={S.input} type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}/>
          <label style={S.label}>New shift</label>
          <select style={S.select} value={selShift} onChange={e=>setSelShift(e.target.value)}>
            <option value="">Select shift</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</option>)}
          </select>
          <label style={S.label}>Note</label>
          <input style={S.input} placeholder="Reason for override" value={note} onChange={e=>setNote(e.target.value)}/>
          <button style={S.btn} onClick={applyOverride}>Apply override</button>
        </div>
      )}
      {tab==="requests"&&(
        <div>
          {requests.length===0&&<Empty icon="✅" msg="No pending requests"/>}
          {requests.map(req=>(
            <div key={req.id} style={{background:C.white,borderRadius:20,padding:18,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${C.amber}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div><p style={{color:C.gr900,fontWeight:800}}>{req.employee_name}</p><p style={{color:C.gr500,fontSize:12}}>{req.designation}</p></div>
                <span style={{background:"#fffbeb",color:C.amber,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>Pending</span>
              </div>
              <p style={{color:C.g800,fontWeight:700,marginBottom:6}}>📅 {fmtDF(req.date)}</p>
              <p style={{color:C.gr500,fontSize:13,marginBottom:4}}>Requested: {req.requested_shift_name} · {req.start_time?.slice(0,5)}–{req.end_time?.slice(0,5)}</p>
              {req.note&&<p style={{color:C.gr500,fontSize:13,marginBottom:12}}>💬 "{req.note}"</p>}
              <div style={{display:"flex",gap:10}}>
                <button style={{...S.btn,background:C.g600,flex:1,padding:"12px"}} onClick={()=>decide(req,"approved")}>✓ Approve</button>
                <button style={{...S.btn,background:C.red,flex:1,padding:"12px"}} onClick={()=>decide(req,"rejected")}>✕ Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminApprovals({user, notify, activeOrgId}) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const hier={branch_admin:"Approves employee late/leave requests",org_admin:"Approves branch admin requests + escalations",super_admin:"Override anything across all organizations"};

  const load=async()=>{
    try{setApprovals(await GET("/api/approvals",{org_id:activeOrgId})||[]);}
    catch(e){notify(e.message,"error");}finally{setLoading(false);}
  };
  useEffect(()=>{if(activeOrgId)load();},[activeOrgId]);

  const decide=async(a,status)=>{
    try{await PATCH(`/api/approvals/${a.id}`,{status});notify(`Request ${status} ✓`);load();}
    catch(e){notify(e.message,"error");}
  };

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Approvals</h2>
      <div style={{background:C.g50,borderRadius:14,padding:14,marginBottom:16,borderLeft:`3px solid ${C.g500}`}}>
        <p style={{color:C.g700,fontSize:13,fontWeight:700}}>Your approval authority</p>
        <p style={{color:C.gr500,fontSize:12,marginTop:3}}>{hier[user.role]}</p>
      </div>
      {approvals.length===0&&<Empty icon="✅" msg="No pending approvals"/>}
      {approvals.map(a=>(
        <div key={a.id} style={{background:C.white,borderRadius:20,padding:18,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${C.amber}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div><p style={{color:C.gr900,fontWeight:800,fontSize:15}}>{a.employee_name}</p><p style={{color:C.gr500,fontSize:12}}>{a.designation}</p></div>
            <span style={{background:"#fffbeb",color:C.amber,fontSize:12,padding:"4px 10px",borderRadius:20,fontWeight:700}}>⏱ {a.late_mins}m late</span>
          </div>
          {a.shift_name&&<p style={{color:C.gr500,fontSize:13,marginBottom:4}}>Shift: {a.shift_name}</p>}
          <p style={{color:C.gr500,fontSize:13,marginBottom:14}}>📅 {fmtD(a.date||"")} at {a.time||""}</p>
          <div style={{display:"flex",gap:10}}>
            <button style={{...S.btn,background:C.g600,flex:1,padding:"12px"}} onClick={()=>decide(a,"approved")}>✓ Approve</button>
            <button style={{...S.btn,background:C.red,flex:1,padding:"12px"}} onClick={()=>decide(a,"rejected")}>✕ Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminQR({notify, activeOrgId}) {
  const [branches,setBranches]=useState([]), [sel,setSel]=useState("");
  const qrRef=useRef(null);
  useEffect(()=>{
    if(!activeOrgId)return;
    GET("/api/branches",{org_id:activeOrgId}).then(b=>{setBranches(b||[]);if(b?.length)setSel(b[0].id);}).catch(e=>notify(e.message,"error"));
  },[activeOrgId]);
  const br=branches.find(b=>b.id===sel);

  const downloadPNG=()=>{
    const canvas=qrRef.current?.querySelector("canvas");
    if(!canvas){notify("QR not ready","error");return;}
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    a.download=`${br?.name||"branch"}-qr.png`;
    a.click();
    notify("QR downloaded as PNG ✓");
  };

  const downloadPDF=()=>{
    const canvas=qrRef.current?.querySelector("canvas");
    if(!canvas){notify("QR not ready","error");return;}
    const imgData=canvas.toDataURL("image/png");
    const brName=br?.name||"Branch";
    const html="<html><head><title>"+brName+" QR</title>"
      +"<style>body{display:flex;flex-direction:column;align-items:center;"
      +"justify-content:center;min-height:100vh;font-family:sans-serif;margin:0;padding:20px}"
      +"h2{color:#166534}img{width:250px;height:250px}"
      +"p{color:#6b7280;font-size:13px}</style></head><body>"
      +"<h2>"+brName+"</h2>"
      +"<p>SmartAi Attendance — Scan to mark attendance</p>"
      +"<img src='"+imgData+"'/>"
      +"<p style='color:#9ca3af;font-size:11px'>by 3SL Media Labs</p>"
      +"</body></html>";
    const w=window.open("","_blank");
    if(w){w.document.write(html);w.document.close();setTimeout(()=>{w.print();},500);}
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Branch QR Codes</h2>
      <select style={{...S.select,marginBottom:16}} value={sel} onChange={e=>setSel(e.target.value)}>
        {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {br&&(
        <div style={{background:C.white,borderRadius:24,padding:32,textAlign:"center",boxShadow:`0 4px 24px ${C.g300}66`}}>
          <p style={{color:C.gr500,fontSize:13,marginBottom:20}}>📍 {br.address}</p>
          <div ref={qrRef} style={{display:"flex",justifyContent:"center",marginBottom:20}}>
            <QRCanvas data={JSON.stringify({branchId:br.id,token:"SMARTAI_V4",app:"3SL"})} size={220}/>
          </div>
          <h3 style={{color:C.g800,fontSize:20,fontWeight:800}}>{br.name}</h3>
          <p style={{color:C.g700,fontSize:13,marginTop:10}}>📍 {br.lat}, {br.lng} · ⭕ {br.radius}m geo-fence</p>
          <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"center"}}>
            <button style={{...S.btn,width:"auto",padding:"10px 20px",background:C.g700}} onClick={downloadPNG}>⬇ Download PNG</button>
            <button style={{...S.btn,width:"auto",padding:"10px 20px",background:"#7c3aed"}} onClick={downloadPDF}>🖨 Print / PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminReports({user, notify, activeOrgId}) {
  const [report,setReport]=useState(null), [loading,setLoading]=useState(true);
  const [filterBranch,setFilterBranch]=useState("all"), [filterStatus,setFilterStatus]=useState("all");
  const [branches,setBranches]=useState([]);
  const now=new Date();

  useEffect(()=>{
    if(!activeOrgId)return;
    Promise.all([
      GET("/api/salary-report",{year:now.getFullYear(),month:now.getMonth()+1,org_id:activeOrgId}),
      GET("/api/branches",{org_id:activeOrgId}),
    ]).then(([r,b])=>{setReport(r);setBranches(b||[]);}).catch(e=>notify(e.message,"error")).finally(()=>setLoading(false));
  },[activeOrgId]);

  if(loading) return <Spinner/>;
  if(!report) return <Empty icon="📊" msg="No report data"/>;

  let list=report.report||[];
  if(filterBranch!=="all") list=list.filter(e=>e.branch_id===filterBranch||e.branch_name===branches.find(b=>b.id===filterBranch)?.name);

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Monthly Report</h2>
      <p style={{color:C.gr500,fontSize:13,marginBottom:16}}>{now.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{background:C.g700,borderRadius:18,padding:16,textAlign:"center"}}>
          <p style={{color:"rgba(255,255,255,0.7)",fontSize:12}}>Total Payable</p>
          <p style={{color:C.white,fontSize:22,fontWeight:900}}>{fmt(report.total||0)}</p>
        </div>
        <div style={{background:C.white,borderRadius:18,padding:16,textAlign:"center",boxShadow:`0 2px 8px ${C.g300}44`}}>
          <p style={{color:C.gr500,fontSize:12}}>Total Employees</p>
          <p style={{color:C.g600,fontSize:22,fontWeight:900}}>{list.length}</p>
        </div>
      </div>
      <select style={{...S.select,marginBottom:14}} value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
        <option value="all">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {list.map(e=>(
        <div key={e.id} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div><p style={{color:C.gr900,fontWeight:800}}>{e.name}</p><p style={{color:C.gr500,fontSize:12}}>{e.designation} · {e.branch_name}</p></div>
            <div style={{textAlign:"right"}}><p style={{color:C.g700,fontWeight:900,fontSize:17}}>{fmt(e.netEarned||0)}</p>{(e.totalDeductions||0)>0&&<p style={{color:C.red,fontSize:12}}>-{fmt(e.totalDeductions)}</p>}</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["Present",e.presentDays,C.g600],["Late",e.lateDays,C.amber],["CL",e.casualUsed,C.blue],["Unauth",e.unauthLeaves,C.red]].map(([l,v,c])=>(
              <span key={l} style={{background:`${c}15`,color:c,fontSize:12,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{l}: {v||0}</span>
            ))}
          </div>
        </div>
      ))}
      {list.length===0&&<Empty icon="📊" msg="No data for this month"/>}
    </div>
  );
}

function AdminEditAtt({user, notify, activeOrgId}) {
  const [employees,setEmployees]=useState([]), [loading,setLoading]=useState(true);
  const [selEmp,setSelEmp]=useState(""), [selDate,setSelDate]=useState(today()), [cin,setCin]=useState(""), [cout,setCout]=useState(""), [notes,setNotes]=useState("");
  useEffect(()=>{
    if(!activeOrgId)return;
    GET("/api/employees",{org_id:activeOrgId}).then(e=>setEmployees(e||[])).finally(()=>setLoading(false));
  },[activeOrgId]);
  const go=async()=>{
    if(!selEmp||!cin){notify("Employee and check-in required","error");return;}
    try{await POST("/api/attendance/admin-mark",{employee_id:selEmp,date:selDate,check_in_time:cin,check_out_time:cout||null,notes,org_id:activeOrgId});notify("Attendance saved ✓");}
    catch(e){notify(e.message,"error");}
  };
  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Edit Attendance</h2>
      <p style={{color:C.gr500,fontSize:13,marginBottom:16}}>Mark or correct any employee attendance</p>
      <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        <label style={S.label}>Employee</label>
        <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
          <option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label style={S.label}>Date</label>
        <input style={S.input} type="date" value={selDate} max={today()} onChange={e=>setSelDate(e.target.value)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={S.label}>Check-in *</label><input style={S.input} type="time" value={cin} onChange={e=>setCin(e.target.value)}/></div>
          <div><label style={S.label}>Check-out</label><input style={S.input} type="time" value={cout} onChange={e=>setCout(e.target.value)}/></div>
        </div>
        <label style={S.label}>Notes</label>
        <input style={S.input} placeholder="Reason for edit" value={notes} onChange={e=>setNotes(e.target.value)}/>
        <button style={S.btn} onClick={go}>Save record</button>
      </div>
    </div>
  );
}

function AdminSettings({user, notify, activeOrgId}) {
  const [settings,setSettings]=useState(null), [branches,setBranches]=useState([]), [loading,setLoading]=useState(true);
  const [brName,setBrName]=useState(""), [brAddr,setBrAddr]=useState(""), [brLat,setBrLat]=useState(""), [brLng,setBrLng]=useState(""), [brR,setBrR]=useState("200");

  useEffect(()=>{
    if(!activeOrgId)return;
    Promise.all([GET("/api/orgs/"+activeOrgId+"/settings"),GET("/api/branches",{org_id:activeOrgId})])
      .then(([s,b])=>{setSettings(s);setBranches(b||[]);}).catch(e=>notify(e.message,"error")).finally(()=>setLoading(false));
  },[activeOrgId]);

  const saveSettings=async()=>{
    try{await PATCH("/api/orgs/"+activeOrgId+"/settings",settings);notify("Settings saved ✓");}
    catch(e){notify(e.message,"error");}
  };

  const addBranch=async()=>{
    if(!brName||!brLat||!brLng){notify("Name and coordinates required","error");return;}
    try{
      await POST("/api/branches",{org_id:activeOrgId,name:brName,address:brAddr,lat:parseFloat(brLat),lng:parseFloat(brLng),radius:parseInt(brR)||200});
      notify("Branch added ✓");setBrName("");setBrAddr("");setBrLat("");setBrLng("");setBrR("200");
      GET("/api/branches",{org_id:activeOrgId}).then(b=>setBranches(b||[]));
    }catch(e){notify(e.message,"error");}
  };

  if(loading||!settings) return <Spinner/>;
  const fields=[["grace_period_mins","Grace period (mins)"],["late_deduction_per_occ","Late deduction (₹)"],["max_allowed_lates_per_month","Max lates/month"],["excess_late_penalty","Excess late penalty (₹)"],["unauth_leave_penalty","Unauth leave penalty (₹)"],["no_show_penalty","No-show penalty (₹)"],["casual_leave_per_month","Casual leave/month"],["working_days_per_month","Working days/month"],["geo_fence_radius_meters","Geo-fence radius (m)"]];
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Settings</h2>
      <div style={{background:C.white,borderRadius:20,padding:20,marginBottom:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        {fields.map(([k,l])=>(
          <div key={k} style={{marginBottom:12}}>
            <label style={S.label}>{l}</label>
            <input style={S.input} type="number" value={settings[k]||""} onChange={e=>setSettings(p=>({...p,[k]:Number(e.target.value)}))}/>
          </div>
        ))}
        {(user.role==="super_admin"||user.role==="org_admin")
          ?<button style={S.btn} onClick={saveSettings}>Save settings</button>
          :<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:12,padding:12,marginTop:8}}><p style={{color:"#92400e",fontSize:13,fontWeight:700}}>👁 View only — contact Org Admin to change settings</p></div>
        }
      </div>
      <h3 style={{color:C.g800,fontWeight:800,marginBottom:12}}>Branches</h3>
      {branches.map(b=>(
        <div key={b.id} style={{background:C.white,borderRadius:16,padding:14,marginBottom:10,boxShadow:`0 2px 6px ${C.g300}22`}}>
          <p style={{color:C.gr900,fontWeight:800}}>{b.name}</p>
          <p style={{color:C.g600,fontSize:13}}>📍 {b.lat}, {b.lng} · ⭕ {b.radius}m</p>
          <p style={{color:C.gr500,fontSize:12}}>{b.address}</p>
        </div>
      ))}
      {(user.role==="super_admin"||user.role==="org_admin")&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>Add branch</p>
          <input style={S.input} placeholder="Branch name *" value={brName} onChange={e=>setBrName(e.target.value)}/>
          <input style={S.input} placeholder="Address" value={brAddr} onChange={e=>setBrAddr(e.target.value)}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <input style={S.input} type="number" step="0.0001" placeholder="Latitude *" value={brLat} onChange={e=>setBrLat(e.target.value)}/>
            <input style={S.input} type="number" step="0.0001" placeholder="Longitude *" value={brLng} onChange={e=>setBrLng(e.target.value)}/>
          </div>
          <input style={S.input} type="number" placeholder="Radius (m)" value={brR} onChange={e=>setBrR(e.target.value)}/>
          <p style={{color:C.gr500,fontSize:12,marginBottom:10}}>💡 Get coordinates: Google Maps → right-click → "What's here?"</p>
          <button style={S.btn} onClick={addBranch}>Add branch</button>
        </div>
      )}
      {(user.role==="super_admin"||user.role==="org_admin")&&<DeviceBlockManager notify={notify} activeOrgId={activeOrgId}/>}
      {(user.role==="super_admin"||user.role==="org_admin")&&<JobCategoriesManager notify={notify} activeOrgId={activeOrgId}/>}
    </div>
  );
}

// ── SHARED ─────────────────────────────────────────────────────────────────
function TopBar({user, onLogout, orgId}) {
  return(
    <div style={{background:C.white,padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.g100}`,boxShadow:`0 2px 12px ${C.g300}33`,position:"sticky",top:0,zIndex:10}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",color:C.g800,fontSize:16,fontWeight:800,letterSpacing:"-0.3px"}}>SmartAi Attendance</h1>
        <p style={{color:C.gr500,fontSize:9,fontWeight:600,letterSpacing:0.3}}>by 3SL Media Labs</p>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{textAlign:"right"}}>
          <p style={{color:C.g800,fontSize:13,fontWeight:700}}>{user.name?.split(" ")[0]}</p>
          <p style={{color:C.gr500,fontSize:9,textTransform:"uppercase",letterSpacing:0.5}}>{ROLE_CFG[user.role]?.label}</p>
        </div>
        <NotificationBell user={user}/>
        <button onClick={onLogout} style={{background:C.g100,border:"none",borderRadius:10,width:34,height:34,cursor:"pointer",color:C.g700,fontWeight:700,fontSize:13}}>↩</button>
      </div>
    </div>
  );
}

function BottomNav({items, page, setPage}) {
  return(
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.white,borderTop:`1px solid ${C.g100}`,display:"flex",zIndex:20,boxShadow:`0 -4px 20px ${C.g300}44`,overflowX:"auto"}}>
      {items.map(({k,i,l})=>(
        <button key={k} onClick={()=>setPage(k)} style={{flex:1,minWidth:48,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 2px 12px",cursor:"pointer",color:page===k?C.g600:C.gr500,transition:"color .2s"}}>
          <span style={{fontSize:page===k?20:17}}>{i}</span>
          <span style={{fontSize:9,marginTop:2,fontWeight:page===k?800:500,whiteSpace:"nowrap"}}>{l}</span>
          {page===k&&<div style={{width:4,height:4,background:C.g500,borderRadius:"50%",marginTop:2}}/>}
        </button>
      ))}
    </div>
  );
}

function TabBar({tabs, active, onChange}) {
  return(
    <div style={{background:C.g100,borderRadius:14,display:"flex",padding:4,marginBottom:16}}>
      {tabs.map(([k,l])=>(
        <button key={k} onClick={()=>onChange(k)} style={{flex:1,background:active===k?C.white:"transparent",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:active===k?C.g700:C.gr500,fontWeight:700,fontSize:13}}>{l}</button>
      ))}
    </div>
  );
}

function Toast({msg, type}) {
  const bg={success:C.g600,error:C.red,warn:C.amber,info:C.blue}[type]||C.g600;
  return<div style={{position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",background:bg,color:C.white,padding:"12px 22px",borderRadius:14,fontWeight:700,fontSize:14,zIndex:9999,maxWidth:"90vw",boxShadow:"0 8px 32px rgba(0,0,0,.22)",animation:"fadeUp .3s ease",whiteSpace:"nowrap"}}>{msg}</div>;
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function monthRange() {
  const now=new Date(), y=now.getFullYear(), m=now.getMonth()+1;
  return { from:`${y}-${pad(m)}-01`, to:new Date(y,m,0).toISOString().split("T")[0] };
}

function AdminAttendanceTable({ user, notify, activeOrgId }) {
  const [view, setView] = useState("day");
  const [selDate, setSelDate] = useState(today());
  const [selBranch, setSelBranch] = useState("all");
  const [selMonth, setSelMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}`;
  });
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [records, setRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRec, setEditRec] = useState(null);
  const [editForm, setEditForm] = useState({ cin: "", cout: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [e, b] = await Promise.all([
        GET("/api/employees", { org_id: activeOrgId }),
        GET("/api/branches", { org_id: activeOrgId }),
      ]);
      setEmployees(e || []);
      setBranches(b || []);
    } catch (err) { notify(err.message, "error"); }
    finally { setLoading(false); }
  };

  const loadRecords = async () => {
    try {
      let from, to;
      if (view === "day") { from = selDate; to = selDate; }
      else {
        const [y, m] = selMonth.split("-").map(Number);
        from = `${y}-${pad(m)}-01`;
        to = new Date(y, m, 0).toISOString().split("T")[0];
      }
      const [att, lv] = await Promise.all([
        GET("/api/attendance", { from, to, org_id: activeOrgId }),
        GET("/api/leaves", { from, to, org_id: activeOrgId }),
      ]);
      setRecords(att || []);
      setLeaves(lv || []);
    } catch (err) { notify(err.message, "error"); }
  };

  useEffect(() => { if (activeOrgId) loadAll(); }, [activeOrgId]);
  useEffect(() => { if (activeOrgId) loadRecords(); }, [view, selDate, selMonth, activeOrgId]);

  // Get attendance record for employee+date
  // API returns one row per employee per day with check_in_time + check_out_time
  const getRec = (empId, date) =>
    records.find(r => r.employee_id === empId && r.date === date);

  const getLeave = (empId, date) =>
    leaves.find(l => l.employee_id === empId && l.date === date);

  const getStatus = (empId, date) => {
    const leave = getLeave(empId, date);
    if (leave) {
      const lc = { casual: { label:"CL", color:"#7c3aed", bg:"#ede9fe" }, unauthorized: { label:"UL", color:"#dc2626", bg:"#fee2e2" }, noshow: { label:"NS", color:"#ea580c", bg:"#ffedd5" } };
      return { type: "leave", ...(lc[leave.type] || { label: "L", color: "#7c3aed", bg: "#ede9fe" }) };
    }
    const rec = getRec(empId, date);
    if (rec && rec.check_in_time) {
      return rec.is_late
        ? { type: "late", label: `L${rec.late_mins || ""}`, color: "#d97706", bg: "#fef3c7", rec }
        : { type: "present", label: "P", color: "#16a34a", bg: "#dcfce7", rec };
    }
    return { type: "absent", label: "A", color: "#dc2626", bg: "#fee2e2" };
  };

  const openEdit = (empId, date, empName) => {
    const rec = getRec(empId, date);
    setEditRec({ employee_id: empId, date, name: empName });
    setEditForm({
      cin: rec?.check_in_time ? String(rec.check_in_time).slice(0, 5) : "",
      cout: rec?.check_out_time ? String(rec.check_out_time).slice(0, 5) : "",
      notes: rec?.notes || "",
    });
  };

  const saveEdit = async () => {
    if (!editRec || !editForm.cin) { notify("Check-in time is required", "error"); return; }
    if (!editForm.notes || !editForm.notes.trim()) { notify("Reason for edit is required", "error"); return; }
    setSaving(true);
    try {
      await POST("/api/attendance/admin-mark", {
        employee_id: editRec.employee_id,
        date: editRec.date,
        check_in_time: editForm.cin,
        check_out_time: editForm.cout || null,
        notes: editForm.notes,
        org_id: activeOrgId,
      });
      notify("Attendance updated ✓");
      setEditRec(null);
      await loadRecords(); // refresh data
    } catch (err) { notify(err.message, "error"); }
    finally { setSaving(false); }
  };

  const clearAtt = async (empId, date) => {
    if (!window.confirm("Remove attendance for this day?")) return;
    try {
      // We mark as absent by removing the record — use a special clear endpoint or set times to null
      await POST("/api/attendance/admin-mark", {
        employee_id: empId, date,
        check_in_time: null, check_out_time: null,
        notes: "Cleared by admin",
        org_id: activeOrgId,
        clear: true,
      });
      notify("Attendance cleared");
      await loadRecords();
    } catch (err) { notify(err.message, "error"); }
  };

  const getDaysInMonth = () => {
    const [y, m] = selMonth.split("-").map(Number);
    const days = [];
    for (let d = 1; d <= new Date(y, m, 0).getDate(); d++)
      days.push(`${y}-${pad(m)}-${pad(d)}`);
    return days;
  };

  let filteredEmps = employees.filter(e => e.role === "employee");
  if (user.role === "branch_admin") filteredEmps = filteredEmps.filter(e => e.branch_id === user.branch_id);
  if (selBranch !== "all") filteredEmps = filteredEmps.filter(e => e.branch_id === selBranch);

  const daySummary = {
    present: filteredEmps.filter(e => ["present","late"].includes(getStatus(e.id, selDate).type)).length,
    absent:  filteredEmps.filter(e => getStatus(e.id, selDate).type === "absent").length,
    leave:   filteredEmps.filter(e => getStatus(e.id, selDate).type === "leave").length,
    late:    filteredEmps.filter(e => getStatus(e.id, selDate).type === "late").length,
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: "#166534", fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Attendance Table</h2>

      {/* View toggle */}
      <div style={{ background: "#dcfce7", borderRadius: 14, display: "flex", padding: 4, marginBottom: 16 }}>
        {[["day", "📅 Day View"], ["month", "📊 Month View"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ flex: 1, background: view === v ? "#fff" : "transparent", border: "none", borderRadius: 10, padding: "8px", cursor: "pointer", color: view === v ? "#15803d" : "#6b7280", fontWeight: 700, fontSize: 13 }}>
            {l}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {view === "day"
          ? <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "11px 14px", fontSize: 14, outline: "none", flex: 1 }} type="date" value={selDate} onChange={e => setSelDate(e.target.value)} />
          : <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "11px 14px", fontSize: 14, outline: "none", flex: 1 }} type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} />
        }
        <select style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "11px 14px", fontSize: 13, outline: "none", flex: 1 }} value={selBranch} onChange={e => setSelBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["P","Present","#dcfce7","#16a34a"],["A","Absent","#fee2e2","#dc2626"],["L","Late","#fef3c7","#d97706"],["CL","Casual","#ede9fe","#7c3aed"],["UL","Unauth","#fee2e2","#dc2626"],["NS","No Show","#ffedd5","#ea580c"]].map(([code,label,bg,color])=>(
          <span key={code} style={{ display:"flex",alignItems:"center",gap:4,fontSize:12,color:"#6b7280" }}>
            <span style={{ background:bg,color,fontSize:11,padding:"2px 6px",borderRadius:6,fontWeight:700 }}>{code}</span>{label}
          </span>
        ))}
      </div>

      {/* DAY VIEW */}
      {view === "day" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[["Present", daySummary.present, "#16a34a"], ["Absent", daySummary.absent, "#dc2626"], ["Leave", daySummary.leave, "#7c3aed"], ["Late", daySummary.late, "#d97706"]].map(([l, v, c]) => (
              <div key={l} style={{ background: "#fff", borderRadius: 14, padding: "12px 8px", textAlign: "center", boxShadow: "0 2px 8px #86efac33" }}>
                <p style={{ color: c, fontSize: 22, fontWeight: 900 }}>{v}</p>
                <p style={{ color: "#6b7280", fontSize: 11 }}>{l}</p>
              </div>
            ))}
          </div>

          {filteredEmps.map(emp => {
            const st = getStatus(emp.id, selDate);
            const rec = getRec(emp.id, selDate);
            const cinTime = rec?.check_in_time ? String(rec.check_in_time).slice(0, 5) : null;
            const coutTime = rec?.check_out_time ? String(rec.check_out_time).slice(0, 5) : null;
            return (
              <div key={emp.id} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: "0 2px 8px #86efac33", borderLeft: `4px solid ${st.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "#111827", fontWeight: 800 }}>{emp.name}</p>
                    <p style={{ color: "#6b7280", fontSize: 12 }}>{emp.designation} · {emp.branch_name}</p>
                    {cinTime && (
                      <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                        ▶ <strong style={{ color: "#16a34a" }}>{cinTime}</strong>
                        {coutTime && <> &nbsp; ⏹ <strong style={{ color: "#6366f1" }}>{coutTime}</strong></>}
                        {rec?.worked_mins != null && <span style={{ color: "#6b7280" }}> &nbsp; ⏱ {Math.floor(rec.worked_mins / 60)}h {rec.worked_mins % 60}m</span>}
                        {rec?.is_late && <span style={{ color: "#d97706" }}> · {rec.late_mins}m late</span>}
                      </p>
                    )}
                    {rec?.admin_edited && <p style={{ color: "#7c3aed", fontSize: 11, marginTop: 2 }}>✏ Admin edited</p>}
                    {rec?.notes && <p style={{ color: "#6b7280", fontSize: 11 }}>{rec.notes}</p>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ background: st.bg, color: st.color, fontSize: 13, padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>{st.type === "absent" ? "Absent" : st.type === "present" ? "Present" : st.type === "late" ? `Late ${rec?.late_mins || ""}m` : st.label}</span>
                    <button onClick={() => openEdit(emp.id, selDate, emp.name)}
                      style={{ background: "#fff", border: "1.5px solid #22c55e", borderRadius: 10, color: "#15803d", padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredEmps.length === 0 && <div style={{ textAlign: "center", padding: "50px 20px" }}><p style={{ fontSize: 42, marginBottom: 12 }}>👥</p><p style={{ color: "#6b7280", fontSize: 15 }}>No employees found</p></div>}
        </div>
      )}

      {/* MONTH VIEW */}
      {view === "month" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ background: "#166534", color: "#fff", padding: "10px 12px", textAlign: "left", position: "sticky", left: 0, zIndex: 2, minWidth: 130 }}>Employee</th>
                {getDaysInMonth().map(ds => {
                  const d = new Date(ds + "T12:00:00");
                  const isSun = d.getDay() === 0;
                  const isToday_ = ds === today();
                  return (
                    <th key={ds} style={{ background: isToday_ ? "#16a34a" : isSun ? "#f3f4f6" : "#166534", color: isToday_ ? "#fff" : isSun ? "#9ca3af" : "#fff", padding: "8px 4px", textAlign: "center", minWidth: 34, fontSize: 10 }}>
                      <div>{pad(d.getDate())}</div>
                      <div style={{ opacity: 0.7 }}>{["S","M","T","W","T","F","S"][d.getDay()]}</div>
                    </th>
                  );
                })}
                <th style={{ background: "#166534", color: "#fff", padding: "10px 8px", textAlign: "center" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map((emp, ei) => {
                const days = getDaysInMonth();
                let pCount = 0, aCount = 0, lCount = 0, lateCount = 0;
                return (
                  <tr key={emp.id} style={{ background: ei % 2 === 0 ? "#fff" : "#f0faf4" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#111827", position: "sticky", left: 0, background: ei % 2 === 0 ? "#fff" : "#f0faf4", zIndex: 1, borderRight: "1px solid #dcfce7" }}>
                      <div>{emp.name}</div>
                      <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 400 }}>{emp.branch_name}</div>
                    </td>
                    {days.map(ds => {
                      const st = getStatus(emp.id, ds);
                      const isSun = new Date(ds + "T12:00:00").getDay() === 0;
                      if (!isSun) {
                        if (["present","late"].includes(st.type)) { pCount++; if (st.type === "late") lateCount++; }
                        else if (st.type === "absent") aCount++;
                        else lCount++;
                      }
                      return (
                        <td key={ds} style={{ padding: "3px 2px", textAlign: "center", background: isSun ? "#f9fafb" : "transparent" }}>
                          <button onClick={() => !isSun && openEdit(emp.id, ds, emp.name)}
                            style={{ background: isSun ? "transparent" : st.bg, color: isSun ? "#d1d5db" : st.color, border: "none", borderRadius: 6, padding: "3px 3px", fontSize: 10, fontWeight: 700, cursor: isSun ? "default" : "pointer", minWidth: 26 }}>
                            {isSun ? "—" : st.label}
                          </button>
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px", textAlign: "center", fontSize: 11, whiteSpace: "nowrap" }}>
                      <div style={{ color: "#16a34a", fontWeight: 700 }}>P:{pCount}</div>
                      <div style={{ color: "#dc2626", fontWeight: 700 }}>A:{aCount}</div>
                      <div style={{ color: "#d97706", fontWeight: 700 }}>L:{lateCount}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editRec && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <p style={{ color: "#166534", fontWeight: 800, fontSize: 17 }}>Edit Attendance</p>
                <p style={{ color: "#6b7280", fontSize: 13 }}>{editRec.name} · {fmtDF(editRec.date)}</p>
              </div>
              <button onClick={() => setEditRec(null)} style={{ background: "#dcfce7", border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", color: "#15803d", fontSize: 16 }}>✕</button>
            </div>

            <div style={{ background: "#f0faf4", borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, color: "#6b7280" }}>
              Leave check-in and check-out empty to mark as <strong style={{ color: "#dc2626" }}>Absent</strong>. Fill check-in to mark as <strong style={{ color: "#16a34a" }}>Present</strong>.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ color: "#166534", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Check-in time</label>
                <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%" }}
                  type="time" value={editForm.cin} onChange={e => setEditForm(f => ({ ...f, cin: e.target.value }))} />
              </div>
              <div>
                <label style={{ color: "#166534", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Check-out time</label>
                <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%" }}
                  type="time" value={editForm.cout} onChange={e => setEditForm(f => ({ ...f, cout: e.target.value }))} />
              </div>
            </div>
            {editForm.cin&&editForm.cout&&toM(editForm.cout)>toM(editForm.cin)&&<WorkedTime cin={editForm.cin} cout={editForm.cout}/>}
            <label style={{ color: "#166534", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block", marginTop: 10 }}>Reason for edit</label>
            <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%", marginBottom: 12 }}
              placeholder="e.g. Employee forgot to scan" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ background: "linear-gradient(135deg,#15803d,#22c55e)", border: "none", borderRadius: 14, color: "#fff", padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", flex: 1 }}
                onClick={saveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => setEditRec(null)}
                style={{ background: "#fff", border: "1.5px solid #22c55e", borderRadius: 14, color: "#15803d", padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", flex: 1 }}>
                Cancel
              </button>
            </div>
            {editRec?.is_early_checkout&&!editRec?.early_penalty_waived&&(
              <button style={{...S.btn,background:"#d97706",marginTop:8}}
                onClick={async()=>{try{await PATCH("/api/attendance/"+editRec.id+"/waive-early",{});notify("Early checkout penalty waived ✓");setEditRec(null);await loadRecords();}catch(e){notify(e.message,"error");}}}>
                ✅ Waive early checkout penalty
              </button>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LEAVE HISTORY (full audit) ─────────────────────────────────────────────
function AdminLeaveHistory({ user, notify, activeOrgId }) {
  const [leaves, setLeaves] = useState([]);
  const [audit, setAudit] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("current"); // current | audit
  const [selEmp, setSelEmp] = useState("all");
  const [selType, setSelType] = useState("all");
  const [selMonth, setSelMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; });
  const [editLeave, setEditLeave] = useState(null);
  const [editForm, setEditForm] = useState({ type: "", reason: "", date: "" });

  const TYPE_CONFIG = {
    casual:       { label: "Casual Leave",       color: "#3b82f6", bg: "#eff6ff" },
    unauthorized: { label: "Unauthorized Leave", color: "#dc2626", bg: "#fee2e2" },
    noshow:       { label: "No Show",            color: "#ea580c", bg: "#ffedd5" },
    sick:         { label: "Sick Leave",         color: "#7c3aed", bg: "#ede9fe" },
  };

  const ACTION_CONFIG = {
    created: { label: "Created", color: "#16a34a", bg: "#dcfce7" },
    edited:  { label: "Edited",  color: "#d97706", bg: "#fef3c7" },
    deleted: { label: "Deleted", color: "#dc2626", bg: "#fee2e2" },
  };

  const load = async () => {
    setLoading(true);
    try {
      const [y, m] = selMonth.split("-").map(Number);
      const from = `${y}-${pad(m)}-01`;
      const to = new Date(y, m, 0).toISOString().split("T")[0];
      const [lv, emps, al] = await Promise.all([
        GET("/api/leaves", { from, to, org_id: activeOrgId }),
        GET("/api/employees", { org_id: activeOrgId }),
        GET("/api/leaves/audit", { from, to, org_id: activeOrgId }).catch(() => []),
      ]);
      setLeaves(lv || []);
      setEmployees(emps || []);
      setAudit(al || []);
    } catch (err) { notify(err.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (activeOrgId) load(); }, [activeOrgId, selMonth]);

  const deleteLeave = async (lv) => {
    if (!window.confirm(`Delete this ${lv.type} leave for ${lv.employee_name} on ${fmtD(lv.date)}?`)) return;
    try { await DEL(`/api/leaves/${lv.id}`); notify("Leave deleted ✓"); load(); }
    catch (err) { notify(err.message, "error"); }
  };

  const saveEdit = async () => {
    try {
      await PATCH(`/api/leaves/${editLeave.id}`, editForm);
      notify("Leave updated ✓"); setEditLeave(null); load();
    } catch (err) { notify(err.message, "error"); }
  };

  let list = leaves;
  if (selEmp !== "all") list = list.filter(l => l.employee_id === selEmp);
  if (selType !== "all") list = list.filter(l => l.type === selType);
  list = [...list].sort((a, b) => b.date.localeCompare(a.date));

  const counts = leaves.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {});

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: "#166534", fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Leave & Penalty History</h2>

      <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "11px 14px", fontSize: 14, outline: "none", width: "100%", marginBottom: 12 }} type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} />

      {/* Summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(counts).map(([type, count]) => {
          const tc = TYPE_CONFIG[type] || { label: type, color: "#6b7280", bg: "#f3f4f6" };
          return <span key={type} style={{ background: tc.bg, color: tc.color, fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>{tc.label}: {count}</span>;
        })}
      </div>

      {/* Tabs */}
      <div style={{ background: "#dcfce7", borderRadius: 14, display: "flex", padding: 4, marginBottom: 16 }}>
        {[["current", `📋 Current Leaves (${list.length})`], ["audit", `🕐 Audit Log (${audit.length})`]].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, background: tab === t ? "#fff" : "transparent", border: "none", borderRadius: 10, padding: "8px", cursor: "pointer", color: tab === t ? "#15803d" : "#6b7280", fontWeight: 700, fontSize: 13 }}>{l}</button>
        ))}
      </div>

      {tab === "current" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <select style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "10px 12px", fontSize: 12, outline: "none", flex: 1 }} value={selEmp} onChange={e => setSelEmp(e.target.value)}>
              <option value="all">All employees</option>
              {employees.filter(e => e.role === "employee").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "10px 12px", fontSize: 12, outline: "none", flex: 1 }} value={selType} onChange={e => setSelType(e.target.value)}>
              <option value="all">All types</option>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {list.map(lv => {
            const tc = TYPE_CONFIG[lv.type] || { label: lv.type, color: "#6b7280", bg: "#f3f4f6" };
            return (
              <div key={lv.id} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: "0 2px 8px #86efac33", borderLeft: `4px solid ${tc.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <p style={{ color: "#111827", fontWeight: 800 }}>{lv.employee_name}</p>
                      <span style={{ background: tc.bg, color: tc.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{tc.label}</span>
                    </div>
                    <p style={{ color: "#15803d", fontWeight: 700, fontSize: 14 }}>📅 {fmtD(lv.date)}</p>
                    {lv.reason && <p style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>💬 {lv.reason}</p>}
                    {lv.recorded_by_name && <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 4 }}>Recorded by {lv.recorded_by_name}</p>}
                    {lv.created_at && <p style={{ color: "#9ca3af", fontSize: 11 }}>{new Date(lv.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                    <button onClick={() => { setEditLeave(lv); setEditForm({ type: lv.type, reason: lv.reason || "", date: lv.date }); }}
                      style={{ background: "#fff", border: "1.5px solid #22c55e", borderRadius: 10, color: "#15803d", padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️</button>
                    <button onClick={() => deleteLeave(lv)}
                      style={{ background: "#fff", border: "1.5px solid #ef4444", borderRadius: 10, color: "#ef4444", padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <div style={{ textAlign: "center", padding: "50px 20px" }}><p style={{ fontSize: 42, marginBottom: 12 }}>📝</p><p style={{ color: "#6b7280" }}>No leave records this month</p></div>}
        </div>
      )}

      {tab === "audit" && (
        <div>
          {audit.length === 0 && <div style={{ textAlign: "center", padding: "50px 20px" }}><p style={{ fontSize: 42, marginBottom: 12 }}>🕐</p><p style={{ color: "#6b7280" }}>No audit events this month</p></div>}
          {audit.map(a => {
            const ac = ACTION_CONFIG[a.action] || { label: a.action, color: "#6b7280", bg: "#f3f4f6" };
            const oldD = a.old_data ? (typeof a.old_data === "string" ? JSON.parse(a.old_data) : a.old_data) : null;
            const newD = a.new_data ? (typeof a.new_data === "string" ? JSON.parse(a.new_data) : a.new_data) : null;
            const tc = TYPE_CONFIG[newD?.type || oldD?.type] || { label: newD?.type || oldD?.type, color: "#6b7280" };
            return (
              <div key={a.id} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: "0 2px 8px #86efac33", borderLeft: `4px solid ${ac.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <p style={{ color: "#111827", fontWeight: 800 }}>{a.employee_name}</p>
                    <p style={{ color: "#9ca3af", fontSize: 12 }}>
                      {a.changed_by_name && `by ${a.changed_by_name} · `}
                      {new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span style={{ background: ac.bg, color: ac.color, fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>{ac.label}</span>
                </div>
                {/* Show before → after */}
                {oldD && newD && a.action === "edited" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <div style={{ flex: 1, background: "#fee2e2", borderRadius: 10, padding: "8px 10px" }}>
                      <p style={{ color: "#9ca3af", fontSize: 10, marginBottom: 2 }}>BEFORE</p>
                      <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 700 }}>{TYPE_CONFIG[oldD.type]?.label || oldD.type}</p>
                      <p style={{ color: "#9ca3af", fontSize: 12 }}>{fmtD(oldD.date)} {oldD.reason && `· ${oldD.reason}`}</p>
                    </div>
                    <span style={{ alignSelf: "center", fontSize: 18 }}>→</span>
                    <div style={{ flex: 1, background: "#dcfce7", borderRadius: 10, padding: "8px 10px" }}>
                      <p style={{ color: "#9ca3af", fontSize: 10, marginBottom: 2 }}>AFTER</p>
                      <p style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>{TYPE_CONFIG[newD.type]?.label || newD.type}</p>
                      <p style={{ color: "#9ca3af", fontSize: 12 }}>{fmtD(newD.date)} {newD.reason && `· ${newD.reason}`}</p>
                    </div>
                  </div>
                )}
                {a.action === "created" && newD && (
                  <p style={{ color: "#6b7280", fontSize: 13 }}>{TYPE_CONFIG[newD.type]?.label} on {fmtD(newD.date)}{newD.reason && ` · ${newD.reason}`}</p>
                )}
                {a.action === "deleted" && oldD && (
                  <p style={{ color: "#6b7280", fontSize: 13, textDecoration: "line-through" }}>{TYPE_CONFIG[oldD.type]?.label} on {fmtD(oldD.date)}{oldD.reason && ` · ${oldD.reason}`}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editLeave && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ color: "#166534", fontWeight: 800, fontSize: 17 }}>Edit Leave</p>
                <p style={{ color: "#6b7280", fontSize: 13 }}>{editLeave.employee_name}</p>
              </div>
              <button onClick={() => setEditLeave(null)} style={{ background: "#dcfce7", border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", color: "#15803d", fontSize: 16 }}>✕</button>
            </div>
            <label style={{ color: "#166534", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Leave type</label>
            <select style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%", marginBottom: 10 }} value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <label style={{ color: "#166534", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Date</label>
            <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%", marginBottom: 10 }} type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
            <label style={{ color: "#166534", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Reason</label>
            <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%", marginBottom: 12 }} placeholder="Reason" value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ background: "linear-gradient(135deg,#15803d,#22c55e)", border: "none", borderRadius: 14, color: "#fff", padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", flex: 1 }} onClick={saveEdit}>Save changes</button>
              <button onClick={() => setEditLeave(null)} style={{ background: "#fff", border: "1.5px solid #22c55e", borderRadius: 14, color: "#15803d", padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DAILY BOARD ────────────────────────────────────────────────────────────
function AdminDailyBoard({ notify, activeOrgId }) {
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selBranch, setSelBranch] = useState("all");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("present");

  const load = async () => {
    setLoading(true);
    try {
      const [e, r, lv, b] = await Promise.all([
        GET("/api/employees", { org_id: activeOrgId }),
        GET("/api/attendance", { date, org_id: activeOrgId }),
        GET("/api/leaves", { from: date, to: date, org_id: activeOrgId }),
        GET("/api/branches", { org_id: activeOrgId }),
      ]);
      setEmployees((e || []).filter(x => x.role === "employee" && x.status === "active"));
      setRecords(r || []);
      setLeaves(lv || []);
      setBranches(b || []);
    } catch (err) { notify(err.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (activeOrgId) load(); }, [activeOrgId, date]);

  let emps = employees;
  if (selBranch !== "all") emps = emps.filter(e => e.branch_id === selBranch);

  const getEmpStatus = (emp) => {
    const rec = records.find(r => r.employee_id === emp.id && r.check_in_time);
    const leave = leaves.find(l => l.employee_id === emp.id);
    if (leave) return { status: "leave", type: leave.type, reason: leave.reason };
    if (rec) return {
      status: rec.is_late ? "late" : "present", rec,
      cin: String(rec.check_in_time || "").slice(0, 5),
      cout: String(rec.check_out_time || "").slice(0, 5),
      lateMins: rec.late_mins, workedMins: rec.worked_mins,
    };
    return { status: "absent" };
  };

  const present = emps.filter(e => ["present","late"].includes(getEmpStatus(e).status));
  const absent  = emps.filter(e => getEmpStatus(e).status === "absent");
  const onLeave = emps.filter(e => getEmpStatus(e).status === "leave");
  const late    = emps.filter(e => getEmpStatus(e).status === "late");

  const currentList = { present, late, absent, leave: onLeave }[tab] || [];

  const statusColor = { present: "#16a34a", late: "#d97706", absent: "#dc2626", leave: "#7c3aed" };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: "#166534", fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Daily Board</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "11px 14px", fontSize: 14, outline: "none", flex: 1 }} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <select style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#111827", padding: "11px 12px", fontSize: 13, outline: "none", flex: 1 }} value={selBranch} onChange={e => setSelBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[["Present", present.length, "#16a34a"], ["Late", late.length, "#d97706"], ["Absent", absent.length, "#dc2626"], ["Leave", onLeave.length, "#7c3aed"]].map(([l, v, c]) => (
          <div key={l} onClick={() => setTab(l.toLowerCase())} style={{ background: "#fff", borderRadius: 14, padding: "12px 8px", textAlign: "center", boxShadow: "0 2px 8px #86efac33", cursor: "pointer", outline: tab === l.toLowerCase() ? `2px solid ${c}` : "none" }}>
            <p style={{ color: c, fontSize: 22, fontWeight: 900 }}>{v}</p>
            <p style={{ color: "#6b7280", fontSize: 11 }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {[["present", `✅ Present (${present.length})`], ["late", `⚠ Late (${late.length})`], ["absent", `❌ Absent (${absent.length})`], ["leave", `🌿 Leave (${onLeave.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ background: tab === k ? "#16a34a" : "#dcfce7", border: "none", borderRadius: 20, padding: "7px 14px", cursor: "pointer", color: tab === k ? "#fff" : "#6b7280", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>

      <button onClick={load} style={{ background: "#f0faf4", border: "1.5px solid #86efac", borderRadius: 12, color: "#15803d", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>🔄 Refresh</button>

      {currentList.map(emp => {
        const es = getEmpStatus(emp);
        const sc = statusColor[es.status] || "#6b7280";
        return (
          <div key={emp.id} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: "0 2px 8px #86efac33", borderLeft: `4px solid ${sc}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: "#111827", fontWeight: 800 }}>{emp.name}</p>
                <p style={{ color: "#6b7280", fontSize: 12 }}>{emp.designation} · {emp.branch_name}</p>
                {(es.status === "present" || es.status === "late") && (
                  <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                    ▶ <strong style={{ color: "#16a34a" }}>{es.cin}</strong>
                    {es.cout && <> ⏹ <strong style={{ color: "#6366f1" }}>{es.cout}</strong></>}
                    {es.workedMins != null && <span> · ⏱ {Math.floor(es.workedMins / 60)}h {es.workedMins % 60}m</span>}
                    {es.status === "late" && <span style={{ color: "#d97706" }}> · {es.lateMins}m late</span>}
                  </p>
                )}
                {es.status === "leave" && <p style={{ color: "#7c3aed", fontSize: 12, marginTop: 3 }}>{es.type}{es.reason ? ` · ${es.reason}` : ""}</p>}
              </div>
              <span style={{ background: `${sc}18`, color: sc, fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>
                {es.status === "present" ? "Present" : es.status === "late" ? `Late ${es.lateMins}m` : es.status === "absent" ? "Absent" : es.type || "Leave"}
              </span>
            </div>
          </div>
        );
      })}
      {currentList.length === 0 && <div style={{ textAlign: "center", padding: "50px 20px" }}><p style={{ fontSize: 42, marginBottom: 12 }}>✅</p><p style={{ color: "#6b7280" }}>No employees in {tab} category</p></div>}
    </div>
  );
}


function EmpAdvances({ user, notify }) {
  const [advances, setAdvances] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", reason: "", needed_by_date: "", is_emergency: false });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    try {
      const [adv, sett] = await Promise.all([
        GET("/api/advances"),
        GET("/api/orgs/"+user.org_id+"/settings"),
      ]);
      setAdvances(adv || []);
      setSettings(sett || {});
    } catch (e) { notify(e.message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const noticeDays = settings.advance_notice_days || 5;
  const maxAmount = settings.max_advance_amount || 10000;

  // Check if request date is within 5 days notice
  const isWithinNotice = form.needed_by_date
    ? (new Date(form.needed_by_date) - new Date()) / (1000 * 60 * 60 * 24) < noticeDays
    : false;

  const submit = async () => {
    if (!form.amount || !form.reason) { notify("Amount and reason required", "error"); return; }
    if (Number(form.amount) > maxAmount) { notify(`Max advance is ${fmt(maxAmount)}`, "error"); return; }
    if (isWithinNotice && !form.is_emergency) {
      notify(`Advances must be requested ${noticeDays} days in advance. Mark as emergency if urgent.`, "warn");
      return;
    }
    try {
      await POST("/api/advances", { ...form, amount: Number(form.amount), org_id: user.org_id });
      notify("Advance request submitted ✓");
      setShowForm(false);
      setForm({ amount: "", reason: "", needed_by_date: "", is_emergency: false });
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const STATUS_COLORS = {
    pending:    { color: "#d97706", bg: "#fef3c7", label: "Pending" },
    approved:   { color: "#16a34a", bg: "#dcfce7", label: "Approved" },
    rejected:   { color: "#dc2626", bg: "#fee2e2", label: "Rejected" },
    paid:       { color: "#7c3aed", bg: "#ede9fe", label: "Paid" },
    recovering: { color: "#3b82f6", bg: "#eff6ff", label: "Recovering" },
    recovered:  { color: "#6b7280", bg: "#f3f4f6", label: "Recovered" },
  };

  const totalPending = advances.filter(a => ["approved","paid","recovering"].includes(a.status))
    .reduce((s, a) => s + (Number(a.amount) - Number(a.recovered_amount || 0)), 0);

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: C.g800, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Salary Advances</h2>

      {/* Policy notice */}
      <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <p style={{ color: "#92400e", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📋 Advance Policy</p>
        <p style={{ color: "#78350f", fontSize: 12, lineHeight: 1.6 }}>
          • Requests must be made <strong>{noticeDays} days in advance</strong><br />
          • Maximum advance: <strong>{fmt(maxAmount)}</strong><br />
          • Emergency requests can be made anytime — mark as emergency<br />
          • Amount deducted from salary over agreed months
        </p>
      </div>

      {/* Balance summary */}
      {totalPending > 0 && (
        <div style={{ background: `linear-gradient(135deg,${C.g800},${C.g600})`, borderRadius: 18, padding: 18, marginBottom: 16 }}>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Outstanding advance balance</p>
          <p style={{ color: C.white, fontSize: 28, fontWeight: 900 }}>{fmt(totalPending)}</p>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Being recovered from your salary</p>
        </div>
      )}

      <button onClick={() => setShowForm(!showForm)}
        style={{ ...S.btn, marginBottom: 16, background: showForm ? C.gr500 : `linear-gradient(135deg,${C.g700},${C.g500})` }}>
        {showForm ? "Cancel" : "+ Request Salary Advance"}
      </button>

      {/* Request form */}
      {showForm && (
        <div style={{ background: C.white, borderRadius: 20, padding: 20, marginBottom: 16, boxShadow: `0 2px 12px ${C.g300}44` }}>
          <p style={{ color: C.g800, fontWeight: 800, fontSize: 15, marginBottom: 14 }}>New advance request</p>

          <label style={S.label}>Amount needed (₹)</label>
          <input style={S.input} type="number" placeholder={`Max ${fmt(maxAmount)}`} value={form.amount} onChange={e => f("amount", e.target.value)} />

          <label style={S.label}>Reason for advance</label>
          <input style={S.input} placeholder="Explain why you need this advance" value={form.reason} onChange={e => f("reason", e.target.value)} />

          <label style={S.label}>Needed by date</label>
          <input style={S.input} type="date" value={form.needed_by_date} onChange={e => f("needed_by_date", e.target.value)} />

          {isWithinNotice && (
            <div style={{ background: "#fee2e2", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <p style={{ color: "#dc2626", fontWeight: 700, fontSize: 13 }}>
                ⚠ This date is within {noticeDays} days. Mark as emergency if urgent.
              </p>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16 }}>
            <input type="checkbox" checked={form.is_emergency} onChange={e => f("is_emergency", e.target.checked)}
              style={{ accentColor: C.red, width: 18, height: 18 }} />
            <div>
              <span style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>🚨 Emergency request</span>
              <p style={{ color: C.gr500, fontSize: 12 }}>For urgent situations — will go directly to org admin</p>
            </div>
          </label>

          <button style={S.btn} onClick={submit}>Submit request</button>
        </div>
      )}

      {/* Advance history */}
      <h3 style={{ color: C.g800, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>My advance history</h3>
      {advances.map(adv => {
        const sc = STATUS_COLORS[adv.status] || STATUS_COLORS.pending;
        const balance = Number(adv.amount) - Number(adv.recovered_amount || 0);
        return (
          <div key={adv.id} style={{ background: C.white, borderRadius: 18, padding: 16, marginBottom: 12, boxShadow: `0 2px 8px ${C.g300}33`, borderLeft: `4px solid ${sc.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <p style={{ color: C.gr900, fontWeight: 800, fontSize: 16 }}>{fmt(adv.amount)}</p>
                <p style={{ color: C.gr500, fontSize: 12 }}>Requested {fmtD(adv.requested_date)}</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ background: sc.bg, color: sc.color, fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>{sc.label}</span>
                {adv.is_emergency && <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>🚨 Emergency</span>}
              </div>
            </div>
            <p style={{ color: C.gr700, fontSize: 13, marginBottom: 4 }}>💬 {adv.reason}</p>
            {adv.payment_date && <p style={{ color: C.g600, fontSize: 12 }}>✅ Paid on {fmtD(adv.payment_date)} via {adv.bank_used || "—"}</p>}
            {adv.rejected_reason && <p style={{ color: C.red, fontSize: 12 }}>❌ {adv.rejected_reason}</p>}
            {["recovering", "paid"].includes(adv.status) && (
              <div style={{ background: C.g50, borderRadius: 10, padding: 10, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.gr500, fontSize: 12 }}>Recovered</span>
                  <span style={{ color: C.g600, fontWeight: 700, fontSize: 12 }}>{fmt(adv.recovered_amount || 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.gr500, fontSize: 12 }}>Balance</span>
                  <span style={{ color: balance > 0 ? C.red : C.g600, fontWeight: 700, fontSize: 12 }}>{fmt(balance)}</span>
                </div>
                <div style={{ background: C.g200, borderRadius: 6, height: 5, marginTop: 8 }}>
                  <div style={{ background: C.g600, height: 5, borderRadius: 6, width: `${Math.min(100, ((Number(adv.recovered_amount) / Number(adv.amount)) * 100))}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {advances.length === 0 && <Empty icon="💰" msg="No advance requests yet" />}
    </div>
  );
}

// ── ADMIN ADVANCES ────────────────────────────────────────────
function AdminAdvances({ user, notify, activeOrgId }) {
  const [advances, setAdvances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ payment_date: today(), payment_notes: "", bank_used: "", recovery_months: 1 });
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  // Manual payment recording
  const [showManual, setShowManual] = useState(false);
  const [manForm, setManForm] = useState({ employee_id: "", amount: "", reason: "", payment_date: today(), payment_notes: "", bank_used: "", is_emergency: true, recovery_months: 1 });
  const mf = (k, v) => setManForm(p => ({ ...p, [k]: v }));

  const BANKS = ["Cash", "SBI", "HDFC", "ICICI", "Axis", "Kotak", "Bank of Baroda", "Canara Bank", "PNB", "Other"];

  const STATUS_COLORS = {
    pending:    { color: "#d97706", bg: "#fef3c7", label: "Pending" },
    approved:   { color: "#16a34a", bg: "#dcfce7", label: "Approved" },
    rejected:   { color: "#dc2626", bg: "#fee2e2", label: "Rejected" },
    paid:       { color: "#7c3aed", bg: "#ede9fe", label: "Paid" },
    recovering: { color: "#3b82f6", bg: "#eff6ff", label: "Recovering" },
    recovered:  { color: "#6b7280", bg: "#f3f4f6", label: "Recovered" },
  };

  const load = async () => {
    setLoading(true);
    try {
      const [adv, emps] = await Promise.all([
        GET("/api/advances", { org_id: activeOrgId }),
        GET("/api/employees", { org_id: activeOrgId }),
      ]);
      setAdvances(adv || []);
      setEmployees((emps || []).filter(e => e.role === "employee"));
    } catch (e) { notify(e.message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (activeOrgId) load(); }, [activeOrgId]);

  const approve = async (adv) => {
    try {
      await PATCH(`/api/advances/${adv.id}`, { status: "approved" });
      notify("Advance approved ✓"); load();
    } catch (e) { notify(e.message, "error"); }
  };

  const reject = async () => {
    try {
      await PATCH(`/api/advances/${rejectModal.id}`, { status: "rejected", rejected_reason: rejectReason });
      notify("Advance rejected"); setRejectModal(null); setRejectReason(""); load();
    } catch (e) { notify(e.message, "error"); }
  };

  const recordPayment = async () => {
    try {
      await PATCH(`/api/advances/${payModal.id}`, {
        status: "recovering",
        payment_date: payForm.payment_date,
        payment_notes: payForm.payment_notes,
        bank_used: payForm.bank_used,
        recovery_months: Number(payForm.recovery_months),
        monthly_recovery: Number(payModal.amount) / Number(payForm.recovery_months),
      });
      notify("Payment recorded ✓"); setPayModal(null); load();
    } catch (e) { notify(e.message, "error"); }
  };

  const recordManual = async () => {
    if (!manForm.employee_id || !manForm.amount) { notify("Employee and amount required", "error"); return; }
    try {
      await POST("/api/advances/manual", { ...manForm, amount: Number(manForm.amount), org_id: activeOrgId, status: "recovering", recorded_by: user.id });
      notify("Payment recorded ✓"); setShowManual(false); setManForm({ employee_id: "", amount: "", reason: "", payment_date: today(), payment_notes: "", bank_used: "", is_emergency: true, recovery_months: 1 });
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const tabs = ["pending", "approved", "recovering", "all"];
  const filtered = tab === "all" ? advances : advances.filter(a => a.status === tab);
  const pendingCount = advances.filter(a => a.status === "pending").length;
  const totalOutstanding = advances.filter(a => ["recovering", "paid", "approved"].includes(a.status))
    .reduce((s, a) => s + Math.max(0, Number(a.amount) - Number(a.recovered_amount || 0)), 0);

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: C.g800, fontSize: 22, fontWeight: 800 }}>Salary Advances</h2>
        <button onClick={() => setShowManual(!showManual)}
          style={{ ...S.btn, width: "auto", padding: "8px 14px", fontSize: 12, background: showManual ? C.gr500 : C.violet }}>
          {showManual ? "Cancel" : "+ Record Payment"}
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.amber + "20", border: `1px solid ${C.amber}`, borderRadius: 16, padding: 14 }}>
          <p style={{ color: C.amber, fontWeight: 900, fontSize: 22 }}>{pendingCount}</p>
          <p style={{ color: C.gr500, fontSize: 12 }}>Pending approval</p>
        </div>
        <div style={{ background: C.red + "15", border: `1px solid ${C.red}`, borderRadius: 16, padding: 14 }}>
          <p style={{ color: C.red, fontWeight: 900, fontSize: 18 }}>{fmt(totalOutstanding)}</p>
          <p style={{ color: C.gr500, fontSize: 12 }}>Total outstanding</p>
        </div>
      </div>

      {/* Manual payment recording */}
      {showManual && (
        <div style={{ background: "#ede9fe", border: `1px solid ${C.violet}`, borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <p style={{ color: C.violet, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Record a cash/bank payment given</p>
          <p style={{ color: "#7c3aed99", fontSize: 12, marginBottom: 14 }}>Use this when you gave money directly without a prior request</p>

          <label style={S.label}>Employee</label>
          <select style={S.select} value={manForm.employee_id} onChange={e => mf("employee_id", e.target.value)}>
            <option value="">Select employee</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.branch_name}</option>)}
          </select>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={S.label}>Amount (₹)</label><input style={S.input} type="number" placeholder="Amount" value={manForm.amount} onChange={e => mf("amount", e.target.value)} /></div>
            <div><label style={S.label}>Payment date</label><input style={S.input} type="date" value={manForm.payment_date} onChange={e => mf("payment_date", e.target.value)} /></div>
          </div>

          <label style={S.label}>Bank / payment method</label>
          <select style={S.select} value={manForm.bank_used} onChange={e => mf("bank_used", e.target.value)}>
            <option value="">Select bank / method</option>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <label style={S.label}>Reason / notes</label>
          <input style={S.input} placeholder="Reason for advance" value={manForm.reason} onChange={e => mf("reason", e.target.value)} />

          <input style={S.input} placeholder="Additional notes" value={manForm.payment_notes} onChange={e => mf("payment_notes", e.target.value)} />

          <label style={S.label}>Recover over (months)</label>
          <select style={S.select} value={manForm.recovery_months} onChange={e => mf("recovery_months", e.target.value)}>
            {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""} — {manForm.amount ? fmt(Number(manForm.amount) / n) : "₹—"}/month</option>)}
          </select>

          <button style={S.btn} onClick={recordManual}>Record payment</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: tab === t ? C.g600 : C.g100, border: "none", borderRadius: 20, padding: "7px 14px", cursor: "pointer", color: tab === t ? C.white : C.gr500, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", textTransform: "capitalize" }}>
            {t === "pending" ? `⏳ Pending (${pendingCount})` : t === "recovering" ? "🔄 Recovering" : t === "all" ? "📋 All" : "✅ Approved"}
          </button>
        ))}
      </div>

      {filtered.map(adv => {
        const sc = STATUS_COLORS[adv.status] || STATUS_COLORS.pending;
        const balance = Number(adv.amount) - Number(adv.recovered_amount || 0);
        const empName = employees.find(e => e.id === adv.employee_id)?.name || adv.employee_name || "—";
        return (
          <div key={adv.id} style={{ background: C.white, borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: `0 2px 10px ${C.g300}44`, borderLeft: `4px solid ${sc.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ color: C.gr900, fontWeight: 800, fontSize: 15 }}>{empName}</p>
                  {adv.is_emergency && <span style={{ background: "#fee2e2", color: C.red, fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 700 }}>🚨 Emergency</span>}
                </div>
                <p style={{ color: C.gr500, fontSize: 12 }}>Requested {fmtD(adv.requested_date)}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ color: C.gr900, fontWeight: 900, fontSize: 18 }}>{fmt(adv.amount)}</p>
                <span style={{ background: sc.bg, color: sc.color, fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>{sc.label}</span>
              </div>
            </div>

            <p style={{ color: C.gr700, fontSize: 13, marginBottom: 8 }}>💬 {adv.reason}</p>
            {adv.needed_by_date && <p style={{ color: C.gr500, fontSize: 12, marginBottom: 6 }}>📅 Needed by: {fmtDF(adv.needed_by_date)}</p>}
            {adv.payment_date && (
              <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <p style={{ color: C.g700, fontSize: 12, fontWeight: 700 }}>✅ Paid {fmtD(adv.payment_date)} via {adv.bank_used || "—"}</p>
                {adv.payment_notes && <p style={{ color: C.gr500, fontSize: 12 }}>{adv.payment_notes}</p>}
                <p style={{ color: C.g600, fontSize: 12 }}>Recovery: {fmt(adv.monthly_recovery || 0)}/month × {adv.recovery_months} months</p>
              </div>
            )}

            {["recovering", "paid"].includes(adv.status) && (
              <div style={{ background: C.g50, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.gr500, fontSize: 12 }}>Recovered: {fmt(adv.recovered_amount || 0)}</span>
                  <span style={{ color: balance > 0 ? C.red : C.g600, fontWeight: 700, fontSize: 12 }}>Balance: {fmt(balance)}</span>
                </div>
                <div style={{ background: C.g200, borderRadius: 6, height: 6 }}>
                  <div style={{ background: C.g600, height: 6, borderRadius: 6, width: `${Math.min(100, (Number(adv.recovered_amount) / Number(adv.amount)) * 100)}%` }} />
                </div>
              </div>
            )}

            {adv.status === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...S.btn, flex: 1, background: C.g600, padding: "10px" }} onClick={() => approve(adv)}>✓ Approve</button>
                <button style={{ ...S.btn, flex: 1, background: C.red, padding: "10px" }} onClick={() => { setRejectModal(adv); setRejectReason(""); }}>✕ Reject</button>
              </div>
            )}
            {adv.status === "approved" && (
              <button style={{ ...S.btn, background: C.violet, padding: "10px" }} onClick={() => { setPayModal(adv); setPayForm({ payment_date: today(), payment_notes: "", bank_used: "", recovery_months: 1 }); }}>
                💳 Record Payment
              </button>
            )}
            {(user.role === "super_admin" || user.role === "org_admin") && adv.status === "recovering" && (
              <button style={{ ...S.outline, width: "100%", marginTop: 8 }} onClick={() => { setPayModal(adv); setPayForm({ payment_date: today(), payment_notes: "", bank_used: adv.bank_used || "", recovery_months: adv.recovery_months || 1 }); }}>
                ✏️ Edit payment details
              </button>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && <Empty icon="💰" msg="No advances in this category" />}

      {/* Payment modal */}
      {payModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ color: C.g800, fontWeight: 800, fontSize: 17 }}>Record Payment</p>
                <p style={{ color: C.gr500, fontSize: 13 }}>{fmt(payModal.amount)} advance</p>
              </div>
              <button onClick={() => setPayModal(null)} style={S.iconBtn}>✕</button>
            </div>

            <label style={S.label}>Payment date</label>
            <input style={S.input} type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />

            <label style={S.label}>Bank / payment method</label>
            <select style={S.select} value={payForm.bank_used} onChange={e => setPayForm(f => ({ ...f, bank_used: e.target.value }))}>
              <option value="">Select bank / method</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            <label style={S.label}>Recovery period</label>
            <select style={S.select} value={payForm.recovery_months} onChange={e => setPayForm(f => ({ ...f, recovery_months: e.target.value }))}>
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""} — {fmt(Number(payModal.amount) / n)}/month</option>)}
            </select>

            <label style={S.label}>Notes</label>
            <input style={S.input} placeholder="Any additional notes" value={payForm.payment_notes} onChange={e => setPayForm(f => ({ ...f, payment_notes: e.target.value }))} />

            <button style={S.btn} onClick={recordPayment}>Save payment record</button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ color: C.g800, fontWeight: 800, fontSize: 17 }}>Reject advance</p>
              <button onClick={() => setRejectModal(null)} style={S.iconBtn}>✕</button>
            </div>
            <label style={S.label}>Reason for rejection</label>
            <input style={S.input} placeholder="Explain why this is being rejected" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <button style={{ ...S.btn, background: C.red }} onClick={reject}>Reject advance</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ATTENDANCE CALENDAR ───────────────────────────────────────
function AttendanceCalendar({ user, notify, isAdmin, activeOrgId }) {
  const [selMonth, setSelMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; });
  const [selEmp, setSelEmp] = useState(isAdmin ? "" : user.id);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      GET("/api/employees", { org_id: activeOrgId || user.org_id })
        .then(e => setEmployees((e || []).filter(x => x.role === "employee")))
        .catch(() => {});
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (!selEmp) return;
    setLoading(true);
    const [y, m] = selMonth.split("-").map(Number);
    const from = `${y}-${pad(m)}-01`;
    const to = new Date(y, m, 0).toISOString().split("T")[0];
    Promise.all([
      GET("/api/attendance", { from, to, employee_id: selEmp, org_id: activeOrgId || user.org_id }),
      GET("/api/leaves", { from, to, employee_id: selEmp, org_id: activeOrgId || user.org_id }),
    ]).then(([att, lv]) => { setRecords(att || []); setLeaves(lv || []); })
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, [selEmp, selMonth]);

  const [y, m] = selMonth.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();

  const getDayStatus = (day) => {
    const ds = `${y}-${pad(m)}-${pad(day)}`;
    const d = new Date(ds + "T12:00:00");
    if (d.getDay() === 0) return "sunday";
    const leave = leaves.find(l => String(l.date).split("T")[0] === ds);
    if (leave) return leave.type === "casual" ? "casual" : leave.type === "unauthorized" ? "unauthorized" : "leave";
    const rec = records.find(r => String(r.date).split("T")[0] === ds && r.check_in_time);
    if (rec) return rec.is_late ? "late" : "present";
    if (d <= new Date()) return "absent";
    return "future";
  };

  const DAY_STYLES = {
    present:      { bg: "#dcfce7", color: "#15803d", border: "#86efac", label: "P" },
    late:         { bg: "#fef3c7", color: "#d97706", border: "#fcd34d", label: "L" },
    absent:       { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5", label: "A" },
    casual:       { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd", label: "CL" },
    unauthorized: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5", label: "UL" },
    leave:        { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", label: "L" },
    sunday:       { bg: "#f9fafb", color: "#d1d5db", border: "#e5e7eb", label: "—" },
    future:       { bg: "#fff", color: "#d1d5db", border: "#f3f4f6", label: "" },
  };

  // Summary counts
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const counts = days.reduce((acc, d) => {
    const st = getDayStatus(d);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  const empName = isAdmin
    ? employees.find(e => e.id === selEmp)?.name || "Employee"
    : user.name;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: C.g800, fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Attendance Calendar</h2>

      <input style={{ ...S.input, marginBottom: 10 }} type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} />

      {isAdmin && (
        <select style={{ ...S.select, marginBottom: 14 }} value={selEmp} onChange={e => setSelEmp(e.target.value)}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.branch_name}</option>)}
        </select>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {Object.entries(DAY_STYLES).filter(([k]) => !["future"].includes(k)).map(([k, v]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.gr500 }}>
            <span style={{ width: 14, height: 14, background: v.bg, border: `1px solid ${v.border}`, borderRadius: 3, display: "inline-block" }} />{v.label === "P" ? "Present" : v.label === "L" && k === "late" ? "Late" : v.label === "A" ? "Absent" : v.label === "CL" ? "Casual" : v.label === "UL" ? "Unauth" : v.label === "—" ? "Sunday" : "Leave"}
          </span>
        ))}
      </div>

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[["Present", (counts.present || 0) + (counts.late || 0), "#16a34a"],
          ["Late", counts.late || 0, "#d97706"],
          ["Absent", counts.absent || 0, "#dc2626"],
          ["Leave", (counts.casual || 0) + (counts.unauthorized || 0) + (counts.leave || 0), "#7c3aed"]
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: C.white, borderRadius: 12, padding: "10px 6px", textAlign: "center", boxShadow: `0 2px 6px ${C.g300}33` }}>
            <p style={{ color: c, fontSize: 20, fontWeight: 900 }}>{v}</p>
            <p style={{ color: C.gr500, fontSize: 10 }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {(!selEmp && isAdmin) ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.gr500 }}>Select an employee to view their calendar</div>
      ) : loading ? <Spinner /> : (
        <div style={{ background: C.white, borderRadius: 20, padding: 16, boxShadow: `0 2px 12px ${C.g300}44` }}>
          <p style={{ color: C.g800, fontWeight: 800, marginBottom: 12, textAlign: "center" }}>
            {empName} — {new Date(y, m - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </p>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, color: d === "Sun" ? C.red : C.gr500, fontWeight: 700, padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          {/* Calendar cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
            {/* Empty cells for first week offset */}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
            {days.map(day => {
              const st = getDayStatus(day);
              const ds = DAY_STYLES[st] || DAY_STYLES.future;
              const rec = records.find(r => String(r.date).split("T")[0] === `${y}-${pad(m)}-${pad(day)}`);
              const isToday = day === new Date().getDate() && m === new Date().getMonth() + 1 && y === new Date().getFullYear();
              return (
                <div key={day} title={rec ? `In: ${String(rec.check_in_time || "").slice(0, 5)} Out: ${String(rec.check_out_time || "").slice(0, 5)}` : ""}
                  style={{ background: ds.bg, border: `1.5px solid ${isToday ? C.g600 : ds.border}`, borderRadius: 8, padding: "6px 2px", textAlign: "center", cursor: rec ? "pointer" : "default", position: "relative" }}>
                  <div style={{ fontSize: 11, color: C.gr500, marginBottom: 2 }}>{day}</div>
                  <div style={{ fontSize: 9, color: ds.color, fontWeight: 700 }}>{ds.label}</div>
                  {isToday && <div style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, background: C.g600, borderRadius: "50%" }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HIERARCHY TABLE ───────────────────────────────────────────
function HierarchyTable({ user, notify, activeOrgId }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [newManager, setNewManager] = useState("");

  useEffect(() => {
    if (!activeOrgId) return;
    GET("/api/employees", { org_id: activeOrgId })
      .then(e => setEmployees(e || []))
      .catch(err => notify(err.message, "error"))
      .finally(() => setLoading(false));
  }, [activeOrgId]);

  const saveManager = async (empId) => {
    try {
      await PATCH(`/api/employees/${empId}`, { manager_id: newManager || null });
      notify("Reporting line updated ✓");
      setEditing(null);
      GET("/api/employees", { org_id: activeOrgId }).then(e => setEmployees(e || []));
    } catch (e) { notify(e.message, "error"); }
  };

  const ROLE_ORDER = { org_admin: 1, branch_admin: 2, employee: 3 };
  const sorted = [...employees].sort((a, b) => (ROLE_ORDER[a.role] || 9) - (ROLE_ORDER[b.role] || 9) || a.name.localeCompare(b.name));

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: C.g800, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Reporting Hierarchy</h2>
      <p style={{ color: C.gr500, fontSize: 13, marginBottom: 16 }}>Who reports to whom — used for leave and advance approvals</p>

      {/* Approval flow info */}
      <div style={{ background: C.g50, borderRadius: 16, padding: 16, marginBottom: 20, border: `1px solid ${C.g200}` }}>
        <p style={{ color: C.g800, fontWeight: 800, marginBottom: 8 }}>Approval flow</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {[["Leave requests", "Branch Admin"], ["Advance requests", "Org Admin"], ["Emergency advances", "Super Admin / Org Admin"]].map(([type, approver]) => (
            <div key={type} style={{ background: C.white, borderRadius: 10, padding: "8px 12px", border: `1px solid ${C.g200}` }}>
              <p style={{ color: C.gr500, fontSize: 10 }}>{type}</p>
              <p style={{ color: C.g700, fontWeight: 700, fontSize: 12 }}>→ {approver}</p>
            </div>
          ))}
        </div>
      </div>

      {sorted.map(emp => {
        const manager = employees.find(e => e.id === emp.manager_id);
        const directReports = employees.filter(e => e.manager_id === emp.id);
        const rc = ROLE_CFG[emp.role] || {};
        return (
          <div key={emp.id} style={{ background: C.white, borderRadius: 16, padding: 16, marginBottom: 10, boxShadow: `0 2px 8px ${C.g300}22`, borderLeft: `4px solid ${rc.color || C.g300}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p style={{ color: C.gr900, fontWeight: 800 }}>{emp.name}</p>
                  <span style={{ background: rc.color + "20", color: rc.color, fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{rc.label}</span>
                </div>
                <p style={{ color: C.gr500, fontSize: 12 }}>{emp.designation} · {emp.branch_name}</p>
                <p style={{ color: C.gr500, fontSize: 12, marginTop: 4 }}>
                  Reports to: <strong style={{ color: manager ? C.g700 : C.gr300 }}>{manager?.name || "— (No manager set)"}</strong>
                </p>
                {directReports.length > 0 && (
                  <p style={{ color: C.gr500, fontSize: 12 }}>
                    Manages: {directReports.map(r => r.name).join(", ")}
                  </p>
                )}
              </div>
              {(user?.role==="super_admin"||user?.role==="org_admin")&&(
                <button onClick={() => { setEditing(emp.id); setNewManager(emp.manager_id || ""); }}
                  style={{ ...S.outline, padding: "6px 12px", fontSize: 12 }}>✏️</button>
              )}
            </div>

            {editing === emp.id && (
              <div style={{ marginTop: 12, padding: 12, background: C.g50, borderRadius: 12 }}>
                <label style={S.label}>Reports to</label>
                <select style={{ ...S.select, marginBottom: 10 }} value={newManager} onChange={e => setNewManager(e.target.value)}>
                  <option value="">— No manager —</option>
                  {employees.filter(e => e.id !== emp.id).map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({ROLE_CFG[e.role]?.label})</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.btn, flex: 1, padding: "10px" }} onClick={() => saveManager(emp.id)}>Save</button>
                  <button onClick={() => setEditing(null)} style={{ ...S.outline, flex: 1 }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}



// ── RESET PASSWORD (Admin) ────────────────────────────────────
function ResetPasswordBox({empId, empName, notify}) {
  const [show,setShow]=useState(false);
  const [newPw,setNewPw]=useState("");
  const [loading,setLoading]=useState(false);
  const reset=async()=>{
    if(!newPw||newPw.length<4){notify("Minimum 4 characters","error");return;}
    setLoading(true);
    try{
      await POST("/api/employees/"+empId+"/reset-password",{password:newPw});
      notify(`✅ Password reset for ${empName}`);
      setShow(false);setNewPw("");
    }catch(e){notify(e.message,"error");}
    finally{setLoading(false);}
  };
  return(
    <div style={{marginTop:12,background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:14,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <p style={{color:"#92400e",fontWeight:700,fontSize:13}}>🔑 Reset Password</p>
        <button onClick={()=>setShow(!show)} style={{background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:8,padding:"4px 12px",cursor:"pointer",color:"#92400e",fontWeight:700,fontSize:12}}>{show?"Cancel":"Reset"}</button>
      </div>
      {show&&(
        <div style={{marginTop:10}}>
          <label style={S.label}>New password for {empName}</label>
          <input style={S.input} type="password" placeholder="Min 4 characters" value={newPw} onChange={e=>setNewPw(e.target.value)}/>
          <button style={{...S.btn,background:"#d97706"}} onClick={reset} disabled={loading}>{loading?"Saving...":"Set new password"}</button>
          <p style={{color:"#92400e",fontSize:11,marginTop:6}}>⚠ Share this password securely with the employee</p>
        </div>
      )}
    </div>
  );
}

// ── CHANGE PASSWORD (Employee) ────────────────────────────────
function ChangePasswordBox({notify}) {
  const [form,setForm]=useState({current:"",newPw:"",confirm:""});
  const [loading,setLoading]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const submit=async()=>{
    if(!form.current||!form.newPw){notify("Fill all fields","error");return;}
    if(form.newPw!==form.confirm){notify("Passwords don't match","error");return;}
    if(form.newPw.length<4){notify("Minimum 4 characters","error");return;}
    setLoading(true);
    try{
      await POST("/api/auth/change-password",{current_password:form.current,new_password:form.newPw});
      notify("✅ Password changed successfully");
      setForm({current:"",newPw:"",confirm:""});
    }catch(e){notify(e.message,"error");}
    finally{setLoading(false);}
  };
  return(
    <div>
      <label style={S.label}>Current password</label>
      <input style={S.input} type="password" placeholder="Current password" value={form.current} onChange={e=>f("current",e.target.value)}/>
      <label style={S.label}>New password</label>
      <input style={S.input} type="password" placeholder="New password (min 4 chars)" value={form.newPw} onChange={e=>f("newPw",e.target.value)}/>
      <label style={S.label}>Confirm new password</label>
      <input style={S.input} type="password" placeholder="Confirm new password" value={form.confirm} onChange={e=>f("confirm",e.target.value)}/>
      <button style={S.btn} onClick={submit} disabled={loading}>{loading?"Saving...":"Change Password"}</button>
    </div>
  );
}


// ── BRANCH ADMIN PERSONAL VIEW ────────────────────────────────
function BranchAdminPersonalView({user, notify, page, setPage}) {
  const [showScanner, setShowScanner] = useState(false);
  const [branches, setBranches] = useState([]);
  const [todayAtt, setTodayAtt] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [br, att] = await Promise.all([
        GET("/api/branches"),
        GET("/api/attendance", {date: today(), employee_id: user.id}),
      ]);
      setBranches((br||[]).filter(b=>b.org_id===user.org_id));
      const slot1 = (att||[]).find(r=>r.slot===1||!r.slot);
      const slot2 = (att||[]).find(r=>r.slot===2);
      setTodayAtt({
        cin: slot1, cout: slot1?.check_out_time?slot1:null,
        slot2cin: slot2, slot2cout: slot2?.check_out_time?slot2:null,
      });
    } catch(e) { notify(e.message,"error"); }
    finally { setLoading(false); }
  },[user.id]);

  useEffect(()=>{ load(); },[load]);

  const handleScan = (qd) => {
    setShowScanner(false);
    const scBr = branches.find(b=>b.id===qd.branchId);
    if(!scBr){notify("Branch not found","error");return;}
    if(todayAtt?.cin&&todayAtt?.cout&&todayAtt?.slot2cout){notify("Both shifts complete","error");return;}
    notify("📍 Checking location…","info");
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(
        pos=>{
          const dist=geoDist(pos.coords.latitude,pos.coords.longitude,scBr.lat,scBr.lng);
          if(dist>(scBr.radius||200)){notify(`❌ ${Math.round(dist)}m away. Must be within ${scBr.radius||200}m`,"error");return;}
          processAtt(qd.branchId,pos.coords);
        },
        ()=>processAtt(qd.branchId,null),
        {timeout:10000,enableHighAccuracy:true,maximumAge:0}
      );
    } else processAtt(qd.branchId,null);
  };

  const processAtt = async (branchId, coords) => {
    try {
      const fp = await getDeviceFingerprint();
      if(!todayAtt?.cin||(todayAtt?.cin?.check_out_time&&!todayAtt?.slot2cin)){
        const res = await POST("/api/attendance/checkin",{branch_id:branchId,geo_lat:coords?.latitude,geo_lng:coords?.longitude,geo_verified:!!coords,device_fp:fp});
        if(res.blocked){notify(res.error,"error");return;}
        if(res.needsApproval) notify(`${res.lateMins}m late — approval sent ⏳`,"warn");
        else if(res.isLate) notify(`Checked in ${res.lateMins}m late ⚠`,"warn");
        else notify(`✅ Checked in — Shift ${res.slot||1}`);
      } else {
        const cinTime = todayAtt.cin?.check_in_time;
        if(cinTime){
          const diff = toM(nowT())-toM(String(cinTime).slice(0,5));
          if(diff<30){notify(`⚠ Minimum 30 minutes required. ${30-diff} mins remaining.`,"warn");return;}
        }
        if(!window.confirm("Are you sure you want to check out?")) return;
        const res = await POST("/api/attendance/checkout",{geo_lat:coords?.latitude,geo_lng:coords?.longitude,geo_verified:!!coords});
        const h=Math.floor((res.worked_mins||0)/60),m=(res.worked_mins||0)%60;
        if(res.capped) notify(`⚠ ${res.message}`,"warn");
        else notify(`✅ Checked out — ${h}h ${m}m`);
      }
      load();
    } catch(e){ notify(e.message,"error"); }
  };

  const myBranch = branches.find(b=>b.id===user.branch_id);
  const empNav=[{k:"home",i:"🏠",l:"Home"},{k:"shifts",i:"📅",l:"Shifts"},{k:"history",i:"📋",l:"History"},{k:"salary",i:"💰",l:"Salary"},{k:"advances",i:"💳",l:"Advance"},{k:"profile",i:"👤",l:"Profile"}];
  const empPages={
    home: <EmpHome user={user} branch={myBranch} todayAtt={todayAtt} loading={loading} onScan={()=>setShowScanner(true)}/>,
    shifts: <EmpShifts user={user} notify={notify}/>,
    history: <EmpHistory user={user} notify={notify}/>,
    salary: <EmpSalary user={user} notify={notify}/>,
    advances: <EmpAdvances user={user} notify={notify}/>,
    profile: <EmpProfile user={user} notify={notify}/>,
  };

  return(
    <>
      {showScanner&&<QRScanner onScan={handleScan} onClose={()=>setShowScanner(false)} branches={branches}/>}
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{empPages[page]||empPages.home}</div>
      <BottomNav items={empNav} page={page} setPage={setPage}/>
    </>
  );
}


// ── DEVICE BLOCK MANAGER ─────────────────────────────────────
function DeviceBlockManager({notify, activeOrgId}) {
  const [blocks,setBlocks]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(false);
  const [selEmp,setSelEmp]=useState("");
  const [show,setShow]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const [b,e]=await Promise.all([
        GET("/api/device-blocks",{org_id:activeOrgId}),
        GET("/api/employees",{org_id:activeOrgId}),
      ]);
      setBlocks(b||[]);
      setEmployees((e||[]).filter(x=>x.role==="employee"||x.role==="branch_admin"));
    }catch(err){notify(err.message,"error");}
    finally{setLoading(false);}
  };

  const clearOne=async(empId)=>{
    try{await PATCH("/api/device-blocks/clear",{employee_id:empId,org_id:activeOrgId});notify("Device block cleared ✓");load();}
    catch(err){notify(err.message,"error");}
  };

  const clearAll=async()=>{
    if(!window.confirm("Clear all device fingerprints for today?")) return;
    try{await PATCH("/api/device-blocks/clear",{clear_all:true,org_id:activeOrgId});notify("All blocks cleared ✓");load();}
    catch(err){notify(err.message,"error");}
  };

  return(
    <div style={{background:C.white,borderRadius:20,padding:20,marginTop:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <p style={{color:C.g800,fontWeight:800,fontSize:15}}>🔒 Device Blocks</p>
        <button onClick={()=>{setShow(!show);if(!show)load();}} style={{background:C.g100,border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",color:C.g700,fontWeight:700,fontSize:12}}>{show?"Hide":"Manage"}</button>
      </div>
      <p style={{color:C.gr500,fontSize:12,marginBottom:show?12:0}}>Clear device block if an employee can't mark attendance</p>
      {show&&(
        <div>
          {loading?<Spinner/>:(
            <>
              {blocks.filter(b=>Number(b.unique_employees)>1).length>0&&(
                <div style={{background:"#fee2e2",borderRadius:12,padding:12,marginBottom:12}}>
                  <p style={{color:C.red,fontWeight:700,fontSize:13,marginBottom:6}}>⚠ Shared device detected today</p>
                  {blocks.filter(b=>Number(b.unique_employees)>1).map((b,i)=>(
                    <p key={i} style={{color:C.red,fontSize:12}}>Same device: {Array.isArray(b.employees)?b.employees.join(", "):b.employees}</p>
                  ))}
                </div>
              )}
              <label style={S.label}>Clear block for specific employee</label>
              <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
                <option value="">Select employee</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.name} — {e.branch_name}</option>)}
              </select>
              <div style={{display:"flex",gap:8}}>
                <button style={{...S.btn,flex:1,background:C.amber,padding:"10px"}} onClick={()=>{if(!selEmp){notify("Select employee","error");return;}clearOne(selEmp);}}>🔓 Clear employee</button>
                <button style={{...S.btn,flex:1,background:C.red,padding:"10px"}} onClick={clearAll}>🗑 Clear all today</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ── NOTIFICATION BELL ─────────────────────────────────────────
function NotificationBell({user}) {
  const [count, setCount] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);

  const loadCount = async () => {
    try {
      const r = await GET("/api/notifications/count");
      setCount(r.count || 0);
      // Update PWA badge
      if('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(()=>null);
        reg?.active?.postMessage({type:'SET_BADGE', count: r.count||0});
      }
      if('setAppBadge' in navigator) navigator.setAppBadge(r.count||0).catch(()=>{});
    } catch(e) {}
  };

  const loadNotifs = async () => {
    try {
      const r = await GET("/api/notifications");
      setNotifs(r||[]);
    } catch(e) {}
  };

  const markRead = async () => {
    try {
      await PATCH("/api/notifications/read", {});
      setCount(0);
      if('clearAppBadge' in navigator) navigator.clearAppBadge().catch(()=>{});
      if('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(()=>null);
        reg?.active?.postMessage({type:'CLEAR_BADGE'});
      }
      loadNotifs();
    } catch(e) {}
  };

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  const TYPE_ICON = {
    approval_request: '⏰', approval_decision: '✅',
    advance_request: '💰', shift_request: '🔄',
  };

  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>{setOpen(!open);if(!open){loadNotifs();markRead();}}}
        style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:12,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
        <span style={{fontSize:18}}>🔔</span>
        {count>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"}}>{count>9?"9+":count}</span>}
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:46,width:300,background:"#fff",borderRadius:16,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",zIndex:200,maxHeight:400,overflowY:"auto"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f0faf4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <p style={{color:"#166534",fontWeight:800,fontSize:14}}>Notifications</p>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b7280",fontSize:16}}>✕</button>
          </div>
          {notifs.length===0
            ? <p style={{color:"#6b7280",fontSize:13,padding:"20px",textAlign:"center"}}>No notifications</p>
            : notifs.map(n=>(
              <div key={n.id} style={{padding:"12px 16px",borderBottom:"1px solid #f9fafb",background:n.is_read?"#fff":"#f0faf4"}}>
                <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:18}}>{TYPE_ICON[n.type]||"🔔"}</span>
                  <div style={{flex:1}}>
                    <p style={{color:"#111827",fontWeight:700,fontSize:13}}>{n.title}</p>
                    <p style={{color:"#6b7280",fontSize:12}}>{n.body}</p>
                    <p style={{color:"#9ca3af",fontSize:11,marginTop:2}}>{new Date(n.created_at).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── SERVICE WORKER & PUSH REGISTRATION ───────────────────────
async function registerPush(userId) {
  try {
    if(!('serviceWorker' in navigator)||!('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.register('/sw.js');
    const vapidRes = await GET("/api/push/vapid-public-key");
    if(!vapidRes.key) return;
    const permission = await Notification.requestPermission();
    if(permission !== 'granted') return;
    const existing = await reg.pushManager.getSubscription();
    if(existing) {
      await POST("/api/push/subscribe", existing.toJSON());
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidRes.key,
    });
    await POST("/api/push/subscribe", sub.toJSON());
  } catch(e) { console.log('Push registration skipped:', e.message); }
}


// ── DEVICE RESET BOX (Admin) ──────────────────────────────────
function DeviceResetBox({empId, empName, notify}) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasDevice, setHasDevice] = useState(null);

  useEffect(()=>{
    if(show) {
      GET("/api/devices").then(devs=>{
        const emp = devs.find(d=>d.id===empId);
        setHasDevice(!!emp?.registered_device_fp);
      }).catch(()=>{});
    }
  },[show]);

  const reset = async () => {
    if(!window.confirm(`Reset registered device for ${empName}? They can register a new device on their next check-in.`)) return;
    setLoading(true);
    try {
      await PATCH("/api/devices/"+empId+"/reset", {});
      notify(`✅ Device reset for ${empName} — they can register a new device`);
      setShow(false); setHasDevice(false);
    } catch(e) { notify(e.message,"error"); }
    finally { setLoading(false); }
  };

  return(
    <div style={{marginTop:8,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:14,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <p style={{color:"#1d4ed8",fontWeight:700,fontSize:13}}>📱 Registered Device</p>
        <button onClick={()=>setShow(!show)} style={{background:"#dbeafe",border:"1px solid #bfdbfe",borderRadius:8,padding:"4px 12px",cursor:"pointer",color:"#1d4ed8",fontWeight:700,fontSize:12}}>{show?"Hide":"View"}</button>
      </div>
      {show&&(
        <div style={{marginTop:10}}>
          <p style={{color:"#3b82f6",fontSize:13,marginBottom:10}}>
            {hasDevice===null?"Checking..." : hasDevice ? "✅ Device registered — employee can check in" : "⚠ No device registered — will register on next check-in"}
          </p>
          {hasDevice&&<button style={{...S.btn,background:"#1d4ed8",padding:"10px"}} onClick={reset} disabled={loading}>{loading?"Resetting...":"🔄 Reset device"}</button>}
          <p style={{color:"#6b7280",fontSize:11,marginTop:6}}>After reset, employee must use their phone to check in — that phone becomes their new registered device</p>
        </div>
      )}
    </div>
  );
}


// ── JOB CATEGORIES MANAGER ────────────────────────────────────
function JobCategoriesManager({notify, activeOrgId}) {
  const [cats, setCats] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({name:"",working_days_type:26,sunday_off:true,cl_per_month:2,sl_per_month:1,paid_off_days:0,description:""});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const load=async()=>{
    GET("/api/job-categories").then(c=>setCats(c||[])).catch(()=>{});
  };
  useEffect(()=>{if(activeOrgId)load();},[activeOrgId]);

  const save=async()=>{
    if(!form.name){notify("Category name required","error");return;}
    try{
      const catData={...form,sunday_off:form.weekly_off!=="none",org_id:activeOrgId};
      if(editing) await PATCH(`/api/job-categories/${editing}`,catData);
      else await POST("/api/job-categories",catData);
      notify("Category saved ✓"); setShow(false); setEditing(null);
      setForm({name:"",working_days_type:26,weekly_off:"sunday",sunday_off:true,cl_per_month:2,sl_per_month:1,paid_off_days:0,description:""});
      load();
    }catch(e){notify(e.message,"error");}
  };

  const del=async(id)=>{
    if(!window.confirm("Delete this category?")) return;
    try{await DEL(`/api/job-categories/${id}`);notify("Deleted");load();}
    catch(e){notify(e.message,"error");}
  };

  const startEdit=(cat)=>{
    setEditing(cat.id);
    setForm({name:cat.name,working_days_type:cat.working_days_type,weekly_off:cat.weekly_off||"sunday",sunday_off:cat.sunday_off,cl_per_month:cat.cl_per_month,sl_per_month:cat.sl_per_month,paid_off_days:cat.paid_off_days,description:cat.description||""});
    setShow(true);
  };

  return(
    <div style={{background:C.white,borderRadius:20,padding:20,marginTop:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{color:C.g800,fontWeight:800,fontSize:15}}>👔 Job Categories</p>
        <button onClick={()=>{setShow(!show);setEditing(null);setForm({name:"",working_days_type:26,weekly_off:"sunday",sunday_off:true,cl_per_month:2,sl_per_month:1,paid_off_days:0,description:""}); }}
          style={{background:C.g100,border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",color:C.g700,fontWeight:700,fontSize:12}}>
          {show&&!editing?"Cancel":"+ Add Category"}
        </button>
      </div>
      <p style={{color:C.gr500,fontSize:12,marginBottom:12}}>Define working schedules and leave entitlements per staff type</p>

      {/* Existing categories */}
      {cats.map(cat=>(
        <div key={cat.id} style={{background:C.g50,borderRadius:14,padding:12,marginBottom:8,border:`1px solid ${C.g200}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <p style={{color:C.g800,fontWeight:800,fontSize:14}}>{cat.name}</p>
              <p style={{color:C.gr500,fontSize:12}}>
                {cat.sunday_off?"Sunday off":"7-day working"} · {cat.working_days_type} days
              </p>
              <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                <span style={{background:"#dcfce7",color:"#15803d",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700}}>CL: {cat.cl_per_month}/mo</span>
                <span style={{background:"#eff6ff",color:"#3b82f6",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700}}>SL: {cat.sl_per_month}/mo</span>
                {cat.paid_off_days>0&&<span style={{background:"#fef3c7",color:"#d97706",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700}}>Paid off: {cat.paid_off_days}/mo</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>startEdit(cat)} style={{background:"#fff",border:`1px solid ${C.g300}`,borderRadius:8,padding:"4px 10px",cursor:"pointer",color:C.g700,fontSize:12}}>✏️</button>
              <button onClick={()=>del(cat.id)} style={{background:"#fff",border:"1px solid #fca5a5",borderRadius:8,padding:"4px 10px",cursor:"pointer",color:C.red,fontSize:12}}>🗑</button>
            </div>
          </div>
        </div>
      ))}

      {/* Add/Edit form */}
      {show&&(
        <div style={{background:"#f0faf4",borderRadius:14,padding:16,marginTop:8,border:`1px solid ${C.g300}`}}>
          <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>{editing?"Edit Category":"New Category"}</p>
          <label style={S.label}>Category name</label>
          <input style={S.input} placeholder="e.g. Admin Staff, Kitchen Staff" value={form.name} onChange={e=>f("name",e.target.value)}/>
          <label style={S.label}>Working days per month</label>
          <input style={S.input} type="number" min="1" max="31" placeholder="e.g. 26, 28, 30" value={form.working_days_type} onChange={e=>f("working_days_type",Number(e.target.value))}/>
          <label style={S.label}>Weekly holiday</label>
          <select style={S.select} value={form.weekly_off} onChange={e=>f("weekly_off",e.target.value)}>
            <option value="none">No weekly off — work all days</option>
            <option value="sunday">Sunday off only</option>
            <option value="saturday_sunday">Saturday + Sunday off</option>
          </select>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div>
              <label style={S.label}>CL/month</label>
              <input style={S.input} type="number" min="0" max="30" value={form.cl_per_month} onChange={e=>f("cl_per_month",Number(e.target.value))}/>
            </div>
            <div>
              <label style={S.label}>SL/month</label>
              <input style={S.input} type="number" min="0" max="30" value={form.sl_per_month} onChange={e=>f("sl_per_month",Number(e.target.value))}/>
            </div>
            <div>
              <label style={S.label}>Paid off/mo</label>
              <input style={S.input} type="number" min="0" max="10" value={form.paid_off_days} onChange={e=>f("paid_off_days",Number(e.target.value))}/>
            </div>
          </div>
          <label style={S.label}>Description (optional)</label>
          <input style={S.input} placeholder="e.g. Full-time kitchen staff" value={form.description} onChange={e=>f("description",e.target.value)}/>
          <button style={S.btn} onClick={save}>Save category</button>
        </div>
      )}
    </div>
  );
}

// ── LIVE WORKING CLOCK ────────────────────────────────────────
function WorkingClock({cinTime}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(()=>{
    if(!cinTime) return;
    const cinStr = String(cinTime).slice(0,5);
    const [ch,cm] = cinStr.split(':').map(Number);
    const cinDate = new Date();
    cinDate.setHours(ch,cm,0,0);

    const tick=()=>{
      const now = new Date();
      const diff = Math.floor((now - cinDate)/1000);
      setElapsed(Math.max(0,diff));
    };
    tick();
    const interval = setInterval(tick, 30000); // update every 30s
    return ()=>clearInterval(interval);
  },[cinTime]);

  const h = Math.floor(elapsed/3600);
  const m = Math.floor((elapsed%3600)/60);

  return(
    <div style={{background:`linear-gradient(135deg,${C.g700},${C.g500})`,borderRadius:16,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:24}}>⏱</span>
      <div>
        <p style={{color:"rgba(255,255,255,0.7)",fontSize:11}}>Working time</p>
        <p style={{color:"#fff",fontWeight:900,fontSize:20}}>{h}h {pad(m)}m</p>
      </div>
    </div>
  );
}


function WorkedTime({cin, cout}) {
  const mins = toM(cout) - toM(cin);
  const h = Math.floor(mins / 60);
  const m = mins - (h * 60);
  return <p style={{color:"#16a34a",fontSize:13,margin:"8px 0"}}>{"⏱ Worked: "+h+"h "+m+"m"}</p>;
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const S = {
  label: {color:C.g800,fontSize:13,fontWeight:600,marginBottom:6,display:"block"},
  input: {background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  select: {background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  btn: {background:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:14,color:C.white,padding:"14px 20px",fontSize:15,fontWeight:800,cursor:"pointer",width:"100%",marginTop:4},
  outline: {background:C.white,border:`1.5px solid ${C.g500}`,borderRadius:14,color:C.g700,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"},
  iconBtn: {background:C.g100,border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",color:C.g700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"},
};