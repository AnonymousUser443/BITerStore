export default defineAppConfig({
  entryPagePath: 'pages/startup/index',
  pages: [
    'pages/startup/index', 'pages/welcome/index', 'pages/onboarding/index', 'pages/login/index', 'pages/home/index',
    'pages/search/index', 'pages/publish/index', 'pages/messages/index',
    'pages/profile/index', 'pages/profile/edit', 'pages/listing/detail', 'pages/notification/detail',
    'pages/chat/index', 'pages/favorites/index', 'pages/my-listings/index',
    'pages/states/index'
  ],
  window: {
    navigationStyle: 'custom',
    navigationBarTitleText: 'BITerStore', navigationBarTextStyle: 'black',
    navigationBarBackgroundColor: '#fffdf8', backgroundColor: '#f7f4ea', backgroundTextStyle: 'dark'
  },
  ...(process.env.TARO_ENV === 'weapp' ? {
    lazyCodeLoading: 'requiredComponents'
  } : {})
})
