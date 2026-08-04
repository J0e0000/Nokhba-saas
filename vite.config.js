import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon-64.png', 'logo-icon.png'],
      manifest: {
        name: 'النخبة — نظام إدارة ذكي',
        short_name: 'النخبة',
        description: 'نظام إدارة ذكي للمدرسين والطلاب',
        theme_color: '#0E2954',
        background_color: '#F8FAFC',
        display: 'standalone',
        dir: 'rtl',
        lang: 'ar',
        icons: [
          { src: 'favicon-64.png', sizes: '64x64', type: 'image/png' },
          { src: 'logo-icon.png', sizes: '706x527', type: 'image/png' },
        ],
      },
      workbox: {
        // يخزّن الواجهة كاملة (HTML/CSS/JS/خطوط/أيقونات) عشان تفتح وتبان بنفس الشكل من غير إنترنت
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // مهم جدًا: بيخلي أي نسخة جديدة من الموقع تتفعّل فورًا بدل ما تستنى كل تابات
        // النسخة القديمة تتقفل — من غيرهم المتصفح ممكن يفضل شغّال على نسخة قديمة
        // متجمدة إلى ما لا نهاية حتى بعد ما نرفع تحديثات جديدة
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // خطوط Google (Cairo) — تُحفظ بعد أول تحميل عشان تشتغل أوفلاين بعد كده
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        // بيانات Supabase الحية (API) متتخزنش هنا عمدًا — دي مش أصول ثابتة، والنظام
        // مش بيعمل مزامنة بيانات أوفلاين كاملة في النسخة دي
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
})
