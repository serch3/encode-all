// Basic framer-motion mock returning regular elements
import React from 'react'

// Define a proper type for motion component props
type MotionProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode
  [key: string]: unknown
}

export const motion: Record<string, React.FC<MotionProps>> = new Proxy(
  {},
  {
    get: () => (props: MotionProps) => React.createElement('div', props)
  }
) as Record<string, React.FC<MotionProps>>

export default { motion }
