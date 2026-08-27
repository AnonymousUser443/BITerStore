export default defineAppConfig({
  entryPagePath: 'pages/startup/index',
  pages: [
    'pages/startup/index', 'pages/welcome/index', 'pages/onboarding/index', 'pages/login/index', 'pages/home/index',
    'pages/search/index', 'pages/publish/index', 'pages/messages/index',
    'pages/profile/index', 'pages/listing/detail', 'pages/notification/detail',
    'pages/chat/index', 'pages/favorites/index', 'pages/my-listings/index',
    'pages/states/index'
  ],
  window: {
    navigationBarTitleText: 'BITerStore', navigationBarTextStyle: 'black',
    navigationBarBackgroundColor: '#fffdf8', backgroundColor: '#f7f4ea', backgroundTextStyle: 'dark'
  },
  tabBar: {
    color: '#7f846f', selectedColor: '#4f5940', backgroundColor: '#fffdf7', borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '首页', iconPath: 'assets/tabbar/home-default.png', selectedIconPath: 'assets/tabbar/home-selected.png' },
      { pagePath: 'pages/search/index', text: '搜索', iconPath: 'assets/tabbar/category-default.png', selectedIconPath: 'assets/tabbar/category-selected.png' },
      { pagePath: 'pages/publish/index', text: '发布', iconPath: 'assets/tabbar/publish-default.png', selectedIconPath: 'assets/tabbar/publish-selected.png' },
      { pagePath: 'pages/messages/index', text: '消息', iconPath: 'assets/tabbar/messages-default.png', selectedIconPath: 'assets/tabbar/messages-selected.png' },
      { pagePath: 'pages/profile/index', text: '我的', iconPath: 'assets/tabbar/profile-default.png', selectedIconPath: 'assets/tabbar/profile-selected.png' }
    ]
  }
})
