export default defineAppConfig({
  entryPagePath: 'pages/startup/index',
  pages: [
    'pages/startup/index', 'pages/welcome/index', 'pages/onboarding/index', 'pages/home/index',
    'pages/search/index', 'pages/publish/index', 'pages/messages/index',
    'pages/profile/index', 'pages/listing/detail', 'pages/notification/detail',
    'pages/chat/index', 'pages/favorites/index', 'pages/my-listings/index',
    'pages/states/index'
  ],
  window: { navigationStyle: 'custom', backgroundColor: '#f7f4ea', backgroundTextStyle: 'dark' },
  tabBar: {
    custom: true, color: '#7f846f', selectedColor: '#4f5940', backgroundColor: '#fffdf7',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/search/index', text: '搜索' },
      { pagePath: 'pages/publish/index', text: '发布' },
      { pagePath: 'pages/messages/index', text: '消息' },
      { pagePath: 'pages/profile/index', text: '我的' }
    ]
  }
})
