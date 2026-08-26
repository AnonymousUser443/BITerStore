import type { ListingAIDraft, ListingAIInput, ListingAssistant } from '../domain/types'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class DemoListingAssistant implements ListingAssistant {
  async generate(_input: ListingAIInput): Promise<ListingAIDraft> {
    await delay(900)
    return {
      title: '高等数学（第七版）上册',
      author: '同济大学数学系 编',
      isbn: '978-7-5608-9493-7',
      category: '教材教辅',
      course: '高等数学',
      price: '26',
      originalPrice: '49.8',
      condition: '九成新',
      description: '同济版经典教材，例题讲解清晰，笔记和标注较少，整体干净整洁，适合期末复习备考。',
      tags: ['考研必备', '期末复习', '笔记少'],
    }
  }
}

export const listingAssistant = new DemoListingAssistant()
