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

  it('wires visible header controls and keeps desktop profile actions unclipped', () => {
    expect(mobileApp).toContain('aria-label="查看消息通知" onClick={() => navigate(\'/messages\')}');
    expect(mobileApp).toContain('aria-label="个人中心" onClick={() => navigate(\'/profile\')}');
    expect(mobileApp).toContain('className="topbar-menu" role="menu"');
    expect(mobileApp).toContain("notify('拍照识书正在准备中，请先输入书名或 ISBN')");
    expect(styles).toContain('.profile-menu { align-self: start; height: auto; }');
  });

  it('canonicalizes authenticated entry routes instead of rendering behind stale URLs', () => {
    expect(mobileApp).toContain("window.history.replaceState({}, '', canonicalPath)");
    expect(mobileApp).toContain("path === '/' && demoRepository.isOnboardingComplete()");
  });

  it('reflows continuously from narrow phones through ultra-wide H5 windows', () => {
    expect(styles).toContain('@media (max-width: 340px)');
    expect(styles).toContain('@media (min-width: 480px) and (max-width: 699px)');
    expect(styles).toContain('@media (orientation: landscape) and (min-width: 700px)');
    expect(styles).toContain('repeat(auto-fill, minmax(340px, 1fr))');
    expect(styles).toContain('width: min(calc(100vw - 48px), 1600px)');
    expect(styles).toContain('.profile-page .content-scroll { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
  });
});
