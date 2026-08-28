import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, ClipboardList, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'
import './style.css'

const API = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
type View = 'dashboard' | 'users' | 'listings' | 'reports' | 'audit'
async function request<T>(path: string, init?: RequestInit): Promise<T> { const token = sessionStorage.getItem('admin-token'); const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || `请求失败 ${response.status}`); return response.json() }

function App() {
  const [view, setView] = useState<View>('dashboard'); const [data, setData] = useState<any>(); const [error, setError] = useState(''); const [token, setToken] = useState(sessionStorage.getItem('admin-token') || ''); const [draftToken,setDraftToken]=useState(''); const [totp,setTotp]=useState('')
  const load = async () => { setError(''); try { const path = { dashboard: '/admin/metrics', users: '/admin/users', listings: '/admin/listings', reports: '/admin/reports', audit: '/admin/audit-logs' }[view]; setData(await request(path)) } catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') } }
  useEffect(() => { if (token) void load() }, [view, token])
  const authenticate=async()=>{setError('');try{sessionStorage.setItem('admin-token',draftToken);const elevated=await request<{accessToken:string}>('/admin/security/totp/verify',{method:'POST',body:JSON.stringify({code:totp})});sessionStorage.setItem('admin-token',elevated.accessToken);setToken(elevated.accessToken)}catch(cause){sessionStorage.removeItem('admin-token');setError(cause instanceof Error?cause.message:'管理员验证失败')}}
  if (!token) return <main className="login"><section><ShieldCheck size={42}/><h1>BITerStore 管理平台</h1><p>使用完成微信登录、校园认证和后台授权的短期令牌，并通过管理员动态验证码。</p><input placeholder="管理员 access token" value={draftToken} onChange={(event) => setDraftToken(event.target.value.trim())}/><input inputMode="numeric" maxLength={6} placeholder="6 位 TOTP 动态验证码" value={totp} onChange={(event)=>setTotp(event.target.value.replace(/\D/g,''))}/>{error&&<p className="error">{error}</p>}<button disabled={!draftToken||totp.length!==6} onClick={()=>void authenticate()}>验证并进入后台</button></section></main>
  const items: Array<[View, string, any]> = [['dashboard','数据看板',LayoutDashboard],['users','用户管理',Users],['listings','商品审核',BookOpen],['reports','举报工单',ClipboardList],['audit','审计日志',ShieldCheck]]
  return <div className="layout"><aside><h1>BITerStore</h1><small>平台治理中心</small><nav>{items.map(([key,label,Icon])=><button className={view===key?'active':''} onClick={()=>setView(key)} key={key}><Icon size={18}/>{label}</button>)}</nav><button className="logout" onClick={()=>{sessionStorage.clear();setToken('')}}>退出</button></aside><main><header><h2>{items.find(([key])=>key===view)?.[1]}</h2><button onClick={load}>刷新</button></header>{error&&<p className="error">{error}</p>}<Content view={view} data={data} reload={load}/></main></div>
}
function Content({view,data,reload}:{view:View;data:any;reload:()=>Promise<void>}) {
  if (!data) return <p>正在加载…</p>
  if (view==='dashboard') return <div className="metrics">{Object.entries(data).map(([key,value])=><article key={key}><small>{key}</small><strong>{String(value)}</strong></article>)}</div>
  const act=async(row:any,action:string)=>{const reason=window.prompt(`请输入“${action}”的处置原因`);if(!reason)return;if(!window.confirm(`确认对 ${String(row.id).slice(0,8)} 执行 ${action}？`))return;await request('/admin/moderation-actions',{method:'POST',body:JSON.stringify({targetType:view==='users'?'USER':view==='listings'?'LISTING':'REPORT',targetId:row.id,action,reason})});await reload()}
  const rows=Array.isArray(data)?data:[]; return <div className="table"><table><thead><tr>{['ID','名称 / 对象','状态','创建时间','操作'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((row:any)=><tr key={String(row.id)}><td>{String(row.id).slice(0,8)}</td><td>{row.nickname||row.title||row.reason||row.action}</td><td>{row.status||row.campusStatus||row.action}</td><td>{row.createdAt?new Date(row.createdAt).toLocaleString():'-'}</td><td>{view==='users'?<><button onClick={()=>void act(row,'BANNED')}>封禁</button><button onClick={()=>void act(row,'ACTIVE')}>恢复</button></>:view==='listings'?<><button onClick={()=>void act(row,'BLOCKED')}>下架</button><button onClick={()=>void act(row,'ACTIVE')}>恢复</button></>:view==='reports'?<><button onClick={()=>void act(row,'RESOLVED')}>处理</button><button onClick={()=>void act(row,'REJECTED')}>驳回</button></>:'-'}</td></tr>)}</tbody></table>{!rows.length&&<p>暂无数据</p>}</div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
