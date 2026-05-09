import { useState, useEffect, useRef } from "react";

// ── FONTS & GLOBAL STYLES ────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Syne:wght@700;800&display=swap";
  document.head.appendChild(l);
  const s = document.createElement("style");
  s.textContent = `*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{background:#f0faf4;font-family:'Plus Jakarta Sans',sans-serif}input,select,textarea{font-family:'Plus Jakarta Sans',sans-serif}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#86efac;border-radius:4px}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}@keyframes glow{0%,100%{box-shadow:0 0 20px #16a34a33}50%{box-shadow:0 0 36px #16a34a66}}@keyframes scanline{0%,100%{top:12%}50%{top:80%}}@keyframes badgePop{0%{transform:scale(0.6);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`;
  document.head.appendChild(s);
}

// ── PALETTE ──────────────────────────────────────────────────────────────────
const C = {
  g900:"#14532d",g800:"#166534",g700:"#15803d",g600:"#16a34a",g500:"#22c55e",
  g400:"#4ade80",g300:"#86efac",g200:"#bbf7d0",g100:"#dcfce7",g50:"#f0faf4",
  white:"#ffffff",gr900:"#111827",gr700:"#374151",gr500:"#6b7280",gr300:"#d1d5db",
  red:"#ef4444",amber:"#f59e0b",blue:"#3b82f6",violet:"#7c3aed",indigo:"#6366f1",
};

// ── DEFAULT DATA ─────────────────────────────────────────────────────────────
const DEFAULT_SHIFT_TEMPLATES = [
  {id:"sh1",name:"Early Morning",start:"06:00",end:"14:00",breakMins:30, color:"#f59e0b"},
  {id:"sh2",name:"Day",          start:"09:00",end:"18:00",breakMins:60, color:"#3b82f6"},
  {id:"sh3",name:"Evening",      start:"14:00",end:"22:00",breakMins:30, color:"#8b5cf6"},
  {id:"sh4",name:"Night",        start:"22:00",end:"06:00",breakMins:60, color:"#6366f1"},
  {id:"sh5",name:"Half Day AM",  start:"09:00",end:"13:00",breakMins:0,  color:"#10b981"},
  {id:"sh6",name:"Split 7–7",    start:"07:00",end:"19:00",breakMins:60, color:"#ef4444"},
  {id:"sh7",name:"Split 10–10",  start:"10:00",end:"22:00",breakMins:60, color:"#ec4899"},
];

const DEFAULT_ORG = {
  name:"Acme Corporation",
  branches:[
    {id:"br1",name:"Mumbai HQ",  address:"BKC, Mumbai",      lat:19.0600,lng:72.8650,radius:200},
    {id:"br2",name:"Pune Branch",address:"Hinjewadi, Pune",  lat:18.5913,lng:73.7389,radius:200},
  ],
};

const DEFAULT_EMPLOYEES = [
  {id:"emp1",name:"Priya Sharma", phone:"9876543210",password:"1234",      branchId:"br1",role:"employee",   salary:45000,managerId:"mgr1",designation:"Software Engineer",defaultShiftId:"sh2"},
  {id:"emp2",name:"Rahul Verma",  phone:"9123456789",password:"1234",      branchId:"br1",role:"employee",   salary:38000,managerId:"mgr1",designation:"QA Engineer",      defaultShiftId:"sh2"},
  {id:"emp3",name:"Anjali Menon", phone:"9112233445",password:"1234",      branchId:"br2",role:"employee",   salary:42000,managerId:"mgr1",designation:"UI Designer",      defaultShiftId:"sh3"},
  {id:"mgr1",name:"Sunita Rao",   phone:"9000000001",password:"admin123",  branchId:"br1",role:"branch_admin",salary:75000,managerId:"super",designation:"Branch Manager", defaultShiftId:"sh2"},
  {id:"super",name:"Super Admin", phone:"9999999999",password:"superadmin",branchId:"br1",role:"super_admin",salary:0,    managerId:null,  designation:"Super Admin",       defaultShiftId:null},
];

const DEFAULT_SETTINGS = {
  gracePeriodMins:15,lateDeductionPerOccurrence:50,maxAllowedLatesPerMonth:3,
  excessLatePenalty:100,unauthorizedLeavePenalty:200,noShowPenalty:250,
  casualLeavePerMonth:1.5,workingDaysPerMonth:26,geoFenceRadiusMeters:200,
};

// seed a demo schedule: emp1 gets rotational, others get fixed
function buildDefaultSchedule() {
  const entries = [];
  const rotational = ["sh6","sh2","sh7","sh3","sh2","sh1","sh4"]; // Mon–Sun cycle
  const base = new Date(); base.setDate(base.getDate() - 7);
  for (let i = 0; i < 21; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    if (d.getDay() === 0) continue; // skip Sundays for demo
    const ds = d.toISOString().split("T")[0];
    entries.push({id:`s_${ds}_e1`,employeeId:"emp1",date:ds,shiftId:rotational[d.getDay()%7],source:"bulk",override:false});
    entries.push({id:`s_${ds}_e2`,employeeId:"emp2",date:ds,shiftId:"sh2",              source:"bulk",override:false});
    entries.push({id:`s_${ds}_e3`,employeeId:"emp3",date:ds,shiftId:"sh3",              source:"bulk",override:false});
  }
  return entries;
}

// ── STORAGE ──────────────────────────────────────────────────────────────────
const db = {
  get:(k,d)=>{try{const v=localStorage.getItem("saa_"+k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem("saa_"+k,JSON.stringify(v));}catch{}},
};
function initDB(){
  if(!db.get("init")){
    db.set("settings",DEFAULT_SETTINGS); db.set("org",DEFAULT_ORG);
    db.set("employees",DEFAULT_EMPLOYEES); db.set("shiftTemplates",DEFAULT_SHIFT_TEMPLATES);
    db.set("schedule",buildDefaultSchedule()); db.set("records",[]);
    db.set("approvals",[]); db.set("leaves",[]); db.set("shiftRequests",[]);
    db.set("init",true);
  }
}

// ── UTILS ────────────────────────────────────────────────────────────────────
const fmt  = n=>`₹${Number(n).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
const today = ()=>new Date().toISOString().split("T")[0];
const nowTime = ()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes());};
const pad  = n=>String(n).padStart(2,"0");
const toMins = t=>{if(!t)return 0;const[h,m]=t.split(":").map(Number);return h*60+m;};
const fmtDate = ds=>new Date(ds+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",weekday:"short"});
const fmtDateFull = ds=>new Date(ds+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});
const weekDayName = ds=>new Date(ds+"T12:00:00").toLocaleDateString("en-IN",{weekday:"long"});

// Overnight-aware duration
function shiftNetMins(shift){
  if(!shift) return 480;
  const s=toMins(shift.start),e=toMins(shift.end);
  const raw=e>s?e-s:(1440-s+e);
  return raw-(shift.breakMins||0);
}

// Minutes late (positive = late, negative = early); handles overnight shifts
function minsLate(scanTime, shiftStart){
  const sm=toMins(shiftStart), tm=toMins(scanTime);
  let diff=tm-sm;
  // if diff < -720, the shift likely started "yesterday" (night shift) — add 1440
  if(diff < -720) diff+=1440;
  return diff;
}

function geoDistM(lat1,lng1,lat2,lng2){
  const R=6371000,r=x=>x*Math.PI/180,dLat=r(lat2-lat1),dLng=r(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Priority: override > schedule > employee default shift
function resolveShift(schedule, shiftTemplates, employeeId, date, employees){
  const emp = employees.find(e=>e.id===employeeId);
  // 1. override entry
  const overrideEntry = schedule.find(s=>s.employeeId===employeeId&&s.date===date&&s.override===true);
  if(overrideEntry) return {entry:overrideEntry, shift:shiftTemplates.find(s=>s.id===overrideEntry.shiftId)||null, source:"override"};
  // 2. published schedule entry
  const schedEntry = schedule.find(s=>s.employeeId===employeeId&&s.date===date&&!s.override);
  if(schedEntry) return {entry:schedEntry, shift:shiftTemplates.find(s=>s.id===schedEntry.shiftId)||null, source:"schedule"};
  // 3. default shift on employee
  if(emp?.defaultShiftId){
    const shift = shiftTemplates.find(s=>s.id===emp.defaultShiftId);
    return {entry:null, shift:shift||null, source:"default"};
  }
  return {entry:null, shift:null, source:"none"};
}

function calcStats(emp, records, leaves, settings, schedule, shiftTemplates, employees){
  const now=new Date(), mk=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  const mr=records.filter(r=>r.employeeId===emp.id&&r.date.startsWith(mk));
  const ml=leaves.filter(l=>l.employeeId===emp.id&&l.date.startsWith(mk));
  const scheduledThisMonth=schedule.filter(s=>s.employeeId===emp.id&&s.date.startsWith(mk)&&!s.override).length||settings.workingDaysPerMonth;
  const presentDays=[...new Set(mr.filter(r=>r.type==="checkin").map(r=>r.date))].length;
  const lateDays=mr.filter(r=>r.type==="checkin"&&r.isLate&&r.approvalStatus!=="rejected").length;
  const unauthLeaves=ml.filter(l=>l.type==="unauthorized").length;
  const noShows=ml.filter(l=>l.type==="noshow").length;
  const casualUsed=ml.filter(l=>l.type==="casual").length;
  const dailyRate=emp.salary/(scheduledThisMonth||settings.workingDaysPerMonth);
  const earnedGross=presentDays*dailyRate;
  const excessLates=Math.max(0,lateDays-settings.maxAllowedLatesPerMonth);
  const lateDeductions=lateDays*settings.lateDeductionPerOccurrence+excessLates*settings.excessLatePenalty;
  const leaveDeductions=unauthLeaves*settings.unauthorizedLeavePenalty;
  const noShowDeductions=noShows*settings.noShowPenalty;
  const totalDeductions=lateDeductions+leaveDeductions+noShowDeductions;
  return {presentDays,lateDays,unauthLeaves,noShows,casualUsed,scheduledThisMonth,dailyRate,earnedGross,lateDeductions,leaveDeductions,noShowDeductions,totalDeductions,netEarned:Math.max(0,earnedGross-totalDeductions)};
}

function genQR(branchId){return JSON.stringify({branchId,token:"SMARTAI_V3",app:"3SL"});}

// ── QR CANVAS ────────────────────────────────────────────────────────────────
function QRCanvas({data:qd,size=220}){
  const ref=useRef(null);
  useEffect(()=>{
    if(!ref.current)return;
    const cv=ref.current,ctx=cv.getContext("2d");
    cv.width=size;cv.height=size;
    let h=5381;for(let i=0;i<qd.length;i++)h=((h<<5)+h)^qd.charCodeAt(i);h=Math.abs(h);
    const M=29,cs=size/M;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);
    const dm=(x,y)=>{ctx.fillStyle=C.g800;ctx.fillRect(x*cs,y*cs,7*cs,7*cs);ctx.fillStyle="#fff";ctx.fillRect((x+1)*cs,(y+1)*cs,5*cs,5*cs);ctx.fillStyle=C.g600;ctx.fillRect((x+2)*cs,(y+2)*cs,3*cs,3*cs);};
    dm(0,0);dm(M-7,0);dm(0,M-7);
    for(let r=0;r<M;r++)for(let c=0;c<M;c++){
      const iM=(r<8&&c<8)||(r<8&&c>=M-8)||(r>=M-8&&c<8);
      if(!iM){const b=(h>>((r*M+c)%29))&1,b2=((h*31^(r*17+c*7))>>((r+c)%19))&1;
        if(b||b2){ctx.fillStyle=C.g700;ctx.fillRect(c*cs+0.5,r*cs+0.5,cs-1,cs-1);}}
    }
    ctx.fillStyle="#fff";ctx.fillRect(size/2-18,size/2-18,36,36);
    ctx.fillStyle=C.g600;ctx.font=`bold ${Math.floor(cs*1.8)}px sans-serif`;
    ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("📍",size/2,size/2+1);
  },[qd,size]);
  return <canvas ref={ref} style={{borderRadius:12,display:"block"}}/>;
}

// ── QR SCANNER ────────────────────────────────────────────────────────────────
function QRScanner({onScan,onClose,branches}){
  const vRef=useRef(null);
  const [streaming,setStreaming]=useState(false),[err,setErr]=useState(null),[man,setMan]=useState("");
  useEffect(()=>{
    let st;
    navigator.mediaDevices?.getUserMedia({video:{facingMode:"environment"}})
      .then(s=>{st=s;if(vRef.current)vRef.current.srcObject=s;setStreaming(true);})
      .catch(()=>setErr("Camera unavailable"));
    return ()=>st?.getTracks().forEach(t=>t.stop());
  },[]);
  const tryManual=()=>{try{const d=JSON.parse(man);if(d.branchId)onScan(d);else setErr("Invalid QR");}catch{setErr("Bad format");}};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999}}>
      <div style={{background:C.white,borderRadius:"28px 28px 0 0",padding:24,width:"100%",maxWidth:480,animation:"slideUp .3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><p style={Txt.cap}>Scan QR Code</p><h3 style={{fontSize:20,fontWeight:800,color:C.g800}}>Mark Attendance</h3></div>
          <Btn ghost icon="✕" onClick={onClose}/>
        </div>
        <div style={{background:"#000",borderRadius:20,height:180,position:"relative",overflow:"hidden",marginBottom:16}}>
          <video ref={vRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:16,border:`2px solid ${C.g500}`,borderRadius:12}}/>
          {streaming&&<div style={{position:"absolute",left:16,right:16,height:2,background:`linear-gradient(90deg,transparent,${C.g500},transparent)`,top:"40%",animation:"scanline 2s ease-in-out infinite"}}/>}
        </div>
        {err&&<p style={{color:C.amber,fontSize:13,textAlign:"center",marginBottom:10}}>⚠ {err}</p>}
        <input style={S.input} placeholder="Paste QR data…" value={man} onChange={e=>setMan(e.target.value)}/>
        <button style={{...S.btn,marginBottom:16}} onClick={tryManual}>Submit manual</button>
        <p style={{color:C.g600,fontSize:12,fontWeight:700,marginBottom:8}}>⚡ Demo quick scan</p>
        <div style={{display:"flex",gap:8}}>
          {branches.map(b=>(
            <button key={b.id} style={S.outline} onClick={()=>onScan({branchId:b.id,token:"SMARTAI_V3",app:"3SL"})}>📍 {b.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [page,setPage]=useState("login");
  const [toast,setToast]=useState(null);
  const [data,setData]=useState(()=>{
    initDB();
    return {
      settings:db.get("settings",DEFAULT_SETTINGS), org:db.get("org",DEFAULT_ORG),
      employees:db.get("employees",DEFAULT_EMPLOYEES), shiftTemplates:db.get("shiftTemplates",DEFAULT_SHIFT_TEMPLATES),
      schedule:db.get("schedule",[]), records:db.get("records",[]),
      approvals:db.get("approvals",[]), leaves:db.get("leaves",[]),
      shiftRequests:db.get("shiftRequests",[]),
    };
  });

  const notify=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};
  const save=(k,v)=>{db.set(k,v);setData(d=>({...d,[k]:v}));};

  if(!user) return <LoginScreen employees={data.employees} onLogin={u=>{setUser(u);setPage(u.role==="employee"?"home":"adm_home");}}/>;

  return(
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.g50,minHeight:"100vh"}}>
      {toast&&<Toast {...toast}/>}
      {user.role==="employee"
        ?<EmpApp user={user} data={data} save={save} notify={notify} page={page} setPage={setPage} onLogout={()=>{setUser(null);setPage("login");}}/>
        :<AdminApp user={user} data={data} save={save} notify={notify} page={page} setPage={setPage} onLogout={()=>{setUser(null);setPage("login");}}/>}
    </div>
  );
}

// ── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({employees,onLogin}){
  const [ph,setPh]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[loading,setLoading]=useState(false);
  const go=()=>{
    setLoading(true);setErr("");
    setTimeout(()=>{
      const e=employees.find(e=>e.phone===ph&&e.password===pw);
      if(e) onLogin(e); else{setErr("Invalid phone or password");setLoading(false);}
    },500);
  };
  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${C.g900},${C.g700} 60%,${C.g500})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{position:"fixed",top:-80,right:-80,width:280,height:280,background:"rgba(255,255,255,0.05)",borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{width:"100%",maxWidth:400,animation:"fadeUp .5s ease"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:76,height:76,background:"rgba(255,255,255,0.14)",borderRadius:22,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.18)"}}>
            <span style={{fontSize:38}}>📍</span>
          </div>
          <h1 style={{color:C.white,fontSize:26,fontWeight:900,fontFamily:"'Syne',sans-serif",letterSpacing:"-0.5px",margin:"0 0 4px"}}>SmartAi Attendance</h1>
          <p style={{color:"rgba(255,255,255,0.55)",fontSize:12,fontWeight:600,letterSpacing:0.5}}>by 3SL Media Labs</p>
        </div>
        <div style={{background:C.white,borderRadius:26,padding:30,boxShadow:"0 28px 72px rgba(0,0,0,0.22)"}}>
          <h2 style={{color:C.g800,fontSize:20,fontWeight:800,marginBottom:20}}>Sign in</h2>
          <label style={Txt.label}>Phone number</label>
          <input style={S.input} type="tel" placeholder="9876543210" value={ph} onChange={e=>setPh(e.target.value)}/>
          <label style={Txt.label}>Password</label>
          <input style={S.input} type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
          {err&&<p style={{color:C.red,fontSize:13,marginBottom:8}}>⚠ {err}</p>}
          <button style={S.btn} onClick={go} disabled={loading}>
            {loading?<span style={{display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>:"Sign In →"}
          </button>
        </div>
        <div style={{marginTop:20,background:"rgba(255,255,255,0.1)",borderRadius:18,padding:18,backdropFilter:"blur(8px)"}}>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Demo accounts</p>
          {[["🔐 Super Admin","9999999999","superadmin"],["🏢 Branch Admin","9000000001","admin123"],["👤 Employee (rotational)","9876543210","1234"]].map(([l,p,w])=>(
            <button key={l} onClick={()=>{setPh(p);setPw(w);}} style={{width:"100%",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.18)",borderRadius:12,padding:"10px 14px",color:C.white,fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span>{l}</span><span style={{opacity:.55}}>{p}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── EMPLOYEE APP ─────────────────────────────────────────────────────────────
function EmpApp({user,data,save,notify,page,setPage,onLogout}){
  const [showScanner,setShowScanner]=useState(false);
  const todayStr=today();
  const {shift:todayShift,source:shiftSource}=resolveShift(data.schedule,data.shiftTemplates,user.id,todayStr,data.employees);
  const todayRecs=data.records.filter(r=>r.employeeId===user.id&&r.date===todayStr);
  const checkedIn=todayRecs.find(r=>r.type==="checkin");
  const checkedOut=todayRecs.find(r=>r.type==="checkout");
  const stats=calcStats(user,data.records,data.leaves,data.settings,data.schedule,data.shiftTemplates,data.employees);
  const branch=data.org.branches.find(b=>b.id===user.branchId);

  const handleScan=qd=>{
    setShowScanner(false);
    const scBranch=data.org.branches.find(b=>b.id===qd.branchId);
    if(!scBranch){notify("Invalid QR — branch not found","error");return;}
    if(checkedIn&&checkedOut){notify("Already done for today","error");return;}
    if(!todayShift){notify("No shift assigned for today — contact admin","error");return;}

    navigator.geolocation?.getCurrentPosition(
      pos=>{
        const dist=geoDistM(pos.coords.latitude,pos.coords.longitude,scBranch.lat,scBranch.lng);
        if(dist>scBranch.radius){notify(`Outside geo-fence! ${Math.round(dist)}m away (max ${scBranch.radius}m)`,"error");return;}
        processCheckIn(qd.branchId,pos.coords,scBranch);
      },
      ()=>processCheckIn(qd.branchId,null,scBranch),
      {timeout:7000,enableHighAccuracy:true}
    );
  };

  const processCheckIn=(branchId,coords,scBranch)=>{
    const now=nowTime(),s=data.settings;
    if(!checkedIn){
      const late=minsLate(now,todayShift.start);
      const isLate=late>s.gracePeriodMins;
      const needsApproval=late>s.gracePeriodMins*2;
      const rec={id:`r_${Date.now()}`,employeeId:user.id,branchId,date:todayStr,time:now,type:"checkin",
        shiftId:todayShift.id,shiftStart:todayShift.start,shiftEnd:todayShift.end,
        isLate,lateMins:Math.max(0,late),approvalStatus:needsApproval?"pending":"approved",
        geoVerified:!!coords,adminEdited:false};
      const newRecs=[...data.records,rec];
      save("records",newRecs);
      if(needsApproval){
        save("approvals",[...data.approvals,{id:`ap_${Date.now()}`,recordId:rec.id,employeeId:user.id,employeeName:user.name,managerId:user.managerId,date:todayStr,time:now,lateMins:late,shiftName:todayShift.name,status:"pending"}]);
        notify(`Checked in — ${late}m late on ${todayShift.name} shift. Approval sent ⏳`,"warn");
      } else if(isLate){
        notify(`Checked in ${late}m late on ${todayShift.name} shift ⚠`,"warn");
      } else {
        notify(`✅ Checked in at ${now} — ${todayShift.name} shift @ ${scBranch.name}`);
      }
    } else {
      const wm=toMins(now)-toMins(checkedIn.time);
      const net=shiftNetMins(todayShift);
      const rec={id:`r_${Date.now()}`,employeeId:user.id,branchId,date:todayStr,time:now,type:"checkout",workedMins:wm,shiftId:todayShift.id,geoVerified:!!coords,adminEdited:false};
      save("records",[...data.records,rec]);
      if(wm<net){notify(`Checked out — ${Math.floor(wm/60)}h ${wm%60}m worked (shift needs ${Math.floor(net/60)}h) ⚠`,"warn");}
      else notify(`✅ Checked out — ${Math.floor(wm/60)}h ${wm%60}m worked`);
    }
  };

  const empNav=[{k:"home",i:"🏠",l:"Home"},{k:"my_shifts",i:"📅",l:"Shifts"},{k:"history",i:"📋",l:"History"},{k:"salary",i:"💰",l:"Salary"},{k:"leaves",i:"🌿",l:"Leaves"}];
  const pages={
    home:<EmpHome user={user} todayShift={todayShift} shiftSource={shiftSource} checkedIn={checkedIn} checkedOut={checkedOut} branch={branch} stats={stats} settings={data.settings} onScan={()=>setShowScanner(true)}/>,
    my_shifts:<EmpMyShifts user={user} data={data} save={save} notify={notify}/>,
    history:<EmpHistory user={user} records={data.records} schedule={data.schedule} shiftTemplates={data.shiftTemplates} branches={data.org.branches} employees={data.employees}/>,
    salary:<EmpSalary user={user} stats={stats} settings={data.settings}/>,
    leaves:<EmpLeaves user={user} stats={stats} settings={data.settings} leaves={data.leaves}/>,
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:480,margin:"0 auto",background:C.g50}}>
      {showScanner&&<QRScanner onScan={handleScan} onClose={()=>setShowScanner(false)} branches={data.org.branches}/>}
      <TopBar user={user} onLogout={onLogout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{pages[page]||pages.home}</div>
      <BottomNav items={empNav} page={page} setPage={setPage}/>
    </div>
  );
}

// ── EMP HOME ──────────────────────────────────────────────────────────────────
function EmpHome({user,todayShift,shiftSource,checkedIn,checkedOut,branch,stats,settings,onScan}){
  const status=!checkedIn?"out":!checkedOut?"in":"done";
  const netMins=todayShift?shiftNetMins(todayShift):0;
  return(
    <div style={{padding:20}}>
      {/* Hero card */}
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:18,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,background:"rgba(255,255,255,0.07)",borderRadius:"50%"}}/>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13,marginBottom:3}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
        <h2 style={{color:C.white,fontSize:22,fontWeight:800,marginBottom:2}}>Hi, {user.name.split(" ")[0]} 👋</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{user.designation} · {branch?.name}</p>

        {/* Today's shift badge */}
        {todayShift?(
          <div style={{marginTop:16,background:"rgba(255,255,255,0.13)",borderRadius:14,padding:"12px 16px",backdropFilter:"blur(8px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Today's Shift</p>
                <p style={{color:C.white,fontSize:18,fontWeight:800}}>{todayShift.name}</p>
                <p style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>{todayShift.start} → {todayShift.end} · {Math.floor(netMins/60)}h {netMins%60}m net</p>
              </div>
              <div style={{width:12,height:12,borderRadius:"50%",background:todayShift.color,boxShadow:`0 0 12px ${todayShift.color}`}}/>
            </div>
            {shiftSource==="override"&&<p style={{color:"#fde68a",fontSize:11,marginTop:6}}>⚡ Manager override for today</p>}
            {shiftSource==="default"&&<p style={{color:"rgba(255,255,255,0.5)",fontSize:11,marginTop:6}}>Default shift (no specific schedule set)</p>}
          </div>
        ):(
          <div style={{marginTop:16,background:"rgba(239,68,68,0.2)",borderRadius:14,padding:"12px 16px"}}>
            <p style={{color:"#fca5a5",fontWeight:700}}>⚠ No shift assigned for today</p>
            <p style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>Contact your admin or manager</p>
          </div>
        )}
      </div>

      {/* Check in/out times */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["Check In",checkedIn?.time,"▶",C.g600,checkedIn?.isLate?`${checkedIn.lateMins}m late`:"On time"],
          ["Check Out",checkedOut?.time,"⏹",C.indigo,checkedOut?.auto?"Auto":"—"]].map(([l,t,icon,c,sub])=>(
          <div key={l} style={{background:C.white,borderRadius:16,padding:"14px",boxShadow:`0 2px 8px ${C.g300}33`}}>
            <p style={{color:C.gray500,fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{color:t?c:C.gr300,fontSize:22,fontWeight:900,margin:"4px 0"}}>{t||"—"}</p>
            <p style={{color:t?C.gray500:C.gr300,fontSize:11}}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Scan button */}
      <button onClick={onScan} disabled={status==="done"||!todayShift}
        style={{width:"100%",background:status==="done"||!todayShift?C.gr300:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:20,padding:"22px",cursor:status==="done"||!todayShift?"not-allowed":"pointer",color:C.white,display:"flex",flexDirection:"column",alignItems:"center",gap:6,animation:status!=="done"&&todayShift?"glow 3s infinite":"none",marginBottom:18}}>
        <span style={{fontSize:34}}>📷</span>
        <span style={{fontSize:17,fontWeight:800}}>{status==="out"?"Scan to Check In":status==="in"?"Scan to Check Out":"Day Complete ✓"}</span>
        {todayShift&&<span style={{fontSize:12,opacity:0.75}}>Geo-fenced · {todayShift.name} shift · Grace {settings.gracePeriodMins}m</span>}
      </button>

      {/* Month stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[["Present",stats.presentDays,C.g600],["Late",stats.lateDays,C.amber],["CL Left",Math.max(0,Math.ceil(settings.casualLeavePerMonth)-stats.casualUsed),C.blue]].map(([l,v,c])=>(
          <div key={l} style={{background:C.white,borderRadius:15,padding:"12px 8px",textAlign:"center",boxShadow:`0 2px 8px ${C.g300}33`}}>
            <p style={{color:c,fontSize:22,fontWeight:900}}>{v}</p><p style={{color:C.gray500,fontSize:11,marginTop:2}}>{l}</p>
          </div>
        ))}
      </div>

      {/* Salary preview */}
      <div style={{background:C.white,borderRadius:20,padding:18,boxShadow:`0 2px 12px ${C.g300}44`}}>
        <p style={{color:C.gray500,fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4}}>Earned this month</p>
        <p style={{color:C.g700,fontSize:30,fontWeight:900,margin:"4px 0"}}>{fmt(stats.netEarned)}</p>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{color:C.gray500,fontSize:13}}>Gross: {fmt(stats.earnedGross)}</span>
          <span style={{color:C.red,fontSize:13}}>-{fmt(stats.totalDeductions)}</span>
        </div>
        <div style={{background:C.g100,borderRadius:8,height:6,marginTop:10}}>
          <div style={{background:`linear-gradient(90deg,${C.g600},${C.g400})`,height:6,borderRadius:8,width:`${Math.min(100,(stats.netEarned/(user.salary||1))*100)}%`}}/>
        </div>
      </div>
    </div>
  );
}

// ── EMP MY SHIFTS ─────────────────────────────────────────────────────────────
function EmpMyShifts({user,data,save,notify}){
  const [tab,setTab]=useState("upcoming"); // upcoming | request
  const [reqDate,setReqDate]=useState("");
  const [reqShift,setReqShift]=useState("");
  const [reqNote,setReqNote]=useState("");

  // Build 14-day view
  const days=[];
  for(let i=-2;i<=13;i++){const d=new Date();d.setDate(d.getDate()+i);days.push(d.toISOString().split("T")[0]);}

  const myPendingRequests=data.shiftRequests.filter(r=>r.employeeId===user.id&&r.status==="pending");

  const submitRequest=()=>{
    if(!reqDate||!reqShift){notify("Select date and shift","error");return;}
    const req={id:`sr_${Date.now()}`,employeeId:user.id,employeeName:user.name,managerId:user.managerId,
      date:reqDate,requestedShiftId:reqShift,note:reqNote,status:"pending",createdAt:new Date().toISOString()};
    save("shiftRequests",[...data.shiftRequests,req]);
    notify("Shift change request sent to manager ✓");
    setReqDate("");setReqShift("");setReqNote("");
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>My Shifts</h2>
      <p style={{color:C.gray500,fontSize:13,marginBottom:16}}>Upcoming 2 weeks & change requests</p>

      {/* Tabs */}
      <div style={{background:C.g100,borderRadius:14,display:"flex",padding:4,marginBottom:20}}>
        {[["upcoming","📅 Schedule"],["request","🔄 Request change"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.white:"transparent",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:tab===t?C.g700:C.gray500,fontWeight:700,fontSize:13}}>
            {l}
          </button>
        ))}
      </div>

      {tab==="upcoming"&&(
        <div>
          {days.map(ds=>{
            const {shift,source}=resolveShift(data.schedule,data.shiftTemplates,user.id,ds,data.employees);
            const isToday=ds===today();
            const isPast=ds<today();
            const rec=data.records.find(r=>r.employeeId===user.id&&r.date===ds&&r.type==="checkin");
            return(
              <div key={ds} style={{background:isToday?`linear-gradient(135deg,${C.g800},${C.g700})`:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:`0 2px 8px ${C.g300}${isToday?"66":"22"}`,borderLeft:`4px solid ${shift?shift.color:C.gr300}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <p style={{color:isToday?C.white:C.gr900,fontWeight:800,fontSize:15}}>{fmtDate(ds)} {isToday&&"· TODAY"}</p>
                    {shift?(
                      <p style={{color:isToday?"rgba(255,255,255,0.75)":C.gray500,fontSize:13,marginTop:2}}>
                        {shift.name} · {shift.start}–{shift.end}
                      </p>
                    ):(
                      <p style={{color:isPast?C.gr300:C.red,fontSize:13,marginTop:2}}>No shift assigned</p>
                    )}
                    {source==="override"&&<span style={{background:"#fef3c7",color:"#d97706",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>OVERRIDE</span>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    {rec&&<span style={{background:C.g100,color:C.g700,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>✓ In {rec.time}</span>}
                    {!rec&&!isPast&&shift&&<span style={{color:isToday?C.g300:C.gray500,fontSize:12}}>Upcoming</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="request"&&(
        <div>
          {myPendingRequests.length>0&&(
            <div style={{background:"#fffbeb",borderRadius:16,padding:16,marginBottom:20,border:"1px solid #fcd34d"}}>
              <p style={{color:"#d97706",fontWeight:700,fontSize:14,marginBottom:8}}>⏳ Pending requests</p>
              {myPendingRequests.map(r=>{
                const sh=data.shiftTemplates.find(s=>s.id===r.requestedShiftId);
                return(
                  <p key={r.id} style={{color:"#92400e",fontSize:13}}>
                    {fmtDate(r.date)} → {sh?.name} shift — awaiting approval
                  </p>
                );
              })}
            </div>
          )}
          <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
            <p style={{color:C.g800,fontWeight:800,fontSize:16,marginBottom:4}}>Request shift change</p>
            <p style={{color:C.gray500,fontSize:13,marginBottom:16}}>Manager will approve or deny your request</p>
            <label style={Txt.label}>Date you want to change</label>
            <input style={S.input} type="date" value={reqDate} min={today()} onChange={e=>setReqDate(e.target.value)}/>
            {reqDate&&(()=>{const{shift}=resolveShift(data.schedule,data.shiftTemplates,user.id,reqDate,data.employees);return shift&&<p style={{color:C.gray500,fontSize:12,marginBottom:8}}>Current: {shift.name} ({shift.start}–{shift.end})</p>;})()}
            <label style={Txt.label}>Requested shift</label>
            <select style={S.select} value={reqShift} onChange={e=>setReqShift(e.target.value)}>
              <option value="">Select shift</option>
              {data.shiftTemplates.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
            </select>
            <label style={Txt.label}>Reason / note</label>
            <input style={S.input} placeholder="Optional note to manager" value={reqNote} onChange={e=>setReqNote(e.target.value)}/>
            <button style={S.btn} onClick={submitRequest}>Send request to manager</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EMP HISTORY ───────────────────────────────────────────────────────────────
function EmpHistory({user,records,schedule,shiftTemplates,branches,employees}){
  const mine=records.filter(r=>r.employeeId===user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const grouped=mine.reduce((a,r)=>{(a[r.date]=a[r.date]||[]).push(r);return a;},{});
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Attendance History</h2>
      {Object.entries(grouped).slice(0,30).map(([ds,recs])=>{
        const cin=recs.find(r=>r.type==="checkin"),cout=recs.find(r=>r.type==="checkout");
        const br=branches.find(b=>b.id===cin?.branchId);
        const sh=shiftTemplates.find(s=>s.id===cin?.shiftId);
        const worked=cin&&cout?toMins(cout.time)-toMins(cin.time):null;
        return(
          <div key={ds} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`,borderLeft:`4px solid ${sh?sh.color:C.g300}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontWeight:800,color:C.gr900}}>{fmtDate(ds)}</span>
              <div style={{display:"flex",gap:6}}>
                {sh&&<span style={{background:sh.color+"20",color:sh.color,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{sh.name}</span>}
                {cin?.isLate&&<span style={{background:"#fffbeb",color:C.amber,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{cin.lateMins}m LATE</span>}
                {cin?.adminEdited&&<span style={{background:"#ede9fe",color:C.violet,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>EDITED</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <span style={{color:C.g600,fontSize:14,fontWeight:600}}>▶ {cin?.time||"—"}</span>
              <span style={{color:C.gray500,fontSize:14}}>⏹ {cout?.time||"—"}</span>
              {worked!==null&&<span style={{color:C.gray500,fontSize:13}}>⏱ {Math.floor(worked/60)}h {worked%60}m</span>}
            </div>
            {br&&<p style={{color:C.gray500,fontSize:12,marginTop:5}}>📍 {br.name}</p>}
          </div>
        );
      })}
      {Object.keys(grouped).length===0&&<Empty icon="📋" msg="No attendance records yet"/>}
    </div>
  );
}

function EmpSalary({user,stats,settings}){
  const rows=[
    {l:"Base salary",v:fmt(user.salary),c:C.gr700},
    {l:"Scheduled days this month",v:stats.scheduledThisMonth,c:C.gr700},
    {l:"Daily rate",v:fmt(stats.dailyRate),c:C.gr700},
    {l:"Days present",v:stats.presentDays,c:C.g600},
    {l:"Gross earned",v:fmt(stats.earnedGross),c:C.g700,bold:true},
    {l:`Late deductions (${stats.lateDays} late)`,v:`-${fmt(stats.lateDeductions)}`,c:C.amber},
    {l:`Leave penalties (${stats.unauthLeaves} unauth)`,v:`-${fmt(stats.leaveDeductions)}`,c:C.red},
    {l:`No-show penalties (${stats.noShows})`,v:`-${fmt(stats.noShowDeductions)}`,c:C.red},
  ];
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Salary Dashboard</h2>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:20}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</p>
        <p style={{color:C.white,fontSize:38,fontWeight:900,margin:"6px 0 2px"}}>{fmt(stats.netEarned)}</p>
        <p style={{color:"rgba(255,255,255,0.55)",fontSize:13}}>of {fmt(user.salary)}/month</p>
        <div style={{background:"rgba(255,255,255,0.15)",borderRadius:8,height:7,marginTop:14}}>
          <div style={{background:C.g300,height:7,borderRadius:8,width:`${Math.min(100,(stats.netEarned/(user.salary||1))*100)}%`}}/>
        </div>
      </div>
      <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 12px ${C.g300}44`}}>
        {rows.map(({l,v,c,bold})=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.g50}`}}>
            <span style={{color:C.gray500,fontSize:13}}>{l}</span>
            <span style={{color:c,fontWeight:bold?800:600,fontSize:14}}>{v}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"14px 0 0"}}>
          <span style={{color:C.g800,fontWeight:800,fontSize:16}}>Net earned</span>
          <span style={{color:C.g700,fontWeight:900,fontSize:20}}>{fmt(stats.netEarned)}</span>
        </div>
      </div>
    </div>
  );
}

function EmpLeaves({user,stats,settings,leaves}){
  const mine=leaves.filter(l=>l.employeeId===user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const tc={casual:C.blue,unauthorized:C.red,noshow:"#dc2626"};
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Leave Record</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
        {[["CL Used",stats.casualUsed,C.blue],["CL Left",Math.max(0,Math.ceil(settings.casualLeavePerMonth)-stats.casualUsed),C.g600],["Unauth",stats.unauthLeaves,C.red]].map(([l,v,c])=>(
          <div key={l} style={{background:C.white,borderRadius:16,padding:"14px 8px",textAlign:"center",boxShadow:`0 2px 8px ${C.g300}33`}}>
            <p style={{color:c,fontSize:24,fontWeight:900}}>{v}</p><p style={{color:C.gray500,fontSize:11}}>{l}</p>
          </div>
        ))}
      </div>
      {mine.map(l=>(
        <div key={l.id} style={{background:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:`0 2px 6px ${C.g300}22`}}>
          <div><p style={{color:C.gr900,fontWeight:700}}>{fmtDate(l.date)}</p>{l.reason&&<p style={{color:C.gray500,fontSize:12}}>{l.reason}</p>}</div>
          <span style={{background:tc[l.type]+"18",color:tc[l.type],fontSize:11,padding:"4px 10px",borderRadius:20,fontWeight:700}}>{l.type.toUpperCase()}</span>
        </div>
      ))}
      {mine.length===0&&<Empty icon="🌿" msg="No leave records"/>}
    </div>
  );
}

// ── ADMIN APP ─────────────────────────────────────────────────────────────────
function AdminApp({user,data,save,notify,page,setPage,onLogout}){
  const isSA=user.role==="super_admin";
  const nav=[
    {k:"adm_home",i:"🏠",l:"Home"},{k:"adm_shifts",i:"📅",l:"Shifts"},
    {k:"adm_override",i:"⚡",l:"Override"},{k:"adm_approvals",i:"✅",l:"Approvals"},
    {k:"adm_qr",i:"📷",l:"QR"},{k:"adm_employees",i:"👥",l:"Staff"},
    ...(isSA?[{k:"adm_edit",i:"✏️",l:"Edit Att."},{k:"adm_reports",i:"📊",l:"Reports"},{k:"adm_settings",i:"⚙️",l:"Settings"}]:[{k:"adm_reports",i:"📊",l:"Reports"}]),
  ];
  const pages={
    adm_home:<AdminHome user={user} data={data} save={save} notify={notify}/>,
    adm_shifts:<AdminShifts data={data} save={save} notify={notify}/>,
    adm_override:<AdminOverride user={user} data={data} save={save} notify={notify}/>,
    adm_approvals:<AdminApprovals user={user} data={data} save={save} notify={notify}/>,
    adm_qr:<AdminQR data={data}/>,
    adm_employees:<AdminEmployees data={data} save={save} notify={notify}/>,
    adm_edit:<AdminEditAtt data={data} save={save} notify={notify}/>,
    adm_reports:<AdminReports data={data}/>,
    adm_settings:<AdminSettings data={data} save={save} notify={notify}/>,
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:480,margin:"0 auto",background:C.g50}}>
      <TopBar user={user} onLogout={onLogout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{pages[page]||pages.adm_home}</div>
      <BottomNav items={nav} page={page} setPage={setPage}/>
    </div>
  );
}

// ── ADMIN HOME ────────────────────────────────────────────────────────────────
function AdminHome({user,data,save,notify}){
  const td=today();
  const emps=data.employees.filter(e=>e.role==="employee");
  const todayRecs=data.records.filter(r=>r.date===td);
  const checkedInToday=[...new Set(todayRecs.filter(r=>r.type==="checkin").map(r=>r.employeeId))].length;
  const pendingApprovals=data.approvals.filter(a=>a.status==="pending"&&(user.role==="super_admin"||a.managerId===user.id)).length;
  const pendingShiftReqs=data.shiftRequests.filter(r=>r.status==="pending"&&(user.role==="super_admin"||r.managerId===user.id)).length;

  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:18}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
        <h2 style={{color:C.white,fontSize:20,fontWeight:800,margin:"4px 0 2px"}}>{data.org.name}</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{user.designation}</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {[[checkedInToday,`of ${emps.length} staff`,C.g600,"Today Present"],
          [pendingApprovals,"late approvals",C.red,"Pending Att."],
          [pendingShiftReqs,"shift requests",C.amber,"Shift Requests"],
          [data.org.branches.length,"locations",C.blue,"Branches"]].map(([v,sub,c,l])=>(
          <div key={l} style={{background:C.white,borderRadius:18,padding:16,boxShadow:`0 2px 10px ${C.g300}44`,borderTop:`3px solid ${c}`}}>
            <p style={{color:C.gray500,fontSize:12,fontWeight:600}}>{l}</p>
            <p style={{color:c,fontSize:26,fontWeight:900,margin:"4px 0 2px"}}>{v}</p>
            <p style={{color:C.gray500,fontSize:11}}>{sub}</p>
          </div>
        ))}
      </div>
      <h3 style={{color:C.g800,fontSize:15,fontWeight:800,marginBottom:12}}>Mark leave / penalty</h3>
      <AddLeave emps={emps} data={data} save={save} notify={notify}/>
    </div>
  );
}

function AddLeave({emps,data,save,notify}){
  const [empId,setEmpId]=useState(""),[ type,setType]=useState("casual"),[dt,setDt]=useState(today()),[reason,setReason]=useState("");
  const go=()=>{
    if(!empId){notify("Select employee","error");return;}
    save("leaves",[...data.leaves,{id:`lv_${Date.now()}`,employeeId:empId,date:dt,type,reason}]);
    notify("Leave recorded ✓");setEmpId("");setReason("");
  };
  return(
    <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <select style={S.select} value={empId} onChange={e=>setEmpId(e.target.value)}>
        <option value="">Select employee</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select style={S.select} value={type} onChange={e=>setType(e.target.value)}>
        <option value="casual">Casual leave</option><option value="unauthorized">Unauthorized leave</option><option value="noshow">No show</option>
      </select>
      <input style={S.input} type="date" value={dt} onChange={e=>setDt(e.target.value)}/>
      <input style={S.input} placeholder="Reason (optional)" value={reason} onChange={e=>setReason(e.target.value)}/>
      <button style={S.btn} onClick={go}>Record leave</button>
    </div>
  );
}

// ── ADMIN SHIFTS (templates + bulk scheduler) ─────────────────────────────────
function AdminShifts({data,save,notify}){
  const [tab,setTab]=useState("templates"); // templates | schedule
  const [selEmp,setSelEmp]=useState("");
  const [selShift,setSelShift]=useState("");
  const [fromDate,setFromDate]=useState(today());
  const [toDate,setToDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+6);return d.toISOString().split("T")[0];});
  const [skipSunday,setSkipSunday]=useState(true);
  const [pattern,setPattern]=useState("same"); // same | rotate
  const [rotateList,setRotateList]=useState(["sh2","sh3","sh2","sh3","sh2"]);
  // new template form
  const [tmName,setTmName]=useState(""),[ tmStart,setTmStart]=useState("09:00"),[ tmEnd,setTmEnd]=useState("18:00"),[tmBreak,setTmBreak]=useState(60),[tmColor,setTmColor]=useState("#3b82f6");

  const emps=data.employees.filter(e=>e.role==="employee");

  const applyBulk=()=>{
    if(!selEmp||!selShift&&pattern==="same"){notify("Fill all fields","error");return;}
    const newSched=[...data.schedule];
    const start=new Date(fromDate),end=new Date(toDate);
    let dayIdx=0;
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      if(skipSunday&&d.getDay()===0) continue;
      const ds=d.toISOString().split("T")[0];
      // Remove existing non-override entry for this emp+date
      const idx=newSched.findIndex(s=>s.employeeId===selEmp&&s.date===ds&&!s.override);
      const shiftId=pattern==="same"?selShift:rotateList[dayIdx%rotateList.length];
      const entry={id:`s_${ds}_${selEmp}_${Date.now()}`,employeeId:selEmp,date:ds,shiftId,source:"bulk",override:false};
      if(idx>=0) newSched[idx]=entry; else newSched.push(entry);
      dayIdx++;
    }
    save("schedule",newSched);
    notify(`Schedule applied ✓ (${dayIdx} days)`);
  };

  const addTemplate=()=>{
    if(!tmName){notify("Enter shift name","error");return;}
    const t={id:`sh_${Date.now()}`,name:tmName,start:tmStart,end:tmEnd,breakMins:Number(tmBreak),color:tmColor};
    save("shiftTemplates",[...data.shiftTemplates,t]);
    notify("Shift template added ✓");setTmName("");
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Shift Management</h2>
      <div style={{background:C.g100,borderRadius:14,display:"flex",padding:4,marginBottom:20}}>
        {[["templates","📋 Templates"],["schedule","📅 Bulk Schedule"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.white:"transparent",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:tab===t?C.g700:C.gray500,fontWeight:700,fontSize:13}}>{l}</button>
        ))}
      </div>

      {tab==="templates"&&(
        <div>
          {data.shiftTemplates.map(sh=>{
            const net=shiftNetMins(sh);
            return(
              <div key={sh.id} style={{background:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:`0 2px 8px ${C.g300}22`,borderLeft:`4px solid ${sh.color}`}}>
                <div>
                  <p style={{color:C.gr900,fontWeight:800}}>{sh.name}</p>
                  <p style={{color:C.gray500,fontSize:13}}>{sh.start} → {sh.end} · {Math.floor(net/60)}h {net%60}m net · {sh.breakMins}m break</p>
                </div>
                <div style={{width:14,height:14,borderRadius:"50%",background:sh.color}}/>
              </div>
            );
          })}
          <div style={{background:C.white,borderRadius:20,padding:20,marginTop:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
            <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>Add new shift template</p>
            <input style={S.input} placeholder="Shift name (e.g. Night)" value={tmName} onChange={e=>setTmName(e.target.value)}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={Txt.label}>Start time</label><input style={S.input} type="time" value={tmStart} onChange={e=>setTmStart(e.target.value)}/></div>
              <div><label style={Txt.label}>End time</label><input style={S.input} type="time" value={tmEnd} onChange={e=>setTmEnd(e.target.value)}/></div>
            </div>
            <label style={Txt.label}>Break (mins)</label>
            <input style={S.input} type="number" value={tmBreak} onChange={e=>setTmBreak(e.target.value)}/>
            <label style={Txt.label}>Colour</label>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              {["#f59e0b","#3b82f6","#8b5cf6","#6366f1","#10b981","#ef4444","#ec4899","#14b8a6"].map(c=>(
                <button key={c} onClick={()=>setTmColor(c)} style={{width:28,height:28,borderRadius:"50%",background:c,border:tmColor===c?`3px solid ${C.g800}`:"3px solid transparent",cursor:"pointer"}}/>
              ))}
            </div>
            <button style={S.btn} onClick={addTemplate}>Add template</button>
          </div>
        </div>
      )}

      {tab==="schedule"&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,fontSize:16,marginBottom:4}}>Bulk schedule assign</p>
          <p style={{color:C.gray500,fontSize:13,marginBottom:16}}>Assign a shift to an employee for a date range (week, month, etc.)</p>

          <label style={Txt.label}>Employee</label>
          <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
            <option value="">Select employee</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={Txt.label}>From</label><input style={S.input} type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></div>
            <div><label style={Txt.label}>To</label><input style={S.input} type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></div>
          </div>

          <label style={Txt.label}>Shift pattern</label>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[["same","Same every day"],["rotate","Rotating"]].map(([v,l])=>(
              <button key={v} onClick={()=>setPattern(v)} style={{flex:1,background:pattern===v?C.g600:C.g100,border:"none",borderRadius:12,padding:"10px",cursor:"pointer",color:pattern===v?C.white:C.gr700,fontWeight:700,fontSize:13}}>{l}</button>
            ))}
          </div>

          {pattern==="same"&&(
            <>
              <label style={Txt.label}>Shift</label>
              <select style={S.select} value={selShift} onChange={e=>setSelShift(e.target.value)}>
                <option value="">Select shift</option>
                {data.shiftTemplates.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
              </select>
            </>
          )}
          {pattern==="rotate"&&(
            <div style={{background:C.g50,borderRadius:14,padding:14,marginBottom:12}}>
              <p style={{color:C.g800,fontWeight:700,fontSize:13,marginBottom:8}}>Rotation pattern (Mon→Sun cycle)</p>
              {["Mon","Tue","Wed","Thu","Fri","Sat"].map((day,i)=>(
                <div key={day} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{color:C.gray500,fontSize:13,width:30}}>{day}</span>
                  <select style={{...S.select,marginBottom:0,flex:1,padding:"8px 10px",fontSize:13}} value={rotateList[i]||""} onChange={e=>{const l=[...rotateList];l[i]=e.target.value;setRotateList(l);}}>
                    <option value="">Off</option>
                    {data.shiftTemplates.map(s=><option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:16}}>
            <input type="checkbox" checked={skipSunday} onChange={e=>setSkipSunday(e.target.checked)} style={{accentColor:C.g600,width:16,height:16}}/>
            <span style={{color:C.gr700,fontSize:14}}>Skip Sundays</span>
          </label>

          <button style={S.btn} onClick={applyBulk}>Apply schedule</button>
        </div>
      )}
    </div>
  );
}

// ── ADMIN OVERRIDE ─────────────────────────────────────────────────────────────
function AdminOverride({user,data,save,notify}){
  const [tab,setTab]=useState("override"); // override | requests
  const [selEmp,setSelEmp]=useState("");
  const [selDate,setSelDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().split("T")[0];});
  const [selShift,setSelShift]=useState("");
  const [note,setNote]=useState("");

  const emps=data.employees.filter(e=>e.role==="employee");
  const pendingReqs=data.shiftRequests.filter(r=>r.status==="pending"&&(user.role==="super_admin"||r.managerId===user.id));
  const empMap=Object.fromEntries(data.employees.map(e=>[e.id,e]));

  const applyOverride=()=>{
    if(!selEmp||!selShift||!selDate){notify("Fill all fields","error");return;}
    const newSched=data.schedule.filter(s=>!(s.employeeId===selEmp&&s.date===selDate&&s.override));
    newSched.push({id:`ov_${Date.now()}`,employeeId:selEmp,date:selDate,shiftId:selShift,source:"override",override:true,note,overriddenBy:user.id,overriddenAt:new Date().toISOString()});
    save("schedule",newSched);
    notify(`Override applied for ${fmtDate(selDate)} ✓`);
    setNote("");
  };

  const decideRequest=(req,decision)=>{
    const updated=data.shiftRequests.map(r=>r.id===req.id?{...r,status:decision,decidedBy:user.id,decidedAt:new Date().toISOString()}:r);
    if(decision==="approved"){
      const newSched=data.schedule.filter(s=>!(s.employeeId===req.employeeId&&s.date===req.date&&s.override));
      newSched.push({id:`ov_req_${Date.now()}`,employeeId:req.employeeId,date:req.date,shiftId:req.requestedShiftId,source:"override",override:true,note:`Approved request from ${req.employeeName}`,overriddenBy:user.id,overriddenAt:new Date().toISOString()});
      save("schedule",newSched);
    }
    save("shiftRequests",updated);
    notify(`Request ${decision} ✓`);
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Shift Override</h2>
      <p style={{color:C.gray500,fontSize:13,marginBottom:16}}>Change one employee's shift for a specific day</p>

      <div style={{background:C.g100,borderRadius:14,display:"flex",padding:4,marginBottom:20}}>
        {[["override","⚡ Override"],["requests",`🔄 Requests ${pendingReqs.length>0?`(${pendingReqs.length})`:""}`]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.white:"transparent",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:tab===t?C.g700:C.gray500,fontWeight:700,fontSize:13}}>{l}</button>
        ))}
      </div>

      {tab==="override"&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <label style={Txt.label}>Employee</label>
          <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
            <option value="">Select employee</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <label style={Txt.label}>Date</label>
          <input style={S.input} type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}/>

          {selEmp&&selDate&&(()=>{
            const{shift,source}=resolveShift(data.schedule,data.shiftTemplates,selEmp,selDate,data.employees);
            return shift&&<div style={{background:C.g50,borderRadius:12,padding:12,marginBottom:12}}>
              <p style={{color:C.gray500,fontSize:12}}>Current shift for this day:</p>
              <p style={{color:C.g700,fontWeight:700,fontSize:14}}>{shift.name} · {shift.start}–{shift.end} <span style={{fontSize:12,color:C.gray500}}>({source})</span></p>
            </div>;
          })()}

          <label style={Txt.label}>New shift for this day</label>
          <select style={S.select} value={selShift} onChange={e=>setSelShift(e.target.value)}>
            <option value="">Select new shift</option>
            {data.shiftTemplates.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
          </select>
          <label style={Txt.label}>Note (optional)</label>
          <input style={S.input} placeholder="Reason for override…" value={note} onChange={e=>setNote(e.target.value)}/>

          <div style={{background:"#fffbeb",borderRadius:12,padding:12,marginBottom:12,borderLeft:`3px solid ${C.amber}`}}>
            <p style={{color:"#d97706",fontSize:12,fontWeight:700}}>⚡ Override rules</p>
            <p style={{color:"#92400e",fontSize:12,marginTop:4}}>Override takes priority over any published schedule. The employee's app will show the new shift immediately. Late calculation and auto-checkout will use the overridden shift time.</p>
          </div>
          <button style={S.btn} onClick={applyOverride}>Apply override</button>
        </div>
      )}

      {tab==="requests"&&(
        <div>
          {pendingReqs.length===0&&<Empty icon="✅" msg="No pending shift requests"/>}
          {pendingReqs.map(req=>{
            const emp=empMap[req.employeeId];
            const{shift:currentShift}=resolveShift(data.schedule,data.shiftTemplates,req.employeeId,req.date,data.employees);
            const reqShift=data.shiftTemplates.find(s=>s.id===req.requestedShiftId);
            return(
              <div key={req.id} style={{background:C.white,borderRadius:20,padding:18,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${C.amber}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div><p style={{color:C.gr900,fontWeight:800,fontSize:16}}>{emp?.name}</p><p style={{color:C.gray500,fontSize:13}}>{emp?.designation}</p></div>
                  <span style={{background:"#fffbeb",color:C.amber,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>Pending</span>
                </div>
                <p style={{color:C.g800,fontWeight:700,marginBottom:6}}>📅 {fmtDateFull(req.date)}</p>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                  <div style={{flex:1,background:C.g50,borderRadius:10,padding:10}}>
                    <p style={{color:C.gray500,fontSize:11}}>Current shift</p>
                    <p style={{color:C.gr900,fontWeight:700,fontSize:13}}>{currentShift?.name||"None"}</p>
                    {currentShift&&<p style={{color:C.gray500,fontSize:12}}>{currentShift.start}–{currentShift.end}</p>}
                  </div>
                  <span style={{fontSize:20}}>→</span>
                  <div style={{flex:1,background:"#fffbeb",borderRadius:10,padding:10}}>
                    <p style={{color:C.gray500,fontSize:11}}>Requested</p>
                    <p style={{color:C.gr900,fontWeight:700,fontSize:13}}>{reqShift?.name||"?"}</p>
                    {reqShift&&<p style={{color:C.gray500,fontSize:12}}>{reqShift.start}–{reqShift.end}</p>}
                  </div>
                </div>
                {req.note&&<p style={{color:C.gray500,fontSize:13,marginBottom:12}}>💬 "{req.note}"</p>}
                <div style={{display:"flex",gap:10}}>
                  <button style={{...S.btn,background:C.g600,flex:1,padding:"12px"}} onClick={()=>decideRequest(req,"approved")}>✓ Approve</button>
                  <button style={{...S.btn,background:C.red,flex:1,padding:"12px"}} onClick={()=>decideRequest(req,"rejected")}>✕ Deny</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ADMIN APPROVALS ───────────────────────────────────────────────────────────
function AdminApprovals({user,data,save,notify}){
  const pending=data.approvals.filter(a=>a.status==="pending"&&(user.role==="super_admin"||a.managerId===user.id));
  const empMap=Object.fromEntries(data.employees.map(e=>[e.id,e]));
  const decide=(a,d)=>{
    save("approvals",data.approvals.map(x=>x.id===a.id?{...x,status:d}:x));
    save("records",data.records.map(r=>r.id===a.recordId?{...r,approvalStatus:d}:r));
    notify(`Request ${d} ✓`);
  };
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Late Approvals</h2>
      {pending.length===0&&<Empty icon="✅" msg="No pending approvals"/>}
      {pending.map(a=>{
        const e=empMap[a.employeeId];
        return(
          <div key={a.id} style={{background:C.white,borderRadius:20,padding:18,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${C.amber}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div><p style={{color:C.gr900,fontWeight:800,fontSize:16}}>{e?.name}</p><p style={{color:C.gray500,fontSize:13}}>{e?.designation}</p></div>
              <span style={{background:"#fffbeb",color:C.amber,fontSize:12,padding:"4px 10px",borderRadius:20,fontWeight:700}}>⏱ {a.lateMins}m late</span>
            </div>
            {a.shiftName&&<p style={{color:C.gray500,fontSize:13,marginBottom:4}}>Shift: {a.shiftName}</p>}
            <p style={{color:C.gray500,fontSize:13,marginBottom:14}}>📅 {fmtDate(a.date)} at {a.time}</p>
            <div style={{display:"flex",gap:10}}>
              <button style={{...S.btn,background:C.g600,flex:1,padding:"12px"}} onClick={()=>decide(a,"approved")}>✓ Approve</button>
              <button style={{...S.btn,background:C.red,flex:1,padding:"12px"}} onClick={()=>decide(a,"rejected")}>✕ Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminQR({data}){
  const [sel,setSel]=useState(data.org.branches[0]?.id||"");
  const br=data.org.branches.find(b=>b.id===sel);
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Branch QR Codes</h2>
      <select style={S.select} value={sel} onChange={e=>setSel(e.target.value)}>
        {data.org.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {br&&(
        <div style={{background:C.white,borderRadius:24,padding:32,textAlign:"center",boxShadow:`0 4px 24px ${C.g300}66`}}>
          <p style={{color:C.gray500,fontSize:13,marginBottom:20}}>📍 {br.address}</p>
          <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><QRCanvas data={genQR(br.id)} size={220}/></div>
          <h3 style={{color:C.g800,fontSize:20,fontWeight:800}}>{br.name}</h3>
          <div style={{background:C.g50,borderRadius:12,padding:12,marginTop:16,textAlign:"left"}}>
            <p style={{color:C.g700,fontSize:13,fontWeight:700}}>📍 {br.lat}°N, {br.lng}°E · ⭕ {br.radius}m geo-fence</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminEmployees({data,save,notify}){
  const [showAdd,setShowAdd]=useState(false);
  const [f,setF]=useState({name:"",phone:"",password:"1234",branchId:data.org.branches[0]?.id||"",role:"employee",salary:"",designation:"",defaultShiftId:""});
  const go=()=>{
    if(!f.name||!f.phone||!f.salary){notify("Fill required fields","error");return;}
    const mgr=data.employees.find(e=>e.role==="branch_admin"&&e.branchId===f.branchId);
    save("employees",[...data.employees,{...f,id:`emp_${Date.now()}`,salary:Number(f.salary),managerId:mgr?.id||"super"}]);
    notify("Employee added ✓");setShowAdd(false);
  };
  return(
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{color:C.g800,fontSize:22,fontWeight:800}}>Employees</h2>
        <button style={{...S.btn,width:"auto",padding:"8px 16px",fontSize:13}} onClick={()=>setShowAdd(!showAdd)}>+ Add</button>
      </div>
      {showAdd&&(
        <div style={{background:C.white,borderRadius:20,padding:20,marginBottom:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
          {[["name","Full Name","text"],["phone","Phone","tel"],["password","Password","text"],["designation","Designation","text"],["salary","Salary (₹)","number"]].map(([k,ph,t])=>(
            <input key={k} style={S.input} type={t} placeholder={ph} value={f[k]} onChange={e=>setF(x=>({...x,[k]:e.target.value}))}/>
          ))}
          <select style={S.select} value={f.branchId} onChange={e=>setF(x=>({...x,branchId:e.target.value}))}>
            {data.org.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select style={S.select} value={f.role} onChange={e=>setF(x=>({...x,role:e.target.value}))}>
            <option value="employee">Employee</option><option value="branch_admin">Branch Admin</option>
          </select>
          <label style={Txt.label}>Default shift (used when no schedule assigned)</label>
          <select style={S.select} value={f.defaultShiftId} onChange={e=>setF(x=>({...x,defaultShiftId:e.target.value}))}>
            <option value="">None</option>
            {data.shiftTemplates.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
          </select>
          <button style={S.btn} onClick={go}>Add employee</button>
        </div>
      )}
      {data.employees.filter(e=>e.role!=="super_admin").map(e=>{
        const stats=calcStats(e,data.records,data.leaves,data.settings,data.schedule,data.shiftTemplates,data.employees);
        const br=data.org.branches.find(b=>b.id===e.branchId);
        const defShift=data.shiftTemplates.find(s=>s.id===e.defaultShiftId);
        return(
          <div key={e.id} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div>
                <p style={{color:C.gr900,fontWeight:800,fontSize:15}}>{e.name}</p>
                <p style={{color:C.gray500,fontSize:12}}>{e.designation} · {br?.name}</p>
                {defShift&&<p style={{color:C.g600,fontSize:12}}>Default: {defShift.name}</p>}
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{color:C.g600,fontWeight:800,fontSize:16}}>{fmt(stats.netEarned)}</p>
                <p style={{color:C.gray500,fontSize:11}}>{stats.presentDays} days</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminEditAtt({data,save,notify}){
  const [selEmp,setSelEmp]=useState(""),[ selDate,setSelDate]=useState(today()),[cin,setCin]=useState(""),[cout,setCout]=useState("");
  const emps=data.employees.filter(e=>e.role!=="super_admin");
  useEffect(()=>{
    if(!selEmp||!selDate)return;
    const r=data.records.filter(r=>r.employeeId===selEmp&&r.date===selDate);
    setCin(r.find(x=>x.type==="checkin")?.time||"");
    setCout(r.find(x=>x.type==="checkout")?.time||"");
  },[selEmp,selDate]);

  const go=()=>{
    if(!selEmp||!cin){notify("Employee and check-in required","error");return;}
    const {shift}=resolveShift(data.schedule,data.shiftTemplates,selEmp,selDate,data.employees);
    const late=shift?minsLate(cin,shift.start):0;
    const isLate=late>data.settings.gracePeriodMins;
    const filtered=data.records.filter(r=>!(r.employeeId===selEmp&&r.date===selDate));
    const newRecs=[...filtered,{id:`r_adm_${Date.now()}`,employeeId:selEmp,date:selDate,time:cin,type:"checkin",shiftId:shift?.id,shiftStart:shift?.start,shiftEnd:shift?.end,isLate,lateMins:Math.max(0,late),approvalStatus:"approved",geoVerified:false,adminEdited:true,editedAt:new Date().toISOString()}];
    if(cout) newRecs.push({id:`r_adm_${Date.now()+1}`,employeeId:selEmp,date:selDate,time:cout,type:"checkout",workedMins:toMins(cout)-toMins(cin),shiftId:shift?.id,geoVerified:false,adminEdited:true,editedAt:new Date().toISOString()});
    save("records",newRecs);
    notify("Attendance saved ✓");
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Edit Attendance</h2>
      <p style={{color:C.gray500,fontSize:13,marginBottom:16}}>Super admin — mark or edit for any past date</p>
      <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        <label style={Txt.label}>Employee</label>
        <select style={S.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
          <option value="">Select employee</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label style={Txt.label}>Date</label>
        <input style={S.input} type="date" value={selDate} max={today()} onChange={e=>setSelDate(e.target.value)}/>
        {selEmp&&selDate&&(()=>{const{shift}=resolveShift(data.schedule,data.shiftTemplates,selEmp,selDate,data.employees);return shift&&<div style={{background:C.g50,borderRadius:12,padding:10,marginBottom:12}}><p style={{color:C.g700,fontWeight:700,fontSize:13}}>Shift for this day: {shift.name} · {shift.start}–{shift.end}</p></div>;})()}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={Txt.label}>Check-in *</label><input style={S.input} type="time" value={cin} onChange={e=>setCin(e.target.value)}/></div>
          <div><label style={Txt.label}>Check-out</label><input style={S.input} type="time" value={cout} onChange={e=>setCout(e.target.value)}/></div>
        </div>
        {cin&&cout&&<p style={{color:C.g600,fontSize:13,marginBottom:10}}>⏱ {Math.floor((toMins(cout)-toMins(cin))/60)}h {(toMins(cout)-toMins(cin))%60}m worked</p>}
        <button style={S.btn} onClick={go}>Save record</button>
      </div>
    </div>
  );
}

function AdminReports({data}){
  const emps=data.employees.filter(e=>e.role==="employee");
  const brMap=Object.fromEntries(data.org.branches.map(b=>[b.id,b]));
  const total=emps.reduce((s,e)=>s+calcStats(e,data.records,data.leaves,data.settings,data.schedule,data.shiftTemplates,data.employees).netEarned,0);
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Monthly Report</h2>
      <p style={{color:C.gray500,fontSize:13,marginBottom:16}}>{new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</p>
      <div style={{background:`linear-gradient(135deg,${C.g700},${C.g500})`,borderRadius:18,padding:20,textAlign:"center",marginBottom:20}}>
        <p style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>Total payable this month</p>
        <p style={{color:C.white,fontSize:30,fontWeight:900}}>{fmt(total)}</p>
      </div>
      {emps.map(e=>{
        const st=calcStats(e,data.records,data.leaves,data.settings,data.schedule,data.shiftTemplates,data.employees);
        return(
          <div key={e.id} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div><p style={{color:C.gr900,fontWeight:800}}>{e.name}</p><p style={{color:C.gray500,fontSize:12}}>{brMap[e.branchId]?.name}</p></div>
              <div style={{textAlign:"right"}}><p style={{color:C.g700,fontWeight:900,fontSize:18}}>{fmt(st.netEarned)}</p>{st.totalDeductions>0&&<p style={{color:C.red,fontSize:12}}>-{fmt(st.totalDeductions)}</p>}</div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[["Present",st.presentDays,C.g600],["Late",st.lateDays,C.amber],["CL",st.casualUsed,C.blue],["Unauth",st.unauthLeaves,C.red]].map(([l,v,c])=>(
                <span key={l} style={{background:c+"15",color:c,fontSize:12,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{l}: {v}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminSettings({data,save,notify}){
  const [s,setS]=useState(data.settings);
  const fields=[["gracePeriodMins","Grace period (mins)","number"],["lateDeductionPerOccurrence","Late deduction (₹)","number"],["maxAllowedLatesPerMonth","Max lates/month","number"],["excessLatePenalty","Excess late penalty (₹)","number"],["unauthorizedLeavePenalty","Unauth leave penalty (₹)","number"],["noShowPenalty","No-show penalty (₹)","number"],["casualLeavePerMonth","Casual leave/month","number"],["workingDaysPerMonth","Working days/month","number"],["geoFenceRadiusMeters","Default geo radius (m)","number"]];
  const [brName,setBrName]=useState(""),[ brAddr,setBrAddr]=useState(""),[ brLat,setBrLat]=useState(""),[ brLng,setBrLng]=useState(""),[ brR,setBrR]=useState("200");
  const addBranch=()=>{
    if(!brName||!brLat||!brLng){notify("Name and coordinates required","error");return;}
    save("org",{...data.org,branches:[...data.org.branches,{id:`br_${Date.now()}`,name:brName,address:brAddr,lat:parseFloat(brLat),lng:parseFloat(brLng),radius:parseInt(brR)||200}]});
    notify("Branch added ✓");setBrName("");setBrAddr("");setBrLat("");setBrLng("");setBrR("200");
  };
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Settings</h2>
      <div style={{background:C.white,borderRadius:20,padding:20,marginBottom:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        {fields.map(([k,l,t])=>(
          <div key={k} style={{marginBottom:14}}>
            <label style={Txt.label}>{l}</label>
            <input style={S.input} type={t} value={s[k]} onChange={e=>setS(p=>({...p,[k]:t==="number"?Number(e.target.value):e.target.value}))}/>
          </div>
        ))}
        <button style={S.btn} onClick={()=>{save("settings",s);notify("Saved ✓");}}>Save settings</button>
      </div>
      <h3 style={{color:C.g800,fontWeight:800,marginBottom:12}}>Branches & geo-fence</h3>
      {data.org.branches.map(b=>(
        <div key={b.id} style={{background:C.white,borderRadius:16,padding:14,marginBottom:10,boxShadow:`0 2px 6px ${C.g300}22`}}>
          <p style={{color:C.gr900,fontWeight:800}}>{b.name}</p>
          <p style={{color:C.g600,fontSize:13}}>📍 {b.lat}, {b.lng} · ⭕ {b.radius}m</p>
        </div>
      ))}
      <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>Add branch</p>
        <input style={S.input} placeholder="Name *" value={brName} onChange={e=>setBrName(e.target.value)}/>
        <input style={S.input} placeholder="Address" value={brAddr} onChange={e=>setBrAddr(e.target.value)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <input style={S.input} type="number" step="0.0001" placeholder="Latitude *" value={brLat} onChange={e=>setBrLat(e.target.value)}/>
          <input style={S.input} type="number" step="0.0001" placeholder="Longitude *" value={brLng} onChange={e=>setBrLng(e.target.value)}/>
        </div>
        <input style={S.input} type="number" placeholder="Radius (m)" value={brR} onChange={e=>setBrR(e.target.value)}/>
        <button style={S.btn} onClick={addBranch}>Add branch</button>
      </div>
    </div>
  );
}

// ── SHARED UI ─────────────────────────────────────────────────────────────────
function TopBar({user,onLogout}){
  return(
    <div style={{background:C.white,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.g100}`,boxShadow:`0 2px 12px ${C.g300}33`,position:"sticky",top:0,zIndex:10}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",color:C.g800,fontSize:17,fontWeight:800,letterSpacing:"-0.3px"}}>SmartAi Attendance</h1>
        <p style={{color:C.gray500,fontSize:10,fontWeight:600,letterSpacing:0.3}}>by 3SL Media Labs</p>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{textAlign:"right"}}>
          <p style={{color:C.g800,fontSize:13,fontWeight:700}}>{user.name.split(" ")[0]}</p>
          <p style={{color:C.gray500,fontSize:10,textTransform:"uppercase",letterSpacing:0.5}}>{user.role.replace("_"," ")}</p>
        </div>
        <button onClick={onLogout} style={{background:C.g100,border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",color:C.g700,fontWeight:700,fontSize:14}}>↩</button>
      </div>
    </div>
  );
}

function BottomNav({items,page,setPage}){
  return(
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.white,borderTop:`1px solid ${C.g100}`,display:"flex",zIndex:20,boxShadow:`0 -4px 20px ${C.g300}44`,overflowX:"auto"}}>
      {items.map(({k,i,l})=>(
        <button key={k} onClick={()=>setPage(k)} style={{flex:1,minWidth:52,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 2px 12px",cursor:"pointer",color:page===k?C.g600:C.gray500,transition:"color .2s"}}>
          <span style={{fontSize:page===k?20:18}}>{i}</span>
          <span style={{fontSize:9,marginTop:3,fontWeight:page===k?800:500,whiteSpace:"nowrap"}}>{l}</span>
          {page===k&&<div style={{width:4,height:4,background:C.g500,borderRadius:"50%",marginTop:3}}/>}
        </button>
      ))}
    </div>
  );
}

function Btn({ghost,icon,onClick}){
  return<button onClick={onClick} style={{background:ghost?C.g100:"transparent",border:"none",borderRadius:12,width:40,height:40,cursor:"pointer",fontSize:18,color:C.g700,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</button>;
}
function Empty({icon,msg}){return<div style={{textAlign:"center",padding:"50px 20px"}}><p style={{fontSize:44,marginBottom:12}}>{icon}</p><p style={{color:C.gray500,fontSize:15}}>{msg}</p></div>;}
function Toast({msg,type}){
  const bg={success:C.g600,error:C.red,warn:C.amber,info:C.blue}[type]||C.g600;
  return<div style={{position:"fixed",top:76,left:"50%",transform:"translateX(-50%)",background:bg,color:C.white,padding:"12px 22px",borderRadius:14,fontWeight:700,fontSize:14,zIndex:9999,maxWidth:"90vw",boxShadow:"0 8px 32px rgba(0,0,0,.22)",animation:"fadeUp .3s ease",whiteSpace:"nowrap"}}>{msg}</div>;
}

// helpers used above
function genQR(branchId){return JSON.stringify({branchId,token:"SMARTAI_V3",app:"3SL"});}
function resolveShift(schedule,shiftTemplates,employeeId,date,employees){
  const emp=employees.find(e=>e.id===employeeId);
  const ov=schedule.find(s=>s.employeeId===employeeId&&s.date===date&&s.override===true);
  if(ov)return{entry:ov,shift:shiftTemplates.find(s=>s.id===ov.shiftId)||null,source:"override"};
  const sc=schedule.find(s=>s.employeeId===employeeId&&s.date===date&&!s.override);
  if(sc)return{entry:sc,shift:shiftTemplates.find(s=>s.id===sc.shiftId)||null,source:"schedule"};
  if(emp?.defaultShiftId){const sh=shiftTemplates.find(s=>s.id===emp.defaultShiftId);return{entry:null,shift:sh||null,source:"default"};}
  return{entry:null,shift:null,source:"none"};
}

// ── STYLE CONSTANTS ───────────────────────────────────────────────────────────
const S={
  input:{background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  select:{background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  btn:{background:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:14,color:C.white,padding:"14px 20px",fontSize:15,fontWeight:800,cursor:"pointer",width:"100%",marginTop:4},
  outline:{background:C.white,border:`1.5px solid ${C.g500}`,borderRadius:14,color:C.g700,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",flex:1},
};
const Txt={
  label:{color:C.g800,fontSize:13,fontWeight:600,marginBottom:6,display:"block"},
  cap:{fontSize:11,color:C.gray500,fontWeight:600,letterSpacing:1,textTransform:"uppercase"},
};