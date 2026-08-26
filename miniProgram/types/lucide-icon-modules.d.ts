declare module 'lucide-react/dist/esm/icons/*.mjs' {
  import type { ForwardRefExoticComponent, RefAttributes } from 'react'
  import type { LucideProps } from 'lucide-react'

  const Icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>
  export default Icon
}
