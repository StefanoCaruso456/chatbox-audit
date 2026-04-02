import { Image, type ImageProps } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { categoryMeta, type ApprovedApp } from '@/types/apps'

type AppIconProps = Omit<ImageProps, 'src' | 'alt'> & {
  app: ApprovedApp
}

function getInitials(name: string) {
  const parts = name
    .replace(/!/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function buildFallbackIcon(app: ApprovedApp) {
  const initials = getInitials(app.name)
  const accent = categoryMeta[app.category].accent
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
      <rect width="96" height="96" rx="28" fill="${accent}" />
      <rect x="10" y="10" width="76" height="76" rx="22" fill="rgba(15,23,42,0.18)" />
      <text
        x="50%"
        y="54%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="#ffffff"
        font-family="Avenir Next, Inter, Arial, sans-serif"
        font-size="30"
        font-weight="700"
        letter-spacing="1"
      >
        ${initials}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function AppIcon({ app, ...props }: AppIconProps) {
  const [hasError, setHasError] = useState(false)
  const fallbackIcon = useMemo(() => buildFallbackIcon(app), [app])

  useEffect(() => {
    setHasError(false)
  }, [app.icon])

  return (
    <Image
      {...props}
      src={hasError ? fallbackIcon : app.icon}
      alt=""
      onError={() => {
        if (!hasError) {
          setHasError(true)
        }
      }}
    />
  )
}
