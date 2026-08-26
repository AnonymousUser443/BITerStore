import { Text, View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'

export function FormField({ label, required, error, children }: PropsWithChildren<{ label: string; required?: boolean; error?: string }>) {
  return (
    <View className={`form-field ${error ? 'error' : ''}`}>
      <View className='form-label'>{required && <Text>*</Text>}{label}</View>
      {children}
      {error && <Text className='field-error'>{error}</Text>}
    </View>
  )
}
