import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { Button } from './ui/Button'
import { NirmaanMark } from './common/NirmaanMark'

/** Last line of defence: a crash inside one page never blanks the whole app, and never shows a stack trace. */
export function RouteError() {
  const err = useRouteError()
  const chunk = err instanceof Error && /dynamically imported module|Failed to fetch dynamically|Importing a module script failed/i.test(err.message)
  const notFound = isRouteErrorResponse(err) && err.status === 404
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6" role="alert">
      <NirmaanMark size={40} className="mb-5" />
      <h1 className="text-xl font-semibold">{notFound ? 'Page not found' : chunk ? 'A new version is available' : 'Something went wrong'}</h1>
      <p className="text-sm text-muted mt-2 max-w-sm">{chunk ? 'Reload to get the latest version of NIRMAAN.' : notFound ? "That page doesn't exist." : 'This page hit an unexpected problem. Your data is safe.'}</p>
      <div className="flex gap-2 mt-5"><Button onClick={() => window.location.reload()}>Reload</Button><Link to="/dashboard"><Button variant="secondary">Dashboard</Button></Link></div>
    </main>
  )
}
