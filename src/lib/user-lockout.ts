import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Lockout guard for deactivating, demoting or removing an account.
 *
 * A school with no active ADMIN cannot be recovered from the inside: nobody left
 * there can create, re-role or re-activate an account, so the last one is
 * protected for every actor — a SUPER_ADMIN included. The platform ways to retire
 * a school are still open: deactivate the school itself, delete it (which
 * cascades), or appoint a replacement admin first.
 *
 * Deactivating your own account is refused outright: it is a self-inflicted
 * lockout, and for the last admin of a school it is the same unrecoverable state,
 * reached without any second party to blame.
 *
 * Shared by `PUT`/`DELETE /api/users` and the user actions of
 * `POST /api/super-admin`, because the invariant only holds if every path that
 * can take an administrator away enforces it — not just the one a school admin
 * can reach.
 */
export interface LockoutTarget {
  id: string;
  role: string;
  schoolId: string | null;
  isActive: boolean;
}

export async function lockoutGuard(opts: {
  actorId: string;
  target: LockoutTarget;
  /** The change stops the account from being an administrator. */
  removesAdmin?: boolean;
  /** The change takes the account out of service (deactivate or delete). */
  deactivates?: boolean;
}): Promise<NextResponse | null> {
  const { actorId, target, removesAdmin = false, deactivates = false } = opts;

  if (deactivates && actorId === target.id) {
    return NextResponse.json(
      { error: 'Anda tidak dapat menonaktifkan akun Anda sendiri' },
      { status: 403 }
    );
  }

  const losesAnAdmin = target.role === 'ADMIN' && target.isActive && (removesAdmin || deactivates);
  if (!losesAnAdmin || !target.schoolId) return null;

  const otherAdmins = await db.user.count({
    where: { schoolId: target.schoolId, role: 'ADMIN', isActive: true, id: { not: target.id } },
  });
  if (otherAdmins > 0) return null;

  return NextResponse.json(
    { error: 'Ini administrator aktif terakhir di sekolah ini. Angkat administrator pengganti terlebih dahulu.' },
    { status: 409 }
  );
}
