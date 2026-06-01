#!/bin/sh
npx prisma migrate deploy
next start -H 0.0.0.0 -p ${PORT:-3000}
