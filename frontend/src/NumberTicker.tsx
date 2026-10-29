import { useEffect, useRef, useState } from 'react'

interface NumberTickerProps {
  value: number
  direction?: 'up' | 'down'
  delay?: number // in seconds
  duration?: number // in milliseconds
  className?: string
  decimalPlaces?: number
}

export function NumberTicker({
  value,
  direction = 'up',
  delay = 0,
  duration = 1100,
  className = '',
  decimalPlaces = 0,
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState(direction === 'down' ? value : 0)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef(direction === 'down' ? value : 0)

  useEffect(() => {
    let animationFrame: number
    let timeoutId: ReturnType<typeof setTimeout>

    const startVal = startValueRef.current
    const targetVal = value
    const isDown = direction === 'down'

    const step = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Ease Out Quart: 1 - (1 - progress)^4
      const easeOut = 1 - Math.pow(1 - progress, 4)
      const current = isDown
        ? startVal - easeOut * (startVal - targetVal)
        : startVal + easeOut * (targetVal - startVal)

      setDisplayValue(current)

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step)
      } else {
        setDisplayValue(targetVal)
        startValueRef.current = targetVal
      }
    }

    timeoutId = setTimeout(() => {
      startTimeRef.current = null
      animationFrame = requestAnimationFrame(step)
    }, delay * 1000)

    return () => {
      clearTimeout(timeoutId)
      cancelAnimationFrame(animationFrame)
    }
  }, [value, delay, duration, direction])

  const formatted =
    decimalPlaces > 0
      ? displayValue.toLocaleString(undefined, {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        })
      : Math.round(displayValue).toLocaleString()

  return (
    <span
      className={`number-ticker ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-block' }}
    >
      {formatted}
    </span>
  )
}

export default NumberTicker
