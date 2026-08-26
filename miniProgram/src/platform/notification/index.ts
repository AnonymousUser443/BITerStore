export interface NotificationAdapter {
  requestTradeReminder(): Promise<'demo'>
}

export const notificationAdapter: NotificationAdapter = {
  async requestTradeReminder() {
    return 'demo'
  },
}
