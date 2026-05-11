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
const fmtD = ds => { const c=ds?String(ds).split('T')[0]:''; if(!c)return'Invalid Date'; return new Date(c+'T12:00:00').toLocaleDateString("en-IN",{day:"numeric",month:"short",weekday:"short"}); };
const fmtDF = ds => { const c=ds?String(ds).split('T')[0]:''; if(!c)return'—'; return new Date(c+'T12:00:00').toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}); };

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
  const vRef = useRef(null);
  const [err, setErr] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [selBranch, setSelBranch] = useState(branches[0]?.id || "");

  useEffect(() => {
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
        <div style={{background:"#000",borderRadius:18,height:150,position:"relative",overflow:"hidden",marginBottom:14}}>
          <video ref={vRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:14,border:`2px solid ${C.g500}`,borderRadius:10}}/>
          {streaming&&<div style={{position:"absolute",left:14,right:14,height:2,background:`linear-gradient(90deg,transparent,${C.g500},transparent)`,top:"40%",animation:"scanline 2s ease-in-out infinite"}}/>}
        </div>
        {err&&<p style={{color:C.amber,fontSize:13,textAlign:"center",marginBottom:10}}>⚠ {err}</p>}
        <p style={{color:C.g700,fontSize:13,fontWeight:700,marginBottom:8}}>Select your branch:</p>
        <select
          style={{...S.select,marginBottom:10}}
          value={selBranch}
          onChange={e=>setSelBranch(e.target.value)}
        >
          <option value="">— Select branch —</option>
          {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button
          onClick={()=>{if(!selBranch){setErr("Select a branch first");return;}onScan({branchId:selBranch,token:"SMARTAI_V4",app:"3SL"});}}
          disabled={!selBranch}
          style={{...S.btn,opacity:selBranch?1:0.5}}
        >
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
  const scBr = branches.find(b => b.id === qd.branchId);
  if(!scBr) { notify("Branch not found", "error"); return; }
  if(todayAtt?.cin && todayAtt?.cout) { notify("Already done for today", "error"); return; }

  notify("📍 Checking your location…", "info");

  if(navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = geoDist(pos.coords.latitude, pos.coords.longitude, scBr.lat, scBr.lng);
        if(dist > (scBr.radius || 200)) {
          notify(`❌ You are ${Math.round(dist)}m away. Must be within ${scBr.radius || 200}m of ${scBr.name}`, "error");
          return;
        }
        processAtt(qd.branchId, pos.coords);
      },
      (geoErr) => {
        const msg = geoErr.code === 1
          ? "⚠ Location permission denied — marking without geo verification"
          : "⚠ GPS unavailable — marking without geo verification";
        notify(msg, "warn");
        processAtt(qd.branchId, null);
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
    );
  } else {
    notify("⚠ GPS not supported — marking anyway", "warn");
    processAtt(qd.branchId, null);
  }
};
  const processAtt = async (branchId, coords) => {
    try {
      if(!todayAtt?.cin) {
        const res = await POST("/api/attendance/checkin", {branch_id:branchId, geo_lat:coords?.latitude, geo_lng:coords?.longitude, geo_verified:!!coords});
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

  const empNav=[{k:"home",i:"🏠",l:"Home"},{k:"shifts",i:"📅",l:"Shifts"},{k:"history",i:"📋",l:"History"},{k:"salary",i:"💰",l:"Salary"},{k:"profile",i:"👤",l:"Profile"}];
  const pages={
    home: <EmpHome user={user} branch={myBranch} todayAtt={todayAtt} loading={loading} onScan={()=>setShowScanner(true)}/>,
    shifts: <EmpShifts user={user} notify={notify}/>,
    history: <EmpHistory user={user} notify={notify}/>,
    salary: <EmpSalary user={user} notify={notify}/>,
    profile: <EmpProfile user={user} notify={notify}/>,
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

      <button onClick={onScan} disabled={status==="done"||loading}
        style={{width:"100%",background:status==="done"?C.gr300:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:20,padding:"20px",cursor:status==="done"?"not-allowed":"pointer",color:C.white,display:"flex",flexDirection:"column",alignItems:"center",gap:6,animation:status!=="done"?"glow 3s infinite":"none",marginBottom:18}}>
        <span style={{fontSize:32}}>📷</span>
        <span style={{fontSize:16,fontWeight:800}}>{status==="out"?"Scan to Check In":status==="in"?"Scan to Check Out":"Day Complete ✓"}</span>
        <span style={{fontSize:12,opacity:0.75}}>Geo-fenced · Tap to mark attendance</span>
      </button>

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
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [reqDate,setReqDate]=useState(""), [reqShift,setReqShift]=useState(""), [reqNote,setReqNote]=useState("");

  const load = async () => {
    try {
      const now = new Date();
      const from = new Date(); from.setDate(from.getDate()-2);
      const to = new Date(); to.setDate(to.getDate()+14);
      const [sc,sh,rq] = await Promise.all([
        GET("/api/schedules",{from:from.toISOString().split("T")[0],to:to.toISOString().split("T")[0],employee_id:user.id}),
        GET("/api/shifts"),
        GET("/api/shift-requests"),
      ]);
      setSchedules(sc||[]); setShifts(sh||[]); setRequests(rq||[]);
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
            const isToday=ds===today(), isPast=ds<today();
            return(
              <div key={ds} style={{background:isToday?`linear-gradient(135deg,${C.g800},${C.g700})`:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:`0 2px 8px ${C.g300}${isToday?"66":"22"}`,borderLeft:`4px solid ${sc?sc.color||C.g500:C.gr300}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div>
                    <p style={{color:isToday?C.white:C.gr900,fontWeight:800,fontSize:15}}>{fmtD(ds)} {isToday&&"· TODAY"}</p>
                    <p style={{color:isToday?"rgba(255,255,255,0.7)":C.gr500,fontSize:13}}>{sc?`${sc.shift_name} · ${sc.start_time?.slice(0,5)}–${sc.end_time?.slice(0,5)}`:"No shift assigned"}</p>
                    {sc?.is_override&&<span style={{background:"#fef3c7",color:"#d97706",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>OVERRIDE</span>}
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

// ============================================================
// FIXES FOR App.jsx — 4 bugs
// ============================================================

// ── FIX 1: "Invalid Date" in History ─────────────────────────
// The date field from PostgreSQL comes as "2026-05-09T00:00:00.000Z"
// fmtD() does new Date(ds+"T12:00:00") which fails on full ISO strings
// 
// Find function fmtD in App.jsx (near top):
//   const fmtD  = ds => new Date(ds+"T12:00:00")...
// Replace BOTH fmtD and fmtDF with these:

// Also fix the grouped records in EmpHistory — the date key from API
// may be a full ISO string. Fix the grouping:
// Find: const grouped = records.reduce((a,r)=>{(a[r.date]=...
// Replace with:
const grouped = records.reduce((a,r)=>{
  const dateKey = r.date ? String(r.date).split('T')[0] : r.date;
  (a[dateKey]=a[dateKey]||[]).push({...r, date: dateKey});
  return a;
},{});


// ── FIX 2: "Forbidden" on Salary — employee can't call admin endpoint ──────
// The salary report endpoint requires admin role.
// Need a separate employee salary endpoint.
//
// In server/index.js, find GET /api/salary-report and ADD this new route
// BEFORE the existing salary-report route:



// ── FIX 3: EmpSalary — use /api/my-salary instead of /api/salary-report ────
// Find function EmpSalary in App.jsx
// Replace the entire function with:

function EmpSalary({user, notify}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(()=>{
    GET("/api/my-salary", {year: now.getFullYear(), month: now.getMonth()+1})
      .then(r => setReport(r))
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  },[]);

  if(loading) return <Spinner/>;
  if(!report) return <Empty icon="💰" msg="No salary data yet"/>;

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Salary Dashboard</h2>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:20}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{now.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</p>
        <p style={{color:C.white,fontSize:36,fontWeight:900,margin:"6px 0 2px"}}>{fmt(report.netEarned||0)}</p>
        <p style={{color:"rgba(255,255,255,0.55)",fontSize:13}}>of {fmt(report.salary||0)}/month</p>
        <div style={{background:"rgba(255,255,255,0.15)",borderRadius:8,height:7,marginTop:14}}>
          <div style={{background:C.g300,height:7,borderRadius:8,width:`${Math.min(100,((report.netEarned||0)/(report.salary||1))*100)}%`}}/>
        </div>
      </div>
      <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 12px ${C.g300}44`}}>
        {[
          ["Days Present", report.presentDays, C.g600],
          ["Late days", report.lateDays, C.amber],
          ["Casual leave used", report.casualUsed, C.blue],
          ["Daily rate", fmt(report.dailyRate||0), C.gr700],
          ["Gross earned", fmt(report.earnedGross||0), C.g700],
          ["Late deductions", `-${fmt(report.lateDeductions||0)}`, C.amber],
          ["Leave penalties", `-${fmt(report.leaveDeductions||0)}`, C.red],
          ["No-show penalties", `-${fmt(report.noShowDeductions||0)}`, C.red],
        ].map(([l,v,c])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.g50}`}}>
            <span style={{color:C.gr500,fontSize:14}}>{l}</span>
            <span style={{color:c||C.gr900,fontWeight:600,fontSize:14}}>{v}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"14px 0 0"}}>
          <span style={{color:C.g800,fontWeight:800,fontSize:16}}>Net Earned</span>
          <span style={{color:C.g700,fontWeight:900,fontSize:20}}>{fmt(report.netEarned||0)}</span>
        </div>
      </div>
    </div>
  );
}


// ── FIX 4: No shift assigned — checkin route fallback to org default ────────
// In server/index.js, find the checkin route:
//   app.post('/api/attendance/checkin'
// Find this block inside it:
//     let shift = schedRows[0];
//     if (!shift) {
//       const { rows: def } = await db(`
//         SELECT st.id AS shift_id, st.name, st.start_time, st.end_time
//         FROM users u JOIN shift_templates st ON st.id = u.default_shift_id
//         WHERE u.id=$1
//       `, [req.user.id]);
//       shift = def[0];
//     }
//     if (!shift) return res.status(400).json...
//
// REPLACE with this (adds org default shift fallback):



// ── FIX 5: EmpHistory date grouping fix ────────────────────────────────────
// Find function EmpHistory in App.jsx
// Replace the entire function with this:

function EmpHistory({user, notify}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const to = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];

  useEffect(()=>{
    GET("/api/attendance",{from, to, employee_id: user.id})
      .then(r => setRecords(r||[]))
      .catch(e => notify(e.message,"error"))
      .finally(()=>setLoading(false));
  },[]);

  // Group by date — strip timezone from date string
  const grouped = records.reduce((a,r)=>{
    const dk = r.date ? String(r.date).split('T')[0] : null;
    if(!dk) return a;
    (a[dk] = a[dk]||[]).push({...r, date: dk});
    return a;
  },{});

  if(loading) return <Spinner/>;
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Attendance History</h2>
      {Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([ds, recs])=>{
        // attendance_records has ONE row per day with check_in_time + check_out_time
        const rec = recs[0];
        const cin = rec?.check_in_time ? String(rec.check_in_time).slice(0,5) : null;
        const cout = rec?.check_out_time ? String(rec.check_out_time).slice(0,5) : null;
        const worked = rec?.worked_mins;
        return(
          <div key={ds} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`,borderLeft:`4px solid ${rec?.is_late?C.amber:C.g500}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontWeight:800,color:C.gr900}}>{fmtD(ds)}</span>
              <div style={{display:"flex",gap:6}}>
                {rec?.shift_name&&<span style={{background:C.g100,color:C.g700,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{rec.shift_name}</span>}
                {rec?.is_late&&<span style={{background:"#fffbeb",color:C.amber,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{rec.late_mins}m LATE</span>}
                {rec?.admin_edited&&<span style={{background:"#ede9fe",color:C.violet,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>EDITED</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <span style={{color:C.g600,fontSize:14,fontWeight:600}}>▶ {cin||"—"}</span>
              <span style={{color:C.gr500,fontSize:14}}>⏹ {cout||"—"}</span>
              {worked!=null&&<span style={{color:C.gr500,fontSize:13}}>⏱ {Math.floor(worked/60)}h {worked%60}m</span>}
            </div>
            {rec?.branch_name&&<p style={{color:C.gr500,fontSize:12,marginTop:5}}>📍 {rec.branch_name}</p>}
          </div>
        );
      })}
      {Object.keys(grouped).length===0&&<Empty icon="📋" msg="No attendance this month"/>}
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
    </div>
  );
}

// ── ADMIN APP ──────────────────────────────────────────────────────────────
function AdminApp({user, notify, page, setPage, activeOrgId, setActiveOrgId, onLogout}) {
  const isSA=user.role==="super_admin", isOA=user.role==="org_admin";
  const nav=[
    ...(isSA?[{k:"sa_orgs",i:"🏢",l:"Orgs"}]:[]),
    {k:"adm_home",i:"🏠",l:"Home"},
    {k:"adm_staff",i:"👥",l:"Staff"},
    {k:"adm_shifts",i:"📅",l:"Shifts"},
    {k:"adm_override",i:"⚡",l:"Override"},
    {k:"adm_approvals",i:"✅",l:"Approvals"},
    {k:"adm_qr",i:"📷",l:"QR"},
    {k:"adm_reports",i:"📊",l:"Reports"},
    ...(isSA||isOA?[{k:"adm_edit",i:"✏️",l:"Edit Att"}]:[]),
    {k:"adm_settings",i:"⚙️",l:"Settings"},
    {k:"adm_att_table", i:"📊", l:"Att."},
    {k:"adm_leave_hist", i:"📝", l:"Leaves"},
    {k:"adm_daily",     i:"🟢", l:"Daily"},
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
    adm_att_table: <AdminAttendanceTable user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_leave_hist: <AdminLeaveHistory user={user} notify={notify} activeOrgId={activeOrgId}/>,
    adm_daily: <AdminDailyBoard notify={notify} activeOrgId={activeOrgId}/>,
    adm_settings: <AdminSettings user={user} notify={notify} activeOrgId={activeOrgId}/>,
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:480,margin:"0 auto",background:C.g50}}>
      <TopBar user={user} onLogout={onLogout} orgId={activeOrgId}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{pages[page]||pages.adm_home}</div>
      <BottomNav items={nav} page={page} setPage={setPage}/>
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
  const [tab, setTab] = useState("list");
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [e,b,s] = await Promise.all([GET("/api/employees",{org_id:activeOrgId}),GET("/api/branches",{org_id:activeOrgId}),GET("/api/shifts",{org_id:activeOrgId})]);
      setEmployees(e||[]); setBranches(b||[]); setShifts(s||[]);
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
                  <button onClick={()=>deleteEmp(e)} style={{...S.outline,padding:"8px 12px",fontSize:12,borderColor:C.red,color:C.red}}>🗑</button>
                </div>
              </div>
            );
          })}
          {list.length===0&&<Empty icon="👥" msg="No staff found"/>}
        </div>
      )}
      {tab==="form"&&(
        <StaffForm emp={selected} branches={branches} shifts={shifts} activeOrgId={activeOrgId} user={user} notify={notify}
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

function StaffForm({emp, branches, shifts, activeOrgId, user, notify, onSave, onCancel}) {
  const isEdit=!!emp;
  const [f,setF]=useState({
    name:emp?.name||"",phone:emp?.phone||"",password:"",branch_id:emp?.branch_id||branches[0]?.id||"",
    role:emp?.role||"employee",designation:emp?.designation||"",salary:emp?.salary||"",
    default_shift_id:emp?.default_shift_id||"",manager_id:emp?.manager_id||"",
    date_of_joining: emp?.date_of_joining ? String(emp.date_of_joining).split('T')[0] : today(),
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
      <label style={S.label}>Default Shift</label>
      <select style={S.select} value={f.default_shift_id} onChange={e=>set("default_shift_id",e.target.value)}>
        <option value="">None</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</option>)}
      </select>
      <div style={{display:"flex",gap:10}}>
        <button style={{...S.btn,flex:1}} onClick={()=>onSave(f)}>{isEdit?"Save changes":"Add staff"}</button>
        <button onClick={onCancel} style={{...S.outline,flex:1}}>Cancel</button>
      </div>
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
  useEffect(()=>{
    if(!activeOrgId)return;
    GET("/api/branches",{org_id:activeOrgId}).then(b=>{setBranches(b||[]);if(b?.length)setSel(b[0].id);}).catch(e=>notify(e.message,"error"));
  },[activeOrgId]);
  const br=branches.find(b=>b.id===sel);
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Branch QR Codes</h2>
      <select style={S.select} value={sel} onChange={e=>setSel(e.target.value)}>
        {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {br&&(
        <div style={{background:C.white,borderRadius:24,padding:32,textAlign:"center",boxShadow:`0 4px 24px ${C.g300}66`}}>
          <p style={{color:C.gr500,fontSize:13,marginBottom:20}}>📍 {br.address}</p>
          <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
            <QRCanvas data={JSON.stringify({branchId:br.id,token:"SMARTAI_V4",app:"3SL"})} size={200}/>
          </div>
          <h3 style={{color:C.g800,fontSize:20,fontWeight:800}}>{br.name}</h3>
          <p style={{color:C.g700,fontSize:13,marginTop:10}}>📍 {br.lat}, {br.lng} · ⭕ {br.radius}m geo-fence</p>
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
    Promise.all([GET(`/api/orgs/${activeOrgId}/settings`),GET("/api/branches",{org_id:activeOrgId})])
      .then(([s,b])=>{setSettings(s);setBranches(b||[]);}).catch(e=>notify(e.message,"error")).finally(()=>setLoading(false));
  },[activeOrgId]);

  const saveSettings=async()=>{
    try{await PATCH(`/api/orgs/${activeOrgId}/settings`,settings);notify("Settings saved ✓");}
    catch(e){notify(e.message,"error");}
    <OrgDefaultShift notify={notify} activeOrgId={activeOrgId} shifts={shifts}/>
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
        <button style={S.btn} onClick={saveSettings}>Save settings</button>
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
    </div>
  );
}

function OrgDefaultShift({notify, activeOrgId, shifts}) {
  const [defShift, setDefShift] = useState("");
  const [orgShifts, setOrgShifts] = useState(shifts||[]);

  useEffect(()=>{
    if(!activeOrgId) return;
    Promise.all([
      GET(`/api/orgs/${activeOrgId}/default-shift`),
      GET("/api/shifts", {org_id: activeOrgId}),
    ]).then(([d, s]) => {
      setDefShift(d.default_shift_id || "");
      setOrgShifts(s || []);
    }).catch(()=>{});
  },[activeOrgId]);

  const save = async () => {
    try {
      await PATCH(`/api/orgs/${activeOrgId}/default-shift`, {default_shift_id: defShift || null});
      notify("Default shift saved ✓");
    } catch(e) { notify(e.message, "error"); }
  };

  return(
    <div style={{background:"#f0faf4",borderRadius:16,padding:16,marginTop:12,border:"1.5px solid #86efac"}}>
      <p style={{color:"#166534",fontWeight:800,fontSize:14,marginBottom:4}}>🕐 Organisation Default Shift</p>
      <p style={{color:"#6b7280",fontSize:12,marginBottom:10}}>All employees will use this shift unless specifically assigned a different one by a manager</p>
      <select style={{...S.select,marginBottom:10}} value={defShift} onChange={e=>setDefShift(e.target.value)}>
        <option value="">No default shift</option>
        {orgShifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</option>)}
      </select>
      <button style={S.btn} onClick={save}>Save default shift</button>
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
// ============================================================
// SmartAi Attendance — New Admin Screens v5.1
// Add these to your App.jsx
// 1. AdminAttendanceTable  — month/day view grid with edit
// 2. AdminLeaveHistory     — leaves with edit/delete + audit
// 3. AdminDailyBoard       — who's present/absent/leave today
// ============================================================
// HOW TO ADD:
// 1. Add these 3 nav items to adminNav array:
//    {k:"adm_att_table", i:"📊", l:"Att. Table"}
//    {k:"adm_leave_hist", i:"📝", l:"Leaves"}
//    {k:"adm_daily",     i:"🟢", l:"Daily"}
// 2. Add to pages object:
//    adm_att_table: <AdminAttendanceTable user={user} notify={notify} activeOrgId={activeOrgId}/>
//    adm_leave_hist: <AdminLeaveHistory user={user} notify={notify} activeOrgId={activeOrgId}/>
//    adm_daily: <AdminDailyBoard notify={notify} activeOrgId={activeOrgId}/>
// ============================================================

// ── ATTENDANCE TABLE (Month + Day views, inline edit) ─────────────────────
function AdminAttendanceTable({ user, notify, activeOrgId }) {
  const [view, setView] = useState("day"); // "day" | "month"
  const [selDate, setSelDate] = useState(today());
  const [selEmp, setSelEmp] = useState("all");
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
  const [editRec, setEditRec] = useState(null); // record being edited
  const [editForm, setEditForm] = useState({ cin: "", cout: "", notes: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [e, b] = await Promise.all([
        GET("/api/employees", { org_id: activeOrgId }),
        GET("/api/branches", { org_id: activeOrgId }),
      ]);
      setEmployees(e || []);
      setBranches(b || []);
      await loadRecords(e || []);
    } catch (err) { notify(err.message, "error"); }
    finally { setLoading(false); }
  };

  const loadRecords = async (emps) => {
    try {
      let from, to;
      if (view === "day") { from = selDate; to = selDate; }
      else {
        const [y, m] = selMonth.split("-").map(Number);
        from = `${y}-${pad(m)}-01`;
        to = new Date(y, m, 0).toISOString().split("T")[0];
      }
      const empIds = (emps || employees).filter(e => e.role === "employee").map(e => e.id);
      const [att, lv] = await Promise.all([
        GET("/api/attendance", { from, to, org_id: activeOrgId }),
        GET("/api/leaves", { from, to, org_id: activeOrgId }),
      ]);
      setRecords(att || []);
      setLeaves(lv || []);
    } catch (err) { notify(err.message, "error"); }
  };

  useEffect(() => { if (activeOrgId) load(); }, [activeOrgId]);
  useEffect(() => { if (employees.length) loadRecords(); }, [view, selDate, selMonth]);

  const saveEdit = async () => {
    if (!editRec) return;
    try {
      await POST("/api/attendance/admin-mark", {
        employee_id: editRec.employee_id,
        date: editRec.date,
        check_in_time: editForm.cin || null,
        check_out_time: editForm.cout || null,
        notes: editForm.notes,
        org_id: activeOrgId,
      });
      notify("Attendance updated ✓");
      setEditRec(null);
      loadRecords();
    } catch (err) { notify(err.message, "error"); }
  };

  // Status for a given employee + date
  const getStatus = (empId, date) => {
    const rec = records.find(r => r.employee_id === empId && r.date === date);
    const leave = leaves.find(l => l.employee_id === empId && l.date === date);
    if (leave) return { type: leave.type, label: leave.type === "casual" ? "CL" : leave.type === "unauthorized" ? "UL" : "NS", color: "#7c3aed", bg: "#ede9fe" };
    if (rec?.check_in_time) {
      const isLate = rec.is_late;
      return { type: "present", label: isLate ? `L${rec.late_mins || ""}` : "P", color: isLate ? "#d97706" : "#16a34a", bg: isLate ? "#fef3c7" : "#dcfce7", rec };
    }
    return { type: "absent", label: "A", color: "#dc2626", bg: "#fee2e2" };
  };

  // Get days in selected month
  const getDaysInMonth = () => {
    const [y, m] = selMonth.split("-").map(Number);
    const days = [];
    const end = new Date(y, m, 0).getDate();
    for (let d = 1; d <= end; d++) days.push(`${y}-${pad(m)}-${pad(d)}`);
    return days;
  };

  let filteredEmps = employees.filter(e => e.role === "employee");
  if (user.role === "branch_admin") filteredEmps = filteredEmps.filter(e => e.branch_id === user.branch_id);
  if (selBranch !== "all") filteredEmps = filteredEmps.filter(e => e.branch_id === selBranch);
  if (selEmp !== "all") filteredEmps = filteredEmps.filter(e => e.id === selEmp);

  // Summary counts for day view
  const daySummary = {
    present: filteredEmps.filter(e => getStatus(e.id, selDate).type === "present").length,
    absent: filteredEmps.filter(e => getStatus(e.id, selDate).type === "absent").length,
    leave: filteredEmps.filter(e => ["casual", "unauthorized", "noshow"].includes(getStatus(e.id, selDate).type)).length,
    late: filteredEmps.filter(e => getStatus(e.id, selDate).type === "present" && records.find(r => r.employee_id === e.id && r.date === selDate)?.is_late).length,
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: C.g800, fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Attendance Table</h2>

      {/* View toggle */}
      <div style={{ background: C.g100, borderRadius: 14, display: "flex", padding: 4, marginBottom: 16 }}>
        {[["day", "📅 Day View"], ["month", "📊 Month View"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, background: view === v ? C.white : "transparent", border: "none", borderRadius: 10, padding: "8px", cursor: "pointer", color: view === v ? C.g700 : C.gr500, fontWeight: 700, fontSize: 13 }}>{l}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {view === "day"
          ? <input style={{ ...S.input, marginBottom: 0, flex: 1 }} type="date" value={selDate} onChange={e => setSelDate(e.target.value)} />
          : <input style={{ ...S.input, marginBottom: 0, flex: 1 }} type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} />
        }
        <select style={{ ...S.select, marginBottom: 0, flex: 1 }} value={selBranch} onChange={e => setSelBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Day view summary */}
      {view === "day" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["Present", daySummary.present, C.g600], ["Absent", daySummary.absent, C.red], ["Leave", daySummary.leave, C.violet], ["Late", daySummary.late, C.amber]].map(([l, v, c]) => (
            <div key={l} style={{ background: C.white, borderRadius: 14, padding: "12px 8px", textAlign: "center", boxShadow: `0 2px 8px ${C.g300}33` }}>
              <p style={{ color: c, fontSize: 22, fontWeight: 900 }}>{v}</p>
              <p style={{ color: C.gr500, fontSize: 11 }}>{l}</p>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {[["P", "Present", "#dcfce7", "#16a34a"], ["A", "Absent", "#fee2e2", "#dc2626"], ["L", "Late", "#fef3c7", "#d97706"], ["CL", "Casual", "#ede9fe", "#7c3aed"], ["UL", "Unauth", "#fee2e2", "#dc2626"], ["NS", "No Show", "#ffedd5", "#ea580c"]].map(([code, label, bg, color]) => (
          <span key={code} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.gr500 }}>
            <span style={{ background: bg, color, fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>{code}</span>{label}
          </span>
        ))}
      </div>

      {/* DAY VIEW — list */}
      {view === "day" && (
        <div>
          {filteredEmps.map(emp => {
            const st = getStatus(emp.id, selDate);
            const rec = records.find(r => r.employee_id === emp.id && r.date === selDate);
            return (
              <div key={emp.id} style={{ background: C.white, borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: `0 2px 8px ${C.g300}33`, borderLeft: `4px solid ${st.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ color: C.gr900, fontWeight: 800 }}>{emp.name}</p>
                    <p style={{ color: C.gr500, fontSize: 12 }}>{emp.designation} · {emp.branch_name}</p>
                    {rec && (
                      <p style={{ color: C.gr500, fontSize: 13, marginTop: 4 }}>
                        ▶ {rec.check_in_time?.slice(0, 5) || "—"} &nbsp; ⏹ {rec.check_out_time?.slice(0, 5) || "—"}
                        {rec.worked_mins != null && <span> &nbsp; ⏱ {Math.floor(rec.worked_mins / 60)}h {rec.worked_mins % 60}m</span>}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ background: st.bg, color: st.color, fontSize: 13, padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>{st.label}</span>
                    <button onClick={() => { setEditRec({ employee_id: emp.id, date: selDate, name: emp.name }); setEditForm({ cin: rec?.check_in_time?.slice(0, 5) || "", cout: rec?.check_out_time?.slice(0, 5) || "", notes: rec?.notes || "" }); }}
                      style={{ ...S.outline, padding: "5px 12px", fontSize: 12 }}>✏️ Edit</button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredEmps.length === 0 && <Empty icon="👥" msg="No employees found" />}
        </div>
      )}

      {/* MONTH VIEW — scrollable grid */}
      {view === "month" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ background: C.g800, color: C.white, padding: "10px 12px", textAlign: "left", borderRadius: "8px 0 0 0", position: "sticky", left: 0, zIndex: 2, minWidth: 120 }}>Employee</th>
                {getDaysInMonth().map(ds => {
                  const d = new Date(ds + "T12:00:00");
                  const isSun = d.getDay() === 0;
                  const isToday_ = ds === today();
                  return (
                    <th key={ds} style={{ background: isToday_ ? C.g600 : isSun ? "#f3f4f6" : C.g800, color: isToday_ ? C.white : isSun ? C.gr500 : C.white, padding: "8px 6px", textAlign: "center", minWidth: 36, fontSize: 10 }}>
                      <div>{pad(d.getDate())}</div>
                      <div style={{ opacity: 0.7 }}>{["S","M","T","W","T","F","S"][d.getDay()]}</div>
                    </th>
                  );
                })}
                <th style={{ background: C.g800, color: C.white, padding: "10px 8px", textAlign: "center", borderRadius: "0 8px 0 0" }}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map((emp, ei) => {
                const days = getDaysInMonth();
                let pCount = 0, aCount = 0, lCount = 0, lateCount = 0;
                return (
                  <tr key={emp.id} style={{ background: ei % 2 === 0 ? C.white : C.g50 }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: C.gr900, position: "sticky", left: 0, background: ei % 2 === 0 ? C.white : C.g50, zIndex: 1, borderRight: `1px solid ${C.g100}` }}>
                      <div>{emp.name}</div>
                      <div style={{ color: C.gr500, fontSize: 10, fontWeight: 400 }}>{emp.branch_name}</div>
                    </td>
                    {days.map(ds => {
                      const st = getStatus(emp.id, ds);
                      const isSun = new Date(ds + "T12:00:00").getDay() === 0;
                      if (st.type === "present") { pCount++; if (st.label.startsWith("L")) lateCount++; }
                      else if (st.type === "absent") aCount++;
                      else lCount++;
                      return (
                        <td key={ds} style={{ padding: "4px 2px", textAlign: "center", background: isSun ? "#f9fafb" : "transparent" }}>
                          <button onClick={() => { setEditRec({ employee_id: emp.id, date: ds, name: emp.name }); const rec = records.find(r => r.employee_id === emp.id && r.date === ds); setEditForm({ cin: rec?.check_in_time?.slice(0, 5) || "", cout: rec?.check_out_time?.slice(0, 5) || "", notes: rec?.notes || "" }); }}
                            style={{ background: isSun ? "transparent" : st.bg, color: isSun ? C.gr300 : st.color, border: "none", borderRadius: 6, padding: "3px 4px", fontSize: 10, fontWeight: 700, cursor: isSun ? "default" : "pointer", minWidth: 28 }}>
                            {isSun ? "—" : st.label}
                          </button>
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px", textAlign: "center", fontSize: 11 }}>
                      <div style={{ color: C.g600, fontWeight: 700 }}>P:{pCount}</div>
                      <div style={{ color: C.red, fontWeight: 700 }}>A:{aCount}</div>
                      <div style={{ color: C.amber, fontWeight: 700 }}>L:{lateCount}</div>
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
          <div style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <p style={{ color: C.g800, fontWeight: 800, fontSize: 17 }}>Edit Attendance</p>
                <p style={{ color: C.gr500, fontSize: 13 }}>{editRec.name} · {fmtDF(editRec.date)}</p>
              </div>
              <button onClick={() => setEditRec(null)} style={S.iconBtn}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={S.label}>Check-in</label><input style={S.input} type="time" value={editForm.cin} onChange={e => setEditForm(f => ({ ...f, cin: e.target.value }))}/></div>
              <div><label style={S.label}>Check-out</label><input style={S.input} type="time" value={editForm.cout} onChange={e => setEditForm(f => ({ ...f, cout: e.target.value }))}/></div>
            </div>
            {editForm.cin && editForm.cout && (
              <p style={{ color: C.g600, fontSize: 13, marginBottom: 10 }}>
                ⏱ {Math.floor((toM(editForm.cout) - toM(editForm.cin)) / 60)}h {(toM(editForm.cout) - toM(editForm.cin)) % 60}m
              </p>
            )}
            <label style={S.label}>Notes / reason for edit</label>
            <input style={S.input} placeholder="e.g. Employee forgot to scan" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}/>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, flex: 1 }} onClick={saveEdit}>Save</button>
              <button onClick={() => setEditRec(null)} style={{ ...S.outline, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LEAVE / PENALTY HISTORY (with edit, delete, audit trail) ───────────────
function AdminLeaveHistory({ user, notify, activeOrgId }) {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selEmp, setSelEmp] = useState("all");
  const [selType, setSelType] = useState("all");
  const [selMonth, setSelMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; });
  const [editLeave, setEditLeave] = useState(null);
  const [editForm, setEditForm] = useState({ type: "", reason: "", date: "" });
  const [showDeleted, setShowDeleted] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [y, m] = selMonth.split("-").map(Number);
      const from = `${y}-${pad(m)}-01`;
      const to = new Date(y, m, 0).toISOString().split("T")[0];
      const [lv, emps] = await Promise.all([
        GET("/api/leaves", { from, to, org_id: activeOrgId }),
        GET("/api/employees", { org_id: activeOrgId }),
      ]);
      setLeaves(lv || []);
      setEmployees(emps || []);
    } catch (err) { notify(err.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (activeOrgId) load(); }, [activeOrgId, selMonth]);

  const deleteLeave = async (lv) => {
    if (!window.confirm(`Delete this ${lv.type} leave for ${lv.employee_name} on ${fmtD(lv.date)}?`)) return;
    try {
      await DEL(`/api/leaves/${lv.id}`);
      notify("Leave deleted ✓");
      load();
    } catch (err) { notify(err.message, "error"); }
  };

  const saveEdit = async () => {
    try {
      await PATCH(`/api/leaves/${editLeave.id}`, editForm);
      notify("Leave updated ✓");
      setEditLeave(null);
      load();
    } catch (err) { notify(err.message, "error"); }
  };

  const TYPE_CONFIG = {
    casual:        { label: "Casual Leave",        color: C.blue,   bg: "#eff6ff" },
    unauthorized:  { label: "Unauthorized Leave",  color: C.red,    bg: "#fee2e2" },
    noshow:        { label: "No Show",             color: "#ea580c", bg: "#ffedd5" },
    sick:          { label: "Sick Leave",          color: C.violet, bg: "#ede9fe" },
  };

  let list = leaves;
  if (selEmp !== "all") list = list.filter(l => l.employee_id === selEmp);
  if (selType !== "all") list = list.filter(l => l.type === selType);
  list = [...list].sort((a, b) => b.date.localeCompare(a.date));

  // Counts per type
  const counts = leaves.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {});

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: C.g800, fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Leave & Penalty History</h2>

      {/* Month selector */}
      <input style={{ ...S.input, marginBottom: 12 }} type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} />

      {/* Summary badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(counts).map(([type, count]) => {
          const tc = TYPE_CONFIG[type] || { label: type, color: C.gr500, bg: C.g50 };
          return <span key={type} style={{ background: tc.bg, color: tc.color, fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>{tc.label}: {count}</span>;
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select style={{ ...S.select, marginBottom: 0, flex: 1, fontSize: 12 }} value={selEmp} onChange={e => setSelEmp(e.target.value)}>
          <option value="all">All employees</option>
          {employees.filter(e => e.role === "employee").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select style={{ ...S.select, marginBottom: 0, flex: 1, fontSize: 12 }} value={selType} onChange={e => setSelType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Leave list */}
      {list.map(lv => {
        const tc = TYPE_CONFIG[lv.type] || { label: lv.type, color: C.gr500, bg: C.g50 };
        return (
          <div key={lv.id} style={{ background: C.white, borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: `0 2px 8px ${C.g300}33`, borderLeft: `4px solid ${tc.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p style={{ color: C.gr900, fontWeight: 800 }}>{lv.employee_name}</p>
                  <span style={{ background: tc.bg, color: tc.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{tc.label}</span>
                </div>
                <p style={{ color: C.g700, fontWeight: 700, fontSize: 14 }}>📅 {fmtD(lv.date)}</p>
                {lv.reason && <p style={{ color: C.gr500, fontSize: 13, marginTop: 3 }}>💬 {lv.reason}</p>}
                {lv.recorded_by_name && <p style={{ color: C.gr500, fontSize: 11, marginTop: 4 }}>Added by {lv.recorded_by_name}</p>}
                {lv.created_at && <p style={{ color: C.gr500, fontSize: 11 }}>{new Date(lv.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditLeave(lv); setEditForm({ type: lv.type, reason: lv.reason || "", date: lv.date }); }}
                  style={{ ...S.outline, padding: "6px 10px", fontSize: 12 }}>✏️</button>
                <button onClick={() => deleteLeave(lv)}
                  style={{ ...S.outline, padding: "6px 10px", fontSize: 12, borderColor: C.red, color: C.red }}>🗑</button>
              </div>
            </div>
          </div>
        );
      })}
      {list.length === 0 && <Empty icon="📝" msg="No leave records this month" />}

      {/* Edit modal */}
      {editLeave && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ color: C.g800, fontWeight: 800, fontSize: 17 }}>Edit Leave</p>
                <p style={{ color: C.gr500, fontSize: 13 }}>{editLeave.employee_name}</p>
              </div>
              <button onClick={() => setEditLeave(null)} style={S.iconBtn}>✕</button>
            </div>
            <label style={S.label}>Leave type</label>
            <select style={S.select} value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <label style={S.label}>Date</label>
            <input style={S.input} type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
            <label style={S.label}>Reason</label>
            <input style={S.input} placeholder="Reason" value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, flex: 1 }} onClick={saveEdit}>Save changes</button>
              <button onClick={() => setEditLeave(null)} style={{ ...S.outline, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FIXED AdminAttendanceTable, AdminLeaveHistory, AdminDailyBoard
// Fixes:
// 1. Attendance edit correctly changes A→P and shows times
// 2. Date of joining preserved on staff edit
// 3. Real-time refresh after edit
// 4. Check-in/out times showing correctly
// 5. Manually added attendance shows P not A
// ============================================================


// ── LEAVE HISTORY (full audit) ─────────────────────────────────────────────


// ── STYLES ─────────────────────────────────────────────────────────────────
const S = {
  label: {color:C.g800,fontSize:13,fontWeight:600,marginBottom:6,display:"block"},
  input: {background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  select: {background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  btn: {background:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:14,color:C.white,padding:"14px 20px",fontSize:15,fontWeight:800,cursor:"pointer",width:"100%",marginTop:4},
  outline: {background:C.white,border:`1.5px solid ${C.g500}`,borderRadius:14,color:C.g700,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"},
  iconBtn: {background:C.g100,border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",color:C.g700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"},
};