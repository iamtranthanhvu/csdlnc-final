import { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  userId: number;
  email: string;
  roles: string[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
  }
}
