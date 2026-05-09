import { useState, useEffect, useRef } from "react";

// ── FONTS & STYLES ────────────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Syne:wght@700;800&display=swap";
  document.head.appendChild(l);
  const s = document.createElement("style");
  s.textContent = `*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{background:#f0faf4;font-family:'Plus Jakarta Sans',sans-serif}input,select,textarea{font-family:'Plus Jakarta Sans',sans-serif}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#86efac;border-radius:4px}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}@keyframes glow{0%,100%{box-shadow:0 0 20px #16a34a33}50%{box-shadow:0 0 36px #16a34a66}}@keyframes scanline{0%,100%{top:12%}50%{top:80%}}`;
  document.head.appendChild(s);
}

// ── PALETTE ───────────────────────────────────────────────────────────────────
const C = {
  g900:"#14532d",g800:"#166534",g700:"#15803d",g600:"#16a34a",g500:"#22c55e",
  g400:"#4ade80",g300:"#86efac",g200:"#bbf7d0",g100:"#dcfce7",g50:"#f0faf4",
  white:"#fff",gr900:"#111827",gr700:"#374151",gr500:"#6b7280",gr300:"#d1d5db",
  red:"#ef4444",amber:"#f59e0b",blue:"#3b82f6",violet:"#7c3aed",indigo:"#6366f1",
  pink:"#ec4899",teal:"#14b8a6",
};

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:     { label:"Active",      color:"#16a34a", bg:"#dcfce7" },
  on_notice:  { label:"On Notice",   color:"#d97706", bg:"#fef3c7" },
  relieved:   { label:"Relieved",    color:"#6b7280", bg:"#f3f4f6" },
  terminated: { label:"Terminated",  color:"#dc2626", bg:"#fee2e2" },
  absconded:  { label:"Absconded",   color:"#7c3aed", bg:"#ede9fe" },
  suspended:  { label:"Suspended",   color:"#ea580c", bg:"#ffedd5" },
};

const ROLE_CONFIG = {
  super_admin:  { label:"Super Admin",  color:C.g700,    level:1 },
  org_admin:    { label:"Org Admin",    color:C.violet,  level:2 },
  branch_admin: { label:"Branch Admin", color:C.amber,   level:3 },
  employee:     { label:"Employee",     color:C.blue,    level:4 },
};

// ── LOCAL DATA STORE (localStorage) ──────────────────────────────────────────
const db = {
  get:(k,d)=>{try{const v=localStorage.getItem("saa_"+k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem("saa_"+k,JSON.stringify(v));}catch{}},
};

// ── DEFAULT DATA ──────────────────────────────────────────────────────────────
const DEF_ORGS = [
  {id:"org1",name:"Acme Corp",     code:"ACME", plan:"pro",   isActive:true},
  {id:"org2",name:"Beta Industries",code:"BETA",plan:"basic",  isActive:true},
];

const DEF_BRANCHES = [
  {id:"br1",orgId:"org1",name:"Mumbai HQ",  address:"BKC, Mumbai",          lat:19.0600,lng:72.8650,radius:200},
  {id:"br2",orgId:"org1",name:"Pune Branch",address:"Hinjewadi, Pune",      lat:18.5913,lng:73.7389,radius:200},
  {id:"br3",orgId:"org1",name:"Delhi Office",address:"Connaught Place",     lat:28.6315,lng:77.2167,radius:200},
  {id:"br4",orgId:"org2",name:"Chennai HQ",address:"Anna Nagar, Chennai",   lat:13.0843,lng:80.2705,radius:200},
  {id:"br5",orgId:"org2",name:"Bangalore", address:"Whitefield, Bengaluru", lat:12.9698,lng:77.7499,radius:200},
];

const DEF_EMPLOYEES = [
  {id:"super",  orgId:null,  branchId:null, name:"Super Admin",  phone:"9999999999",password:"superadmin",role:"super_admin",  level:1,salary:0,    designation:"Platform Owner",  status:"active",managerId:null,  defaultShiftId:"sh2",joining:"2023-01-01"},
  {id:"oa1",    orgId:"org1",branchId:"br1",name:"Arjun Mehta",  phone:"9800000001",password:"admin123",  role:"org_admin",   level:2,salary:95000,designation:"General Manager", status:"active",managerId:"super",defaultShiftId:"sh2",joining:"2023-01-15"},
  {id:"oa2",    orgId:"org2",branchId:"br4",name:"Deepa Nair",   phone:"9800000002",password:"admin123",  role:"org_admin",   level:2,salary:90000,designation:"General Manager", status:"active",managerId:"super",defaultShiftId:"sh2",joining:"2023-02-01"},
  {id:"mgr1",   orgId:"org1",branchId:"br1",name:"Sunita Rao",   phone:"9000000001",password:"admin123",  role:"branch_admin",level:3,salary:75000,designation:"Branch Manager",  status:"active",managerId:"oa1",  defaultShiftId:"sh2",joining:"2023-03-01"},
  {id:"mgr2",   orgId:"org1",branchId:"br2",name:"Vikram Singh", phone:"9000000003",password:"admin123",  role:"branch_admin",level:3,salary:70000,designation:"Branch Manager",  status:"active",managerId:"oa1",  defaultShiftId:"sh2",joining:"2023-04-01"},
  {id:"mgr3",   orgId:"org2",branchId:"br4",name:"Ravi Kumar",   phone:"9000000002",password:"admin123",  role:"branch_admin",level:3,salary:72000,designation:"Branch Manager",  status:"active",managerId:"oa2",  defaultShiftId:"sh2",joining:"2023-03-15"},
  {id:"emp1",   orgId:"org1",branchId:"br1",name:"Priya Sharma", phone:"9876543210",password:"1234",      role:"employee",    level:4,salary:45000,designation:"Software Engineer",status:"active",managerId:"mgr1", defaultShiftId:"sh2",joining:"2023-06-01"},
  {id:"emp2",   orgId:"org1",branchId:"br1",name:"Rahul Verma",  phone:"9123456789",password:"1234",      role:"employee",    level:4,salary:38000,designation:"QA Engineer",     status:"active",managerId:"mgr1", defaultShiftId:"sh2",joining:"2023-07-01"},
  {id:"emp3",   orgId:"org1",branchId:"br2",name:"Anjali Menon", phone:"9112233445",password:"1234",      role:"employee",    level:4,salary:42000,designation:"UI Designer",     status:"on_notice",managerId:"mgr2",defaultShiftId:"sh3",joining:"2023-08-01"},
  {id:"emp4",   orgId:"org2",branchId:"br4",name:"Kiran Patel",  phone:"9988776655",password:"1234",      role:"employee",    level:4,salary:35000,designation:"Sales Executive", status:"active",managerId:"mgr3", defaultShiftId:"sh2",joining:"2024-01-01"},
];

const DEF_SHIFTS = [
  {id:"sh1",orgId:"org1",name:"Early Morning",start:"06:00",end:"14:00",breakMins:30,color:"#f59e0b"},
  {id:"sh2",orgId:"org1",name:"Day",          start:"09:00",end:"18:00",breakMins:60,color:"#3b82f6"},
  {id:"sh3",orgId:"org1",name:"Evening",      start:"14:00",end:"22:00",breakMins:30,color:"#8b5cf6"},
  {id:"sh4",orgId:"org1",name:"Night",        start:"22:00",end:"06:00",breakMins:60,color:"#6366f1"},
  {id:"sh5",orgId:"org1",name:"Split 7–7",    start:"07:00",end:"19:00",breakMins:60,color:"#ef4444"},
  {id:"sh6",orgId:"org2",name:"Day",          start:"09:00",end:"18:00",breakMins:60,color:"#3b82f6"},
  {id:"sh7",orgId:"org2",name:"Evening",      start:"14:00",end:"22:00",breakMins:30,color:"#8b5cf6"},
];

const DEF_SETTINGS = {
  org1:{gracePeriodMins:15,lateDeduction:50,maxLates:3,excessLatePenalty:100,unauthLeaveP:200,noShowP:250,casualLeave:1.5,workingDays:26,geoRadius:200},
  org2:{gracePeriodMins:15,lateDeduction:50,maxLates:3,excessLatePenalty:100,unauthLeaveP:200,noShowP:250,casualLeave:1.5,workingDays:26,geoRadius:200},
};

function initDB(){
  if(!db.get("v4_init")){
    db.set("orgs",DEF_ORGS); db.set("branches",DEF_BRANCHES);
    db.set("employees",DEF_EMPLOYEES); db.set("shifts",DEF_SHIFTS);
    db.set("settings",DEF_SETTINGS); db.set("records",[]);
    db.set("approvals",[]); db.set("leaves",[]); db.set("shiftRequests",[]);
    db.set("schedule",[]); db.set("statusHistory",[]);
    db.set("v4_init",true);
  }
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
const fmt   = n=>`₹${Number(n).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
const today = ()=>new Date().toISOString().split("T")[0];
const nowT  = ()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes());};
const pad   = n=>String(n).padStart(2,"0");
const toM   = t=>{if(!t)return 0;const[h,m]=t.split(":").map(Number);return h*60+m;};
const fmtD  = ds=>new Date(ds+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",weekday:"short"});
const fmtDF = ds=>new Date(ds+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});

function shiftMins(sh){if(!sh)return 480;const s=toM(sh.start),e=toM(sh.end);return(e>s?e-s:1440-s+e)-(sh.breakMins||0);}
function lateM(scan,start){let d=toM(scan)-toM(start);if(d<-720)d+=1440;return d;}
function geoDist(la1,ln1,la2,ln2){const R=6371000,r=x=>x*Math.PI/180,dL=r(la2-la1),dN=r(ln2-ln1);const a=Math.sin(dL/2)**2+Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(dN/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

function resolveShift(schedule,shifts,empId,date,employees){
  const emp=employees.find(e=>e.id===empId);
  const ov=schedule.find(s=>s.employeeId===empId&&s.date===date&&s.override);
  if(ov)return{shift:shifts.find(s=>s.id===ov.shiftId)||null,source:"override"};
  const sc=schedule.find(s=>s.employeeId===empId&&s.date===date&&!s.override);
  if(sc)return{shift:shifts.find(s=>s.id===sc.shiftId)||null,source:"schedule"};
  if(emp?.defaultShiftId){return{shift:shifts.find(s=>s.id===emp.defaultShiftId)||null,source:"default"};}
  return{shift:null,source:"none"};
}

function calcStats(emp,records,leaves,settings,schedule,shifts,employees){
  const now=new Date(),mk=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  const s=settings[emp.orgId]||Object.values(settings)[0]||{};
  const mr=records.filter(r=>r.employeeId===emp.id&&r.date.startsWith(mk));
  const ml=leaves.filter(l=>l.employeeId===emp.id&&l.date.startsWith(mk));
  const presentDays=mr.filter(r=>r.type==="checkin").length;
  const lateDays=mr.filter(r=>r.type==="checkin"&&r.isLate&&r.approvalStatus!=="rejected").length;
  const unauthLeaves=ml.filter(l=>l.type==="unauthorized").length;
  const noShows=ml.filter(l=>l.type==="noshow").length;
  const casualUsed=ml.filter(l=>l.type==="casual").length;
  const wdm=s.workingDays||26;
  const dailyRate=emp.salary/wdm;
  const earned=presentDays*dailyRate;
  const excess=Math.max(0,lateDays-(s.maxLates||3));
  const lateDed=lateDays*(s.lateDeduction||50)+excess*(s.excessLatePenalty||100);
  const leaveDed=unauthLeaves*(s.unauthLeaveP||200);
  const noShowDed=noShows*(s.noShowP||250);
  const totalDed=lateDed+leaveDed+noShowDed;
  return{presentDays,lateDays,unauthLeaves,noShows,casualUsed,dailyRate,earnedGross:earned,totalDeductions:totalDed,netEarned:Math.max(0,earned-totalDed)};
}

function genQR(branchId){return JSON.stringify({branchId,token:"SMARTAI_V4",app:"3SL"});}

// ── QR CANVAS ────────────────────────────────────────────────────────────────
function QRCanvas({data:qd,size=200}){
  const ref=useRef(null);
  useEffect(()=>{
    if(!ref.current)return;
    const cv=ref.current,ctx=cv.getContext("2d");cv.width=size;cv.height=size;
    let h=5381;for(let i=0;i<qd.length;i++)h=((h<<5)+h)^qd.charCodeAt(i);h=Math.abs(h);
    const M=29,cs=size/M;ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);
    const dm=(x,y)=>{ctx.fillStyle=C.g800;ctx.fillRect(x*cs,y*cs,7*cs,7*cs);ctx.fillStyle="#fff";ctx.fillRect((x+1)*cs,(y+1)*cs,5*cs,5*cs);ctx.fillStyle=C.g600;ctx.fillRect((x+2)*cs,(y+2)*cs,3*cs,3*cs);};
    dm(0,0);dm(M-7,0);dm(0,M-7);
    for(let r=0;r<M;r++)for(let c=0;c<M;c++){const iM=(r<8&&c<8)||(r<8&&c>=M-8)||(r>=M-8&&c<8);if(!iM){const b=(h>>((r*M+c)%29))&1,b2=((h*31^(r*17+c*7))>>((r+c)%19))&1;if(b||b2){ctx.fillStyle=C.g700;ctx.fillRect(c*cs+0.5,r*cs+0.5,cs-1,cs-1);}}}
    ctx.fillStyle="#fff";ctx.fillRect(size/2-16,size/2-16,32,32);ctx.fillStyle=C.g600;ctx.font=`bold ${Math.floor(cs*1.6)}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("📍",size/2,size/2+1);
  },[qd,size]);
  return <canvas ref={ref} style={{borderRadius:10,display:"block"}}/>;
}

// ── QR SCANNER ────────────────────────────────────────────────────────────────
function QRScanner({onScan,onClose,branches}){
  const vRef=useRef(null);
  const [err,setErr]=useState(null),[streaming,setStreaming]=useState(false),[man,setMan]=useState("");
  useEffect(()=>{let st;navigator.mediaDevices?.getUserMedia({video:{facingMode:"environment"}}).then(s=>{st=s;if(vRef.current)vRef.current.srcObject=s;setStreaming(true);}).catch(()=>setErr("Camera unavailable"));return()=>st?.getTracks().forEach(t=>t.stop());},[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999}}>
      <div style={{background:C.white,borderRadius:"28px 28px 0 0",padding:24,width:"100%",maxWidth:480,animation:"slideUp .3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{fontSize:18,fontWeight:800,color:C.g800}}>Scan Branch QR</h3>
          <button onClick={onClose} style={Sb.iconBtn}>✕</button>
        </div>
        <div style={{background:"#000",borderRadius:18,height:160,position:"relative",overflow:"hidden",marginBottom:16}}>
          <video ref={vRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:14,border:`2px solid ${C.g500}`,borderRadius:10}}/>
          {streaming&&<div style={{position:"absolute",left:14,right:14,height:2,background:`linear-gradient(90deg,transparent,${C.g500},transparent)`,top:"40%",animation:"scanline 2s ease-in-out infinite"}}/>}
        </div>
        {err&&<p style={{color:C.amber,fontSize:13,textAlign:"center",marginBottom:10}}>⚠ {err}</p>}
        <input style={Sb.input} placeholder="Paste QR data…" value={man} onChange={e=>setMan(e.target.value)}/>
        <button style={Sb.btn} onClick={()=>{try{const d=JSON.parse(man);if(d.branchId)onScan(d);else setErr("Invalid QR");}catch{setErr("Bad format");}}}>Submit manual</button>
        <p style={{color:C.g600,fontSize:12,fontWeight:700,margin:"14px 0 8px"}}>⚡ Demo quick scan</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {branches.map(b=><button key={b.id} style={Sb.outline} onClick={()=>onScan({branchId:b.id,token:"SMARTAI_V4",app:"3SL"})}>📍 {b.name}</button>)}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [page,setPage]=useState("login");
  const [toast,setToast]=useState(null);
  const [selectedOrgId,setSelectedOrgId]=useState(null);
  const [data,setData]=useState(()=>{
    initDB();
    return{orgs:db.get("orgs",DEF_ORGS),branches:db.get("branches",DEF_BRANCHES),employees:db.get("employees",DEF_EMPLOYEES),shifts:db.get("shifts",DEF_SHIFTS),settings:db.get("settings",DEF_SETTINGS),records:db.get("records",[]),approvals:db.get("approvals",[]),leaves:db.get("leaves",[]),shiftRequests:db.get("shiftRequests",[]),schedule:db.get("schedule",[]),statusHistory:db.get("statusHistory",[])};
  });

  const notify=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};
  const save=(k,v)=>{db.set(k,v);setData(d=>({...d,[k]:v}));};

  const login=(u)=>{
    setUser(u);
    if(u.role==="super_admin"){setPage("sa_orgs");setSelectedOrgId(null);}
    else if(u.role==="org_admin"){setPage("adm_home");setSelectedOrgId(u.orgId);}
    else if(u.role==="branch_admin"){setPage("adm_home");setSelectedOrgId(u.orgId);}
    else{setPage("home");setSelectedOrgId(u.orgId);}
  };

  if(!user)return<LoginScreen employees={data.employees} onLogin={login}/>;

  const activeOrgId=selectedOrgId||user.orgId;

  return(
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.g50,minHeight:"100vh"}}>
      {toast&&<Toast {...toast}/>}
      {user.role==="employee"
        ?<EmpApp user={user} data={data} save={save} notify={notify} page={page} setPage={setPage} onLogout={()=>{setUser(null);setPage("login");}}/>
        :<AdminApp user={user} data={data} save={save} notify={notify} page={page} setPage={setPage} activeOrgId={activeOrgId} setActiveOrgId={setSelectedOrgId} onLogout={()=>{setUser(null);setPage("login");}}/>}
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({employees,onLogin}){
  const [ph,setPh]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[loading,setLoading]=useState(false);
  const go=()=>{setLoading(true);setErr("");setTimeout(()=>{const e=employees.find(e=>e.phone===ph&&e.password===pw&&e.status==="active");if(e)onLogin(e);else{setErr(employees.find(e=>e.phone===ph)?"Account inactive or wrong password":"Invalid phone or password");setLoading(false);}},500);};
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
          <label style={Sb.label}>Phone number</label>
          <input style={Sb.input} type="tel" placeholder="9876543210" value={ph} onChange={e=>setPh(e.target.value)}/>
          <label style={Sb.label}>Password</label>
          <input style={Sb.input} type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
          {err&&<p style={{color:C.red,fontSize:13,marginBottom:8}}>⚠ {err}</p>}
          <button style={Sb.btn} onClick={go} disabled={loading}>
            {loading?<span style={{display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>:"Sign In →"}
          </button>
        </div>
        <div style={{marginTop:20,background:"rgba(255,255,255,0.1)",borderRadius:18,padding:16,backdropFilter:"blur(8px)"}}>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Demo accounts</p>
          {[["🔐 Super Admin","9999999999","superadmin"],["🏢 Org Admin (Acme)","9800000001","admin123"],["🏪 Branch Admin","9000000001","admin123"],["👤 Employee","9876543210","1234"]].map(([l,p,w])=>(
            <button key={l} onClick={()=>{setPh(p);setPw(w);}} style={{width:"100%",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.18)",borderRadius:12,padding:"9px 14px",color:C.white,fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span>{l}</span><span style={{opacity:.55}}>{p}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── EMPLOYEE APP ──────────────────────────────────────────────────────────────
function EmpApp({user,data,save,notify,page,setPage,onLogout}){
  const [showScanner,setShowScanner]=useState(false);
  const todayStr=today();
  const {shift:todayShift,source:shiftSrc}=resolveShift(data.schedule,data.shifts,user.id,todayStr,data.employees);
  const todayRecs=data.records.filter(r=>r.employeeId===user.id&&r.date===todayStr);
  const checkedIn=todayRecs.find(r=>r.type==="checkin");
  const checkedOut=todayRecs.find(r=>r.type==="checkout");
  const stats=calcStats(user,data.records,data.leaves,data.settings,data.schedule,data.shifts,data.employees);
  const myBranch=data.branches.find(b=>b.id===user.branchId);
  const myBranches=data.branches.filter(b=>b.orgId===user.orgId);

  const handleScan=qd=>{
    setShowScanner(false);
    const scBr=data.branches.find(b=>b.id===qd.branchId);
    if(!scBr){notify("Invalid QR","error");return;}
    if(checkedIn&&checkedOut){notify("Already done for today","error");return;}
    if(!todayShift){notify("No shift assigned today","error");return;}
    if(user.status!=="active"){notify("Your account is not active","error");return;}
    navigator.geolocation?.getCurrentPosition(
      pos=>{const dist=geoDist(pos.coords.latitude,pos.coords.longitude,scBr.lat,scBr.lng);if(dist>scBr.radius){notify(`Outside geo-fence! ${Math.round(dist)}m away (max ${scBr.radius}m)`,"error");return;}processAtt(qd.branchId,scBr,pos.coords);},
      ()=>processAtt(qd.branchId,scBr,null),{timeout:7000,enableHighAccuracy:true}
    );
  };

  const processAtt=(branchId,scBr,coords)=>{
    const now=nowT(),s=data.settings[user.orgId]||{};
    if(!checkedIn){
      const late=lateM(now,todayShift.start),isLate=late>s.gracePeriodMins||15,needsAppr=late>(s.gracePeriodMins||15)*2;
      const rec={id:`r_${Date.now()}`,employeeId:user.id,branchId,date:todayStr,time:now,type:"checkin",shiftId:todayShift.id,shiftStart:todayShift.start,shiftEnd:todayShift.end,isLate,lateMins:Math.max(0,late),approvalStatus:needsAppr?"pending":"approved",geoVerified:!!coords,adminEdited:false};
      save("records",[...data.records,rec]);
      if(needsAppr){save("approvals",[...data.approvals,{id:`ap_${Date.now()}`,recordId:rec.id,employeeId:user.id,employeeName:user.name,managerId:user.managerId,orgId:user.orgId,date:todayStr,time:now,lateMins:late,shiftName:todayShift.name,status:"pending",type:"late"}]);}
      notify(needsAppr?`${late}m late — sent for approval ⏳`:isLate?`Checked in ${late}m late ⚠`:`✅ Checked in @ ${scBr.name}`,needsAppr?"warn":isLate?"warn":"success");
    }else{
      const wm=Math.max(0,toM(now)-toM(checkedIn.time));
      save("records",[...data.records,{id:`r_${Date.now()}`,employeeId:user.id,branchId,date:todayStr,time:now,type:"checkout",workedMins:wm,shiftId:todayShift.id,geoVerified:!!coords}]);
      notify(`✅ Checked out — ${Math.floor(wm/60)}h ${wm%60}m`);
    }
  };

  const empNav=[{k:"home",i:"🏠",l:"Home"},{k:"my_shifts",i:"📅",l:"Shifts"},{k:"history",i:"📋",l:"History"},{k:"salary",i:"💰",l:"Salary"},{k:"profile",i:"👤",l:"Profile"}];
  const pages={
    home:<EmpHome user={user} todayShift={todayShift} shiftSrc={shiftSrc} checkedIn={checkedIn} checkedOut={checkedOut} branch={myBranch} stats={stats} settings={data.settings[user.orgId]||{}} onScan={()=>setShowScanner(true)}/>,
    my_shifts:<EmpMyShifts user={user} data={data} save={save} notify={notify}/>,
    history:<EmpHistory user={user} records={data.records} schedule={data.schedule} shifts={data.shifts} branches={data.branches}/>,
    salary:<EmpSalary user={user} stats={stats} settings={data.settings[user.orgId]||{}}/>,
    profile:<EmpProfile user={user} data={data} statusHistory={data.statusHistory}/>,
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

function EmpHome({user,todayShift,shiftSrc,checkedIn,checkedOut,branch,stats,settings,onScan}){
  const status=!checkedIn?"out":!checkedOut?"in":"done";
  const net=todayShift?shiftMins(todayShift):0;
  const sc=STATUS_CONFIG[user.status]||STATUS_CONFIG.active;
  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:18,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,background:"rgba(255,255,255,0.07)",borderRadius:"50%"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <p style={{color:"rgba(255,255,255,0.65)",fontSize:13,marginBottom:3}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
            <h2 style={{color:C.white,fontSize:22,fontWeight:800,marginBottom:2}}>Hi, {user.name.split(" ")[0]} 👋</h2>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{user.designation}</p>
          </div>
          <span style={{background:sc.bg,color:sc.color,fontSize:11,padding:"4px 10px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
        </div>
        {todayShift?(
          <div style={{marginTop:16,background:"rgba(255,255,255,0.13)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Today's Shift</p>
                <p style={{color:C.white,fontSize:17,fontWeight:800}}>{todayShift.name} · {todayShift.start}–{todayShift.end}</p>
                <p style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{Math.floor(net/60)}h {net%60}m net · {branch?.name}</p>
              </div>
              <div style={{width:12,height:12,borderRadius:"50%",background:todayShift.color,boxShadow:`0 0 10px ${todayShift.color}`}}/>
            </div>
            {shiftSrc==="override"&&<p style={{color:"#fde68a",fontSize:11,marginTop:4}}>⚡ Manager override</p>}
          </div>
        ):(
          <div style={{marginTop:16,background:"rgba(239,68,68,0.2)",borderRadius:14,padding:12}}>
            <p style={{color:"#fca5a5",fontWeight:700}}>⚠ No shift assigned for today</p>
          </div>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["Check In",checkedIn?.time,"▶",C.g600,checkedIn?.isLate?`${checkedIn.lateMins}m late`:"On time"],["Check Out",checkedOut?.time,"⏹",C.indigo,"—"]].map(([l,t,ic,c,sub])=>(
          <div key={l} style={{background:C.white,borderRadius:16,padding:14,boxShadow:`0 2px 8px ${C.g300}33`}}>
            <p style={{color:C.gr500,fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{color:t?c:C.gr300,fontSize:22,fontWeight:900,margin:"4px 0"}}>{t||"—"}</p>
            <p style={{color:C.gr500,fontSize:11}}>{sub}</p>
          </div>
        ))}
      </div>
      <button onClick={onScan} disabled={status==="done"||!todayShift||user.status!=="active"}
        style={{width:"100%",background:status==="done"||!todayShift?C.gr300:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:20,padding:"20px",cursor:"pointer",color:C.white,display:"flex",flexDirection:"column",alignItems:"center",gap:6,animation:status!=="done"&&todayShift?"glow 3s infinite":"none",marginBottom:18}}>
        <span style={{fontSize:32}}>📷</span>
        <span style={{fontSize:16,fontWeight:800}}>{status==="out"?"Scan to Check In":status==="in"?"Scan to Check Out":"Day Complete ✓"}</span>
        {todayShift&&<span style={{fontSize:12,opacity:0.75}}>Geo-fenced · Grace {settings.gracePeriodMins||15}m</span>}
      </button>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[["Present",stats.presentDays,C.g600],["Late",stats.lateDays,C.amber],["Net Earned",fmt(stats.netEarned),C.g700]].map(([l,v,c])=>(
          <div key={l} style={{background:C.white,borderRadius:14,padding:"12px 8px",textAlign:"center",boxShadow:`0 2px 8px ${C.g300}33`}}>
            <p style={{color:c,fontSize:l==="Net Earned"?14:22,fontWeight:900}}>{v}</p><p style={{color:C.gr500,fontSize:11,marginTop:2}}>{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmpMyShifts({user,data,save,notify}){
  const [tab,setTab]=useState("upcoming");
  const [reqDate,setReqDate]=useState(""),[reqShift,setReqShift]=useState(""),[reqNote,setReqNote]=useState("");
  const days=[]; for(let i=-2;i<=13;i++){const d=new Date();d.setDate(d.getDate()+i);days.push(d.toISOString().split("T")[0]);}
  const myShifts=data.shifts.filter(s=>s.orgId===user.orgId||s.orgId===null);
  const pendingReqs=data.shiftRequests.filter(r=>r.employeeId===user.id&&r.status==="pending");
  const submit=()=>{
    if(!reqDate||!reqShift){notify("Select date and shift","error");return;}
    save("shiftRequests",[...data.shiftRequests,{id:`sr_${Date.now()}`,employeeId:user.id,employeeName:user.name,managerId:user.managerId,orgId:user.orgId,date:reqDate,requestedShiftId:reqShift,note:reqNote,status:"pending",createdAt:new Date().toISOString()}]);
    notify("Request sent ✓");setReqDate("");setReqShift("");setReqNote("");
  };
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>My Shifts</h2>
      <TabBar tabs={[["upcoming","📅 Schedule"],["request","🔄 Request"]]} active={tab} onChange={setTab}/>
      {tab==="upcoming"&&(
        <div>
          {pendingReqs.length>0&&<div style={{background:"#fffbeb",borderRadius:14,padding:14,marginBottom:14,border:`1px solid #fcd34d`}}><p style={{color:"#d97706",fontWeight:700,fontSize:13}}>⏳ {pendingReqs.length} pending request(s)</p></div>}
          {days.map(ds=>{
            const{shift,source}=resolveShift(data.schedule,data.shifts,user.id,ds,data.employees);
            const isToday=ds===today(),isPast=ds<today();
            const rec=data.records.find(r=>r.employeeId===user.id&&r.date===ds&&r.type==="checkin");
            return(
              <div key={ds} style={{background:isToday?`linear-gradient(135deg,${C.g800},${C.g700})`:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:`0 2px 8px ${C.g300}${isToday?"66":"22"}`,borderLeft:`4px solid ${shift?shift.color:C.gr300}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <p style={{color:isToday?C.white:C.gr900,fontWeight:800,fontSize:15}}>{fmtD(ds)} {isToday&&"· TODAY"}</p>
                    <p style={{color:isToday?"rgba(255,255,255,0.7)":C.gr500,fontSize:13}}>{shift?`${shift.name} · ${shift.start}–${shift.end}`:"No shift"}</p>
                    {source==="override"&&<span style={{background:"#fef3c7",color:"#d97706",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>OVERRIDE</span>}
                  </div>
                  {rec&&<span style={{background:C.g100,color:C.g700,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>✓ In {rec.time}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="request"&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,fontSize:15,marginBottom:14}}>Request shift change</p>
          <label style={Sb.label}>Date</label>
          <input style={Sb.input} type="date" value={reqDate} min={today()} onChange={e=>setReqDate(e.target.value)}/>
          <label style={Sb.label}>Requested shift</label>
          <select style={Sb.select} value={reqShift} onChange={e=>setReqShift(e.target.value)}>
            <option value="">Select shift</option>
            {myShifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
          </select>
          <label style={Sb.label}>Reason</label>
          <input style={Sb.input} placeholder="Optional note" value={reqNote} onChange={e=>setReqNote(e.target.value)}/>
          <button style={Sb.btn} onClick={submit}>Send request</button>
        </div>
      )}
    </div>
  );
}

function EmpHistory({user,records,schedule,shifts,branches}){
  const mine=records.filter(r=>r.employeeId===user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const grouped=mine.reduce((a,r)=>{(a[r.date]=a[r.date]||[]).push(r);return a;},{});
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Attendance History</h2>
      {Object.entries(grouped).slice(0,30).map(([ds,recs])=>{
        const cin=recs.find(r=>r.type==="checkin"),cout=recs.find(r=>r.type==="checkout");
        const br=branches.find(b=>b.id===cin?.branchId);
        const sh=shifts.find(s=>s.id===cin?.shiftId);
        const worked=cin&&cout?toM(cout.time)-toM(cin.time):null;
        return(
          <div key={ds} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`,borderLeft:`4px solid ${sh?sh.color:C.g300}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontWeight:800,color:C.gr900}}>{fmtD(ds)}</span>
              <div style={{display:"flex",gap:6}}>
                {sh&&<span style={{background:sh.color+"20",color:sh.color,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{sh.name}</span>}
                {cin?.isLate&&<span style={{background:"#fffbeb",color:C.amber,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{cin.lateMins}m LATE</span>}
                {cin?.adminEdited&&<span style={{background:"#ede9fe",color:C.violet,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>EDITED</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <span style={{color:C.g600,fontSize:14,fontWeight:600}}>▶ {cin?.time||"—"}</span>
              <span style={{color:C.gr500,fontSize:14}}>⏹ {cout?.time||"—"}</span>
              {worked!==null&&<span style={{color:C.gr500,fontSize:13}}>⏱ {Math.floor(worked/60)}h {worked%60}m</span>}
            </div>
            {br&&<p style={{color:C.gr500,fontSize:12,marginTop:5}}>📍 {br.name}</p>}
          </div>
        );
      })}
      {Object.keys(grouped).length===0&&<Empty icon="📋" msg="No attendance records yet"/>}
    </div>
  );
}

function EmpSalary({user,stats,settings}){
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
      {[["Base Salary",fmt(user.salary),C.gr700],["Days Present",stats.presentDays,C.g600],["Gross Earned",fmt(stats.earnedGross),C.g700],["Late Deductions",`-${fmt(stats.totalDeductions>0?stats.lateDays*(settings.lateDeduction||50):0)}`,C.amber],["Total Deductions",`-${fmt(stats.totalDeductions)}`,C.red],["Net Earned",fmt(stats.netEarned),C.g700]].map(([l,v,c])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.g50}`}}>
          <span style={{color:C.gr500,fontSize:14}}>{l}</span>
          <span style={{color:c,fontWeight:700,fontSize:14}}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function EmpProfile({user,data,statusHistory}){
  const myHistory=statusHistory.filter(h=>h.employeeId===user.id).sort((a,b)=>b.created_at?.localeCompare(a.created_at||"")||0);
  const sc=STATUS_CONFIG[user.status]||STATUS_CONFIG.active;
  const rc=ROLE_CONFIG[user.role];
  const myMgr=data.employees.find(e=>e.id===user.managerId);
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>My Profile</h2>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:16}}>
        <div style={{width:64,height:64,background:"rgba(255,255,255,0.2)",borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:14}}>👤</div>
        <h3 style={{color:C.white,fontSize:20,fontWeight:800}}>{user.name}</h3>
        <p style={{color:"rgba(255,255,255,0.7)",fontSize:14}}>{user.designation}</p>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <span style={{background:sc.bg,color:sc.color,fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
          <span style={{background:"rgba(255,255,255,0.15)",color:C.white,fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{rc?.label}</span>
        </div>
      </div>
      <div style={{background:C.white,borderRadius:20,padding:20,marginBottom:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
        {[["📱 Phone",user.phone],["📅 Joined",user.joining?fmtDF(user.joining):"—"],["👔 Employee Code",user.employeeCode||"—"],["👥 Reports to",myMgr?.name||"—"],["🏢 Branch",data.branches.find(b=>b.id===user.branchId)?.name||"—"]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.g50}`}}>
            <span style={{color:C.gr500,fontSize:14}}>{l}</span>
            <span style={{color:C.gr900,fontWeight:600,fontSize:14}}>{v}</span>
          </div>
        ))}
      </div>
      {myHistory.length>0&&(
        <div>
          <h3 style={{color:C.g800,fontWeight:800,marginBottom:10}}>Status History</h3>
          {myHistory.map(h=>(
            <div key={h.id} style={{background:C.white,borderRadius:14,padding:"12px 16px",marginBottom:8,boxShadow:`0 2px 6px ${C.g300}22`}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:C.gr900,fontWeight:700}}>{STATUS_CONFIG[h.newStatus]?.label}</span>
                <span style={{color:C.gr500,fontSize:12}}>{h.effectiveDate||""}</span>
              </div>
              {h.reason&&<p style={{color:C.gr500,fontSize:12,marginTop:4}}>{h.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ADMIN APP ─────────────────────────────────────────────────────────────────
function AdminApp({user,data,save,notify,page,setPage,activeOrgId,setActiveOrgId,onLogout}){
  const isSA=user.role==="super_admin";
  const isOA=user.role==="org_admin";
  const isBA=user.role==="branch_admin";

  const nav=[
    ...(isSA?[{k:"sa_orgs",i:"🏢",l:"Orgs"}]:[]),
    {k:"adm_home",i:"🏠",l:"Home"},
    {k:"adm_staff",i:"👥",l:"Staff"},
    {k:"adm_shifts",i:"📅",l:"Shifts"},
    {k:"adm_override",i:"⚡",l:"Override"},
    {k:"adm_approvals",i:"✅",l:"Approvals"},
    {k:"adm_qr",i:"📷",l:"QR"},
    {k:"adm_reports",i:"📊",l:"Reports"},
    ...(isSA||isOA?[{k:"adm_edit_att",i:"✏️",l:"Edit Att"}]:[]),
    {k:"adm_settings",i:"⚙️",l:"Settings"},
  ];

  const pages={
    sa_orgs:<SuperAdminOrgs data={data} save={save} notify={notify} setActiveOrgId={setActiveOrgId} setPage={setPage} activeOrgId={activeOrgId}/>,
    adm_home:<AdminHome user={user} data={data} save={save} notify={notify} activeOrgId={activeOrgId}/>,
    adm_staff:<AdminStaff user={user} data={data} save={save} notify={notify} activeOrgId={activeOrgId}/>,
    adm_shifts:<AdminShifts user={user} data={data} save={save} notify={notify} activeOrgId={activeOrgId}/>,
    adm_override:<AdminOverride user={user} data={data} save={save} notify={notify} activeOrgId={activeOrgId}/>,
    adm_approvals:<AdminApprovals user={user} data={data} save={save} notify={notify} activeOrgId={activeOrgId}/>,
    adm_qr:<AdminQR data={data} activeOrgId={activeOrgId}/>,
    adm_reports:<AdminReports data={data} activeOrgId={activeOrgId}/>,
    adm_edit_att:<AdminEditAtt data={data} save={save} notify={notify} activeOrgId={activeOrgId} user={user}/>,
    adm_settings:<AdminSettings data={data} save={save} notify={notify} activeOrgId={activeOrgId} user={user}/>,
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:480,margin:"0 auto",background:C.g50}}>
      <TopBar user={user} onLogout={onLogout} activeOrg={data.orgs.find(o=>o.id===activeOrgId)}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>{pages[page]||pages.adm_home}</div>
      <BottomNav items={nav} page={page} setPage={setPage}/>
    </div>
  );
}

// ── SUPER ADMIN ORGS ──────────────────────────────────────────────────────────
function SuperAdminOrgs({data,save,notify,setActiveOrgId,setPage,activeOrgId}){
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",code:"",plan:"basic"});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const createOrg=()=>{
    if(!form.name||!form.code){notify("Name and code required","error");return;}
    const id=`org_${Date.now()}`;
    save("orgs",[...data.orgs,{id,name:form.name,code:form.code.toUpperCase(),plan:form.plan,isActive:true}]);
    save("settings",{...data.settings,[id]:{gracePeriodMins:15,lateDeduction:50,maxLates:3,excessLatePenalty:100,unauthLeaveP:200,noShowP:250,casualLeave:1.5,workingDays:26,geoRadius:200}});
    notify("Organization created ✓");setShowAdd(false);setForm({name:"",code:"",plan:"basic"});
  };

  const switchOrg=(org)=>{setActiveOrgId(org.id);setPage("adm_home");notify(`Switched to ${org.name}`);};

  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:20}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Super Admin</p>
        <h2 style={{color:C.white,fontSize:20,fontWeight:800,margin:"4px 0"}}>All Organizations</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{data.orgs.length} organizations · {data.employees.filter(e=>e.role==="employee").length} employees total</p>
      </div>

      {data.orgs.map((org,i)=>{
        const orgEmps=data.employees.filter(e=>e.orgId===org.id);
        const orgBranches=data.branches.filter(b=>b.orgId===org.id);
        const isActive=org.id===activeOrgId;
        const colors=[C.g600,C.violet,C.blue,C.pink,C.teal];
        const accent=colors[i%colors.length];
        return(
          <div key={org.id} style={{background:C.white,borderRadius:20,padding:20,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${accent}`,outline:isActive?`2px solid ${accent}`:"none",outlineOffset:2}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:44,height:44,background:`${accent}18`,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:accent,fontSize:16}}>{org.code.slice(0,2)}</div>
                <div>
                  <p style={{color:C.gr900,fontWeight:800,fontSize:16}}>{org.name}</p>
                  <p style={{color:C.gr500,fontSize:12}}>{org.code} · {org.plan}</p>
                </div>
              </div>
              {isActive&&<span style={{background:`${accent}18`,color:accent,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>ACTIVE</span>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              {[["Employees",orgEmps.filter(e=>e.role==="employee").length],["Admins",orgEmps.filter(e=>["org_admin","branch_admin"].includes(e.role)).length],["Branches",orgBranches.length]].map(([l,v])=>(
                <div key={l} style={{background:C.g50,borderRadius:10,padding:"10px",textAlign:"center"}}>
                  <p style={{color:accent,fontWeight:800,fontSize:20}}>{v}</p><p style={{color:C.gr500,fontSize:11}}>{l}</p>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...Sb.btn,flex:1,background:isActive?accent:`linear-gradient(135deg,${C.g700},${C.g500})`}} onClick={()=>switchOrg(org)}>
                {isActive?"✓ Managing":"Switch to this org"}
              </button>
              <button onClick={()=>{save("orgs",data.orgs.map(o=>o.id===org.id?{...o,isActive:!o.isActive}:o));notify(org.isActive?"Org deactivated":"Org activated");}} style={{...Sb.outline,padding:"12px 14px"}}>
                {org.isActive?"Pause":"Activate"}
              </button>
            </div>
          </div>
        );
      })}

      {!showAdd?(
        <button onClick={()=>setShowAdd(true)} style={{...Sb.btn,background:"transparent",border:`2px dashed ${C.g300}`,color:C.g700,padding:18,fontSize:15}}>+ Add new organization</button>
      ):(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,fontSize:15,marginBottom:14}}>New organization</p>
          <label style={Sb.label}>Organization name</label>
          <input style={Sb.input} placeholder="e.g. Acme Corporation" value={form.name} onChange={e=>f("name",e.target.value)}/>
          <label style={Sb.label}>Short code (3–6 chars)</label>
          <input style={Sb.input} placeholder="e.g. ACME" maxLength={6} value={form.code} onChange={e=>f("code",e.target.value.toUpperCase())}/>
          <label style={Sb.label}>Plan</label>
          <select style={Sb.select} value={form.plan} onChange={e=>f("plan",e.target.value)}>
            <option value="basic">Basic</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option>
          </select>
          <div style={{display:"flex",gap:10}}>
            <button style={{...Sb.btn,flex:1}} onClick={createOrg}>Create</button>
            <button onClick={()=>setShowAdd(false)} style={{...Sb.outline,flex:1}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ADMIN HOME ────────────────────────────────────────────────────────────────
function AdminHome({user,data,save,notify,activeOrgId}){
  const td=today();
  const orgEmps=data.employees.filter(e=>e.orgId===activeOrgId&&e.role==="employee"&&e.status==="active");
  const todayRecs=data.records.filter(r=>r.date===td&&orgEmps.find(e=>e.id===r.employeeId));
  const checkedInToday=[...new Set(todayRecs.filter(r=>r.type==="checkin").map(r=>r.employeeId))].length;
  const pendingApprovals=data.approvals.filter(a=>a.status==="pending"&&a.orgId===activeOrgId&&(user.role==="super_admin"||user.role==="org_admin"||a.managerId===user.id)).length;
  const pendingShiftReqs=data.shiftRequests.filter(r=>r.status==="pending"&&r.orgId===activeOrgId&&(user.role==="super_admin"||user.role==="org_admin"||r.managerId===user.id)).length;
  const onNotice=data.employees.filter(e=>e.orgId===activeOrgId&&e.status==="on_notice").length;
  const activeOrg=data.orgs.find(o=>o.id===activeOrgId);

  return(
    <div style={{padding:20}}>
      <div style={{background:`linear-gradient(135deg,${C.g800},${C.g600})`,borderRadius:24,padding:24,marginBottom:18}}>
        <p style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
        <h2 style={{color:C.white,fontSize:20,fontWeight:800,margin:"4px 0"}}>{activeOrg?.name||"Dashboard"}</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{user.designation}</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {[[checkedInToday,`of ${orgEmps.length} present`,C.g600,"Today Present"],[pendingApprovals,"need action",C.red,"Pending Approvals"],[pendingShiftReqs,"shift changes",C.amber,"Shift Requests"],[onNotice,"employees",C.violet,"On Notice"]].map(([v,sub,c,l])=>(
          <div key={l} style={{background:C.white,borderRadius:18,padding:16,boxShadow:`0 2px 10px ${C.g300}44`,borderTop:`3px solid ${c}`}}>
            <p style={{color:C.gr500,fontSize:12,fontWeight:600}}>{l}</p>
            <p style={{color:c,fontSize:26,fontWeight:900,margin:"4px 0 2px"}}>{v}</p>
            <p style={{color:C.gr500,fontSize:11}}>{sub}</p>
          </div>
        ))}
      </div>
      <h3 style={{color:C.g800,fontSize:15,fontWeight:800,marginBottom:12}}>Mark leave / penalty</h3>
      <AddLeave emps={orgEmps} data={data} save={save} notify={notify} activeOrgId={activeOrgId} adminId={user.id}/>
    </div>
  );
}

function AddLeave({emps,data,save,notify,activeOrgId,adminId}){
  const [empId,setEmpId]=useState(""),[type,setType]=useState("casual"),[dt,setDt]=useState(today()),[reason,setReason]=useState("");
  return(
    <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <select style={Sb.select} value={empId} onChange={e=>setEmpId(e.target.value)}>
        <option value="">Select employee</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select style={Sb.select} value={type} onChange={e=>setType(e.target.value)}>
        <option value="casual">Casual leave</option><option value="unauthorized">Unauthorized leave</option><option value="noshow">No show</option>
      </select>
      <input style={Sb.input} type="date" value={dt} onChange={e=>setDt(e.target.value)}/>
      <input style={Sb.input} placeholder="Reason (optional)" value={reason} onChange={e=>setReason(e.target.value)}/>
      <button style={Sb.btn} onClick={()=>{if(!empId){notify("Select employee","error");return;}save("leaves",[...data.leaves,{id:`lv_${Date.now()}`,employeeId:empId,date:dt,type,reason,orgId:activeOrgId,recordedBy:adminId}]);notify("Leave recorded ✓");setEmpId("");setReason("");}}>Record leave</button>
    </div>
  );
}

// ── ADMIN STAFF (full management) ─────────────────────────────────────────────
function AdminStaff({user,data,save,notify,activeOrgId}){
  const [tab,setTab]=useState("list");
  const [selectedEmp,setSelectedEmp]=useState(null);
  const [filterStatus,setFilterStatus]=useState("all");
  const [filterBranch,setFilterBranch]=useState("all");
  const [searchQ,setSearchQ]=useState("");

  const isSA=user.role==="super_admin",isOA=user.role==="org_admin";
  const canManage=isSA||isOA||user.role==="branch_admin";
  const orgBranches=data.branches.filter(b=>b.orgId===activeOrgId);
  let staffList=data.employees.filter(e=>e.orgId===activeOrgId&&e.role!=="super_admin");
  if(user.role==="branch_admin") staffList=staffList.filter(e=>e.branchId===user.branchId||e.id===user.id);
  if(filterStatus!=="all") staffList=staffList.filter(e=>e.status===filterStatus);
  if(filterBranch!=="all") staffList=staffList.filter(e=>e.branchId===filterBranch);
  if(searchQ) staffList=staffList.filter(e=>e.name.toLowerCase().includes(searchQ.toLowerCase())||e.phone.includes(searchQ));

  return(
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{color:C.g800,fontSize:22,fontWeight:800}}>Staff</h2>
        {canManage&&<button style={{...Sb.btn,width:"auto",padding:"8px 16px",fontSize:13}} onClick={()=>{setSelectedEmp(null);setTab("add");}}>+ Add</button>}
      </div>

      <TabBar tabs={[["list","👥 List"],["add",selectedEmp?"✏️ Edit":"➕ Add"]]} active={tab} onChange={setTab}/>

      {tab==="list"&&(
        <div>
          {/* Filters */}
          <input style={{...Sb.input,marginBottom:10}} placeholder="🔍 Search name or phone…" value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
          <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto"}}>
            <select style={{...Sb.select,marginBottom:0,flex:1,fontSize:12}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">All status</option>
              {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            <select style={{...Sb.select,marginBottom:0,flex:1,fontSize:12}} value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
              <option value="all">All branches</option>
              {orgBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Summary badges */}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            {Object.entries(STATUS_CONFIG).map(([k,v])=>{
              const count=data.employees.filter(e=>e.orgId===activeOrgId&&e.status===k).length;
              if(!count)return null;
              return<span key={k} style={{background:v.bg,color:v.color,fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{v.label}: {count}</span>;
            })}
          </div>

          {staffList.map(e=>{
            const br=data.branches.find(b=>b.id===e.branchId);
            const sc=STATUS_CONFIG[e.status]||STATUS_CONFIG.active;
            const rc=ROLE_CONFIG[e.role];
            const stats=calcStats(e,data.records,data.leaves,data.settings,data.schedule,data.shifts,data.employees);
            return(
              <div key={e.id} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <p style={{color:C.gr900,fontWeight:800,fontSize:15}}>{e.name}</p>
                      <span style={{background:sc.bg,color:sc.color,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
                    </div>
                    <p style={{color:C.gr500,fontSize:12}}>{e.designation} · {br?.name}</p>
                    <p style={{color:C.gr500,fontSize:12}}>📱 {e.phone} · <span style={{color:rc?.color,fontWeight:600}}>{rc?.label}</span></p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{color:C.g600,fontWeight:800,fontSize:15}}>{fmt(stats.netEarned)}</p>
                    <p style={{color:C.gr500,fontSize:11}}>{stats.presentDays} days</p>
                  </div>
                </div>
                {canManage&&(
                  <div style={{display:"flex",gap:8,marginTop:12}}>
                    <button style={{...Sb.outline,flex:1,padding:"8px",fontSize:12}} onClick={()=>{setSelectedEmp(e);setTab("add");}}>✏️ Edit</button>
                    <StatusChanger emp={e} data={data} save={save} notify={notify} user={user}/>
                  </div>
                )}
              </div>
            );
          })}
          {staffList.length===0&&<Empty icon="👥" msg="No staff found"/>}
        </div>
      )}

      {tab==="add"&&canManage&&(
        <StaffForm emp={selectedEmp} data={data} save={save} notify={notify} activeOrgId={activeOrgId} user={user} onDone={()=>{setSelectedEmp(null);setTab("list");}}/>
      )}
    </div>
  );
}

function StatusChanger({emp,data,save,notify,user}){
  const [show,setShow]=useState(false);
  const [newStatus,setNewStatus]=useState(emp.status);
  const [reason,setReason]=useState("");
  const [date,setDate]=useState(today());

  const apply=()=>{
    const updated=data.employees.map(e=>e.id===emp.id?{...e,status:newStatus,relievingDate:["relieved","terminated"].includes(newStatus)?date:e.relievingDate,relievingReason:reason||e.relievingReason}:e);
    save("employees",updated);
    save("statusHistory",[...data.statusHistory,{id:`sh_${Date.now()}`,employeeId:emp.id,orgId:emp.orgId,oldStatus:emp.status,newStatus,reason,effectiveDate:date,changedBy:user.id,created_at:new Date().toISOString()}]);
    notify(`${emp.name} status updated to ${STATUS_CONFIG[newStatus]?.label} ✓`);
    setShow(false);
  };

  return(
    <>
      <button onClick={()=>setShow(true)} style={{...Sb.outline,flex:1,padding:"8px",fontSize:12,borderColor:STATUS_CONFIG[emp.status]?.color,color:STATUS_CONFIG[emp.status]?.color}}>
        🔄 Status
      </button>
      {show&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div style={{background:C.white,borderRadius:"24px 24px 0 0",padding:24,width:"100%",maxWidth:480,animation:"slideUp .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <p style={{color:C.g800,fontWeight:800,fontSize:17}}>Change Status — {emp.name}</p>
              <button onClick={()=>setShow(false)} style={Sb.iconBtn}>✕</button>
            </div>
            <label style={Sb.label}>New status</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
              {Object.entries(STATUS_CONFIG).map(([k,v])=>(
                <button key={k} onClick={()=>setNewStatus(k)} style={{background:newStatus===k?v.bg:"transparent",border:`1.5px solid ${newStatus===k?v.color:C.gr300}`,borderRadius:20,padding:"6px 14px",color:newStatus===k?v.color:C.gr500,fontWeight:700,fontSize:13,cursor:"pointer"}}>{v.label}</button>
              ))}
            </div>
            {["relieved","terminated","absconded","on_notice","suspended"].includes(newStatus)&&(
              <>
                <label style={Sb.label}>Effective date</label>
                <input style={Sb.input} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
                <label style={Sb.label}>Reason</label>
                <input style={Sb.input} placeholder="Reason for status change" value={reason} onChange={e=>setReason(e.target.value)}/>
              </>
            )}
            <button style={Sb.btn} onClick={apply}>Apply Status Change</button>
          </div>
        </div>
      )}
    </>
  );
}

function StaffForm({emp,data,save,notify,activeOrgId,user,onDone}){
  const isEdit=!!emp;
  const orgBranches=data.branches.filter(b=>b.orgId===activeOrgId);
  const orgShifts=data.shifts.filter(s=>s.orgId===activeOrgId);
  const managers=data.employees.filter(e=>e.orgId===activeOrgId&&["org_admin","branch_admin"].includes(e.role));

  const [f,setF]=useState({
    name:emp?.name||"",phone:emp?.phone||"",password:"",branchId:emp?.branchId||orgBranches[0]?.id||"",
    role:emp?.role||"employee",designation:emp?.designation||"",salary:emp?.salary||"",
    defaultShiftId:emp?.defaultShiftId||"",managerId:emp?.managerId||"",
    joining:emp?.joining||today(),employeeCode:emp?.employeeCode||"",
    profileNotes:emp?.profileNotes||"",
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  const submit=()=>{
    if(!f.name||!f.phone){notify("Name and phone required","error");return;}
    if(isEdit){
      save("employees",data.employees.map(e=>e.id===emp.id?{...e,...f,salary:Number(f.salary)||emp.salary}:e));
      notify("Staff updated ✓");
    }else{
      if(!f.password){notify("Password required","error");return;}
      const newEmp={...f,id:`emp_${Date.now()}`,orgId:activeOrgId,salary:Number(f.salary)||0,status:"active",level:f.role==="branch_admin"?3:4};
      save("employees",[...data.employees,newEmp]);
      notify("Staff added ✓");
    }
    onDone();
  };

  const deleteEmp=()=>{
    if(!window.confirm(`Delete ${emp.name}? This cannot be undone.`))return;
    save("employees",data.employees.filter(e=>e.id!==emp.id));
    notify("Staff deleted");onDone();
  };

  return(
    <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
      <p style={{color:C.g800,fontWeight:800,fontSize:16,marginBottom:14}}>{isEdit?"Edit Staff":"Add New Staff"}</p>
      {[["name","Full Name","text"],["phone","Phone Number","tel"],["designation","Designation","text"],["salary","Monthly Salary (₹)","number"],["employeeCode","Employee Code","text"],["joining","Date of Joining","date"]].map(([k,ph,t])=>(
        <div key={k}><label style={Sb.label}>{ph}</label><input style={Sb.input} type={t} placeholder={ph} value={f[k]} onChange={e=>set(k,e.target.value)}/></div>
      ))}
      {!isEdit&&<div><label style={Sb.label}>Password</label><input style={Sb.input} type="password" placeholder="Default password" value={f.password} onChange={e=>set("password",e.target.value)}/></div>}
      <label style={Sb.label}>Branch</label>
      <select style={Sb.select} value={f.branchId} onChange={e=>set("branchId",e.target.value)}>
        {orgBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <label style={Sb.label}>Role</label>
      <select style={Sb.select} value={f.role} onChange={e=>set("role",e.target.value)}>
        <option value="employee">Employee</option>
        <option value="branch_admin">Branch Admin</option>
        {(user.role==="super_admin"||user.role==="org_admin")&&<option value="org_admin">Org Admin</option>}
      </select>
      <label style={Sb.label}>Reports to (Manager)</label>
      <select style={Sb.select} value={f.managerId} onChange={e=>set("managerId",e.target.value)}>
        <option value="">None</option>
        {managers.map(m=><option key={m.id} value={m.id}>{m.name} ({ROLE_CONFIG[m.role]?.label})</option>)}
      </select>
      <label style={Sb.label}>Default Shift</label>
      <select style={Sb.select} value={f.defaultShiftId} onChange={e=>set("defaultShiftId",e.target.value)}>
        <option value="">None</option>
        {orgShifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
      </select>
      <label style={Sb.label}>Notes</label>
      <input style={Sb.input} placeholder="Internal notes about this staff" value={f.profileNotes} onChange={e=>set("profileNotes",e.target.value)}/>
      <button style={Sb.btn} onClick={submit}>{isEdit?"Save Changes":"Add Staff"}</button>
      {isEdit&&(user.role==="super_admin"||user.role==="org_admin")&&(
        <button onClick={deleteEmp} style={{...Sb.btn,background:C.red,marginTop:8}}>🗑 Delete Staff</button>
      )}
    </div>
  );
}

// ── ADMIN SHIFTS ──────────────────────────────────────────────────────────────
function AdminShifts({user,data,save,notify,activeOrgId}){
  const [tab,setTab]=useState("templates");
  const [selEmp,setSelEmp]=useState(""),[selShift,setSelShift]=useState(""),[from,setFrom]=useState(today()),[to,setTo]=useState(()=>{const d=new Date();d.setDate(d.getDate()+6);return d.toISOString().split("T")[0];});
  const [skipSun,setSkipSun]=useState(true),[pattern,setPattern]=useState("same");
  const [rotation,setRotation]=useState(["","","","","",""]);
  const [tmName,setTmName]=useState(""),[tmStart,setTmStart]=useState("09:00"),[tmEnd,setTmEnd]=useState("18:00"),[tmBreak,setTmBreak]=useState(60),[tmColor,setTmColor]=useState("#3b82f6");

  const canEdit=["super_admin","org_admin","branch_admin"].includes(user.role);
  const orgShifts=data.shifts.filter(s=>s.orgId===activeOrgId);
  const orgEmps=data.employees.filter(e=>e.orgId===activeOrgId&&e.role==="employee"&&e.status==="active");
  if(user.role==="branch_admin"){var filteredEmps=orgEmps.filter(e=>e.branchId===user.branchId);}else{filteredEmps=orgEmps;}

  const applyBulk=()=>{
    if(!selEmp){notify("Select employee","error");return;}
    const newSched=[...data.schedule];
    const start=new Date(from+"T12:00:00"),end=new Date(to+"T12:00:00");
    let idx=0;
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      if(skipSun&&d.getDay()===0)continue;
      const ds=d.toISOString().split("T")[0];
      const sid=pattern==="same"?selShift:rotation[idx%rotation.length];
      if(!sid){idx++;continue;}
      const ei=newSched.findIndex(s=>s.employeeId===selEmp&&s.date===ds&&!s.override);
      const entry={id:`sc_${ds}_${selEmp}`,employeeId:selEmp,date:ds,shiftId:sid,source:"bulk",override:false};
      if(ei>=0)newSched[ei]=entry;else newSched.push(entry);
      idx++;
    }
    save("schedule",newSched);notify(`Schedule applied for ${idx} days ✓`);
  };

  const addTemplate=()=>{
    if(!tmName){notify("Enter shift name","error");return;}
    save("shifts",[...data.shifts,{id:`sh_${Date.now()}`,orgId:activeOrgId,name:tmName,start:tmStart,end:tmEnd,breakMins:Number(tmBreak),color:tmColor}]);
    notify("Shift template added ✓");setTmName("");
  };

  const deleteShift=(id)=>{
    save("shifts",data.shifts.filter(s=>s.id!==id));notify("Shift deleted");
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Shift Management</h2>
      <TabBar tabs={[["templates","📋 Templates"],["schedule","📅 Bulk Schedule"]]} active={tab} onChange={setTab}/>

      {tab==="templates"&&(
        <div>
          {orgShifts.map(sh=>{
            const net=shiftMins(sh);
            return(
              <div key={sh.id} style={{background:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:`0 2px 8px ${C.g300}22`,borderLeft:`4px solid ${sh.color}`}}>
                <div>
                  <p style={{color:C.gr900,fontWeight:800}}>{sh.name}</p>
                  <p style={{color:C.gr500,fontSize:13}}>{sh.start} → {sh.end} · {Math.floor(net/60)}h {net%60}m net</p>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:sh.color}}/>
                  {canEdit&&<button onClick={()=>deleteShift(sh.id)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>🗑</button>}
                </div>
              </div>
            );
          })}
          {canEdit&&(
            <div style={{background:C.white,borderRadius:20,padding:20,marginTop:16,boxShadow:`0 2px 10px ${C.g300}33`}}>
              <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>Add shift template</p>
              <input style={Sb.input} placeholder="Shift name" value={tmName} onChange={e=>setTmName(e.target.value)}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={Sb.label}>Start</label><input style={Sb.input} type="time" value={tmStart} onChange={e=>setTmStart(e.target.value)}/></div>
                <div><label style={Sb.label}>End</label><input style={Sb.input} type="time" value={tmEnd} onChange={e=>setTmEnd(e.target.value)}/></div>
              </div>
              <label style={Sb.label}>Break (mins)</label>
              <input style={Sb.input} type="number" value={tmBreak} onChange={e=>setTmBreak(e.target.value)}/>
              <label style={Sb.label}>Color</label>
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                {["#f59e0b","#3b82f6","#8b5cf6","#6366f1","#10b981","#ef4444","#ec4899","#14b8a6"].map(c=>(
                  <button key={c} onClick={()=>setTmColor(c)} style={{width:28,height:28,borderRadius:"50%",background:c,border:tmColor===c?`3px solid ${C.g800}`:"3px solid transparent",cursor:"pointer"}}/>
                ))}
              </div>
              <button style={Sb.btn} onClick={addTemplate}>Add template</button>
            </div>
          )}
        </div>
      )}

      {tab==="schedule"&&canEdit&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,fontSize:15,marginBottom:14}}>Bulk schedule assign</p>
          <label style={Sb.label}>Employee</label>
          <select style={Sb.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
            <option value="">Select employee</option>{filteredEmps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={Sb.label}>From</label><input style={Sb.input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
            <div><label style={Sb.label}>To</label><input style={Sb.input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
          </div>
          <label style={Sb.label}>Pattern</label>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[["same","Same daily"],["rotate","Rotating"]].map(([v,l])=>(
              <button key={v} onClick={()=>setPattern(v)} style={{flex:1,background:pattern===v?C.g600:C.g100,border:"none",borderRadius:12,padding:"10px",cursor:"pointer",color:pattern===v?C.white:C.gr700,fontWeight:700,fontSize:13}}>{l}</button>
            ))}
          </div>
          {pattern==="same"&&(
            <><label style={Sb.label}>Shift</label>
            <select style={Sb.select} value={selShift} onChange={e=>setSelShift(e.target.value)}>
              <option value="">Select shift</option>{orgShifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
            </select></>
          )}
          {pattern==="rotate"&&(
            <div style={{background:C.g50,borderRadius:14,padding:14,marginBottom:12}}>
              <p style={{color:C.g800,fontWeight:700,fontSize:13,marginBottom:8}}>Daily rotation (Mon–Sat)</p>
              {["Mon","Tue","Wed","Thu","Fri","Sat"].map((day,i)=>(
                <div key={day} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{color:C.gr500,fontSize:13,width:30}}>{day}</span>
                  <select style={{...Sb.select,marginBottom:0,flex:1,padding:"8px 10px",fontSize:13}} value={rotation[i]||""} onChange={e=>{const l=[...rotation];l[i]=e.target.value;setRotation(l);}}>
                    <option value="">Off</option>{orgShifts.map(s=><option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:16}}>
            <input type="checkbox" checked={skipSun} onChange={e=>setSkipSun(e.target.checked)} style={{accentColor:C.g600,width:16,height:16}}/>
            <span style={{color:C.gr700,fontSize:14}}>Skip Sundays</span>
          </label>
          <button style={Sb.btn} onClick={applyBulk}>Apply schedule</button>
        </div>
      )}
    </div>
  );
}

// ── ADMIN OVERRIDE ─────────────────────────────────────────────────────────────
function AdminOverride({user,data,save,notify,activeOrgId}){
  const [tab,setTab]=useState("override");
  const [selEmp,setSelEmp]=useState(""),[selDate,setSelDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().split("T")[0];}),[selShift,setSelShift]=useState(""),[note,setNote]=useState("");

  const canManage=["super_admin","org_admin","branch_admin"].includes(user.role);
  let orgEmps=data.employees.filter(e=>e.orgId===activeOrgId&&e.role==="employee"&&e.status==="active");
  if(user.role==="branch_admin")orgEmps=orgEmps.filter(e=>e.branchId===user.branchId);
  const orgShifts=data.shifts.filter(s=>s.orgId===activeOrgId);
  const pendingReqs=data.shiftRequests.filter(r=>r.status==="pending"&&r.orgId===activeOrgId&&(user.role==="super_admin"||user.role==="org_admin"||r.managerId===user.id));

  const applyOverride=()=>{
    if(!selEmp||!selShift||!selDate){notify("Fill all fields","error");return;}
    const newSched=data.schedule.filter(s=>!(s.employeeId===selEmp&&s.date===selDate&&s.override));
    newSched.push({id:`ov_${Date.now()}`,employeeId:selEmp,date:selDate,shiftId:selShift,source:"override",override:true,note,overriddenBy:user.id,overriddenAt:new Date().toISOString()});
    save("schedule",newSched);notify(`Override applied for ${fmtD(selDate)} ✓`);setNote("");
  };

  const decideRequest=(req,decision)=>{
    save("shiftRequests",data.shiftRequests.map(r=>r.id===req.id?{...r,status:decision,decidedBy:user.id,decidedAt:new Date().toISOString()}:r));
    if(decision==="approved"){
      const newSched=data.schedule.filter(s=>!(s.employeeId===req.employeeId&&s.date===req.date&&s.override));
      newSched.push({id:`ov_req_${Date.now()}`,employeeId:req.employeeId,date:req.date,shiftId:req.requestedShiftId,source:"override",override:true,note:`Approved: ${req.employeeName}`,overriddenBy:user.id,overriddenAt:new Date().toISOString()});
      save("schedule",newSched);
    }
    notify(`Request ${decision} ✓`);
  };

  const empMap=Object.fromEntries(data.employees.map(e=>[e.id,e]));

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Shift Override</h2>
      <p style={{color:C.gr500,fontSize:13,marginBottom:16}}>Override a specific day's shift for any employee</p>
      <TabBar tabs={[["override","⚡ Override"],["requests",`🔄 Requests${pendingReqs.length>0?` (${pendingReqs.length})`:""}`]]} active={tab} onChange={setTab}/>

      {tab==="override"&&canManage&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <label style={Sb.label}>Employee</label>
          <select style={Sb.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
            <option value="">Select employee</option>{orgEmps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <label style={Sb.label}>Date</label>
          <input style={Sb.input} type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}/>
          {selEmp&&selDate&&(()=>{const{shift,source}=resolveShift(data.schedule,data.shifts,selEmp,selDate,data.employees);return shift&&<div style={{background:C.g50,borderRadius:12,padding:10,marginBottom:10}}><p style={{color:C.g700,fontWeight:700,fontSize:13}}>Current: {shift.name} · {shift.start}–{shift.end} <span style={{color:C.gr500,fontSize:12}}>({source})</span></p></div>;})()}
          <label style={Sb.label}>New shift</label>
          <select style={Sb.select} value={selShift} onChange={e=>setSelShift(e.target.value)}>
            <option value="">Select shift</option>{orgShifts.map(s=><option key={s.id} value={s.id}>{s.name} · {s.start}–{s.end}</option>)}
          </select>
          <label style={Sb.label}>Note (optional)</label>
          <input style={Sb.input} placeholder="Reason for override" value={note} onChange={e=>setNote(e.target.value)}/>
          <button style={Sb.btn} onClick={applyOverride}>Apply override</button>
        </div>
      )}

      {tab==="requests"&&(
        <div>
          {pendingReqs.length===0&&<Empty icon="✅" msg="No pending shift requests"/>}
          {pendingReqs.map(req=>{
            const emp=empMap[req.employeeId];
            const{shift:cur}=resolveShift(data.schedule,data.shifts,req.employeeId,req.date,data.employees);
            const reqSh=data.shifts.find(s=>s.id===req.requestedShiftId);
            return(
              <div key={req.id} style={{background:C.white,borderRadius:20,padding:18,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${C.amber}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <div><p style={{color:C.gr900,fontWeight:800,fontSize:15}}>{emp?.name}</p><p style={{color:C.gr500,fontSize:12}}>{emp?.designation}</p></div>
                  <span style={{background:"#fffbeb",color:C.amber,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>Pending</span>
                </div>
                <p style={{color:C.g800,fontWeight:700,marginBottom:8}}>📅 {fmtDF(req.date)}</p>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                  <div style={{flex:1,background:C.g50,borderRadius:10,padding:10}}>
                    <p style={{color:C.gr500,fontSize:11}}>Current</p>
                    <p style={{color:C.gr900,fontWeight:700,fontSize:13}}>{cur?.name||"None"}</p>
                  </div>
                  <span style={{fontSize:18}}>→</span>
                  <div style={{flex:1,background:"#fffbeb",borderRadius:10,padding:10}}>
                    <p style={{color:C.gr500,fontSize:11}}>Requested</p>
                    <p style={{color:C.gr900,fontWeight:700,fontSize:13}}>{reqSh?.name||"?"}</p>
                  </div>
                </div>
                {req.note&&<p style={{color:C.gr500,fontSize:13,marginBottom:12}}>💬 "{req.note}"</p>}
                <div style={{display:"flex",gap:10}}>
                  <button style={{...Sb.btn,background:C.g600,flex:1,padding:"12px"}} onClick={()=>decideRequest(req,"approved")}>✓ Approve</button>
                  <button style={{...Sb.btn,background:C.red,flex:1,padding:"12px"}} onClick={()=>decideRequest(req,"rejected")}>✕ Deny</button>
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
function AdminApprovals({user,data,save,notify,activeOrgId}){
  const isSA=user.role==="super_admin",isOA=user.role==="org_admin";
  const pending=data.approvals.filter(a=>a.status==="pending"&&a.orgId===activeOrgId&&(isSA||isOA||a.managerId===user.id));
  const empMap=Object.fromEntries(data.employees.map(e=>[e.id,e]));

  // Approval hierarchy info
  const hier={branch_admin:"Approves employee late/leave",org_admin:"Approves branch admin requests + overrides branch decisions",super_admin:"Can approve/override anything across all orgs"};

  const decide=(a,decision)=>{
    save("approvals",data.approvals.map(x=>x.id===a.id?{...x,status:decision,decidedBy:user.id,decidedAt:new Date().toISOString()}:x));
    save("records",data.records.map(r=>r.id===a.recordId?{...r,approvalStatus:decision}:r));
    // If rejected by branch admin, escalate to org admin
    if(decision==="rejected"&&user.role==="branch_admin"){
      const orgAdmin=data.employees.find(e=>e.orgId===activeOrgId&&e.role==="org_admin");
      if(orgAdmin){
        save("approvals",[...data.approvals.map(x=>x.id===a.id?{...x,status:decision}:x),{...a,id:`ap_esc_${Date.now()}`,managerId:orgAdmin.id,status:"pending",escalated:true}]);
      }
    }
    notify(`Request ${decision} ✓`);
  };

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Approvals</h2>
      <div style={{background:C.g50,borderRadius:14,padding:14,marginBottom:16,borderLeft:`3px solid ${C.g500}`}}>
        <p style={{color:C.g700,fontSize:13,fontWeight:700}}>Your approval authority</p>
        <p style={{color:C.gr500,fontSize:12,marginTop:3}}>{hier[user.role]||""}</p>
      </div>
      {pending.length===0&&<Empty icon="✅" msg="No pending approvals"/>}
      {pending.map(a=>{
        const e=empMap[a.employeeId];
        return(
          <div key={a.id} style={{background:C.white,borderRadius:20,padding:18,marginBottom:14,boxShadow:`0 2px 10px ${C.g300}44`,borderLeft:`4px solid ${a.escalated?C.violet:C.amber}`}}>
            {a.escalated&&<span style={{background:"#ede9fe",color:C.violet,fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:700,marginBottom:8,display:"inline-block"}}>ESCALATED</span>}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div><p style={{color:C.gr900,fontWeight:800,fontSize:15}}>{e?.name}</p><p style={{color:C.gr500,fontSize:12}}>{e?.designation}</p></div>
              <span style={{background:"#fffbeb",color:C.amber,fontSize:12,padding:"4px 10px",borderRadius:20,fontWeight:700}}>⏱ {a.lateMins}m late</span>
            </div>
            {a.shiftName&&<p style={{color:C.gr500,fontSize:13,marginBottom:4}}>Shift: {a.shiftName}</p>}
            <p style={{color:C.gr500,fontSize:13,marginBottom:14}}>📅 {fmtD(a.date)} at {a.time}</p>
            <div style={{display:"flex",gap:10}}>
              <button style={{...Sb.btn,background:C.g600,flex:1,padding:"12px"}} onClick={()=>decide(a,"approved")}>✓ Approve</button>
              <button style={{...Sb.btn,background:C.red,flex:1,padding:"12px"}} onClick={()=>decide(a,"rejected")}>✕ Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminQR({data,activeOrgId}){
  const [sel,setSel]=useState(data.branches.find(b=>b.orgId===activeOrgId)?.id||"");
  const br=data.branches.find(b=>b.id===sel);
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Branch QR Codes</h2>
      <select style={Sb.select} value={sel} onChange={e=>setSel(e.target.value)}>
        {data.branches.filter(b=>b.orgId===activeOrgId).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {br&&(
        <div style={{background:C.white,borderRadius:24,padding:32,textAlign:"center",boxShadow:`0 4px 24px ${C.g300}66`}}>
          <p style={{color:C.gr500,fontSize:13,marginBottom:20}}>📍 {br.address}</p>
          <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><QRCanvas data={genQR(br.id)} size={200}/></div>
          <h3 style={{color:C.g800,fontSize:20,fontWeight:800}}>{br.name}</h3>
          <div style={{background:C.g50,borderRadius:12,padding:12,marginTop:16,textAlign:"left"}}>
            <p style={{color:C.g700,fontSize:13,fontWeight:700}}>📍 {br.lat}, {br.lng} · ⭕ {br.radius}m geo-fence</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminReports({data,activeOrgId}){
  const emps=data.employees.filter(e=>e.orgId===activeOrgId&&e.role==="employee");
  const brMap=Object.fromEntries(data.branches.map(b=>[b.id,b]));
  const [filterBranch,setFilterBranch]=useState("all");
  const [filterStatus,setFilterStatus]=useState("all");

  let list=emps;
  if(filterBranch!=="all")list=list.filter(e=>e.branchId===filterBranch);
  if(filterStatus!=="all")list=list.filter(e=>e.status===filterStatus);

  const stats=list.map(e=>({...e,...calcStats(e,data.records,data.leaves,data.settings,data.schedule,data.shifts,data.employees)}));
  const totalPayable=stats.reduce((s,e)=>s+e.netEarned,0);
  const totalDeductions=stats.reduce((s,e)=>s+e.totalDeductions,0);

  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Monthly Report</h2>
      <p style={{color:C.gr500,fontSize:13,marginBottom:16}}>{new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{background:C.g700,borderRadius:18,padding:16,textAlign:"center"}}>
          <p style={{color:"rgba(255,255,255,0.7)",fontSize:12}}>Total Payable</p>
          <p style={{color:C.white,fontSize:22,fontWeight:900}}>{fmt(totalPayable)}</p>
        </div>
        <div style={{background:C.white,borderRadius:18,padding:16,textAlign:"center",boxShadow:`0 2px 8px ${C.g300}44`}}>
          <p style={{color:C.gr500,fontSize:12}}>Total Deductions</p>
          <p style={{color:C.red,fontSize:22,fontWeight:900}}>{fmt(totalDeductions)}</p>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <select style={{...Sb.select,marginBottom:0,flex:1,fontSize:12}} value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
          <option value="all">All branches</option>{data.branches.filter(b=>b.orgId===activeOrgId).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={{...Sb.select,marginBottom:0,flex:1,fontSize:12}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All status</option>{Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {stats.map(e=>{
        const br=brMap[e.branchId];
        const sc=STATUS_CONFIG[e.status]||STATUS_CONFIG.active;
        return(
          <div key={e.id} style={{background:C.white,borderRadius:18,padding:16,marginBottom:10,boxShadow:`0 2px 8px ${C.g300}33`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                  <p style={{color:C.gr900,fontWeight:800}}>{e.name}</p>
                  <span style={{background:sc.bg,color:sc.color,fontSize:10,padding:"1px 7px",borderRadius:20,fontWeight:700}}>{sc.label}</span>
                </div>
                <p style={{color:C.gr500,fontSize:12}}>{e.designation} · {br?.name}</p>
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{color:C.g700,fontWeight:900,fontSize:17}}>{fmt(e.netEarned)}</p>
                {e.totalDeductions>0&&<p style={{color:C.red,fontSize:12}}>-{fmt(e.totalDeductions)}</p>}
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[["Present",e.presentDays,C.g600],["Late",e.lateDays,C.amber],["CL",e.casualUsed,C.blue],["Unauth",e.unauthLeaves,C.red]].map(([l,v,c])=>(
                <span key={l} style={{background:`${c}15`,color:c,fontSize:12,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{l}: {v}</span>
              ))}
            </div>
          </div>
        );
      })}
      {stats.length===0&&<Empty icon="📊" msg="No staff to report"/>}
    </div>
  );
}

function AdminEditAtt({data,save,notify,activeOrgId,user}){
  const [selEmp,setSelEmp]=useState(""),[selDate,setSelDate]=useState(today()),[cin,setCin]=useState(""),[cout,setCout]=useState("");
  const emps=data.employees.filter(e=>e.orgId===activeOrgId&&e.role!=="super_admin");
  useEffect(()=>{
    if(!selEmp||!selDate)return;
    const r=data.records.filter(r=>r.employeeId===selEmp&&r.date===selDate);
    setCin(r.find(x=>x.type==="checkin")?.time||"");setCout(r.find(x=>x.type==="checkout")?.time||"");
  },[selEmp,selDate]);
  const go=()=>{
    if(!selEmp||!cin){notify("Employee and check-in required","error");return;}
    const{shift}=resolveShift(data.schedule,data.shifts,selEmp,selDate,data.employees);
    const late=shift?lateM(cin,shift.start):0;
    const settings=data.settings[data.employees.find(e=>e.id===selEmp)?.orgId]||{};
    const isLate=late>(settings.gracePeriodMins||15);
    const filtered=data.records.filter(r=>!(r.employeeId===selEmp&&r.date===selDate));
    const newRecs=[...filtered,{id:`r_adm_${Date.now()}`,employeeId:selEmp,date:selDate,time:cin,type:"checkin",shiftId:shift?.id,shiftStart:shift?.start,shiftEnd:shift?.end,isLate,lateMins:Math.max(0,late),approvalStatus:"approved",geoVerified:false,adminEdited:true,editedAt:new Date().toISOString()}];
    if(cout)newRecs.push({id:`r_adm_${Date.now()+1}`,employeeId:selEmp,date:selDate,time:cout,type:"checkout",workedMins:Math.max(0,toM(cout)-toM(cin)),shiftId:shift?.id,geoVerified:false,adminEdited:true,editedAt:new Date().toISOString()});
    save("records",newRecs);notify("Attendance saved ✓");
  };
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:4}}>Edit Attendance</h2>
      <p style={{color:C.gr500,fontSize:13,marginBottom:16}}>Mark or correct attendance for any past date</p>
      <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        <label style={Sb.label}>Employee</label>
        <select style={Sb.select} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
          <option value="">Select employee</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label style={Sb.label}>Date</label>
        <input style={Sb.input} type="date" value={selDate} max={today()} onChange={e=>setSelDate(e.target.value)}/>
        {selEmp&&selDate&&(()=>{const{shift}=resolveShift(data.schedule,data.shifts,selEmp,selDate,data.employees);return shift&&<div style={{background:C.g50,borderRadius:12,padding:10,marginBottom:10}}><p style={{color:C.g700,fontWeight:700,fontSize:13}}>Shift: {shift.name} · {shift.start}–{shift.end}</p></div>;})()}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={Sb.label}>Check-in *</label><input style={Sb.input} type="time" value={cin} onChange={e=>setCin(e.target.value)}/></div>
          <div><label style={Sb.label}>Check-out</label><input style={Sb.input} type="time" value={cout} onChange={e=>setCout(e.target.value)}/></div>
        </div>
        {cin&&cout&&<p style={{color:C.g600,fontSize:13,marginBottom:10}}>⏱ {Math.floor((toM(cout)-toM(cin))/60)}h {(toM(cout)-toM(cin))%60}m worked</p>}
        <button style={Sb.btn} onClick={go}>Save record</button>
      </div>
    </div>
  );
}

function AdminSettings({data,save,notify,activeOrgId,user}){
  const s0=data.settings[activeOrgId]||{gracePeriodMins:15,lateDeduction:50,maxLates:3,excessLatePenalty:100,unauthLeaveP:200,noShowP:250,casualLeave:1.5,workingDays:26,geoRadius:200};
  const [s,setS]=useState(s0);
  const [brName,setBrName]=useState(""),[brAddr,setBrAddr]=useState(""),[brLat,setBrLat]=useState(""),[brLng,setBrLng]=useState(""),[brR,setBrR]=useState("200");
  const fields=[["gracePeriodMins","Grace period (mins)","number"],["lateDeduction","Late deduction (₹)","number"],["maxLates","Max lates/month","number"],["excessLatePenalty","Excess late penalty (₹)","number"],["unauthLeaveP","Unauth leave penalty (₹)","number"],["noShowP","No-show penalty (₹)","number"],["casualLeave","Casual leave/month","number"],["workingDays","Working days/month","number"],["geoRadius","Geo-fence radius (m)","number"]];
  const addBranch=()=>{
    if(!brName||!brLat||!brLng){notify("Name and coordinates required","error");return;}
    save("branches",[...data.branches,{id:`br_${Date.now()}`,orgId:activeOrgId,name:brName,address:brAddr,lat:parseFloat(brLat),lng:parseFloat(brLng),radius:parseInt(brR)||200}]);
    notify("Branch added ✓");setBrName("");setBrAddr("");setBrLat("");setBrLng("");setBrR("200");
  };
  return(
    <div style={{padding:20}}>
      <h2 style={{color:C.g800,fontSize:22,fontWeight:800,marginBottom:16}}>Settings</h2>
      <div style={{background:C.white,borderRadius:20,padding:20,marginBottom:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
        <p style={{color:C.g800,fontWeight:800,marginBottom:14}}>Attendance & Salary Rules</p>
        {fields.map(([k,l,t])=>(
          <div key={k} style={{marginBottom:12}}>
            <label style={Sb.label}>{l}</label>
            <input style={Sb.input} type={t} value={s[k]||""} onChange={e=>setS(p=>({...p,[k]:t==="number"?Number(e.target.value):e.target.value}))}/>
          </div>
        ))}
        <button style={Sb.btn} onClick={()=>{save("settings",{...data.settings,[activeOrgId]:s});notify("Settings saved ✓");}}>Save settings</button>
      </div>
      <h3 style={{color:C.g800,fontWeight:800,marginBottom:12}}>Branches</h3>
      {data.branches.filter(b=>b.orgId===activeOrgId).map(b=>(
        <div key={b.id} style={{background:C.white,borderRadius:16,padding:14,marginBottom:10,boxShadow:`0 2px 6px ${C.g300}22`}}>
          <p style={{color:C.gr900,fontWeight:800}}>{b.name}</p>
          <p style={{color:C.g600,fontSize:13}}>📍 {b.lat}, {b.lng} · ⭕ {b.radius}m</p>
        </div>
      ))}
      {(user.role==="super_admin"||user.role==="org_admin")&&(
        <div style={{background:C.white,borderRadius:20,padding:20,boxShadow:`0 2px 10px ${C.g300}33`}}>
          <p style={{color:C.g800,fontWeight:800,marginBottom:12}}>Add branch</p>
          <input style={Sb.input} placeholder="Branch name *" value={brName} onChange={e=>setBrName(e.target.value)}/>
          <input style={Sb.input} placeholder="Address" value={brAddr} onChange={e=>setBrAddr(e.target.value)}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <input style={Sb.input} type="number" step="0.0001" placeholder="Latitude *" value={brLat} onChange={e=>setBrLat(e.target.value)}/>
            <input style={Sb.input} type="number" step="0.0001" placeholder="Longitude *" value={brLng} onChange={e=>setBrLng(e.target.value)}/>
          </div>
          <input style={Sb.input} type="number" placeholder="Radius (m)" value={brR} onChange={e=>setBrR(e.target.value)}/>
          <button style={Sb.btn} onClick={addBranch}>Add branch</button>
        </div>
      )}
    </div>
  );
}

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
function TopBar({user,onLogout,activeOrg}){
  return(
    <div style={{background:C.white,padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.g100}`,boxShadow:`0 2px 12px ${C.g300}33`,position:"sticky",top:0,zIndex:10}}>
      <div>
        <h1 style={{fontFamily:"'Syne',sans-serif",color:C.g800,fontSize:16,fontWeight:800,letterSpacing:"-0.3px"}}>SmartAi Attendance</h1>
        <p style={{color:C.gr500,fontSize:9,fontWeight:600,letterSpacing:0.3}}>{activeOrg?`${activeOrg.name} · `:""}by 3SL Media Labs</p>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{textAlign:"right"}}>
          <p style={{color:C.g800,fontSize:13,fontWeight:700}}>{user.name.split(" ")[0]}</p>
          <p style={{color:C.gr500,fontSize:9,textTransform:"uppercase",letterSpacing:0.5}}>{ROLE_CONFIG[user.role]?.label}</p>
        </div>
        <button onClick={onLogout} style={{background:C.g100,border:"none",borderRadius:10,width:34,height:34,cursor:"pointer",color:C.g700,fontWeight:700,fontSize:13}}>↩</button>
      </div>
    </div>
  );
}

function BottomNav({items,page,setPage}){
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

function TabBar({tabs,active,onChange}){
  return(
    <div style={{background:C.g100,borderRadius:14,display:"flex",padding:4,marginBottom:16}}>
      {tabs.map(([k,l])=>(
        <button key={k} onClick={()=>onChange(k)} style={{flex:1,background:active===k?C.white:"transparent",border:"none",borderRadius:10,padding:"8px",cursor:"pointer",color:active===k?C.g700:C.gr500,fontWeight:700,fontSize:13}}>{l}</button>
      ))}
    </div>
  );
}

function Empty({icon,msg}){return<div style={{textAlign:"center",padding:"50px 20px"}}><p style={{fontSize:42,marginBottom:12}}>{icon}</p><p style={{color:C.gr500,fontSize:15}}>{msg}</p></div>;}
function Toast({msg,type}){
  const bg={success:C.g600,error:C.red,warn:C.amber,info:C.blue}[type]||C.g600;
  return<div style={{position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",background:bg,color:C.white,padding:"12px 22px",borderRadius:14,fontWeight:700,fontSize:14,zIndex:9999,maxWidth:"90vw",boxShadow:"0 8px 32px rgba(0,0,0,.22)",animation:"fadeUp .3s ease",whiteSpace:"nowrap"}}>{msg}</div>;
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const Sb={
  label:{color:C.g800,fontSize:13,fontWeight:600,marginBottom:6,display:"block"},
  input:{background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  select:{background:C.g50,border:`1.5px solid ${C.g300}`,borderRadius:12,color:C.gr900,padding:"12px 14px",fontSize:14,outline:"none",width:"100%",marginBottom:10},
  btn:{background:`linear-gradient(135deg,${C.g700},${C.g500})`,border:"none",borderRadius:14,color:C.white,padding:"14px 20px",fontSize:15,fontWeight:800,cursor:"pointer",width:"100%",marginTop:4},
  outline:{background:C.white,border:`1.5px solid ${C.g500}`,borderRadius:14,color:C.g700,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"},
  iconBtn:{background:C.g100,border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",color:C.g700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"},
};