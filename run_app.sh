#!/bin/bash

set -e
export PORT=${PORT:-7890}
exec node ${NODE_OPTIONS} dist/src/index.js
