import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'BITerStore', date: '2026-08-26', designWidth: 390,
    deviceRatio: { 390: 1, 750: 2 }, sourceRoot: 'src', outputRoot: 'dist',
    framework: 'react', compiler: 'webpack5', cache: { enable: true },
    defineConstants: { __BITERSTORE_E2E__: JSON.stringify(process.env.BITERSTORE_E2E === '1') },
    copy: { patterns: [{ from: 'src/assets', to: 'dist/assets' }, { from: 'src/hosting/_redirects', to: 'dist' }], options: {} },
    mini: {
      postcss: { pxtransform: { enable: true, config: {} }, cssModules: { enable: false } },
      webpackChain(chain) { chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin) }
    },
    h5: {
      publicPath: '/', staticDirectory: 'static',
      router: {
        mode: 'browser',
        customRoutes: {
          '/pages/welcome/index': '/welcome', '/pages/onboarding/index': '/onboarding',
          '/pages/home/index': '/home', '/pages/search/index': ['/search', '/category'],
          '/pages/listing/detail': '/books', '/pages/publish/index': '/publish',
          '/pages/messages/index': '/messages', '/pages/notification/detail': '/notifications', '/pages/chat/index': '/chat',
          '/pages/profile/index': '/profile', '/pages/favorites/index': '/favorites',
          '/pages/my-listings/index': '/my-listings', '/pages/states/index': '/states'
        }
      },
      miniCssExtractPluginOption: { ignoreOrder: true },
      postcss: { autoprefixer: { enable: true, config: {} }, cssModules: { enable: false } },
      webpackChain(chain) { chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin) }
    }
  }
  return merge({}, baseConfig, process.env.NODE_ENV === 'development' ? devConfig : prodConfig)
})
