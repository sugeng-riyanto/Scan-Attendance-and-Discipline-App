#!/bin/sh
npx prisma db push 2>&1 || echo "Schema sync skipped, continuing..."
next start -H 0.0.0.0 -p ${PORT:-3000}
