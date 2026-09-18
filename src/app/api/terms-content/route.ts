import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-utils';
import { canAccessApi } from '@/lib/rbac-policy';
import { getSchoolScope } from '@/lib/school-scope';
import { logAudit } from '@/lib/audit'
import { provenanceKind } from '@/lib/terms-provenance';

// Reading the history and the acceptance report carries the same right as
// publishing a version, so the policy's terms-content write key answers all of
// them (SUPER_ADMIN always passes — see src/lib/rbac-policy.ts).

// GET: Return the active T&C document.
//   - ?history=true (admin only): returns all versions for the history viewer.
//   - Public (no auth): returns the active record so /terms page works without login.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wantHistory = searchParams.get('history') === 'true';

    if (wantHistory) {
      // Admin-only: return all versions (body included for diff comparison)
      const auth = getAuthUser(request);
      if (!auth || !canAccessApi(auth.role, 'POST /api/terms-content')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const all = await db.termsContent.findMany({
        orderBy: { version: 'desc' },
        select: {
          id: true, title: true, body: true, version: true,
          isActive: true, updatedBy: true, createdAt: true, updatedAt: true,
        },
      });
      return NextResponse.json({ versions: all });
    }

    const wantAcceptance = searchParams.get('acceptance') === 'true';
    if (wantAcceptance) {
      // Admin-only: return per-user acceptance status for the current active version
      const auth = getAuthUser(request);
      if (!auth || !canAccessApi(auth.role, 'POST /api/terms-content')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const activeTerms = await db.termsContent.findFirst({
        where: { isActive: true },
        orderBy: { version: 'desc' },
        select: { version: true, updatedAt: true },
      });
      const currentVersion = activeTerms?.version ?? 0;

      // Build where clause: same-school users only. The JWT carries only
      // userId/username/role, so the school must be resolved from the user's
      // account — getSchoolScope does that, honors SUPER_ADMIN preview mode,
      // and denies by default (`{ id: null }`) for a user with no school
      // binding instead of silently returning every school's users.
      const scope = await getSchoolScope(auth);
      const where: any = { isActive: true, ...scope.schoolWhere };

      const users = await db.user.findMany({
        where,
        select: {
          id: true, name: true, username: true, role: true, schoolId: true,
          termsAcceptedAt: true, termsAcceptedVersion: true,
          // Per-user provenance: who recorded this acceptance, and whether it was
          // the account holder or an administrator acting for them.
          termsAcceptedBy: true, termsAcceptedByUserId: true, termsAcceptedOnBehalf: true,
        },
        orderBy: { name: 'asc' },
      });      const accepted = users.filter(u => u.termsAcceptedVersion !== null && u.termsAcceptedVersion >= currentVersion);
      const pending = users.filter(u => u.termsAcceptedVersion === null || u.termsAcceptedVersion < currentVersion);

      // Of the acceptances that count, how many the account holder made and how
      // many an administrator recorded for them — the school-level answer to the
      // question the per-row provenance answers per person.
      const provenanceOf = (u: (typeof accepted)[number]) =>
        provenanceKind({ acceptedBy: u.termsAcceptedBy, onBehalf: u.termsAcceptedOnBehalf });

      return NextResponse.json({
        currentVersion,
        updatedAt: activeTerms?.updatedAt ?? null,
        total: users.length,
        accepted: accepted.length,
        pending: pending.length,
        acceptedSelf: accepted.filter(u => provenanceOf(u) === 'self').length,
        acceptedOnBehalf: accepted.filter(u => provenanceOf(u) === 'admin').length,
        acceptedUnknown: accepted.filter(u => provenanceOf(u) === 'unknown').length,
        users: users.map(u => ({
          id: u.id, name: u.name, username: u.username, role: u.role,
          acceptedVersion: u.termsAcceptedVersion,
          acceptedAt: u.termsAcceptedAt,
          // `acceptedBy` null means "not recorded" (the acceptance predates
          // provenance), which is why `onBehalf` is only meaningful beside it.
          acceptedBy: u.termsAcceptedBy,
          acceptedByUserId: u.termsAcceptedByUserId,
          acceptedOnBehalf: u.termsAcceptedOnBehalf,
          isUpToDate: u.termsAcceptedVersion !== null && u.termsAcceptedVersion >= currentVersion,
        })),
      });
    }

    // Default: return the active version (or latest if none active)
    const terms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });
    const latest = terms ?? await db.termsContent.findFirst({
      orderBy: { version: 'desc' },
    });
    return NextResponse.json({ terms: latest });
  } catch (error) {
    console.error('TermsContent GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch terms content' }, { status: 500 });
  }
}

// POST: Create a new version of T&C (ADMIN / KEPALA_SEKOLAH / SUPER_ADMIN).
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'POST /api/terms-content')) {
      return NextResponse.json({ error: 'Forbidden — only Admin and Kepala Sekolah can edit Terms & Conditions' }, { status: 403 });
    }

    const body = await request.json();
    const { title, body: content, activate } = body;

    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return NextResponse.json({ error: 'Terms content must be at least 10 characters' }, { status: 400 });
    }

    // Determine next version number. It has to clear the table *and* the account
    // records, because an acceptance keeps the number it was made under and
    // `user.termsAcceptedVersion < currentVersion` is the only thing that decides
    // whether anyone is asked to read the new text. Numbering from the table alone
    // reuses a number whenever a version is deleted (which the DELETE handler below
    // does on purpose: it activates the next-newest and removes the active one), and
    // a reused number silently marks a *different* text as already agreed to.
    const [lastVersion, highestAccepted] = await Promise.all([
      db.termsContent.findFirst({ orderBy: { version: 'desc' }, select: { version: true } }),
      db.user.aggregate({ _max: { termsAcceptedVersion: true } }),
    ]);
    const nextVersion =
      Math.max(lastVersion?.version ?? 0, highestAccepted._max.termsAcceptedVersion ?? 0) + 1;

    // If this should be the active version, deactivate all others first
    if (activate !== false) {
      await db.termsContent.updateMany({ where: { isActive: true }, data: { isActive: false } });
    }

    const terms = await db.termsContent.create({
      data: {
        title: title?.trim() || 'Terms and Conditions of Use',
        body: content.trim(),
        version: nextVersion,
        isActive: activate !== false,
        updatedBy: auth.username,
      },
    });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    await logAudit({
      action: 'TERMS_CREATE',
      category: 'SETTINGS',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `Terms & Conditions v${nextVersion} created${activate !== false ? ' and activated' : ''}`,
    });

    return NextResponse.json({ terms, message: `Terms v${nextVersion} created` });
  } catch (error) {
    console.error('TermsContent POST error:', error);
    return NextResponse.json({ error: 'Failed to create terms content' }, { status: 500 });
  }
}

// PUT: Update the existing active version (or any version by id).
export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'PUT /api/terms-content')) {
      return NextResponse.json({ error: 'Forbidden — only Admin and Kepala Sekolah can edit Terms & Conditions' }, { status: 403 });
    }

    const body = await request.json();
    const { id, title, body: content, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const existing = await db.termsContent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Terms content not found' }, { status: 404 });
    }

    const updateData: any = { updatedBy: auth.username };
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length < 10) {
        return NextResponse.json({ error: 'Terms content must be at least 10 characters' }, { status: 400 });
      }
      updateData.body = content.trim();
    }

    // If activating this version, deactivate all others
    if (isActive === true && !existing.isActive) {
      await db.termsContent.updateMany({ where: { isActive: true }, data: { isActive: false } });
      updateData.isActive = true;
    } else if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const terms = await db.termsContent.update({ where: { id }, data: updateData });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    await logAudit({
      action: 'TERMS_UPDATE',
      category: 'SETTINGS',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `Terms & Conditions v${terms.version} updated${isActive === true ? ' and activated' : ''}`,
    });

    return NextResponse.json({ terms, message: `Terms v${terms.version} updated` });
  } catch (error) {
    console.error('TermsContent PUT error:', error);
    return NextResponse.json({ error: 'Failed to update terms content' }, { status: 500 });
  }
}

// DELETE: Remove a terms version (SUPER_ADMIN / ADMIN only).
export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'DELETE /api/terms-content')) {
      return NextResponse.json({ error: 'Forbidden — only Admin and Kepala Sekolah can delete Terms & Conditions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const existing = await db.termsContent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Terms content not found' }, { status: 404 });
    }

    // Prevent deleting the active version if it's the only one
    if (existing.isActive) {
      const count = await db.termsContent.count();
      if (count <= 1) {
        return NextResponse.json({ error: 'Cannot delete the only active Terms & Conditions' }, { status: 400 });
      }
      // If deleting the active one, activate the most recent remaining
      const nextActive = await db.termsContent.findFirst({
        where: { id: { not: id } },
        orderBy: { version: 'desc' },
      });
      if (nextActive) {
        await db.termsContent.update({ where: { id: nextActive.id }, data: { isActive: true } });
      }
    }

    await db.termsContent.delete({ where: { id } });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    await logAudit({
      action: 'TERMS_DELETE',
      category: 'SETTINGS',
      severity: 'WARNING',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `Terms & Conditions v${existing.version} deleted`,
    });

    return NextResponse.json({ message: `Terms v${existing.version} deleted` });
  } catch (error) {
    console.error('TermsContent DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete terms content' }, { status: 500 });
  }
}
