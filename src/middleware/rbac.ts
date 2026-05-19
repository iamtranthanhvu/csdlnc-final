import { FastifyRequest, FastifyReply } from 'fastify';
import { JwtPayload } from './auth';

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload;
    const hasRole = roles.some(r => user?.roles?.includes(r));
    if (!hasRole) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
