import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobileApp = readFileSync(new URL('../components/mobile-app.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

describe('authenticated Golden H5', () => {
  it('uses a dedicated profile editor page instead of a scroll-bound bottom sheet', () => {
    expect(mobileApp).toContain('function ProfileEditPage');
    expect(mobileApp).toContain("navigate('/profile/edit')");
    expect(mobileApp).not.toContain('profile-edit-layer');
    expect(styles).toContain('.profile-edit-page .content-scroll');
    expect(styles).toContain('.profile-edit-card');
  });

  it('does not show demo reset controls on the authenticated profile', () => {
    const profilePage = mobileApp.slice(mobileApp.indexOf('function ProfilePage'), mobileApp.indexOf('function ProfileEditPage'));
    expect(profilePage).not.toContain('重置演示数据');
    expect(profilePage).not.toContain('演示与状态');
  });

  it('shows the authenticated student number above the nickname', () => {
    const profilePage = mobileApp.slice(mobileApp.indexOf('function ProfilePage'), mobileApp.indexOf('function ProfileEditPage'));
    expect(profilePage).toContain('profile-student-number');
    expect(profilePage.indexOf('profile-student-number')).toBeLessThan(profilePage.indexOf('<h1>{profile.name}'));
  });

  it('uses the current seller and hides buyer actions from the publish preview', () => {
    expect(mobileApp).toContain("if (book.id === 'preview') demoRepository.getProfile()")
    expect(mobileApp).toContain("book.id !== 'preview' && <div className=\"listing-actions\"")
    expect(mobileApp).toContain("book.id === 'preview' ? '预览'")
  })

  it('shows byte-level upload progress and prevents repeated publish triggers', () => {
    expect(mobileApp).toContain('if (publishingRef.current) return')
    expect(mobileApp).toContain('正在上传并发布 ${progress}%')
    expect(styles).toContain('.toast.progress-toast progress')
  })
});
