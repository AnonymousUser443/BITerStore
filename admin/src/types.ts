export type View = 'dashboard' | 'users' | 'listings' | 'reports' | 'feedback' | 'audit'
export type AdminRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'
export type TargetType = 'USER' | 'LISTING' | 'REPORT'

export interface AdminIdentity {
  id: string
  nickname: string
  role: AdminRole
  campusStatus?: string
}

export interface SecurityStatus {
  user: AdminIdentity
  totpEnabled: boolean
}

export interface ElevatedSession {
  accessToken: string
  expiresIn: number
  user: AdminIdentity
}

export interface TotpSetup {
  secret: string
  otpauthUrl: string
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface Metrics {
  users: number
  activeUsers: number
  newUsers: number
  listings: number
  activeListings: number
  newListings: number
  sold: number
  openReports: number
  generatedAt: string
}

export interface UserRow {
  id: string
  studentNumber?: string | null
  nickname: string
  avatarUrl?: string | null
  campus?: string | null
  role: 'USER' | AdminRole
  status: string
  campusStatus: string
  adminTotpEnabled: boolean
  createdAt: string
  updatedAt: string
  lastSeenAt?: string | null
  recentAccess: Array<{
    platform: string
    device?: string | null
    lastSeenAt: string
    active: boolean
  }>
  _count: { listings: number; reports: number }
}

export interface ListingRow {
  id: string
  title: string
  author: string
  isbn: string
  category: string
  priceCents: number
  campus: string
  status: string
  moderationDecision?: 'IGNORE' | 'BLOCKED' | null
  viewCount: number
  createdAt: string
  seller: { id: string; nickname: string; status: string }
  images: Array<{ id: string; role: string; sortOrder: number }>
  _count: { favorites: number; conversations: number }
}

export interface ReportRow {
  id: string
  targetType: string
  targetId: string
  reason: string
  evidence?: string | null
  status: string
  assigneeId?: string | null
  resolution?: string | null
  createdAt: string
  updatedAt: string
  reporter: { id: string; nickname: string }
  target?: { label: string; status: string } | null
}

export interface FeedbackRow {
  id: string
  type: 'BUG' | 'SUGGESTION'
  content: string
  platform: 'H5' | 'WEAPP'
  createdAt: string
  user: { id: string; studentNumber?: string | null; nickname: string; campus?: string | null }
}

export interface AuditRow {
  id: string
  action: string
  resourceType: string
  resourceId?: string | null
  requestId: string
  metadata?: { reason?: string } | null
  ip?: string | null
  createdAt: string
  actor?: { id: string; nickname: string; role: string } | null
}

export interface PendingAction {
  targetType: TargetType
  targetId: string
  targetLabel: string
  action: string
  actionLabel: string
  tone?: 'danger' | 'normal'
}
