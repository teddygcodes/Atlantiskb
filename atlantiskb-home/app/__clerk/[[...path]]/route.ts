import { createFrontendApiProxyHandlers } from '@clerk/nextjs/server'

const handlers = createFrontendApiProxyHandlers()

export const { GET, POST, PUT, DELETE, PATCH } = handlers
