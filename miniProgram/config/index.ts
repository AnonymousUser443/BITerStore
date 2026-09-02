import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseDotenv } from 'dotenv'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

const assetPerformanceBudget = 384 * 1024
const h5EntrypointPerformanceBudget = 400 * 1024
const miniEntrypointPerformanceBudget = 640 * 1024
const productionBitLoginUrl = 'https://store.young581.com/bit-login'

function readEnvironmentFile(file: string): Record<string, string> {
  return fs.existsSync(file) ? parseDotenv(fs.readFileSync(file)) : {}
}

function buildEnvironment(): Record<string, string> {
  const mode = process.env.NODE_ENV || 'production'
  const modeEnvironment = readEnvironmentFile(path.resolve(__dirname, `../.env.${mode}`))
  const weappEnvironment = process.env.TARO_ENV === 'weapp'
    ? readEnvironmentFile(path.resolve(__dirname, '../.env.weapp.local'))
    : {}
  return { ...modeEnvironment, ...weappEnvironment, ...process.env } as Record<string, string>
}

export default defineConfig<'webpack5'>(async (merge) => {
  const environment = buildEnvironment()
  const isE2E = environment.BITERSTORE_E2E === '1'
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'BITerStore', date: '2026-08-26', designWidth: 390,
    deviceRatio: { 390: 2, 750: 1 }, sourceRoot: 'src', outputRoot: 'dist',
    framework: 'react',
    compiler: { type: 'webpack5', prebundle: { exclude: ['lucide-react'] } },
    cache: { enable: true },
    defineConstants: {
      __BITERSTORE_E2E__: JSON.stringify(isE2E),
      __API_URL__: JSON.stringify(isE2E ? '' : (environment.BITERSTORE_API_URL || '').replace(/\/$/, '')),
      __BIT_LOGIN_URL__: JSON.stringify((environment.BIT_LOGIN_URL || productionBitLoginUrl).replace(/\/$/, ''))
    },
    copy: { patterns: [{ from: 'src/assets', to: 'dist/assets' }, { from: 'src/hosting/_redirects', to: 'dist' }], options: {} },
    mini: {
      postcss: { pxtransform: { enable: true, config: {} }, cssModules: { enable: false } },
      webpackChain(chain) {
        chain.performance
          .maxAssetSize(assetPerformanceBudget)
          .maxEntrypointSize(miniEntrypointPerformanceBudget)
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    h5: {
      publicPath: '/', staticDirectory: 'static',
      cssLoaderOption: {
        // Golden Reference uses public-root asset URLs. Keep those URLs intact
        // so the copied /assets bundle remains the single source of truth.
        url: { filter: (url: string) => !url.startsWith('/') }
      },
      router: {
        mode: 'browser',
        customRoutes: {
          '/pages/welcome/index': '/welcome', '/pages/onboarding/index': '/onboarding', '/pages/login/index': '/login',
          '/pages/home/index': '/home', '/pages/search/index': ['/search', '/category'],
          '/pages/listing/detail': '/books', '/pages/publish/index': '/publish',
          '/pages/messages/index': '/messages', '/pages/notification/detail': '/notifications', '/pages/chat/index': '/chat',
          '/pages/profile/index': '/profile', '/pages/favorites/index': '/favorites',
          '/pages/my-listings/index': '/my-listings', '/pages/states/index': '/states'
        }
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: process.env.NODE_ENV === 'production' ? 'css/[name].[contenthash:8].css' : 'css/[name].css',
        chunkFilename: process.env.NODE_ENV === 'production' ? 'css/[id].[contenthash:8].css' : 'css/[id].css'
      },
      postcss: { htmltransform: { enable: false }, pxtransform: { enable: false, config: {} }, autoprefixer: { enable: true, config: {} }, cssModules: { enable: false } },
      webpackChain(chain) {
        chain.performance
          .maxAssetSize(assetPerformanceBudget)
          .maxEntrypointSize(h5EntrypointPerformanceBudget)
        if (process.env.NODE_ENV === 'production') {
          chain.output
            .filename('js/[name].[contenthash:8].js')
            .chunkFilename('chunk/[name].[contenthash:8].js')
          chain.optimization.splitChunks({
            cacheGroups: {
              goldenReference: {
                name: 'golden-reference',
                test: /[\\/]web[\\/]app[\\/]/,
                chunks: 'async',
                enforce: true,
                priority: 30,
                reuseExistingChunk: true
              }
            }
          })
        }
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
