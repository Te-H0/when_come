import { setupServer } from 'msw/node';

// Each service test registers only its own contract handlers with server.use().
export const server = setupServer();
