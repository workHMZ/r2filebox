<template>
  <div class="dashboard-container">
    <!-- 统计卡片 -->
    <el-row :gutter="24" class="stats-row">
      <el-col :span="8">
        <div class="stat-card gradient-blue">
          <div class="stat-icon">
            <el-icon size="32"><Monitor /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.activeShares }}</div>
            <div class="stat-label">{{ t('dashboard.activeShares') }}</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </el-col>
      
      <el-col :span="8">
        <div class="stat-card gradient-purple">
          <div class="stat-icon">
            <el-icon size="32"><Folder /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.fileCount }}</div>
            <div class="stat-label">{{ t('dashboard.fileShares') }}</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="stat-card gradient-indigo">
          <div class="stat-icon">
            <el-icon size="32"><Document /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.textShares }}</div>
            <div class="stat-label">{{ t('dashboard.textShares') }}</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="24" class="stats-row">
      <el-col :span="8">
        <div class="stat-card gradient-green">
          <div class="stat-icon">
            <el-icon size="32"><Coin /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ formatFileSize(stats.totalStorage) }}</div>
            <div class="stat-label">{{ t('dashboard.totalStorage') }}</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </el-col>
      
      <el-col :span="8">
        <div class="stat-card gradient-orange">
          <div class="stat-icon">
            <el-icon size="32"><TrendCharts /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.todayUploads }} / {{ animatedStats.todayDownloads }}</div>
            <div class="stat-label">{{ t('dashboard.todayTransfer') }}</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="stat-card gradient-red">
          <div class="stat-icon">
            <el-icon size="32"><Delete /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.expiredShares }}</div>
            <div class="stat-label">{{ t('dashboard.expiredShares') }}</div>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="24" class="charts-row">
      <el-col :span="14">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>{{ t('dashboard.uploadTrend') }}</h3>
              <el-tag type="info">{{ t('dashboard.realtime') }}</el-tag>
            </div>
          </template>
          <div class="chart-container">
            <Line v-if="trendData.labels.length" :data="trendData" :options="trendOptions" />
            <el-empty v-else :description="t('dashboard.noTrend')" />
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="10">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>{{ t('dashboard.fileTypes') }}</h3>
              <el-tag type="info">{{ t('dashboard.realtime') }}</el-tag>
            </div>
          </template>
          <div class="chart-container doughnut-container">
            <Doughnut v-if="typeData.labels.length" :data="typeData" :options="typeOptions" />
            <el-empty v-else :description="t('dashboard.noTypes')" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最新数据 -->
    <el-row :gutter="24" class="recent-row">
      <el-col :span="24">
        <el-card class="recent-card" shadow="hover">
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
import { ref, reactive, onMounted } from 'vue'
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
import { getLocaleTag, useI18n } from '@/i18n'

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

const stats = reactive({
  activeShares: 0,
  fileCount: 0,
  textShares: 0,
  totalStorage: 0,
  todayUploads: 0,
  todayDownloads: 0,
  expiredShares: 0
})

const animatedStats = reactive({
  activeShares: 0,
  fileCount: 0,
  textShares: 0,
  todayUploads: 0,
  todayDownloads: 0,
  expiredShares: 0
})

const recentFiles = ref<any[]>([])

// Chart Data
const trendData = reactive({
  labels: [] as string[],
  datasets: [
    {
      label: t('dashboard.uploads'),
      backgroundColor: 'rgba(15, 118, 110, 0.14)',
      borderColor: '#0f766e',
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#0f766e',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      data: [] as number[]
    }
  ]
})

const trendOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
      }
    },
    x: {
      grid: {
        display: false
      }
    }
  }
}

const typeData = reactive({
  labels: [] as string[],
  datasets: [
    {
      backgroundColor: [
        '#0f766e',
        '#2563eb',
        '#b45309',
        '#15803d',
        '#64748b',
        '#dc2626'
      ],
      data: [] as number[]
    }
  ]
})

const typeOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        usePointStyle: true,
        padding: 20
      }
    }
  },
  cutout: '65%'
}

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString(getLocaleTag(locale.value))
  } catch {
    return '-'
  }
}

const animateNumber = (key: keyof typeof animatedStats, target: number) => {
  const duration = 1000
  const steps = 60
  const increment = target / steps
  let current = 0
  if (target === 0) {
    animatedStats[key] = 0
    return
  }
  const timer = setInterval(() => {
    current += increment
    if (current >= target) {
      animatedStats[key] = target
      clearInterval(timer)
    } else {
      animatedStats[key] = Math.floor(current)
    }
  }, duration / steps)
}

const fetchDashboardStats = async () => {
  try {
    const res = await adminApi.getDashboardStats()
    if (res.code === 200 && res.data) {
      stats.activeShares = res.data.active_shares || 0
      stats.fileCount = res.data.total_files || 0
      stats.textShares = res.data.text_shares || 0
      stats.totalStorage = res.data.total_size || res.data.total_storage_bytes || 0
      stats.todayUploads = res.data.today_uploads || 0
      stats.todayDownloads = res.data.today_downloads || 0
      stats.expiredShares = res.data.expired_shares || 0

      animateNumber('activeShares', stats.activeShares)
      animateNumber('fileCount', stats.fileCount)
      animateNumber('textShares', stats.textShares)
      animateNumber('todayUploads', stats.todayUploads)
      animateNumber('todayDownloads', stats.todayDownloads)
      animateNumber('expiredShares', stats.expiredShares)
    }
  } catch (error) {
    console.error('获取统计信息失败:', error)
  }
}

const fetchCharts = async () => {
  try {
    // Trend
    const trendRes = await adminApi.getUploadTrend(7)
    if (trendRes.code === 200 && trendRes.data) {
      trendData.labels = trendRes.data.map((item: any) => item.date.substring(5)) // mm-dd
      trendData.datasets[0]!.data = trendRes.data.map((item: any) => item.uploads)
    }

    // Type
    const typeRes = await adminApi.getFileTypeDistribution()
    if (typeRes.code === 200 && typeRes.data) {
      typeData.labels = typeRes.data.map((item: any) => item.mime_type)
      typeData.datasets[0]!.data = typeRes.data.map((item: any) => item.count)
    }
  } catch (error) {
    console.error('获取图表数据失败:', error)
  }
}

const fetchRecentFiles = async () => {
  try {
    const res = await adminApi.getRecentFiles()
    if (res.code === 200) {
      if (res.data && Array.isArray(res.data.list)) {
        recentFiles.value = res.data.list.slice(0, 5).map((file: any) => ({
          filename: file.uuid_file_name || file.file_name || file.code,
          file_size: file.file_size || file.size || 0,
          created_at: file.CreatedAt || file.created_at || ''
        }))
      } else if (Array.isArray(res.data)) {
        recentFiles.value = res.data.slice(0, 5)
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
      fetchRecentFiles()
    ])
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard-container {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  position: relative;
  padding: 24px;
  border-radius: var(--radius-xl);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.gradient-blue { background: #eff6ff; }
.gradient-purple { background: #f0fdfa; }
.gradient-indigo { background: #f8fafc; }
.gradient-green { background: #f0fdf4; }
.gradient-orange { background: #fffbeb; }
.gradient-red { background: #fef2f2; }

.stat-icon {
  position: relative;
  z-index: 1;
  margin-bottom: 16px;
  opacity: 0.9;
}

.stat-content {
  position: relative;
  z-index: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
}

.stat-decoration {
  position: absolute;
  right: -20px;
  bottom: -20px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.charts-row {
  margin-bottom: 24px;
}

.chart-card {
  border-radius: 16px;
  border: none;
  height: 100%;
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
  color: #1a1f3a;
}

.chart-container {
  position: relative;
  height: 280px;
  width: 100%;
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
  border-radius: 16px;
  border: none;
}

:deep(.el-card__header) {
  border-bottom: 1px solid #f0f0f0;
  padding: 16px 20px;
}

:deep(.el-card__body) {
  padding: 20px;
}
</style>
