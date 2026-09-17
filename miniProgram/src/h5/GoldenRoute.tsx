import { MobileApp } from '../../../web/app/components/mobile-app'
import { appPathFromUrl } from '../../../web/app/lib/routes'

export default function GoldenRoute() {
  return <MobileApp initialPath={appPathFromUrl(globalThis.location.href)} />
}
