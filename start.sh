#!/bin/sh
echo 'DELETE FROM "DutySchedule";' | npx prisma db execute --stdin 2>/dev/null
npx prisma db push
next start -H 0.0.0.0 -p ${PORT:-3000}
