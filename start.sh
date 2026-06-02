#!/bin/sh
npx prisma db push
next start -H 0.0.0.0 -p ${PORT:-3000}
