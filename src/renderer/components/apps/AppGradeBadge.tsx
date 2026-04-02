import { Badge } from '@mantine/core'
import { gradeRangeMeta, type GradeRange } from '@/types/apps'

export default function AppGradeBadge({ gradeRange }: { gradeRange: GradeRange }) {
  const meta = gradeRangeMeta[gradeRange]

  return (
    <Badge
      size="sm"
      radius="xl"
      variant="light"
      color="chatbox-brand"
      title={`${meta.label} · ${meta.description}`}
      styles={{
        root: {
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.18)',
          color: 'var(--chatbox-tint-primary)',
        },
      }}
    >
      {meta.shortLabel}
    </Badge>
  )
}
