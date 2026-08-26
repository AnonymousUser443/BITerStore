import type { ListingAIDraft, PublishDraft } from './types'

export interface ListingAssistant { generate(input: Partial<PublishDraft>): Promise<ListingAIDraft> }
export const listingAssistant: ListingAssistant = {
  async generate(input) {
    const course = input.course?.trim() || '课程学习'
    const condition = input.condition || '八成新'
    return {
      title: input.title?.trim() || `${course}教材｜${condition}`,
      description: `${condition}，适合${course}学习与期末复习。支持校内当面验书，有需要可以直接留言。`,
      tags: Array.from(new Set([course, condition, '校内自取']))
    }
  }
}
