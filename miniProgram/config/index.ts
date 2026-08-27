import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

const assetPerformanceBudget = 384 * 1024
const entrypointPerformanceBudget = 640 * 1024

export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'BITerStore', date: '2026-08-26', designWidth: 390,
    deviceRatio: { 390: 2, 750: 1 }, sourceRoot: 'src', outputRoot: 'dist',
    framework: 'react',
    compiler: { type: 'webpack5', prebundle: { exclude: ['lucide-react'] } },
    cache: { enable: true },
    defineConstants: { __BITERSTORE_E2E__: JSON.stringify(process.env.BITERSTORE_E2E === '1') },
    copy: { patterns: [{ from: 'src/assets', to: 'dist/assets' }, { from: 'src/hosting/_redirects', to: 'dist' }], options: {} },
    mini: {
      postcss: { pxtransform: { enable: true, config: {} }, cssModules: { enable: false } },
      webpackChain(chain) {
        chain.performance
          .maxAssetSize(assetPerformanceBudget)
          .maxEntrypointSize(entrypointPerformanceBudget)
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
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
      postcss: { htmltransform: { enable: false }, pxtransform: { enable: false, config: {} }, autoprefixer: { enable: true, config: {} }, cssModules: { enable: false } },
      webpackChain(chain) {
        chain.performance
          .maxAssetSize(assetPerformanceBudget)
          .maxEntrypointSize(entrypointPerformanceBudget)
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        chain.module.rule('script').include.add(path.resolve(__dirname, '../../web/app'))
        chain.resolve.alias
          .set('next/image', path.resolve(__dirname, '../src/h5/next-image.tsx'))
          .set('lucide-react$', path.resolve(__dirname, '../src/h5/lucide-react.ts'))
          .set('react', path.resolve(__dirname, '../node_modules/react'))
          .set('react-dom', path.resolve(__dirname, '../node_modules/react-dom'))
      }
    }
  }
  return merge({}, baseConfig, process.env.NODE_ENV === 'development' ? devConfig : prodConfig)
})
