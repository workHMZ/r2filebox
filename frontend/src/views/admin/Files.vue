<template>
  <div class="files-container">
    <el-card shadow="never" class="files-card">
      <div class="card-header">
        <div class="header-title">
          <h2>{{ t('files.title') }}</h2>
          <p>{{ t('files.subtitle') }}</p>
        </div>
        <el-button @click="fetchFiles" :loading="loading" class="refresh-btn">
          <el-icon><Refresh /></el-icon>
          {{ t('common.refreshData') }}
        </el-button>
      </div>

      <el-divider />

      <el-table 
        :data="filesList" 
        v-loading="loading"
        class="files-table"
      >
        <el-table-column :label="t('files.fileInfo')" min-width="250">
          <template #default="{ row }">
            <div class="file-info">
              <div class="file-icon">
                <el-icon size="32" :color="getFileIconColor(row)">
                  <component :is="getFileIcon(row)" />
                </el-icon>
              </div>
              <div class="file-details">
                <div class="file-name">
                  {{ row.uuid_file_name || row.code }}
                </div>
                <div class="file-code">
                  <el-tag size="small" type="info">
                    {{ row.code }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="size" :label="t('common.size')" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" effect="plain">
              {{ formatFileSize(row.size) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('files.uploadType')" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.text ? 'success' : 'primary'" effect="light">
              <el-icon><component :is="row.text ? 'Document' : 'Picture'" /></el-icon>
              {{ row.text ? t('common.text') : t('common.file') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="used_count" :label="t('files.downloads')" width="100" align="center">
          <template #default="{ row }">
            <div class="download-count">
              <el-icon><Download /></el-icon>
              {{ row.used_count || 0 }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="CreatedAt" :label="t('files.createdAt')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.CreatedAt) }}
          </template>
        </el-table-column>

        <el-table-column prop="expired_at" :label="t('files.expiredAt')" width="180">
          <template #default="{ row }">
            <div :class="['expire-time', { expired: isExpired(row.expired_at) }]">
              {{ formatDate(row.expired_at) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('files.actions')" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              type="danger"
              size="small"
              @click="deleteFile(row)"
              round
            >
              <el-icon><Delete /></el-icon>
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Refresh, Document, Picture, Download, Delete,
  VideoPlay, Headset, Reading
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { getLocaleTag, useI18n } from '@/i18n'

const loading = ref(false)
const filesList = ref<any[]>([])
const { t, locale } = useI18n()

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
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

const isExpired = (dateStr: string): boolean => {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date()
  } catch {
    return false
  }
}

const getFileIcon = (row: any) => {
  const filename = row.uuid_file_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const iconMap: Record<string, any> = {
    'jpg': Picture,
    'jpeg': Picture,
    'png': Picture,
    'gif': Picture,
    'mp4': VideoPlay,
    'mp3': Headset,
    'txt': Reading,
    'pdf': Document
  }
  
  return iconMap[ext || ''] || Document
}

const getFileIconColor = (row: any) => {
  const filename = row.uuid_file_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const colorMap: Record<string, string> = {
    'jpg': '#409eff',
    'jpeg': '#409eff',
    'png': '#409eff',
    'gif': '#409eff',
    'mp4': '#67c23a',
    'mp3': '#e6a23c',
    'txt': '#909399',
    'pdf': '#f56c6c'
  }
  
  return colorMap[ext || ''] || '#606266'
}

const fetchFiles = async () => {
  loading.value = true
  try {
    const res = await adminApi.getFiles({
      page: pagination.page,
      page_size: pagination.pageSize
    })
    
    if (res.code === 200) {
      if (res.data && Array.isArray(res.data.list)) {
        filesList.value = res.data.list
        pagination.total = res.data.total || res.data.list.length
      } else if (res.data && Array.isArray(res.data.items)) {
        filesList.value = res.data.items
        pagination.total = res.data.total || res.data.items.length
      } else if (Array.isArray(res.data)) {
        filesList.value = res.data
        pagination.total = res.data.length
      } else {
        filesList.value = []
        pagination.total = 0
      }
    }
  } catch (error) {
    console.error('Failed to load files:', error)
    ElMessage.error(t('files.fetchFailed'))
  } finally {
    loading.value = false
  }
}

const deleteFile = async (file: any) => {
  try {
    await ElMessageBox.confirm(
      t('files.deleteConfirm', { name: file.uuid_file_name || file.code }),
      t('files.deleteTitle'),
      { 
        type: 'warning',
        confirmButtonText: t('files.deleteConfirmButton'),
        cancelButtonText: t('common.cancel')
      }
    )
    
    // 使用 code 而不是 ID
    const res = await adminApi.deleteFileByCode(file.code)
    if (res.code === 200) {
      ElMessage.success(t('files.deleteDone'))
      await fetchFiles()
    } else {
      ElMessage.error(res.message || t('files.deleteFailed'))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('files.deleteFailed'))
    }
  }
}

const handleSizeChange = () => {
  pagination.page = 1
  fetchFiles()
}

const handleCurrentChange = () => {
  fetchFiles()
}

onMounted(() => {
  fetchFiles()
})
</script>

<style scoped>
.files-container {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.files-card {
  border-radius: 16px;
  border: none;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title h2 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
  color: #1a1f3a;
}

.header-title p {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.refresh-btn {
  border-radius: 10px;
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
  color: #ffffff;
  transition: all 0.3s;
}

.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.18);
}

.files-table {
  margin-top: 20px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.file-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-details {
  flex: 1;
}

.file-name {
  font-weight: 600;
  color: #1a1f3a;
  margin-bottom: 6px;
  font-size: 15px;
}

.file-code {
  display: flex;
  gap: 8px;
}

.anonymous {
  color: #909399;
  font-size: 14px;
}

.download-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 600;
  color: var(--primary-color);
}

.expire-time {
  color: #606266;
}

.expire-time.expired {
  color: #f56c6c;
  font-weight: 600;
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

:deep(.el-table) {
  border-radius: 12px;
  overflow: hidden;
}

:deep(.el-table th) {
  background: #fafafa !important;
  font-weight: 600;
  color: #1a1f3a;
}

:deep(.el-table td) {
  padding: 16px 0;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: #fafafa;
}
</style>
