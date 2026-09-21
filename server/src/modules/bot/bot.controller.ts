import { Controller, Get, UseGuards } from '@nestjs/common'
import { PrismaService } from '../../infra/prisma.service.js'
import { TrafficMetricsService } from '../../infra/traffic-metrics.service.js'
import { BotGuard } from '../../common/bot-auth.js'

function shanghaiDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return new Date(`${day}T00:00:00+08:00`)
}

function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

@Controller('bot')
@UseGuards(BotGuard)
export class BotController {
  constructor(private readonly prisma: PrismaService, private readonly traffic: TrafficMetricsService) {}

  @Get('overview')
  async overview() {
    const now = new Date()
    const start = shanghaiDayStart(now)
    const [pendingReview, total, active, sold, submittedToday, approvedToday, soldToday, traffic] = await Promise.all([
      this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
      this.prisma.listing.count({ where: { deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'SOLD', deletedAt: null } }),
      this.prisma.listing.count({ where: { createdAt: { gte: start }, status: { not: 'DRAFT' }, deletedAt: null } }),
      this.prisma.listing.count({ where: { moderatedAt: { gte: start }, moderationDecision: 'ACTIVE', deletedAt: null } }),
      this.prisma.listing.count({ where: { updatedAt: { gte: start }, status: 'SOLD', deletedAt: null } }),
      this.traffic.summary(1)
    ])
    const todayTraffic = traffic.days[0] || { requests: 0, visitors: 0, observed: false }
    return {
      date: dayKey(now),
      generatedAt: now.toISOString(),
      inventory: { total, active, sold, pendingReview },
      today: {
        submitted: submittedToday,
        approved: approvedToday,
        sold: soldToday,
        requests: Number(todayTraffic.requests || 0),
        visitors: Number(todayTraffic.visitors || 0),
        trafficObserved: Boolean(todayTraffic.observed)
      }
    }
  }

  @Get('pending')
  async pending() {
    const items = await this.prisma.listing.findMany({
      where: { status: 'PENDING_REVIEW', deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Keep the newest queue entries visible so polling can discover new submissions
      // even while an older review backlog is still waiting.
      take: 100,
      select: {
        id: true, title: true, author: true, isbn: true, campus: true, createdAt: true,
        seller: { select: { nickname: true } }
      }
    })
    return { items, total: await this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }) }
  }
}
