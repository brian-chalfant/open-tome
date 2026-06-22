#!/bin/sh
set -e

cp -a /usr/share/nginx/html-src/. /usr/share/nginx/html/

find /usr/share/nginx/html \( -name '*.js' -o -name '*.html' \) -exec \
  sed -i "s|__VITE_API_BASE_URL_RUNTIME__|${VITE_API_BASE_URL}|g" {} +

exec "$@"
