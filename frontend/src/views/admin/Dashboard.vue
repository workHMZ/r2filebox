<template>
  <div class="dashboard-container">
    <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ loading ? t('common.loading') : '' }}
    </p>
    <div class="stats-grid" :aria-busy="loading">
      <div class="stat-card stat-card--teal">
        <div class="stat-icon"><el-icon><Monitor /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ animatedStats.activeShares }}</div>
          <div class="stat-label">{{ t('dashboard.activeShares') }}</div>
        </div>
      </div>

      <div class="stat-card stat-card--blue">
        <div class="stat-icon"><el-icon><Folder /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ animatedStats.fileCount }}</div>
          <div class="stat-label">{{ t('dashboard.fileShares') }}</div>
        </div>
      </div>

      <div class="stat-card stat-card--slate">
        <div class="stat-icon"><el-icon><Document /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ animatedStats.textShares }}</div>
          <div class="stat-label">{{ t('dashboard.textShares') }}</div>
        </div>
      </div>

      <div class="stat-card stat-card--green">
        <div class="stat-icon"><el-icon><Coin /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ formatFileSize(stats.totalStorage) }}</div>
          <div class="stat-label">{{ t('dashboard.totalStorage') }}</div>
        </div>
      </div>

      <div class="stat-card stat-card--orange">
        <div class="stat-icon"><el-icon><TrendCharts /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ animatedStats.todayUploads }} / {{ animatedStats.totalDownloads }}</div>
          <div class="stat-label">{{ t('dashboard.todayTransfer') }}</div>
        </div>
      </div>

      <div class="stat-card stat-card--red">
        <div class="stat-icon"><el-icon><Delete /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ animatedStats.expiredShares }}</div>
          <div class="stat-label">{{ t('dashboard.expiredShares') }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="24" class="charts-row" :aria-busy="loading">
      <el-col :xs="24" :lg="14">
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-header">
              <h3>{{ t('dashboard.uploadTrend') }}</h3>
              <el-tag type="info">{{ t('dashboard.realtime') }}</el-tag>
            </div>
          </template>
          <div class="chart-container">
            <template v-if="trendAccessibleData.length">
              <div class="visual-chart" aria-hidden="true">
                <Line :data="trendData" :options="trendOptions" />
              </div>
              <div class="sr-only">
                <table>
                  <caption>{{ t('dashboard.uploadTrend') }}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{{ t('a11y.period') }}</th>
                      <th scope="col">{{ t('dashboard.uploads') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in trendAccessibleData" :key="item.date">
                      <td><time :datetime="item.date">{{ formatChartDate(item.date) }}</time></td>
                      <td>{{ item.uploads }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <el-empty v-else :description="t('dashboard.noTrend')" />
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :lg="10">
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-header">
              <h3>{{ t('dashboard.fileTypes') }}</h3>
              <el-tag type="info">{{ t('dashboard.realtime') }}</el-tag>
            </div>
          </template>
          <div class="chart-container doughnut-container">
            <template v-if="typeAccessibleData.length">
              <div class="visual-chart" aria-hidden="true">
                <Doughnut :data="typeData" :options="typeOptions" />
              </div>
              <div class="sr-only">
                <table>
                  <caption>{{ t('dashboard.fileTypes') }}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{{ t('a11y.category') }}</th>
                      <th scope="col">{{ t('a11y.count') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in typeAccessibleData" :key="item.label">
                      <td>{{ item.label }}</td>
                      <td>{{ item.count }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <el-empty v-else :description="t('dashboard.noTypes')" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" class="recent-row" :aria-busy="loading">
      <el-col :span="24">
        <el-card class="recent-card" shadow="never">
          <template #header>
            <div class="card-header">
              <h3>
                <el-icon><Folder /></el-icon>
                {{ t('dashboard.recentFiles') }}
              </h3>
              <el-button text type="primary" @click="$router.push('/admin/files')">
                {{ t('common.viewAll') }}
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table 
            :data="recentFiles" 
            size="small"
            v-loading="loading"
            :aria-busy="loading"
            table-layout="auto"
            :scrollbar-tabindex="0"
            :header-cell-style="{ background: 'transparent', fontWeight: '600' }"
          >
            <el-table-column prop="filename" :label="t('dashboard.fileName')" show-overflow-tooltip />
            <el-table-column prop="file_size" :label="t('common.size')" width="120">
              <template #default="{ row }">
                <el-tag type="info" size="small">
                  {{ formatFileSize(row.file_size) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" :label="t('dashboard.uploadTime')" width="200">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, reactive, onBeforeUnmount, onMounted, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { 
  Folder, Coin, TrendCharts, ArrowRight, Document, Monitor, Delete 
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js'
import { Line, Doughnut } from 'vue-chartjs'
import { useTheme } from '@/composables/useTheme'
import { getLocaleTag, useI18n } from '@/i18n'
import { formatDateTime, formatFileSize } from '@/utils/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
)

const loading = ref(false)
const { t, locale } = useI18n()
const { isDark } = useTheme()
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
let animationFrame: number | null = null

const stats = reactive({
  activeShares: 0,
  fileCount: 0,
  textShares: 0,
  totalStorage: 0,
  todayUploads: 0,
  totalDownloads: 0,
  expiredShares: 0
})

const animatedStats = reactive({
  activeShares: 0,
  fileCount: 0,
  textShares: 0,
  todayUploads: 0,
  totalDownloads: 0,
  expiredShares: 0
})

interface RecentFile {
  filename: string
  file_size: number
  created_at: string
}

const recentFiles = ref<RecentFile[]>([])

interface TrendDataPoint {
  date: string
  uploads: number
}

interface TypeDataPoint {
  label: string
  count: number
}

const trendAccessibleData = ref<TrendDataPoint[]>([])
const typeAccessibleData = ref<TypeDataPoint[]>([])

interface ChartThemeColors {
  primary: string
  areaFill: string
  pointBackground: string
  grid: string
  textPrimary: string
  textRegular: string
  textSecondary: string
  border: string
  tooltipBackground: string
  series: string[]
}

const fallbackChartTheme = (dark: boolean): ChartThemeColors => ({
  primary: dark ? '#55d1c8' : '#086f68',
  areaFill: dark ? 'rgba(85, 209, 200, 0.18)' : 'rgba(8, 111, 104, 0.12)',
  pointBackground: dark ? '#162128' : '#ffffff',
  grid: dark ? 'rgba(213, 228, 231, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  textPrimary: dark ? '#edf5f6' : '#182229',
  textRegular: dark ? '#d3e0e3' : '#34434d',
  textSecondary: dark ? '#a7b8bf' : '#5f7079',
  border: dark ? '#2a3941' : '#dce4e8',
  tooltipBackground: dark ? '#1b272e' : '#ffffff',
  series: dark
    ? ['#55d1c8', '#75a7ff', '#f7b267', '#62d58b', '#a7b8bf', '#ff8181']
    : ['#086f68', '#2563eb', '#f6821f', '#20824a', '#64748b', '#c33a3a'],
})

const chartTheme = ref<ChartThemeColors>(fallbackChartTheme(isDark.value))

const readThemeColor = (styles: CSSStyleDeclaration, name: string, fallback: string) => {
  return styles.getPropertyValue(name).trim() || fallback
}

const readChartTheme = (): ChartThemeColors => {
  const fallback = fallbackChartTheme(isDark.value)
  if (typeof window === 'undefined') return fallback

  const styles = window.getComputedStyle(document.documentElement)
  return {
    primary: readThemeColor(styles, '--primary-color', fallback.primary),
    areaFill: readThemeColor(styles, '--chart-area-fill', fallback.areaFill),
    pointBackground: readThemeColor(styles, '--surface-card-solid', fallback.pointBackground),
    grid: readThemeColor(styles, '--chart-grid', fallback.grid),
    textPrimary: readThemeColor(styles, '--text-primary', fallback.textPrimary),
    textRegular: readThemeColor(styles, '--text-regular', fallback.textRegular),
    textSecondary: readThemeColor(styles, '--text-secondary', fallback.textSecondary),
    border: readThemeColor(styles, '--border-subtle', fallback.border),
    tooltipBackground: readThemeColor(styles, '--surface-overlay', fallback.tooltipBackground),
    series: [
      readThemeColor(styles, '--primary-color', fallback.series[0]!),
      readThemeColor(styles, '--info-color', fallback.series[1]!),
      readThemeColor(styles, '--accent-color', fallback.series[2]!),
      readThemeColor(styles, '--success-color', fallback.series[3]!),
      readThemeColor(styles, '--text-secondary', fallback.series[4]!),
      readThemeColor(styles, '--danger-color', fallback.series[5]!),
    ],
  }
}

// Chart Data
const trendData = reactive({
  labels: [] as string[],
  datasets: [
    {
      label: t('dashboard.uploads'),
      backgroundColor: chartTheme.value.areaFill,
      borderColor: chartTheme.value.primary,
      pointBackgroundColor: chartTheme.value.pointBackground,
      pointBorderColor: chartTheme.value.primary,
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      data: [] as number[]
    }
  ]
})

const trendOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
      backgroundColor: chartTheme.value.tooltipBackground,
      titleColor: chartTheme.value.textPrimary,
      bodyColor: chartTheme.value.textRegular,
      borderColor: chartTheme.value.border,
      borderWidth: 1,
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        color: chartTheme.value.textSecondary,
      },
      grid: {
        color: chartTheme.value.grid,
      },
      border: {
        color: chartTheme.value.border,
      },
    },
    x: {
      ticks: {
        color: chartTheme.value.textSecondary,
      },
      grid: {
        display: false
      },
      border: {
        color: chartTheme.value.border,
      },
    }
  }
}))

const typeData = reactive({
  labels: [] as string[],
  datasets: [
    {
      backgroundColor: [...chartTheme.value.series],
      data: [] as number[]
    }
  ]
})

const typeOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        usePointStyle: true,
        padding: 20,
        color: chartTheme.value.textSecondary,
      }
    },
    tooltip: {
      backgroundColor: chartTheme.value.tooltipBackground,
      titleColor: chartTheme.value.textPrimary,
      bodyColor: chartTheme.value.textRegular,
      borderColor: chartTheme.value.border,
      borderWidth: 1,
    }
  },
  cutout: '65%'
}))

const applyChartTheme = () => {
  chartTheme.value = readChartTheme()
  const colors = chartTheme.value
  const trendDataset = trendData.datasets[0]!
  trendDataset.backgroundColor = colors.areaFill
  trendDataset.borderColor = colors.primary
  trendDataset.pointBackgroundColor = colors.pointBackground
  trendDataset.pointBorderColor = colors.primary
  typeData.datasets[0]!.backgroundColor = [...colors.series]
}

watch(isDark, async () => {
  await nextTick()
  applyChartTheme()
}, { immediate: true, flush: 'post' })

const formatDate = (dateStr: string): string => {
  return formatDateTime(dateStr, getLocaleTag(locale.value))
}

const formatChartDate = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    if (!year || !month || !day) return dateStr
    return new Date(year, month - 1, day).toLocaleDateString(getLocaleTag(locale.value), {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

const animateStats = () => {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  const keys = Object.keys(animatedStats) as Array<keyof typeof animatedStats>
  if (prefersReducedMotion.value) {
    for (const key of keys) animatedStats[key] = stats[key]
    return
  }
  const duration = 1000
  const startedAt = performance.now()
  const update = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration)
    for (const key of keys) animatedStats[key] = Math.floor(stats[key] * progress)
    if (progress < 1) animationFrame = requestAnimationFrame(update)
    else animationFrame = null
  }
  animationFrame = requestAnimationFrame(update)
}

const fetchDashboardStats = async () => {
  try {
    const res = await adminApi.getDashboardStats()
    if (res.code === 200 && res.data) {
      stats.activeShares = res.data.active_shares || 0
      stats.fileCount = res.data.total_files || 0
      stats.textShares = res.data.text_shares || 0
      stats.totalStorage = res.data.total_size || 0
      stats.todayUploads = res.data.today_uploads || 0
      stats.totalDownloads = res.data.total_downloads || 0
      stats.expiredShares = res.data.expired_shares || 0

      animateStats()
    }
  } catch (error) {
    console.error('获取统计信息失败:', error)
  }
}

const fetchCharts = async () => {
  try {
    const [trendRes, typeRes] = await Promise.all([
      adminApi.getUploadTrend(7),
      adminApi.getFileTypeDistribution(),
    ])
    if (trendRes.code === 200 && trendRes.data) {
      trendAccessibleData.value = trendRes.data.map((item) => ({
        date: item.date,
        uploads: item.uploads
      }))
      trendData.labels = trendAccessibleData.value.map((item) => item.date.substring(5))
      trendData.datasets[0]!.data = trendAccessibleData.value.map((item) => item.uploads)
    }

    if (typeRes.code === 200 && typeRes.data) {
      typeAccessibleData.value = typeRes.data.map((item) => ({
        label: item.mime_type || t('common.unknown'),
        count: item.count
      }))
      typeData.labels = typeAccessibleData.value.map((item) => item.label)
      typeData.datasets[0]!.data = typeAccessibleData.value.map((item) => item.count)
    }
  } catch (error) {
    console.error('获取图表数据失败:', error)
  }
}

watch(locale, () => {
  trendData.datasets[0]!.label = t('dashboard.uploads')
})

const fetchRecentFiles = async () => {
  try {
    const res = await adminApi.getRecentFiles()
    if (res.code === 200) {
      if (res.data && Array.isArray(res.data.items)) {
        recentFiles.value = res.data.items.slice(0, 5).map((file) => ({
          filename: file.display_name || file.id,
          file_size: file.size_bytes,
          created_at: file.created_at,
        }))
      } else {
        recentFiles.value = []
      }
    }
  } catch (error) {
    console.error('获取最新文件失败:', error)
    recentFiles.value = []
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchDashboardStats(),
      fetchCharts(),
      fetchRecentFiles(),
    ])
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
})
</script>

<style scoped>
.dashboard-container {
  animation: fadeIn 0.28s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.stats-grid {
  display: grid;
  margin-bottom: 24px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  display: flex;
  min-width: 0;
  min-height: 116px;
  padding: 20px;
  align-items: center;
  gap: 15px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background: var(--surface-card-solid);
  color: var(--text-primary);
  box-shadow: var(--glass-shadow);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.stat-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--glass-shadow-lg);
}

.stat-icon {
  display: inline-flex;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  font-size: 21px;
}

.stat-card--teal .stat-icon { background: var(--primary-soft); color: var(--primary-color); }
.stat-card--blue .stat-icon { background: var(--info-soft); color: var(--info-color); }
.stat-card--slate .stat-icon { background: var(--primary-soft); color: var(--primary-active); }
.stat-card--green .stat-icon { background: var(--success-soft); color: var(--success-color); }
.stat-card--orange .stat-icon { background: var(--warning-soft); color: var(--warning-color); }
.stat-card--red .stat-icon { background: var(--danger-soft); color: var(--danger-color); }

.stat-content { min-width: 0; }

.stat-value {
  overflow: hidden;
  margin-bottom: 3px;
  color: var(--text-primary);
  font-size: 25px;
  font-weight: 740;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.charts-row {
  margin-bottom: 24px;
}

.chart-card {
  height: 100%;
  border-color: var(--border-subtle) !important;
  background: var(--surface-card-solid) !important;
  color: var(--text-primary) !important;
  box-shadow: var(--glass-shadow) !important;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

.chart-container {
  position: relative;
  height: 280px;
  width: 100%;
  color: var(--text-regular);
}

.visual-chart {
  width: 100%;
  height: 100%;
}


.doughnut-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.recent-row {
  margin-bottom: 24px;
}

.recent-card {
  overflow: hidden;
  border-color: var(--border-subtle) !important;
  background: var(--surface-card-solid) !important;
  color: var(--text-primary) !important;
  box-shadow: var(--glass-shadow) !important;
}

.chart-card :deep(.el-card__header),
.chart-card :deep(.el-card__body),
.recent-card :deep(.el-card__header),
.recent-card :deep(.el-card__body) {
  background: transparent;
  color: inherit;
}

.recent-card :deep(.el-table) {
  background: transparent !important;
  color: var(--text-regular) !important;
}

:deep(.el-card__header) {
  border-bottom: 1px solid var(--border-subtle);
  padding: 16px 20px;
}

:deep(.el-card__body) {
  padding: 20px;
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts-row :deep(.el-col + .el-col) {
    margin-top: 20px;
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .stat-card {
    min-height: 92px;
    padding: 16px;
  }

  .stat-value {
    font-size: 22px;
  }

  .chart-container {
    height: 240px;
  }
}

</style>
