import { strings } from '@/shared/i18n'
import { useGetGreetingQuery } from '../api/greetingApi'

export function HomePage() {
  const { data, isError, isLoading } = useGetGreetingQuery()
  return (
    <main>
      <h1>{strings.homePage.title}</h1>
      <p role="status">{isLoading ? strings.homePage.loading : isError ? strings.homePage.failed : data?.text}</p>
    </main>
  )
}
