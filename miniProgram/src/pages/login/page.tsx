import { useState } from 'react'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import { Brand } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { startBitLogin, submitBitLoginSms, type BitLoginChallenge } from '@/domain/bit-login'
import { demoRepository } from '@/domain/repository'
import { navigationAdapter } from '@/platform'

export default function LoginPage() {
  const [sid, setSid] = useState('')
  const [password, setPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [challenge, setChallenge] = useState<BitLoginChallenge>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const finish = async () => { await demoRepository.markAuthenticated(sid.trim()); setPassword(''); await navigationAdapter.switchTab('/pages/home/index') }
  const continueAsGuest = async () => { await demoRepository.markAuthenticated('guest'); setPassword(''); await navigationAdapter.switchTab('/pages/home/index') }
  const login = async () => {
    if (!/^\d{8,12}$/.test(sid.trim())) return setError('请输入正确的北理工学号')
    if (!password) return setError('请输入统一身份认证密码')
    setLoading(true); setError('')
    try { const result = await startBitLogin(sid.trim(), password); if (result.status === 'waiting_sms') { setPassword(''); setChallenge(result) } else await finish() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '统一身份认证失败') }
    finally { setLoading(false) }
  }
  const verifySms = async () => {
    if (!challenge || !/^\d{4,8}$/.test(smsCode.trim())) return setError('请输入 4 至 8 位短信验证码')
    setLoading(true); setError('')
    try { const result = await submitBitLoginSms(challenge, smsCode.trim()); if (result.status === 'authenticated') await finish() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '短信验证失败') }
    finally { setLoading(false) }
  }
  return <View className='phone-shell login-page'><Image className='paper-texture' src='/assets/paper-bg.webp' mode='aspectFill' /><View className='login-brand'><Brand /><Text><Glyph name='shield' /></Text></View><View className='login-hero'><Image src='/assets/tobby-hello.webp' mode='aspectFit' /><View><Text className='eyebrow'>BIT CAMPUS IDENTITY</Text><Text className='login-title'>{challenge ? '确认是你本人' : '北理同学，你好'}</Text><Text className='login-description'>{challenge ? `验证码已发送至 ${challenge.masked_phone || '绑定手机'}` : '使用学校统一身份认证登录，完成校园身份验证。'}</Text></View></View><View className='login-card'>{challenge ? <><View className='login-field'><Text>短信验证码</Text><Input type='number' maxlength={8} value={smsCode} onInput={(event) => setSmsCode(event.detail.value.replace(/\D/g, ''))} placeholder='请输入验证码' focus /></View><Button id='e2e-login-submit' className='primary-button' disabled={loading} onClick={verifySms}>{loading ? '正在验证…' : '继续验证'}</Button><Button className='login-link' disabled={loading} onClick={() => { setChallenge(undefined); setSmsCode(''); setError('') }}>返回重新登录</Button></> : <><View className='login-field'><Text>学号</Text><Input type='number' value={sid} onInput={(event) => setSid(event.detail.value.replace(/\D/g, ''))} placeholder='请输入北理工学号' focus /></View><View className='login-field'><Text>统一身份认证密码</Text><Input password value={password} onInput={(event) => setPassword(event.detail.value)} placeholder='请输入密码' /></View><Button id='e2e-login-submit' className='primary-button' disabled={loading} onClick={login}>{loading ? '正在安全验证…' : '登录 BITerStore'}</Button><View className='guest-divider'><Text>或</Text></View><Button id='e2e-guest-access' className='secondary-button guest-button' disabled={loading} onClick={continueAsGuest}>游客访问</Button><Text className='guest-note'>先逛逛校园书架，之后可在“我的”页面重新登录。</Text></>}{error && <View className='login-error'><Glyph name='warning' />{error}</View>}{__BITERSTORE_E2E__ && <Button id='e2e-login-bypass' className='login-link' onClick={() => { setSid('1120230000'); void demoRepository.markAuthenticated('1120230000').then(() => navigationAdapter.switchTab('/pages/home/index')) }}>自动化测试登录</Button>}</View><View className='login-security'><Glyph name='shield' /><View><Text>凭据安全说明</Text><Text>密码仅用于本次学校统一身份认证，不会保存在 BITerStore 本地。</Text></View></View><Button className='login-guide' onClick={() => navigationAdapter.go('/pages/onboarding/index')}>返回新手指引</Button></View>
}
