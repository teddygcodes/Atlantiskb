export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateStartupConfig } = await import('./lib/startup-checks')
    validateStartupConfig()
  }
}
