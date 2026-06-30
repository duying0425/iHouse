import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  server: {
    // 避免监听 pnpm-store / node_modules 触发系统 inotify 上限 (ENOSPC)
    watch: {
      ignored: [
        '**/.pnpm-store/**',
        '**/node_modules/**',
      ],
    },
  },
  plugins: [
    // 注意：移除 'react-dev-locator' babel 插件。
    // 该插件会为每个 JSX 元素注入源码定位属性，TRAE 预览的组件定位浮层
    // 会在 DOM 变更时重新扫描这些属性。当户型图以大体积 base64 注入到
    // <image href> 时，删除区域引发的列表 diff 会让浮层 reconciliation
    // 超出最大更新深度 (React #185) 而崩溃。移除后浮层不再扫描，问题消失。
    react(),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths()
  ],
})
