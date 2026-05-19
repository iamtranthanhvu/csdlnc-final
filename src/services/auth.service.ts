import bcrypt from 'bcryptjs';
import * as pgRepo from '../repositories/postgres';

export async function register(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  const existing = await pgRepo.findUserByEmail(input.email);
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
  }

  const hash = await bcrypt.hash(input.password, 10);
  const user = await pgRepo.createUser({ ...input, password: hash });

  const customerRole = await pgRepo.findRoleByName('customer');
  if (customerRole) {
    await pgRepo.assignRoleToUser(user.userId, customerRole.roleId);
  }

  const { password: _pw, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function verifyCredentials(email: string, password: string) {
  const user = await pgRepo.findUserByEmail(email);
  if (!user) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  const fullUser = await pgRepo.findUserWithRoles(user.userId);
  const roles = fullUser?.userRoles.map(ur => ur.role.roleName) ?? [];

  return { userId: user.userId, email: user.email, name: user.name, roles };
}
