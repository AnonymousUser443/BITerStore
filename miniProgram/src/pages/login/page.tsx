import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import { Brand } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import {
  destroyBitLoginChallenge,
  getRegistrationToken,
  startBitLogin,
  submitBitLoginSms,
  type BitLoginChallenge
} from '@/domain/bit-login'
import { continueAsGuest, loginWithCampus, loginWithWechat, pollWebLogin } from '@/domain/auth'
import { demoRepository, warmAccountSnapshots } from '@/domain/repository'
import { externalNavigationAdapter, navigationAdapter } from '@/platform'

export default function LoginPage() {
  const [sid, setSid] = useState('')
  const [password, setPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [challenge, setChallenge] = useState<BitLoginChallenge>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (process.env.TARO_ENV !== 'h5') return
    const state = Taro.getStorageSync('biterstore:web-login-state')
    if (!state || Taro.getCurrentInstance().router?.params.wechat !== 'complete') return
    setLoading(true)
    void pollWebLogin(state)
      .then(() => { void warmAccountSnapshots(); return navigationAdapter.switchTab('/pages/home/index') })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '微信登录确认失败'))
      .finally(() => setLoading(false))
  }, [])

  const finishCampus = async (value: BitLoginChallenge) => {
    try {
      const registrationToken = await getRegistrationToken(value)
      await loginWithCampus(registrationToken)
      void warmAccountSnapshots()
      await destroyBitLoginChallenge(value)
      setPassword('')
      await navigationAdapter.switchTab('/pages/home/index')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学号登录失败')
    }
  }

  const campusLogin = async () => {
    if (!/^\d{8,12}$/.test(sid.trim())) return setError('请输入正确的北理工学号')
    if (!password) return setError('请输入统一身份认证密码')
    setLoading(true)
    setError('')
    try {
      const result = await startBitLogin(sid.trim(), password)
      if (result.status === 'waiting_sms') {
        setPassword('')
        setChallenge(result)
      } else await finishCampus(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '统一身份认证失败')
    } finally {
      setLoading(false)
    }
  }

  const verifySms = async () => {
    if (!challenge || !/^\d{4,8}$/.test(smsCode.trim())) return setError('请输入 4 至 8 位短信验证码')
    setLoading(true)
    setError('')
    try {
      const result = await submitBitLoginSms(challenge, smsCode.trim())
      if (result.status === 'authenticated') await finishCampus(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '短信验证失败')
    } finally {
      setLoading(false)
    }
  }

  const wechatLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await loginWithWechat()
      if ('accessToken' in result) { void warmAccountSnapshots(); await navigationAdapter.switchTab('/pages/home/index') }
      else if (result.authorizeUrl) await externalNavigationAdapter.open(result.authorizeUrl)
      else setError('微信网站登录尚未配置，请先使用学号登录')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '微信登录失败')
    } finally {
      setLoading(false)
    }
  }

  const guest = async () => {
    await continueAsGuest()
    await demoRepository.markAuthenticated('guest')
    await navigationAdapter.switchTab('/pages/home/index')
  }
  const e2eLogin = () => {
    void demoRepository.markAuthenticated('1120230000').then(() => navigationAdapter.switchTab('/pages/home/index'))
  }

  return <View className='phone-shell login-page'>
    <Image className='paper-texture' src='/assets/paper-bg.webp' mode='aspectFill' />
    <View className='login-brand'><Brand /><Text><Glyph name='shield' /></Text></View>
    <View className='login-hero'>
      <Image src='/assets/tobby-hello.webp' mode='aspectFit' />
      <View>
        <Text className='eyebrow'>BIT CAMPUS ACCOUNT</Text>
        <Text className='login-title'>{challenge ? '确认是你本人' : '北理同学，你好'}</Text>
        <Text className='login-description'>{challenge
          ? `验证码已发送至 ${challenge.masked_phone || '绑定手机'}`
          : '使用学校统一身份认证登录，完成校园身份验证。'}</Text>
      </View>
    </View>

    <View className='login-card'>
      {challenge ? <>
        <View className='login-field'><Text>短信验证码</Text><Input type='number' maxlength={8} value={smsCode} onInput={(event) => setSmsCode(event.detail.value.replace(/\D/g, ''))} placeholder='请输入验证码' focus /></View>
        <Button id='e2e-login-submit' className='primary-button' disabled={loading} onClick={verifySms}>{loading ? '正在验证…' : '继续登录'}</Button>
      </> : <>
        <View className='login-field'><Text>学号</Text><Input type='number' value={sid} onInput={(event) => setSid(event.detail.value.replace(/\D/g, ''))} placeholder='请输入北理工学号' /></View>
        <View className='login-field'><Text>统一身份认证密码</Text><Input password value={password} onInput={(event) => setPassword(event.detail.value)} placeholder='请输入密码' /></View>
        <Button id='e2e-login-submit' className='primary-button' disabled={loading} onClick={campusLogin}>{loading ? '正在安全验证…' : '学号登录'}</Button>
        <View className='guest-divider'><Text>或</Text></View>
        <Button id='e2e-guest-access' className='secondary-button guest-button' disabled={loading} onClick={guest}>游客浏览</Button>
        <Text className='guest-note'>游客只能浏览商品，可随时返回登录。</Text>
        <Button className='login-link' disabled={loading} onClick={wechatLogin}>已绑定微信？快捷登录</Button>
      </>}
      {error && <View className='login-error'><Glyph name='warning' />{error}</View>}
      {__BITERSTORE_E2E__ && <Button id='e2e-login-bypass' className='login-link' onClick={e2eLogin}>自动化测试登录</Button>}
    </View>

    <View className='login-security'><Glyph name='shield' /><View><Text>隐私说明</Text><Text>校园密码只发送到认证服务；BITerStore 只接收一次性登录凭证，不保存密码、短信验证码或教务 Cookie。</Text></View></View>
    <Button className='login-guide' onClick={() => navigationAdapter.back()}>返回</Button>
  </View>
}
