import { Badge } from '@mantine/core'
import { categoryMeta, type AppCategory } from '@/types/apps'

export default function AppCategoryBadge({ category }: { category: AppCategory }) {
  const meta = categoryMeta[category]

  return (
    <Badge
      size="sm"
      radius="xl"
      variant="light"
      title={meta.label}
      styles={{
        root: {
          backgroundColor: `${meta.accent}1f`,
          border: `1px solid ${meta.accent}33`,
          color: 'var(--chatbox-tint-primary)',
        },
      }}
    >
      {meta.label}
    </Badge>
  )
}
