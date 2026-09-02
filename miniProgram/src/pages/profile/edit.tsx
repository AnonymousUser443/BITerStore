import { useState } from 'react'
import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Avatar } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { requireAccount } from '@/domain/access'
import { demoRepository } from '@/domain/repository'
import type { Campus, ProfileUpdate, User } from '@/domain/types'
import { avatarAdapter, feedbackAdapter, navigationAdapter } from '@/platform'

const campuses: Campus[] = ['中关村', '良乡', '西山', '珠海']

export default function ProfileEditPage() {
  const [user, setUser] = useState<User | undefined>(() => demoRepository.peekProfile())
  const [draft, setDraft] = useState<ProfileUpdate | undefined>(() => user ? { name: user.name, campus: user.campus, bio: user.bio, avatar: user.avatar } : undefined)
  const [saving, setSaving] = useState(false)

  useDidShow(() => {
    void requireAccount('登录后才能编辑个人资料').then(async (allowed) => {
      if (!allowed) return
      try {
        const profile = await demoRepository.getProfile()
        setUser(profile)
        setDraft({ name: profile.name, campus: profile.campus, bio: profile.bio, avatar: profile.avatar })
      } catch (cause) {
        await feedbackAdapter.toast(cause instanceof Error ? cause.message : '个人资料加载失败')
      }
    })
  })

  const chooseAvatar = async () => {
    try { const avatar = await avatarAdapter.pickDataUrl(); setDraft((current) => current ? { ...current, avatar } : current) }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '头像处理失败') }
  }
  const save = async () => {
    if (!draft || saving) return
    const name = draft.name.trim()
    const bio = draft.bio.trim()
    if (name.length < 2 || name.length > 24) return feedbackAdapter.toast('昵称长度应为 2–24 个字符')
    if (bio.length > 160) return feedbackAdapter.toast('个人简介不能超过 160 个字符')
    setSaving(true)
    try {
      await demoRepository.updateProfile({ ...draft, name, bio })
      await feedbackAdapter.toast('个人资料已保存')
      await navigationAdapter.switchTab('/pages/profile/index')
    } catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '个人资料保存失败') }
    finally { setSaving(false) }
  }

  if (!user || !draft) return <AppShell title='编辑个人资料' back backTo='/pages/profile/index' noNav className='profile-edit-page'><View className='inline-loading'>托比正在准备个人资料…</View></AppShell>
  return <AppShell title='编辑个人资料' back backTo='/pages/profile/index' noNav className='profile-edit-page'>
    <View className='profile-edit-intro'><View className='profile-avatar-editor'><Avatar user={{ ...user, avatar: draft.avatar }} size={92} /><View><Button className='secondary-button' onClick={chooseAvatar}><Glyph name='camera' /> 更换头像</Button>{draft.avatar && <Button className='profile-avatar-clear' onClick={() => setDraft({ ...draft, avatar: undefined })}>移除头像</Button>}</View></View><Text>完善资料，让校友更放心地和你交易。</Text></View>
    <View className='profile-edit-card'><View className='profile-edit-field'><Text>昵称</Text><Input id='e2e-profile-name' maxlength={24} value={draft.name} onInput={(event) => setDraft({ ...draft, name: event.detail.value })} /><Text className='profile-char-count'>{draft.name.length}/24</Text></View><View className='profile-edit-field'><Text>校区</Text><Picker mode='selector' range={campuses} value={Math.max(0, campuses.indexOf(draft.campus))} onChange={(event) => setDraft({ ...draft, campus: campuses[Number(event.detail.value)] })}><View className='select-control'>{draft.campus}校区</View></Picker></View><View className='profile-edit-field'><Text>个人简介</Text><Textarea maxlength={160} value={draft.bio} onInput={(event) => setDraft({ ...draft, bio: event.detail.value })} placeholder='介绍一下自己、常交易的校区或偏好的书籍' /><Text className='profile-char-count'>{draft.bio.length}/160</Text></View></View>
    <View className='profile-edit-notice'><Glyph name='shield' /><View><Text>校园身份已认证</Text><Text>学号与认证信息不会公开展示。</Text></View></View>
    <Button id='e2e-profile-save' className='primary-button profile-save' disabled={saving} onClick={save}>{saving ? '保存中…' : '保存个人资料'}</Button>
  </AppShell>
}
