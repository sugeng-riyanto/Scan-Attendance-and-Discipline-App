import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production';
const TOKEN_EXPIRY = '24h';

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const xAuthToken = request.headers.get('x-auth-token');
  if (xAuthToken) return xAuthToken;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const token = request.cookies.get('token')?.value;
  return token || null;
}

export function getAuthUser(request: NextRequest): JwtPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

export const rolePermissions: Record<string, string[]> = {
  ADMIN: ['all'],
  KEPALA_SEKOLAH: ['view_all', 'view_statistics', 'view_escalation', 'manage_alerts'],
  VP_KESISWAAN: ['view_all', 'view_discipline', 'manage_violations', 'manage_good_deeds', 'view_escalation', 'manage_categories'],
  WALI_KELAS: ['view_own_class', 'manage_violations', 'manage_good_deeds', 'view_class_attendance', 'manage_permissions', 'manage_own_class_data'],
  GURU: ['view_assigned_classes', 'manage_violations', 'manage_good_deeds', 'record_attendance'],
  GURU_JAGA: ['view_all_attendance', 'monitor_attendance', 'record_attendance', 'export_reports'],
  ORANG_TUA: ['view_own_child', 'request_permission'],
  SISWA: ['view_own_data'],
};

export function hasPermission(role: string, permission: string): boolean {
  const perms = rolePermissions[role] || [];
  return perms.includes('all') || perms.includes(permission);
}

export function requireRole(role: string, allowedRoles: string[]): boolean {
  return allowedRoles.includes(role);
}
