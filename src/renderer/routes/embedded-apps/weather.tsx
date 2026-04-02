import { createFileRoute } from '@tanstack/react-router'
import { WeatherAppPage } from './-components/weather/WeatherAppPage'

export const Route = createFileRoute('/embedded-apps/weather')({
  component: WeatherRouteComponent,
})

function WeatherRouteComponent() {
  return <WeatherAppPage />
}
